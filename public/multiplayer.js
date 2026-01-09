import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, getDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export class FirebaseHandler {
    constructor(matchId, userId) {
        this.matchId = matchId || "main_match";
        this.userId = userId;
        this.docRef = doc(db, "matches", this.matchId);
        this.unsubscribes = [];

        // Fix: Initialize deduplication timestamps to NOW to ignore pre-existing attacks/bombs
        this.lastProcessedAttackTime = Date.now();
        this.lastProcessedBombTime = Date.now();

        console.log(`Firebase Initialized for match: ${this.matchId}, user: ${this.userId}`);
    }

    async initPlayer(name) {
        // Ensure match document exists
        try {
            await setDoc(this.docRef, { created: Date.now() }, { merge: true });

            // Register player
            await updateDoc(this.docRef, {
                [`${this.userId}_stats`]: { name: name, wins: 0, losses: 0, pb: 0 }
            });
            return { name: name, wins: 0, losses: 0, pb: 0 };
        } catch (e) {
            console.error("Error initializing player:", e);
            return {};
        }
    }

    async updatePB(score) {
        // Not critical for battle MVP
    }

    async recordWin() {
        // Increment win count in Firestore?
    }

    async sendGameState(grid, koCount, garbageQueue, activePiece) {
        // Throttling: Maybe don't wait for promise resolution to avoid blocking?
        const state = {
            grid: JSON.stringify(grid),
            ko: koCount,
            garbage: garbageQueue,
            activePiece: activePiece,
            timestamp: Date.now()
        };
        try {
            // Using dot notation to update nested field
            await updateDoc(this.docRef, {
                [`${this.userId}`]: JSON.stringify(state)
            });
        } catch (e) {
            // Suppress rapid-fire errors to avoid console spam
        }
    }

    async sendAttack(opponentId, lines, effect = null) {
        // We write to a shared 'attacks' collection or a dedicated field on the match doc
        // For simplicity, let's update a 'last_attack' field on the match doc 
        // that listeners will pick up.
        // Use a timestamp to ensure uniqueness.
        try {
            await updateDoc(this.docRef, {
                last_attack: {
                    from: this.userId,
                    to: opponentId,
                    lines: lines,
                    effect: effect,
                    timestamp: Date.now()
                }
            });
            console.log(`Sent ${lines} lines to ${opponentId}, effect: ${effect}`);
        } catch (e) {
            console.error("Error sending attack:", e);
        }
    }

    // Timer Mine Bomb: Send a bomb to opponent's queue
    async sendBomb(opponentId) {
        try {
            await updateDoc(this.docRef, {
                last_bomb: {
                    to: opponentId,
                    from: this.userId,
                    timestamp: Date.now()
                }
            });
            console.log(`Sent bomb to ${opponentId}`);
        } catch (e) {
            console.error("Error sending bomb:", e);
        }
    }

    listenToBombs(callback) {
        const unsub = onSnapshot(this.docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const bomb = data.last_bomb;
                // Check if bomb is targeted at me and is new
                if (bomb && bomb.to === this.userId) {
                    if (bomb.timestamp > (this.lastProcessedBombTime || 0)) {
                        this.lastProcessedBombTime = bomb.timestamp;
                        console.log("Received bomb from", bomb.from);
                        callback();
                    }
                }
            }
        });
        this.unsubscribes.push(unsub);
        return unsub;
    }

    listenToMatch(callback) {
        const unsub = onSnapshot(this.docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                // Parse the JSON strings back into objects for the callback
                // We need to be careful about performance here
                // Actually Main.js expects flat data mostly, except grid is string.
                // Let's just pass raw data and let Main decode.
                callback(data);
            }
        });
        this.unsubscribes.push(unsub);
        return unsub;
    }

    listenToAttacks(callback) {
        const unsub = onSnapshot(this.docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const attack = data.last_attack;
                // Check if it's a new attack AND targeted at me
                if (attack && attack.to === this.userId) {
                    // Primitive deduplication: rely on timestamp? 
                    // Or just callback() and let game logic handle it.
                    // Main.js doesn't dedupe, so we need to be careful not to re-process old attacks.
                    // Simple fix: Store last processed timestamp in memory (not persistent).
                    if (attack.timestamp > (this.lastProcessedAttackTime || 0)) {
                        this.lastProcessedAttackTime = attack.timestamp;
                        console.log("Received attack!", attack.lines, "Effect:", attack.effect);
                        callback(attack.lines, attack.effect); // Pass Effect
                    }
                }
            }
        });
        this.unsubscribes.push(unsub);
        return unsub;
    }

    async setOnline() {
        // We add a timestamp to 'joined' so we can detect NEW sessions (refreshes)
        // even if the 'online' status itself didn't change.
        await updateDoc(this.docRef, {
            [`presence_${this.userId}`]: 'online',
            [`joined_${this.userId}`]: Date.now()
        });
    }

    async setReady(userId) {
        // Mark a player as ready in the lobby
        await updateDoc(this.docRef, {
            [`ready_${userId}`]: Date.now()
        });
        console.log(`${userId} is ready!`);
    }

    async clearReady() {
        // Clear ready status for both players (called when match starts)
        await updateDoc(this.docRef, {
            ready_Lifedelinquent: null,
            ready_ChronoKoala: null
        });
    }

    async clearReadyForPlayer(userId) {
        // Clear ready status for a specific player (called when unreadying)
        await updateDoc(this.docRef, {
            [`ready_${userId}`]: null
        });
        console.log(`${userId} unreadied!`);
    }

    listenToReadyStatus(callback) {
        const unsub = onSnapshot(this.docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const lifeReady = data.ready_Lifedelinquent ? true : false;
                const chronoReady = data.ready_ChronoKoala ? true : false;
                callback({ lifeReady, chronoReady });
            }
        });
        this.unsubscribes.push(unsub);
        return unsub;
    }

    listenToOnline(opponentId, callback) {
        let lastJoinTime = 0;
        const unsub = onSnapshot(this.docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const isOnline = data[`presence_${opponentId}`] === 'online';
                const joinTime = data[`joined_${opponentId}`] || 0;

                // Fire callback if:
                // 1. They are online
                // 2. AND This is a NEW join event we haven't processed yet
                // (Using > 0 check to ensure we process the initial state too)
                if (isOnline && joinTime > lastJoinTime) {
                    lastJoinTime = joinTime;
                    callback(true);
                }
            }
        });
        this.unsubscribes.push(unsub);
        return unsub;
    }

    async triggerMatchStart() {
        // Only trigger if start_time is old or null
        // Race condition handled by Firestore transactions ideally, but simplistic here:
        const startData = {
            startTime: Date.now() + 3000,
            seed: Math.random(),
            timestamp: Date.now()
        };
        // Clear pause state when starting a new match
        await updateDoc(this.docRef, {
            match_start: startData,
            pause_state: {
                paused: false,
                pausedBy: null,
                pausedAt: null
            }
        });
        console.log("Match started, pause state cleared");
        return startData.startTime;
    }

    listenToMatchStart(callback) {
        const unsub = onSnapshot(this.docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.match_start) {
                    const ms = data.match_start;
                    // Dedupe: Only trigger if recently set (e.g., < 10s ago)
                    // and we haven't started this specific timestamp yet.
                    if (Date.now() - ms.timestamp < 10000) {
                        if (this.lastStartTime !== ms.timestamp) {
                            this.lastStartTime = ms.timestamp;
                            callback(ms.startTime);
                        }
                    }
                }
            }
        });
        this.unsubscribes.push(unsub);
        return unsub;
    }

    setRematch(isReady) {
        updateDoc(this.docRef, {
            [`rematch_${this.userId}`]: isReady
        });
    }

    listenToRematch(opponentId, callback) {
        const unsub = onSnapshot(this.docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const meReady = data[`rematch_${this.userId}`];
                const opReady = data[`rematch_${opponentId}`];
                callback(meReady && opReady);
            }
        });
        this.unsubscribes.push(unsub);
        return unsub;
    }

    // --- Synchronized Pause System ---

    async setPause(isPaused) {
        // Set pause state with who initiated and when
        if (isPaused) {
            await updateDoc(this.docRef, {
                pause_state: {
                    paused: true,
                    pausedBy: this.userId,
                    pausedAt: Date.now()
                }
            });
            console.log(`${this.userId} paused the game`);
        } else {
            await updateDoc(this.docRef, {
                pause_state: {
                    paused: false,
                    pausedBy: null,
                    pausedAt: null
                }
            });
            console.log(`${this.userId} unpaused the game`);
        }
    }

    listenToPause(callback) {
        // Listen for pause state changes from opponent
        // callback receives: { paused, pausedBy, pausedAt, canUnpause }
        const unsub = onSnapshot(this.docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const pauseState = data.pause_state;

                if (pauseState) {
                    // Calculate if this player can unpause
                    // Can unpause if: they initiated OR 5 minutes have passed
                    const fiveMinutes = 5 * 60 * 1000;
                    const timeElapsed = pauseState.pausedAt ? Date.now() - pauseState.pausedAt : 0;
                    const canUnpause = pauseState.pausedBy === this.userId || timeElapsed >= fiveMinutes;

                    callback({
                        paused: pauseState.paused,
                        pausedBy: pauseState.pausedBy,
                        pausedAt: pauseState.pausedAt,
                        canUnpause: canUnpause
                    });
                } else {
                    callback({ paused: false, pausedBy: null, pausedAt: null, canUnpause: true });
                }
            }
        });
        this.unsubscribes.push(unsub);
        return unsub;
    }
}

export class MockFirebaseHandler {
    constructor(matchId, userId) {
        this.matchId = matchId;
        this.userId = userId;
        console.warn("⚠️ RUNNING IN OFFLINE / LOCAL SYNC MODE ⚠️");

        // Initial clean up of old state for this user to avoid stale data
        // We only clear OUR state, so we don't wipe the opponent's if they are already open
        localStorage.removeItem(`tetris_state_${userId}`);
        localStorage.removeItem(`tetris_attack_${userId}`);
        // Do NOT clear presence, setting it immediately below
    }

    async initPlayer(name) {
        console.log("Local Sync: initPlayer", name);
        return { name: name, wins: 0, losses: 0, pb: 0 };
    }

    async updatePB(score) { }
    async recordWin() { }

    async sendGameState(grid, koCount, garbageQueue, activePiece) {
        const state = {
            grid: JSON.stringify(grid),
            ko: koCount,
            garbage: garbageQueue,
            activePiece: activePiece, // New: Ghost Data
            timestamp: Date.now()
        };
        localStorage.setItem(`tetris_state_${this.userId}`, JSON.stringify(state));
    }

    async sendAttack(opponentId, lines) {
        const attackData = {
            lines: lines,
            timestamp: Date.now()
        };
        localStorage.setItem(`tetris_attack_${opponentId}`, JSON.stringify(attackData));
        console.log(`Local Sync: Sent ${lines} lines to ${opponentId}`);
    }

    // --- Presence & Match Control ---

    async setOnline() {
        localStorage.setItem(`presence_${this.userId}`, 'online');
    }

    listenToOnline(opponentId, callback) {
        // Check immediately
        if (localStorage.getItem(`presence_${opponentId}`) === 'online') {
            callback(true);
        }

        const listener = (e) => {
            if (e.key === `presence_${opponentId}` && e.newValue === 'online') {
                callback(true);
            }
        };
        window.addEventListener('storage', listener);
        return () => window.removeEventListener('storage', listener);
    }

    async triggerMatchStart() {
        // Only trigger if a start isn't already pending
        const current = localStorage.getItem('match_start');
        if (current) {
            const data = JSON.parse(current);
            // If recently triggered (by opponent), return IT so we can join it!
            if (Date.now() - data.timestamp < 5000) return data.startTime;
        }

        const startData = {
            startTime: Date.now() + 3000, // Start in 3 seconds
            seed: Math.random(),
            timestamp: Date.now()
        };
        localStorage.setItem(`match_start`, JSON.stringify(startData));
        return startData.startTime; // Return for local use
    }

    listenToMatchStart(callback) {
        // Check immediately in case we missed the event
        const current = localStorage.getItem('match_start');
        if (current) {
            try {
                const data = JSON.parse(current);
                if (Date.now() - data.timestamp < 5000) {
                    callback(data.startTime);
                }
            } catch (err) { }
        }

        const listener = (e) => {
            if (e.key === `match_start` && e.newValue) {
                try {
                    const data = JSON.parse(e.newValue);
                    // Only react if this is a NEW start event (e.g. within last 5 seconds)
                    if (Date.now() - data.timestamp < 5000) {
                        callback(data.startTime);
                    }
                } catch (err) { }
            }
        };
        window.addEventListener('storage', listener);
        return () => window.removeEventListener('storage', listener);
    }

    setRematch(isReady) {
        localStorage.setItem(`rematch_${this.userId}`, isReady);
    }

    listenToRematch(opponentId, callback) {
        const check = () => {
            const opReady = localStorage.getItem(`rematch_${opponentId}`) === 'true';
            const meReady = localStorage.getItem(`rematch_${this.userId}`) === 'true';
            callback(meReady && opReady);
        };

        window.addEventListener('storage', check);
        // Also check on interval just in case storage event misses self-change (though self-change is known)
        const interval = setInterval(check, 500);
        return () => {
            window.removeEventListener('storage', check);
            clearInterval(interval);
        };
    }

    // --- existing listeners ---

    listenToMatch(callback) {
        console.log("Local Sync: Listening for opponent updates...");

        const opponentId = this.userId === "Lifedelinquent" ? "ChronoKoala" : "Lifedelinquent";
        const key = `tetris_state_${opponentId}`;

        const listener = (e) => {
            if (e.key === key && e.newValue) {
                try {
                    const state = JSON.parse(e.newValue);
                    const data = {
                        [`${opponentId}_grid`]: state.grid,
                        [`${opponentId}_ko`]: state.ko,
                        [`${opponentId}_garbage`]: state.garbage,
                        [`${opponentId}_piece`]: state.activePiece // Forward ghost piece
                    };
                    callback(data);
                } catch (err) {
                    console.error("Error parsing local state update", err);
                }
            }
        };

        window.addEventListener('storage', listener);
        // Also try to read immediate state if it exists
        const existing = localStorage.getItem(key);
        if (existing) {
            try {
                const state = JSON.parse(existing);
                const data = {
                    [`${opponentId}_grid`]: state.grid,
                    [`${opponentId}_ko`]: state.ko,
                    [`${opponentId}_garbage`]: state.garbage,
                    [`${opponentId}_piece`]: state.activePiece
                };
                callback(data);
            } catch (err) { }
        }

        return () => window.removeEventListener('storage', listener);
    }

    listenToAttacks(callback) {
        console.log("Local Sync: Listening for attacks...");

        const key = `tetris_attack_${this.userId}`;

        const listener = (e) => {
            if (e.key === key && e.newValue) {
                try {
                    const data = JSON.parse(e.newValue);
                    if (data.lines > 0) {
                        console.log("Local Sync: Received attack!", data.lines);
                        callback(data.lines);
                    }
                } catch (err) {
                    console.error("Error parsing local attack", err);
                }
            }
        };

        window.addEventListener('storage', listener);
        return () => window.removeEventListener('storage', listener);
    }
}
