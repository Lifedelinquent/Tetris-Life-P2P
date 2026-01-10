/**
 * P2P Handler for Tetris Life Battle
 * Uses PeerJS for WebRTC peer-to-peer connections
 * Drop-in replacement for FirebaseHandler
 */

export class P2PHandler {
    constructor(roomCode = null, isHost = false) {
        this.roomCode = roomCode;
        this.isHost = isHost;
        this.userId = null;
        this.opponentId = null;
        this.peer = null;
        this.conn = null;
        this.callbacks = {};
        this.gameState = {};
        this.connected = false;
        this.opponentStats = null; // Opponent's win/loss record received via P2P

        // Deduplication timestamps (same as Firebase version)
        this.lastProcessedAttackTime = Date.now();
        this.lastProcessedBombTime = Date.now();
        this.lastStartTime = 0;

        // Stats persistence
        this.stats = this.loadStats();

        console.log(`P2P Handler initialized. Room: ${roomCode}, Host: ${isHost}`);
    }

    // --- Connection Management ---

    /**
     * Generate a random 4-character room code
     */
    static generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing chars like 0/O, 1/I
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }

    /**
     * Create a room as host
     * @param {function} onReady - Called when peer is ready with room code
     * @param {function} onConnect - Called when opponent connects
     * @param {function} onError - Called on connection error
     */
    createRoom(onReady, onConnect, onError) {
        this.isHost = true;
        this.roomCode = P2PHandler.generateRoomCode();
        this.userId = 'Lifedelinquent'; // Host is always Lifedelinquent
        this.opponentId = 'ChronoKoala';

        // Reload stats now that we know we're the host
        this.stats = this.loadStats();

        // Prefix room code to avoid collisions on PeerJS cloud
        const peerId = `tetris-life-${this.roomCode}`;

        this.peer = new Peer(peerId, {
            debug: 1 // Minimal logging
        });

        this.peer.on('open', (id) => {
            console.log('Room created with ID:', id);
            onReady(this.roomCode);
        });

        this.peer.on('connection', (conn) => {
            console.log('Opponent connected!');
            this.conn = conn;
            this.setupConnection(conn, onConnect);
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            if (err.type === 'unavailable-id') {
                // Room code already taken, try again
                this.roomCode = P2PHandler.generateRoomCode();
                this.peer.destroy();
                this.createRoom(onReady, onConnect, onError);
            } else {
                onError(err);
            }
        });
    }

    /**
     * Join an existing room
     * @param {string} roomCode - 4-character room code
     * @param {function} onConnect - Called when connected to host
     * @param {function} onError - Called on connection error
     */
    joinRoom(roomCode, onConnect, onError) {
        this.isHost = false;
        this.roomCode = roomCode.toUpperCase();
        this.userId = 'ChronoKoala'; // Guest is always ChronoKoala
        this.opponentId = 'Lifedelinquent';

        // Reload stats now that we know we're the guest
        this.stats = this.loadStats();

        const peerId = `tetris-life-${this.roomCode}-guest-${Date.now()}`;
        const hostId = `tetris-life-${this.roomCode}`;

        this.peer = new Peer(peerId, {
            debug: 1
        });

        this.peer.on('open', () => {
            console.log('Connecting to room:', this.roomCode);
            const conn = this.peer.connect(hostId, { reliable: true });

            conn.on('open', () => {
                console.log('Connected to host!');
                this.conn = conn;
                this.setupConnection(conn, onConnect);
            });

            conn.on('error', (err) => {
                console.error('Connection error:', err);
                onError(err);
            });
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            if (err.type === 'peer-unavailable') {
                onError(new Error('Room not found. Check the code and try again.'));
            } else {
                onError(err);
            }
        });
    }

    /**
     * Setup data connection handlers
     */
    setupConnection(conn, onConnect) {
        this.connected = true;

        conn.on('data', (data) => {
            this.handleMessage(data);
        });

        conn.on('close', () => {
            console.log('Connection closed');
            this.connected = false;
            if (this.callbacks.onDisconnect) {
                this.callbacks.onDisconnect();
            }
        });

        onConnect();
    }

    /**
     * Handle incoming P2P messages
     */
    handleMessage(data) {
        const { type, payload } = data;

        switch (type) {
            case 'gameState':
                this.handleGameState(payload);
                break;
            case 'attack':
                this.handleAttack(payload);
                break;
            case 'bomb':
                this.handleBomb(payload);
                break;
            case 'ready':
                this.handleReady(payload);
                break;
            case 'matchStart':
                this.handleMatchStart(payload);
                break;
            case 'pause':
                this.handlePause(payload);
                break;
            case 'rematch':
                this.handleRematch(payload);
                break;
            case 'online':
                this.handleOnline(payload);
                break;
            case 'stats':
                this.handleStats(payload);
                break;
        }
    }

    /**
     * Send a message to the peer
     */
    send(type, payload) {
        if (this.conn && this.conn.open) {
            this.conn.send({ type, payload });
        }
    }

    // --- Game State Methods (Same API as FirebaseHandler) ---

    async initPlayer(name) {
        // Send online status to opponent
        this.send('online', { userId: this.userId, name });
        return this.stats;
    }

    async updatePB(score) {
        if (score > this.stats.pb) {
            this.stats.pb = score;
            this.saveStats();
        }
    }

    async recordWin() {
        this.stats.wins++;
        this.saveStats();
    }

    async sendGameState(grid, koCount, garbageQueue, activePiece) {
        this.send('gameState', {
            grid: JSON.stringify(grid),
            ko: koCount,
            garbage: garbageQueue,
            activePiece: activePiece,
            timestamp: Date.now()
        });
    }

    async sendAttack(opponentId, lines, effect = null) {
        this.send('attack', {
            from: this.userId,
            to: opponentId,
            lines: lines,
            effect: effect,
            timestamp: Date.now()
        });
        console.log(`Sent ${lines} lines to ${opponentId}, effect: ${effect}`);
    }

    async sendBomb(opponentId) {
        this.send('bomb', {
            from: this.userId,
            to: opponentId,
            timestamp: Date.now()
        });
        console.log(`Sent bomb to ${opponentId}`);
    }

    // --- Listeners ---

    listenToBombs(callback) {
        this.callbacks.onBomb = callback;
        return () => { this.callbacks.onBomb = null; };
    }

    handleBomb(payload) {
        if (payload.to === this.userId && payload.timestamp > this.lastProcessedBombTime) {
            this.lastProcessedBombTime = payload.timestamp;
            console.log('Received bomb from', payload.from);
            if (this.callbacks.onBomb) this.callbacks.onBomb();
        }
    }

    listenToMatch(callback) {
        this.callbacks.onMatch = callback;
        return () => { this.callbacks.onMatch = null; };
    }

    handleGameState(payload) {
        // Format data like Firebase does
        const data = {
            [`${this.opponentId}`]: JSON.stringify(payload)
        };
        if (this.callbacks.onMatch) this.callbacks.onMatch(data);
    }

    listenToAttacks(callback) {
        this.callbacks.onAttack = callback;
        return () => { this.callbacks.onAttack = null; };
    }

    handleAttack(payload) {
        if (payload.to === this.userId && payload.timestamp > this.lastProcessedAttackTime) {
            this.lastProcessedAttackTime = payload.timestamp;
            console.log('Received attack!', payload.lines, 'Effect:', payload.effect);
            if (this.callbacks.onAttack) this.callbacks.onAttack(payload.lines, payload.effect);
        }
    }

    async setOnline() {
        this.send('online', { userId: this.userId, timestamp: Date.now() });
    }

    async setReady(userId) {
        this.gameState[`ready_${userId}`] = Date.now();
        this.send('ready', { userId, timestamp: Date.now() });
        console.log(`${userId} is ready!`);

        // Update local UI immediately
        if (this.callbacks.onReadyStatus) {
            this.callbacks.onReadyStatus({
                lifeReady: !!this.gameState.ready_Lifedelinquent,
                chronoReady: !!this.gameState.ready_ChronoKoala
            });
        }

        this.checkBothReady();
    }

    async clearReady() {
        this.gameState.ready_Lifedelinquent = null;
        this.gameState.ready_ChronoKoala = null;
    }

    async clearReadyForPlayer(userId) {
        this.gameState[`ready_${userId}`] = null;
        this.send('ready', { userId, timestamp: null });
        console.log(`${userId} unreadied!`);

        // Update local UI immediately (same as setReady)
        if (this.callbacks.onReadyStatus) {
            this.callbacks.onReadyStatus({
                lifeReady: !!this.gameState.ready_Lifedelinquent,
                chronoReady: !!this.gameState.ready_ChronoKoala
            });
        }
    }

    listenToReadyStatus(callback) {
        this.callbacks.onReadyStatus = callback;
        // Immediately call with current state
        callback({
            lifeReady: !!this.gameState.ready_Lifedelinquent,
            chronoReady: !!this.gameState.ready_ChronoKoala
        });
        return () => { this.callbacks.onReadyStatus = null; };
    }

    handleReady(payload) {
        this.gameState[`ready_${payload.userId}`] = payload.timestamp;
        if (this.callbacks.onReadyStatus) {
            this.callbacks.onReadyStatus({
                lifeReady: !!this.gameState.ready_Lifedelinquent,
                chronoReady: !!this.gameState.ready_ChronoKoala
            });
        }
        this.checkBothReady();
    }

    checkBothReady() {
        if (this.gameState.ready_Lifedelinquent && this.gameState.ready_ChronoKoala) {
            // Both ready - host triggers match start
            if (this.isHost && this.callbacks.onBothReady) {
                this.callbacks.onBothReady();
            }
        }
    }

    listenToOnline(opponentId, callback) {
        this.callbacks.onOnline = callback;
        // If already connected, fire immediately
        if (this.connected) callback(true);
        return () => { this.callbacks.onOnline = null; };
    }

    handleOnline(payload) {
        if (this.callbacks.onOnline) this.callbacks.onOnline(true);
    }

    /**
     * Send our stats to the opponent for lobby display
     */
    sendStats() {
        this.send('stats', {
            wins: this.stats.wins || 0,
            losses: this.stats.losses || 0
        });
    }

    /**
     * Handle receiving opponent's stats
     */
    handleStats(payload) {
        this.opponentStats = {
            wins: payload.wins || 0,
            losses: payload.losses || 0
        };
        console.log('Received opponent stats:', this.opponentStats);
        if (this.callbacks.onOpponentStats) {
            this.callbacks.onOpponentStats(this.opponentStats);
        }
    }

    /**
     * Listen for opponent stats
     */
    listenToOpponentStats(callback) {
        this.callbacks.onOpponentStats = callback;
        // If we already have opponent stats, fire immediately
        if (this.opponentStats) callback(this.opponentStats);
        return () => { this.callbacks.onOpponentStats = null; };
    }

    async triggerMatchStart() {
        const startData = {
            startTime: Date.now() + 3000,
            seed: Math.random(),
            timestamp: Date.now()
        };
        this.gameState.matchStart = startData;
        this.lastStartTime = startData.timestamp; // Prevent duplicate handling
        this.send('matchStart', startData);
        console.log('Match start triggered');

        // Also start the host's own game
        if (this.callbacks.onMatchStart) {
            this.callbacks.onMatchStart(startData.startTime);
        }

        return startData.startTime;
    }

    listenToMatchStart(callback) {
        this.callbacks.onMatchStart = callback;
        return () => { this.callbacks.onMatchStart = null; };
    }

    handleMatchStart(payload) {
        if (Date.now() - payload.timestamp < 10000) {
            if (this.lastStartTime !== payload.timestamp) {
                this.lastStartTime = payload.timestamp;
                if (this.callbacks.onMatchStart) this.callbacks.onMatchStart(payload.startTime);
            }
        }
    }

    async setRematch(isReady) {
        this.gameState[`rematch_${this.userId}`] = isReady;
        this.send('rematch', { userId: this.userId, isReady });
    }

    listenToRematch(opponentId, callback) {
        this.callbacks.onRematch = callback;
        return () => { this.callbacks.onRematch = null; };
    }

    handleRematch(payload) {
        this.gameState[`rematch_${payload.userId}`] = payload.isReady;
        const meReady = this.gameState[`rematch_${this.userId}`];
        const opReady = this.gameState[`rematch_${this.opponentId}`];
        if (this.callbacks.onRematch) this.callbacks.onRematch(meReady && opReady);
    }

    async setPause(isPaused) {
        const pauseState = isPaused ? {
            paused: true,
            pausedBy: this.userId,
            pausedAt: Date.now()
        } : {
            paused: false,
            pausedBy: null,
            pausedAt: null
        };
        this.gameState.pauseState = pauseState;
        this.send('pause', pauseState);
        console.log(`${this.userId} ${isPaused ? 'paused' : 'unpaused'} the game`);

        // Also apply pause locally
        if (this.callbacks.onPause) {
            this.callbacks.onPause({
                paused: pauseState.paused,
                pausedBy: pauseState.pausedBy,
                pausedAt: pauseState.pausedAt,
                canUnpause: true // Player who paused can always unpause
            });
        }
    }

    listenToPause(callback) {
        this.callbacks.onPause = callback;
        // Initial state
        callback({ paused: false, pausedBy: null, pausedAt: null, canUnpause: true });
        return () => { this.callbacks.onPause = null; };
    }

    handlePause(payload) {
        this.gameState.pauseState = payload;
        const fiveMinutes = 5 * 60 * 1000;
        const timeElapsed = payload.pausedAt ? Date.now() - payload.pausedAt : 0;
        const canUnpause = payload.pausedBy === this.userId || timeElapsed >= fiveMinutes;

        if (this.callbacks.onPause) {
            this.callbacks.onPause({
                paused: payload.paused,
                pausedBy: payload.pausedBy,
                pausedAt: payload.pausedAt,
                canUnpause: canUnpause
            });
        }
    }

    // --- Stats Persistence (localStorage) ---
    // Stats are saved per-player so each browser tracks both players' records

    loadStats() {
        try {
            // Load stats for the current player (based on whether host or guest)
            const key = this.isHost ? 'tetris_life_stats_life' : 'tetris_life_stats_chrono';
            const saved = localStorage.getItem(key);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.warn('Could not load stats:', e);
        }
        return { name: '', wins: 0, losses: 0, pb: 0 };
    }

    saveStats() {
        try {
            const key = this.isHost ? 'tetris_life_stats_life' : 'tetris_life_stats_chrono';
            localStorage.setItem(key, JSON.stringify(this.stats));
        } catch (e) {
            console.warn('Could not save stats:', e);
        }
    }

    async recordLoss() {
        this.stats.losses++;
        this.saveStats();
    }

    /**
     * Get win/loss records for both players (for lobby display)
     * @returns {{ life: {wins: number, losses: number}, chrono: {wins: number, losses: number} }}
     */
    static getPlayerRecords() {
        let lifeStats = { wins: 0, losses: 0 };
        let chronoStats = { wins: 0, losses: 0 };

        try {
            const lifeSaved = localStorage.getItem('tetris_life_stats_life');
            if (lifeSaved) {
                const parsed = JSON.parse(lifeSaved);
                lifeStats = { wins: parsed.wins || 0, losses: parsed.losses || 0 };
            }
        } catch (e) {
            console.warn('Could not load Life stats:', e);
        }

        try {
            const chronoSaved = localStorage.getItem('tetris_life_stats_chrono');
            if (chronoSaved) {
                const parsed = JSON.parse(chronoSaved);
                chronoStats = { wins: parsed.wins || 0, losses: parsed.losses || 0 };
            }
        } catch (e) {
            console.warn('Could not load Chrono stats:', e);
        }

        return { life: lifeStats, chrono: chronoStats };
    }

    // --- Cleanup ---

    destroy() {
        if (this.conn) this.conn.close();
        if (this.peer) this.peer.destroy();
        this.connected = false;
    }
}
