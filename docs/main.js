import { TetrisEngine } from './tetris.js'; // Corrected Import
import { BattleManager } from './battle.js';
import { ArcadeManager } from './arcade_effects.js?v=3'; // Cache Busting
import { P2PHandler } from './p2p.js';

let fb = null; // Will be initialized when P2P connection is established
const arcade = new ArcadeManager();
arcade.init(); // Initialize the Tetris background animation
window.arcade = arcade; // Expose globally for debugging

// ... Global Vars ...
// ...

function gameLoop() {
    if (!startTime || isPaused) {
        requestAnimationFrame(gameLoop);
        return;
    }

    const now = Date.now();
    const elapsed = now - startTime;

    // Timer UI (Count UP)
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    document.getElementById('timer').innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    // Level & Speed Logic - Faster progression for intense battles (based on Tetris 99 research)
    const level = Math.floor(elapsed / 15000) + 1; // 15s Levels (faster than before)

    // START DRUMS - DISABLED for MP3 Mode
    // if (level >= 2) { arcade.setDrums(true); } else { arcade.setDrums(false); }
    arcade.setDrums(false);

    // Speed: 1200ms start, decrease 50ms per level, min 180ms (reaches max speed at ~5 mins)
    let targetSpeed = Math.max(180, 1200 - ((level - 1) * 50));

    // Music Tempo Sync (MP3 Speed)
    // Safeguard: Ensure level is valid before setting tempo
    if (!isNaN(level) && level > 0) {
        // arcade.setTempoScale(1 + ((level - 1) * 0.05)); // Old Synth
        arcade.setMusicSpeed(1 + ((level - 1) * 0.02)); // New MP3 (Slower/Gradual: 2% per level)
    }

    // Stats UI (Score)
    if (myScoreId) document.getElementById(myScoreId).innerText = score;

    // Power-up check (Rush Override)
    if (p1Battle.finalRushActive) {
        targetSpeed = 300; // FASTEST (Fixed for Rush)
        document.getElementById('p1-rush-btn').classList.add('active'); // Visual
    }

    currentSpeed = targetSpeed;

    try {
        if (p1) p1.render();
        if (p2 && p2.render) p2.render();

        // Panic Mode Music - Check if either player is in danger
        const p1Container = document.querySelector('.p1-split .main-board-container');
        const p2Container = document.querySelector('.p2-split .main-board-container');
        const p1InDanger = p1Container && p1Container.classList.contains('danger-mode');
        const p2InDanger = p2Container && p2Container.classList.contains('danger-mode');
        arcade.setPanicMode(p1InDanger || p2InDanger);
    } catch (e) {
        console.error("Game Loop Render Error:", e);
    }

    requestAnimationFrame(gameLoop);
}
window.arcade = arcade; // Expose for debugging


window.addEventListener('load', () => {
    try {
        console.log("Initializing Arcade Manager...");

        // Auto-init audio on first user interaction (no click-to-start screen)
        let audioInitialized = false;
        document.addEventListener('click', () => {
            if (!audioInitialized) {
                console.log("First click detected. Unlocking audio...");
                arcade.initAudio();
                arcade.resumeAudio();
                audioInitialized = true;
            }
        }, { once: false }); // Keep listening but only init once

        // Music toggle button functionality
        const musicBtn = document.getElementById('music-toggle');
        if (musicBtn) {
            musicBtn.addEventListener('click', () => {
                if (arcade.musicOn) {
                    arcade.stopMusic();
                    musicBtn.innerText = "🎵 MUSIC: OFF";
                } else {
                    arcade.startMusic();
                    musicBtn.innerText = "🎵 MUSIC: ON";
                }
            });
        }

        // Volume Sliders (In-Game)
        const musicSlider = document.getElementById('music-slider');
        if (musicSlider) {
            musicSlider.addEventListener('input', (e) => {
                arcade.setMusicVolume(e.target.value);
            });
        }

        const sfxSlider = document.getElementById('sfx-slider');
        if (sfxSlider) {
            sfxSlider.addEventListener('input', (e) => {
                arcade.setSfxVolume(e.target.value);
            });
        }
        // Note: Music toggle is already handled above

        // Music Toggle (In-Game)
        const inGameMusicBtn = document.getElementById('ingame-music-toggle');
        if (inGameMusicBtn) {
            console.log("Mute button found, attaching listener...");
            inGameMusicBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent event bubbling
                console.log("Mute button clicked!");
                const isPlaying = arcade.toggleMusic();
                inGameMusicBtn.innerText = isPlaying ? "🔊" : "🔇";
                if (isPlaying) arcade.playClickSound();
                inGameMusicBtn.blur(); // Remove focus so spacebar doesn't trigger it
            });
        } else {
            console.warn("Mute button NOT found!");
        }

    } catch (e) {
        console.error("Arcade Init Failed:", e);
        alert("Arcade Init Failed: " + e.message);
    }
});

console.log("Main script loaded");

let p1, p2, p1Battle;
let matchActive = false;
let startTime;
const MATCH_DURATION = 120000; // 2 minutes

// Game State Globals
let score = 0;
let currentSpeed = 1000;
let tickTimeout;
let myScoreId;
let myButtonPrefix = 'p1'; // Default to p1, set dynamically in initGame

const p1Canvas = document.getElementById('p1-canvas');
const p2Canvas = document.getElementById('p2-canvas');
let isPaused = false;
let pauseStartTime = 0;

let gameInitialized = false;

async function initGame(userId) {
    if (gameInitialized) return;
    gameInitialized = true;
    console.log("Initializing game for", userId);

    // P2P handler should already be initialized during connection
    // For solo mode, create a mock handler
    if (userId === "Solo" && !fb) {
        fb = { userId: "Solo", sendGameState: () => { }, sendAttack: () => { }, sendBomb: () => { }, setPause: () => { } };
    }
    console.log("Starting P2P Mode with user:", userId);

    try {
        let stats;

        // Use the mock handler's init (which is instant)
        stats = await fb.initPlayer(userId);

        console.log("Player stats loaded:", stats);

        // Initialize match with a PROPER empty grid (20 rows x 12 cols)
        const emptyGrid = Array.from({ length: 20 }, () => Array(12).fill(0));
        fb.sendGameState(emptyGrid, 0, []).catch(e => console.error("Initial sendGameState failed:", e));

        // Stats Population (Local)
        // Note: For now, in offline mode, we only fetch our OWN stats.
        // The opponent's stats will be 0 by default in the HTML.
        const myWins = stats.wins;
        // const myPB = stats.pb; 

        // Dynamic Canvas Binding based on User Identity
        let localCanvas, remoteCanvas, localNext, remoteNext, localHold, remoteHold;

        if (userId === "Solo") {
            // SINGLE PLAYER SETUP
            document.body.classList.add('single-player');
            localCanvas = document.getElementById('p1-canvas');
            localNext = document.getElementById('p1-next');
            localHold = document.getElementById('p1-hold');
            // Remote is ignored/dummy
            remoteCanvas = document.getElementById('p2-canvas');
            remoteNext = document.getElementById('p2-next');

            document.querySelector('.p1-split .player-name').innerText = "SOLO CHALLENGE";
            document.getElementById('p1-lifetime-wins').innerText = "-";
            myScoreId = 'p1-pb';

            // Highlight
            document.querySelector('.p1-border').style.borderColor = '#4a90e2'; // Blue
            document.querySelector('.p1-border').style.boxShadow = '0 0 20px #4a90e2';

        } else if (userId === "Lifedelinquent") {
            localCanvas = document.getElementById('p1-canvas');
            // ... (rest of P1 logic)
            remoteCanvas = document.getElementById('p2-canvas');
            localNext = document.getElementById('p1-next');
            localHold = document.getElementById('p1-hold');
            remoteNext = document.getElementById('p2-next');

            // UI Labels & Stats
            document.querySelector('.p1-split .player-name').innerText = "LIFEDELINQUENT (YOU)";
            document.querySelector('.p2-split .player-name').innerText = "CHRONOKOALA (OPPONENT)";
            document.getElementById('p1-lifetime-wins').innerText = myWins;

            // Highlight My Board
            document.querySelector('.p1-border').style.borderColor = '#FFD700'; // Gold
            document.querySelector('.p1-border').style.boxShadow = '0 0 20px #FFD700';

            myScoreId = 'p1-pb';
            myButtonPrefix = 'p1';
        } else {
            // ... (P2 logic)
            localCanvas = document.getElementById('p2-canvas');
            remoteCanvas = document.getElementById('p1-canvas');
            localNext = document.getElementById('p2-next');
            localHold = document.getElementById('p2-hold');
            remoteNext = document.getElementById('p1-next');

            // UI Labels & Stats
            document.querySelector('.p2-split .player-name').innerText = "CHRONOKOALA (YOU)";
            document.querySelector('.p1-split .player-name').innerText = "LIFEDELINQUENT (OPPONENT)";
            document.getElementById('p2-lifetime-wins').innerText = myWins;

            // Highlight My Board
            document.querySelector('.p2-border').style.borderColor = '#FFD700'; // Gold
            document.querySelector('.p2-border').style.boxShadow = '0 0 20px #FFD700';

            myScoreId = 'p2-pb';
            myButtonPrefix = 'p2';
        }

        // p1 variable acts as the LOCAL ENGINE (Your Inputs)
        p1 = new TetrisEngine(localCanvas, localNext, localHold);
        p1Battle = new BattleManager(p1, userId === 'Lifedelinquent' || userId === 'Solo');
        p1Battle.onShieldUsed = () => updatePowerUpUI(); // Update UI when shield is consumed

        // p2 variable acts as the REMOTE ENGINE (Network Updates)
        p2 = new TetrisEngine(remoteCanvas, remoteNext);

        // --- Presence & Match Start Logic ---
        if (userId === "Solo") {
            console.log("Solo Mode: Starting immediately...");
            // Immediate Start
            startCountdown(Date.now() + 3000);
            return; // EXIT initGame, skip network listeners
        }

        // 1. Announce I am online
        fb.setOnline();

        // 2. Listen for the Start Signal (Handles BOTH players)
        fb.listenToMatchStart((timestamp) => {
            console.log("Match Start Signal Received via Network:", new Date(timestamp));
            startCountdown(timestamp);
        });

        // 2b. Listen for Pause State Sync (Both players pause/unpause together)
        fb.listenToPause((pauseState) => {
            // Only log actual pause changes, not every Firebase update
            applyLocalPause(pauseState.paused, pauseState.canUnpause);
        });

        // 3. Check for Opponent Presence to trigger start
        // Host (Lifedelinquent) detects Guest.
        const opponentId = userId === "Lifedelinquent" ? "ChronoKoala" : "Lifedelinquent";

        // Listen continuously. The handler in multiplayer.js handles deduping by timestamp.
        fb.listenToOnline(opponentId, async (isOnline) => {
            if (isOnline) {
                console.log("Opponent Detected (New Session/Refresh)!");

                // Host Authority: Only Lifedelinquent triggers the start
                if (userId === "Lifedelinquent") {
                    console.log("I am Host. Triggering/Restaring Match...");
                    try {
                        await fb.triggerMatchStart();
                    } catch (e) { console.error("Trigger Start Failed", e); }
                } else {
                    console.log("I am Guest. Waiting for Host...");
                }
            }
        });


        fb.listenToMatch((data) => {
            if (data[`${opponentId}_grid`]) {
                const gridData = data[`${opponentId}_grid`];
                const parsedGrid = typeof gridData === 'string' ? JSON.parse(gridData) : gridData;

                // Validate Grid Structure (Must be array of arrays)
                if (Array.isArray(parsedGrid) && parsedGrid.length > 0 && Array.isArray(parsedGrid[0])) {
                    p2.grid = parsedGrid;
                }
                // Empty grid is normal during game start/end - no warning needed
            }
            // Check for Ghost Piece
            if (data[`${opponentId}_ko`] !== undefined) {
                const targetId = userId === "Lifedelinquent" ? 'p2-ko' : 'p1-ko';
                document.getElementById(targetId).innerText = data[`${opponentId}_ko`];
            }

            // NEW: Parse the opponent's full state object
            if (data[opponentId]) {
                try {
                    const oppState = typeof data[opponentId] === 'string' ? JSON.parse(data[opponentId]) : data[opponentId];

                    // Grid
                    if (oppState.grid) {
                        const parsedGrid = typeof oppState.grid === 'string' ? JSON.parse(oppState.grid) : oppState.grid;
                        if (Array.isArray(parsedGrid) && parsedGrid.length > 0 && Array.isArray(parsedGrid[0])) {
                            // Detect line clears by comparing filled rows
                            const oldFilledRows = p2.grid ? p2.grid.filter(row => row.some(cell => cell !== 0)).length : 0;
                            const newFilledRows = parsedGrid.filter(row => row.some(cell => cell !== 0)).length;
                            const linesCleared = oldFilledRows - newFilledRows;

                            // Trigger effects if lines were cleared (opponent scored)
                            if (linesCleared > 0 && window.arcade) {
                                const isP1Side = userId !== 'Lifedelinquent'; // Opponent is on P1 side if I'm Chrono
                                const centerX = isP1Side ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
                                const centerY = window.innerHeight * 0.5;
                                window.arcade.createExplosion(centerX, centerY, '#FF0D72', linesCleared * 10);

                                // Floating text for big clears
                                if (linesCleared >= 4) {
                                    window.arcade.createFloatingText('TETRIS!', centerX, centerY - 50, '#FFD700');
                                } else if (linesCleared >= 2) {
                                    window.arcade.createFloatingText(`+${linesCleared}`, centerX, centerY - 50, '#0DC2FF');
                                }
                            }

                            p2.grid = parsedGrid;
                        }
                    }

                    // Active Piece
                    if (oppState.activePiece) {
                        const p = oppState.activePiece;
                        // Only trigger win if explicitly game_over === true (not just truthy/undefined)
                        if (p.game_over === true) {
                            console.log("Opponent sent game_over signal!");
                            if (matchActive) {
                                // Record the win locally
                                if (fb && fb.recordWin) {
                                    fb.recordWin();
                                }
                                handleGameOver(false);
                                showResultScreen("WIN");
                            }
                        } else if (p.type) {
                            p2.currentPiece = p.type;
                            p2.pos = p.pos || { x: 0, y: 0 };
                            p2.rotation = p.rotation || 0;
                            if (p.score !== undefined) {
                                const targetId = userId === "Lifedelinquent" ? 'p2-pb' : 'p1-pb';
                                document.getElementById(targetId).innerText = p.score;
                                p2.score = p.score;
                                updateAvatar();
                            }
                            // Lines Sent (Attack Score)
                            if (p.linesSent !== undefined) {
                                const targetId = userId === "Lifedelinquent" ? 'p2-lines-sent' : 'p1-lines-sent';
                                const el = document.getElementById(targetId);
                                if (el) el.innerText = p.linesSent;
                            }
                        }
                    }

                    // KO Count
                    if (oppState.ko !== undefined) {
                        const targetId = userId === "Lifedelinquent" ? 'p2-ko' : 'p1-ko';
                        document.getElementById(targetId).innerText = oppState.ko;
                    }
                } catch (e) {
                    console.warn("Error parsing opponent state:", e);
                }
            }
        });

        // Remove duplicate listener (was previously duplicated below)
        // fb.listenToMatch((data) => { ... }); // REMOVED

        fb.listenToAttacks((lines, effect) => {
            p1Battle.receiveGarbage(lines, effect);
        });

        // Listen for bomb attacks
        fb.listenToBombs(() => {
            p1Battle.receiveBomb();
        });

        // Setup bomb detonation handler
        p1Battle.setupBombDetonation();

    } catch (error) {
        console.error("Error initializing game:", error);
        alert("Failed to initialize game. Check console for details.");
    }
}

function startCountdown(targetStartTime) {
    // Force Interrupt: Stop any running game loop logic
    matchActive = false;
    startTime = null;

    // Reset Game State - only if p1 already exists (rematch scenario)
    // For first game start, initGame already set up p1
    if (p1 && p1.canvas) {
        p1 = new TetrisEngine(p1.canvas, p1.nextCanvas, p1.holdCanvas);
        p1Battle = new BattleManager(p1, myButtonPrefix === 'p1');
        p1Battle.onShieldUsed = () => updatePowerUpUI(); // Update UI when shield is consumed
        p1Battle.setupBombDetonation(); // Re-register bomb detonation callback
    }

    score = 0; // RESET SCORE!
    document.getElementById('p1-pb').innerText = "0"; // Reset UI immediately

    // Reset power-up UI (removes old highlights)
    updatePowerUpUI();

    // Reset lines-sent display for both players
    const p1SentEl = document.getElementById('p1-lines-sent');
    const p2SentEl = document.getElementById('p2-lines-sent');
    if (p1SentEl) p1SentEl.innerText = '0';
    if (p2SentEl) p2SentEl.innerText = '0';

    // Broadcast Empty State to Opponent immediately
    // This ensures they see us as empty even if they joined late or have old data
    fb.sendGameState(p1.grid, 0, [], null).catch(e => console.error("Failed to broadcast reset:", e));

    // Reset Opponent Visuals (Dynamic)
    if (p2 && p2.canvas) {
        const p2Ctx = p2.canvas.getContext('2d');
        p2Ctx.clearRect(0, 0, p2Ctx.canvas.width, p2Ctx.canvas.height);
    }

    // Optional: Draw 'Waiting' or Empty Grid? Empty is fine.
    // Also clear secondary canvases if possible, but main board is key.

    // Hide Game Over Screen explicitly (Fixes stuck overlay on rematch)
    document.getElementById('game-over-screen').classList.add('hidden');

    const overlay = document.getElementById('countdown-overlay');
    const text = document.getElementById('countdown-text');
    overlay.classList.remove('hidden');

    const interval = setInterval(() => {
        const now = Date.now();
        const diff = Math.ceil((targetStartTime - now) / 1000);

        if (diff > 0) {
            text.innerText = diff;
            arcade.playSoftBeep(); // Beep on count
        } else {
            clearInterval(interval);
            text.innerText = "GO!";
            arcade.playClickSound(); // Go sound
            setTimeout(() => overlay.classList.add('hidden'), 500);

            // Audio Switch - Start battle music (MP3 playlist at 40%)
            arcade.stopGameOverMusic(); // Stop any game over music still playing
            arcade.stopMusic(); // Stop lobby synth music
            arcade.startBattleMusic(); // Start MP3 playlist

            // START GAME
            matchActive = true;
            startTime = Date.now();
            requestAnimationFrame(gameLoop);
            tick();
        }
    }, 100);
}

// Helper: Handle Piece Lock (Scoring & Attacks)
function handleLock(result) {
    if (!result.locked) return;

    // Scoring: Landing = 25
    score += 25;

    // Scoring: Standard Tetris (100, 300, 500, 800)
    if (result.linesCleared === 1) score += 100;
    else if (result.linesCleared === 2) score += 300;
    else if (result.linesCleared === 3) score += 500;
    else if (result.linesCleared === 4) score += 800;

    if (result.linesCleared > 0) {
        arcade.playLineClear(result.linesCleared);
        // Track lines for powerup unlock
        if (p1Battle.onLineClear(result.linesCleared)) {
            updatePowerUpUI();
        }
    } else {
        arcade.playLand();
    }

    const isTSpin = p1.isTSpin(); // Note: Check T-Spin BEFORE drop? 
    // Actually drop() inside tetris.js already spawned new piece, so isTSpin might be wrong?
    // Wait, p1.isTSpin() checks current pos. 
    // If drop() spawns new piece, p1.pos resets. 
    // FIXED: TetrisEngine needs to return TSpin status or we check before?
    // In tick(), isTSpin was calculated BEFORE p1.drop().
    // We need to pass isTSpin into handleLock or move it.
    // Let's rely on the caller to pass isTSpin if needed, or simplfy.
    // For now, let's just make handleLock take (result, isTSpin).

    if (myScoreId) document.getElementById(myScoreId).innerText = score;
    updateAvatar();

    // Counter System: Lines cleared reduce pending garbage first
    // Then remaining lines become attack
    let attackLines = p1Battle.calculateAttack(result.linesCleared, arguments[1] || false);

    // Counter pending garbage with lines cleared
    if (result.linesCleared > 0) {
        const remainingForAttack = p1Battle.counterGarbage(result.linesCleared);
        // Scale attack based on how many lines actually used for attack (not countered)
        if (remainingForAttack < result.linesCleared) {
            // Some lines were used for countering, reduce attack proportionally
            const counterRatio = remainingForAttack / result.linesCleared;
            attackLines = Math.floor(attackLines * counterRatio);
        }
    }

    // Send attack to opponent
    if (attackLines > 0 && fb.userId !== "Solo") {
        const opponentId = fb.userId === "Lifedelinquent" ? "ChronoKoala" : "Lifedelinquent";
        fb.sendAttack(opponentId, attackLines);

        // Track lines sent and update UI
        p1Battle.linesSent += attackLines;
        const mySentId = fb.userId === "Lifedelinquent" ? 'p1-lines-sent' : 'p2-lines-sent';
        const sentEl = document.getElementById(mySentId);
        if (sentEl) sentEl.innerText = p1Battle.linesSent;
    }
    // DoT system handles garbage application automatically via timer

    // Update State (New Piece)
    if (fb.userId !== "Solo") {
        fb.sendGameState(p1.grid, p1Battle.koCount, p1Battle.pendingGarbage, {
            type: p1.currentPiece,
            pos: p1.pos,
            rotation: p1.rotation,
            score: score,
            linesSent: p1Battle.linesSent
        });
    }

    // Game Over Check
    if (p1.gameOver) {
        handleGameOver(true);
    }
}

// Main Game Loop (Gravity)
let lastTickTime = 0;

function tick() {
    if (!matchActive || isPaused) return;

    // Check bomb timers (only runs when game is active, not paused)
    if (p1Battle) p1Battle.updateBombs();

    const now = Date.now();
    if (lastTickTime === 0) lastTickTime = now;

    let delta = now - lastTickTime;

    // Safety cap: If delta is huge (e.g. computer sleep), don't spiral. Max 10 ticks.
    if (delta > currentSpeed * 10) {
        delta = currentSpeed;
        lastTickTime = now - delta;
    }

    // Accumulator: While enough time has passed for at least one drop...
    while (delta >= currentSpeed) {

        // --- Single Tick Logic ---
        const isTSpin = p1.isTSpin();
        const result = p1.drop();

        // Broadcast Movement (if falling)
        // Optimization check: broadcast every tick? Or only if state changed significantly?
        // Let's keep broadcasting for smooth view, but maybe limit rate?
        // Actually, broadcast is lightweight.
        if (!result.locked && fb.userId !== "Solo") {
            fb.sendGameState(p1.grid, p1Battle.koCount, p1Battle.garbageQueue, {
                type: p1.currentPiece,
                pos: p1.pos,
                rotation: p1.rotation,
                score: score
            });
        }

        handleLock(result, isTSpin);

        if (p1.gameOver) {
            handleGameOver(true);
            return;
        }
        // -------------------------

        delta -= currentSpeed;
        lastTickTime += currentSpeed;

        // If we locked, maybe break catch-up to allow visual delay? 
        // Standard tetris usually continues or has "Are" delay.
        // For simple web tetris, continuing is fine, makes it fast in late game.
    }

    // Schedule next check
    // We can check often (e.g. 50ms) to hit the targetSpeed accurately.
    // Background throttling will force this to ~1000ms, which the while loop handles.
    clearTimeout(tickTimeout);
    tickTimeout = setTimeout(() => {
        tick();
    }, 50); // High polling rate for precision in foreground, auto-throttles in background
}

function handleGameOver(toppedOut) {
    matchActive = false;
    clearTimeout(tickTimeout);

    // Stop Game Music - game over music will handle transition to lobby music
    arcade.stopBattleMusic();

    // Logic: If I topped out, I lose.
    // If time ran out, compare scores? Or just Draw?
    // User Request: "when one player... gets to top he loses so KO goto other player"

    let result = "DRAW";
    if (toppedOut) {
        result = "LOSE";
        // Record the loss locally
        if (fb && fb.recordLoss) {
            fb.recordLoss();
        }
        // Notify Opponent I lost? 
        // Opponent needs to know to show "WIN".
        // simple way: set KO to Opponent locally?
        // Better: Send a "I DIED" signal?
        // We already send "ko" count.
        // Wait, "KO goto other player" means Opponent gets a point. 

        // Let's send a special 'game_over' state or just rely on manual "I Lost" logic overlay.
        fb.sendGameState(p1.grid, p1Battle.koCount, p1Battle.garbageQueue, { game_over: true });
    }

    showResultScreen(result);
}

// --- Sync Opponent Stats ---
// --- Sync Opponent Stats ---
// Logic moved to initGame() to ensure fb is defined


// --- Rematch Logic ---
document.getElementById('restart-btn').onclick = () => {
    arcade.playClickSound();

    if (fb.userId === "Solo") {
        document.getElementById('game-over-screen').classList.add('hidden');
        startCountdown(Date.now() + 3000); // Immediate Restart
        return;
    }

    document.getElementById('restart-btn').innerText = "Waiting for Opponent...";
    document.getElementById('restart-btn').disabled = true;
    fb.setRematch(true);

    // Start listening for BOTH to be ready
    // Start listening for BOTH to be ready
    const opponentId = fb.userId === "Lifedelinquent" ? "ChronoKoala" : "Lifedelinquent";
    let hasTriggeredRematch = false; // LOCK

    const cleanup = fb.listenToRematch(opponentId, async (bothReady) => {
        if (bothReady && !hasTriggeredRematch) {
            console.log("Both Ready for Rematch!");
            hasTriggeredRematch = true; // Lock immediately

            // Reset Rematch Flags
            localStorage.removeItem(`rematch_${fb.userId}`);
            localStorage.removeItem(`rematch_${opponentId}`);

            // Hide Overlay
            document.getElementById('game-over-screen').classList.add('hidden');
            document.getElementById('restart-btn').innerText = "Play Again";
            document.getElementById('restart-btn').disabled = false;

            // Trigger New Match (Host Only Authority again?)
            // Actually, triggerMatchStart already has race-handling in backend (maybe), but let's be safe.
            // Let's use Host Authority again.

            if (fb.userId === "Lifedelinquent") {
                const selfStart = await fb.triggerMatchStart();
                // Note: we don't startCountdown here, we let the global listener handle it!
                // Removing direct startCountdown calls prevents the local/remote double-start.
            }

            // Cleanup listener
            cleanup();
        }
    });
};

document.getElementById('quit-btn').onclick = () => {
    arcade.playClickSound();
    location.reload();
};

function showResultScreen(result) {
    document.getElementById('winner-text').innerText = result;
    document.getElementById('game-over-screen').classList.remove('hidden');

    // Play game over music (plays once, then starts lobby music)
    arcade.playGameOverMusic();
}

function updatePowerUpUI() {
    if (!p1Battle) return;

    const status = p1Battle.getPowerUpStatus();

    // Shield button
    const shieldBtn = document.getElementById(`${myButtonPrefix}-shield-btn`);
    if (shieldBtn) {
        if (status.shield) {
            shieldBtn.classList.add('ready');
            shieldBtn.disabled = false;
            shieldBtn.style.boxShadow = '0 0 15px #0DFF72, 0 0 30px #0DFF72';
            shieldBtn.style.animation = 'pulse 1s infinite';
        } else {
            shieldBtn.classList.remove('ready');
            shieldBtn.disabled = true;
            shieldBtn.style.boxShadow = 'none';
            shieldBtn.style.animation = 'none';
        }
        // If shield is active, show it visually
        if (p1Battle.shieldActive) shieldBtn.classList.add('active');
    }

    // Lightning button
    const rushBtn = document.getElementById(`${myButtonPrefix}-rush-btn`);
    if (rushBtn) {
        if (status.lightning) {
            rushBtn.classList.add('ready');
            rushBtn.disabled = false;
            rushBtn.style.boxShadow = '0 0 15px #FFFF00, 0 0 30px #FFFF00';
            rushBtn.style.animation = 'pulse 1s infinite';
        } else {
            rushBtn.classList.remove('ready');
            rushBtn.disabled = true;
            rushBtn.style.boxShadow = 'none';
            rushBtn.style.animation = 'none';
        }
    }

    // Bomb button
    const twinBtn = document.getElementById(`${myButtonPrefix}-twin-btn`);
    if (twinBtn) {
        if (status.bomb) {
            twinBtn.classList.add('ready');
            twinBtn.disabled = false;
            twinBtn.style.boxShadow = '0 0 15px #FF00FF, 0 0 30px #FF00FF';
            twinBtn.style.animation = 'pulse 1s infinite';
        } else {
            twinBtn.classList.remove('ready');
            twinBtn.disabled = true;
            twinBtn.style.boxShadow = 'none';
            twinBtn.style.animation = 'none';
        }
    }

    // Color Buster button
    const busterBtn = document.getElementById(`${myButtonPrefix}-buster-btn`);
    if (busterBtn) {
        if (status.colorBuster) {
            busterBtn.classList.add('ready');
            busterBtn.disabled = false;
            busterBtn.style.boxShadow = '0 0 15px #FFFFFF, 0 0 30px #00FFFF, 0 0 45px #FF00FF';
            busterBtn.style.animation = 'pulse 1s infinite';
        } else {
            busterBtn.classList.remove('ready');
            busterBtn.disabled = true;
            busterBtn.style.boxShadow = 'none';
            busterBtn.style.animation = 'none';
        }
    }
}

// Controls
window.addEventListener('keydown', (e) => {
    if (!matchActive) return;

    // Powerups Shortcuts
    const k = e.key.toLowerCase();
    if (k === 's') {
        const btn = document.getElementById(`${myButtonPrefix}-shield-btn`);
        if (btn) btn.click();
    }
    if (k === 'r') {
        const btn = document.getElementById(`${myButtonPrefix}-rush-btn`);
        if (btn) btn.click();
    }
    if (k === 'e') {
        const btn = document.getElementById(`${myButtonPrefix}-twin-btn`);
        if (btn) btn.click();
    }
    if (k === 'q') {
        const btn = document.getElementById(`${myButtonPrefix}-buster-btn`);
        if (btn) btn.click();
    }

    // Movement Logic
    // Movement Logic
    let changed = false;
    let lockResult = null;
    let tSpinCheck = false;

    if (e.key === 'ArrowLeft') { p1.pos.x--; changed = true; }
    if (e.key === 'ArrowRight') { p1.pos.x++; changed = true; }

    if (e.key === 'ArrowDown') {
        tSpinCheck = p1.isTSpin();
        lockResult = p1.drop(); // Check lock
        changed = true;
    }

    if (e.key === 'ArrowUp') {
        p1.rotate(1);
        changed = true;
        arcade.playRotate();
    }

    if (e.key === ' ') {
        tSpinCheck = p1.isTSpin();
        lockResult = p1.hardDrop(); // Check lock
        changed = true;
    }

    if (e.key === 'c' || e.key === 'C') { p1.hold(); changed = true; }

    if (p1.collide() && e.key !== 'ArrowDown' && e.key !== ' ' && e.key !== 'ArrowUp') {
        // ... (Revert code same as before)
        if (e.key === 'ArrowLeft') p1.pos.x++;
        if (e.key === 'ArrowRight') p1.pos.x--;
    }

    // Handle Manual Lock
    if (lockResult && lockResult.locked) {
        handleLock(lockResult, tSpinCheck);
        // Don't need to broadcast here, handleLock does it
        changed = false; // Prevent double broadcast below if we locked
    }

    // Broadcast State immediately on input for smooth ghosting (if NOT locked)

    // Broadcast State immediately on input for smooth ghosting
    if (changed && fb.userId !== "Solo") {
        fb.sendGameState(p1.grid, p1Battle.koCount, p1Battle.garbageQueue, {
            type: p1.currentPiece,
            pos: p1.pos,
            rotation: p1.rotation,
            score: score // Include score!
        });
    }
});

// Power-up Tooltip Logic
const tooltip = document.getElementById('powerup-tooltip');
document.querySelectorAll('.power-icon').forEach(btn => {
    btn.addEventListener('mouseenter', (e) => {
        let text = "";
        const id = e.target.id;

        if (id.includes('shield')) text = "SHIELD [S]: Blocks the next incoming garbage attack";
        if (id.includes('rush')) text = "LIGHTNING [R]: Gives you 3 long I-pieces in a row";
        if (id.includes('twin')) text = "BOMB [E]: Sends timer bomb to opponent (10s)";
        if (id.includes('buster')) text = "COLOR BUSTER [Q]: Removes all blocks of one color!";

        if (text) {
            tooltip.innerText = text;
            tooltip.classList.remove('hidden');
            arcade.playHoverSound();
        }
    });

    btn.addEventListener('mouseleave', () => {
        tooltip.classList.add('hidden');
    });
});

// Powerup Button Handlers - Set up for both P1 and P2
function setupPowerUpButton(prefix) {
    const shieldBtn = document.getElementById(`${prefix}-shield-btn`);
    const rushBtn = document.getElementById(`${prefix}-rush-btn`);
    const twinBtn = document.getElementById(`${prefix}-twin-btn`);
    const busterBtn = document.getElementById(`${prefix}-buster-btn`);

    if (shieldBtn) {
        shieldBtn.onclick = () => {
            if (!p1Battle) return;
            const result = p1Battle.usePowerUp('shield');
            if (result) {
                shieldBtn.classList.add('active');
                updatePowerUpUI();
                arcade.playClickSound();
            }
        };
    }

    if (rushBtn) {
        rushBtn.onclick = () => {
            if (!p1Battle) return;
            const result = p1Battle.usePowerUp('rush');
            if (result) {
                updatePowerUpUI();
                arcade.playClickSound();
            }
        };
    }

    if (twinBtn) {
        twinBtn.onclick = () => {
            if (!p1Battle) return;
            const result = p1Battle.usePowerUp('twin');
            if (result === 'sendBomb') {
                // Send timer mine bomb to opponent's queue via multiplayer
                const opponentId = fb.userId === "Lifedelinquent" ? "ChronoKoala" : "Lifedelinquent";
                fb.sendBomb(opponentId);
                updatePowerUpUI();
                arcade.playClickSound();

                // Visual feedback for sender
                const x = fb.userId === "Lifedelinquent" ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
                arcade.createFloatingText("💣 BOMB SENT!", x, window.innerHeight * 0.4, '#ff00ff');
            }
        };
    }

    if (busterBtn) {
        busterBtn.onclick = () => {
            if (!p1Battle) return;
            const result = p1Battle.usePowerUp('colorBuster');
            if (result) {
                updatePowerUpUI();
                arcade.playClickSound();
            }
        };
    }
}

// Set up handlers for both players' buttons
setupPowerUpButton('p1');
setupPowerUpButton('p2');

// --- P2P CONNECTION SYSTEM ---
let selectedUserId = null;
let isP2PReady = false;

// P2P Connection UI Handlers
document.getElementById('create-room-btn').onclick = () => {
    arcade.playClickSound();

    // Hide options, show create panel
    document.getElementById('connection-options').classList.add('hidden');
    document.getElementById('create-room-panel').classList.remove('hidden');

    // Create P2P handler and room
    fb = new P2PHandler();
    fb.createRoom(
        // onReady - room created successfully
        (roomCode) => {
            console.log("Room created:", roomCode);
            document.getElementById('room-code-display').innerText = roomCode;
            document.getElementById('create-room-panel').querySelector('h3').innerText = '📡 ROOM READY!';
        },
        // onConnect - opponent joined
        () => {
            console.log("Opponent connected!");
            document.getElementById('host-status').innerText = '✓ Opponent Connected!';
            document.getElementById('host-status').style.color = '#0DFF72';

            // Show connected panel
            setTimeout(() => {
                document.getElementById('create-room-panel').classList.add('hidden');
                document.getElementById('connected-panel').classList.remove('hidden');
                document.getElementById('your-role').innerText = 'You are: Lifedelinquent (Host)';
                selectedUserId = 'Lifedelinquent';
                setupP2PReadySystem();
            }, 1000);
        },
        // onError
        (err) => {
            console.error("Create room error:", err);
            document.getElementById('host-status').innerText = '❌ Error: ' + err.message;
            document.getElementById('host-status').style.color = '#ff3333';
        }
    );
};

document.getElementById('cancel-create-btn').onclick = () => {
    arcade.playClickSound();
    if (fb) fb.destroy();
    fb = null;

    // Reset UI
    document.getElementById('create-room-panel').classList.add('hidden');
    document.getElementById('connection-options').classList.remove('hidden');
    document.getElementById('room-code-display').innerText = '----';
    document.getElementById('host-status').innerText = '⏳ Waiting for opponent...';
    document.getElementById('host-status').style.color = '#FFD700';
};

document.getElementById('join-room-btn').onclick = () => {
    arcade.playClickSound();

    // Hide options, show join panel
    document.getElementById('connection-options').classList.add('hidden');
    document.getElementById('join-room-panel').classList.remove('hidden');
    document.getElementById('room-code-input').focus();
};

document.getElementById('confirm-join-btn').onclick = () => {
    arcade.playClickSound();

    const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (roomCode.length !== 4) {
        document.getElementById('join-error').innerText = 'Please enter a 4-character code';
        return;
    }

    document.getElementById('join-error').innerText = 'Connecting...';
    document.getElementById('join-error').style.color = '#FFD700';

    // Create P2P handler and join room
    fb = new P2PHandler();
    fb.joinRoom(roomCode,
        // onConnect
        () => {
            console.log("Connected to host!");
            document.getElementById('join-error').innerText = '✓ Connected!';
            document.getElementById('join-error').style.color = '#0DFF72';

            // Show connected panel
            setTimeout(() => {
                document.getElementById('join-room-panel').classList.add('hidden');
                document.getElementById('connected-panel').classList.remove('hidden');
                document.getElementById('your-role').innerText = 'You are: ChronoKoala (Guest)';
                selectedUserId = 'ChronoKoala';
                setupP2PReadySystem();
            }, 1000);
        },
        // onError
        (err) => {
            console.error("Join room error:", err);
            document.getElementById('join-error').innerText = '❌ ' + err.message;
            document.getElementById('join-error').style.color = '#ff3333';
            if (fb) fb.destroy();
            fb = null;
        }
    );
};

document.getElementById('cancel-join-btn').onclick = () => {
    arcade.playClickSound();
    if (fb) fb.destroy();
    fb = null;

    // Reset UI
    document.getElementById('join-room-panel').classList.add('hidden');
    document.getElementById('connection-options').classList.remove('hidden');
    document.getElementById('room-code-input').value = '';
    document.getElementById('join-error').innerText = '';
};

// Auto-uppercase room code input
document.getElementById('room-code-input').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
});

// Update lobby records display - shows own stats from localStorage, opponent stats from P2P
function updateLobbyRecords() {
    const myStats = fb.stats;

    const p1RecordEl = document.getElementById('lobby-p1-record');
    const p2RecordEl = document.getElementById('lobby-p2-record');

    // Display my stats on my side
    if (fb.isHost) {
        // I'm Lifedelinquent (host), show my stats on P1 side
        if (p1RecordEl) {
            p1RecordEl.innerText = `${myStats.wins || 0}W - ${myStats.losses || 0}L`;
        }
    } else {
        // I'm ChronoKoala (guest), show my stats on P2 side
        if (p2RecordEl) {
            p2RecordEl.innerText = `${myStats.wins || 0}W - ${myStats.losses || 0}L`;
        }
    }
}

// Update opponent's record display when we receive their stats
function updateOpponentRecord(opponentStats) {
    const p1RecordEl = document.getElementById('lobby-p1-record');
    const p2RecordEl = document.getElementById('lobby-p2-record');

    if (fb.isHost) {
        // I'm host (Life), opponent is Chrono (P2 side)
        if (p2RecordEl) {
            p2RecordEl.innerText = `${opponentStats.wins}W - ${opponentStats.losses}L`;
        }
    } else {
        // I'm guest (Chrono), opponent is Life (P1 side)
        if (p1RecordEl) {
            p1RecordEl.innerText = `${opponentStats.wins}W - ${opponentStats.losses}L`;
        }
    }
}

// Setup P2P ready system after connection
function setupP2PReadySystem() {
    // Update connection status indicators
    const p1Connection = document.getElementById('lobby-p1-connection');
    const p2Connection = document.getElementById('lobby-p2-connection');

    if (fb.isHost) {
        // I'm host (Life) - I'm connected, waiting for guest (Chrono)
        if (p1Connection) {
            p1Connection.innerText = '✓ Connected';
            p1Connection.style.color = '#0DFF72';
        }
        if (p2Connection) {
            p2Connection.innerText = '⏳ Waiting...';
            p2Connection.style.color = '#FFD700';
        }
    } else {
        // I'm guest (Chrono) - both are connected since I just joined
        if (p1Connection) {
            p1Connection.innerText = '✓ Connected';
            p1Connection.style.color = '#0DFF72';
        }
        if (p2Connection) {
            p2Connection.innerText = '✓ Connected';
            p2Connection.style.color = '#F538FF';
        }
    }

    // Update lobby records display for my stats
    updateLobbyRecords();

    // Send my stats to opponent
    fb.sendStats();

    // Listen for opponent stats (this also confirms opponent is connected)
    fb.listenToOpponentStats((opponentStats) => {
        updateOpponentRecord(opponentStats);
        // Update opponent connection status when we receive their stats
        if (fb.isHost && p2Connection) {
            p2Connection.innerText = '✓ Connected';
            p2Connection.style.color = '#F538FF';
        }
    });

    // Listen for ready status
    fb.listenToReadyStatus(({ lifeReady, chronoReady }) => {
        const p1Indicator = document.getElementById('p1-ready-indicator');
        const p2Indicator = document.getElementById('p2-ready-indicator');
        const p1Avatar = document.getElementById('lobby-p1-avatar');
        const p2Avatar = document.getElementById('lobby-p2-avatar');

        if (p1Indicator) {
            p1Indicator.innerText = lifeReady ? '✓ READY!' : '⏳ Not Ready';
            p1Indicator.style.color = lifeReady ? '#0DFF72' : '#FFD700';
        }
        if (p2Indicator) {
            p2Indicator.innerText = chronoReady ? '✓ READY!' : '⏳ Not Ready';
            p2Indicator.style.color = chronoReady ? '#0DFF72' : '#FFD700';
        }

        // Switch avatars to angry faces when ready (battle mode!)
        if (p1Avatar) {
            p1Avatar.src = lifeReady ? 'avatars/brianangry.png' : 'avatars/briannormal.png';
        }
        if (p2Avatar) {
            p2Avatar.src = chronoReady ? 'avatars/fernandomad.png' : 'avatars/fernandonormal.png';
        }

        // If both ready, host triggers match start
        if (lifeReady && chronoReady && fb.isHost && !isP2PReady) {
            isP2PReady = true;
            console.log("Both players ready, starting match...");
            fb.triggerMatchStart();
        }
    });

    // Listen for match start
    fb.listenToMatchStart(async (timestamp) => {
        console.log("Match start received:", timestamp);
        // Hide P2P screen, show game
        document.getElementById('p2p-screen').classList.add('hidden');
        document.getElementById('game-container').classList.remove('hidden');
        await initGame(selectedUserId);
        startCountdown(timestamp);
    });
}

// Ready button handler
document.getElementById('ready-btn').onclick = () => {
    arcade.playClickSound();

    const btn = document.getElementById('ready-btn');
    const isReady = btn.classList.contains('ready');

    if (isReady) {
        // Unready
        btn.classList.remove('ready');
        btn.innerText = '✓ READY!';
        btn.style.background = 'linear-gradient(135deg, #FFD700, #FFA500)';
        fb.clearReadyForPlayer(selectedUserId);
    } else {
        // Ready up
        btn.classList.add('ready');
        btn.innerText = '⏳ WAITING...';
        btn.style.background = 'linear-gradient(135deg, #0DFF72, #0DC2FF)';
        fb.setReady(selectedUserId);
    }
};

// Solo mode from P2P screen
document.getElementById('select-solo').onclick = () => {
    arcade.playClickSound();
    console.log("Selected Solo Mode");
    document.getElementById('p2p-screen').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    initGame('Solo');
    startCountdown(Date.now() + 3000);
};

// Old Firebase-based character selection removed - now using P2P connection flow above

// Arcade Button Hover Sounds
['create-room-btn', 'join-room-btn', 'select-solo', 'ready-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
        btn.addEventListener('mouseenter', () => arcade.playHoverSound());
    }
});

function updateAvatar() {
    if (!p2 || typeof p2.score === 'undefined') return;

    // Calculate score difference from each player's perspective
    // Positive diff = that player is winning
    // Negative diff = that player is losing

    const p1Avatar = document.getElementById('p1-avatar');
    const p2Avatar = document.getElementById('p2-avatar');

    // Lifedelinquent's score diff (My Score - Opponent's Score)
    let lifeDiff = 0;
    // ChronoKoala's score diff
    let chronoDiff = 0;

    if (fb.userId === "Lifedelinquent") {
        lifeDiff = score - p2.score;       // Life (Me) - Chrono (P2)
        chronoDiff = p2.score - score;     // Chrono (P2) - Life (Me)
    } else if (fb.userId === "ChronoKoala") {
        lifeDiff = p2.score - score;       // Life (P2) - Chrono (Me)
        chronoDiff = score - p2.score;     // Chrono (Me) - Life (P2)
    } else {
        // Solo mode - just show normal
        return;
    }

    // Helper function to determine face based on score diff
    function getFace(diff) {
        if (diff >= 1000) return "excited";      // Winning Big
        else if (diff >= 200) return "happy";    // Winning
        else if (diff <= -1000) return "mad";    // Losing Big (Brian uses "angry")
        else if (diff <= -200) return "sad";     // Losing
        return "normal";
    }

    // Update Brian (Lifedelinquent) avatar
    if (p1Avatar) {
        let brianFace = getFace(lifeDiff);
        // Brian uses "angry" instead of "mad"
        if (brianFace === "mad") brianFace = "angry";
        const brianPath = `avatars/brian${brianFace}.png`;
        if (!p1Avatar.src.includes(brianPath)) {
            p1Avatar.src = brianPath;
        }
    }

    // Update Fernando (ChronoKoala) avatar
    if (p2Avatar) {
        let fernandoFace = getFace(chronoDiff);
        const fernandoPath = `avatars/fernando${fernandoFace}.png`;
        if (!p2Avatar.src.includes(fernandoPath)) {
            p2Avatar.src = fernandoPath;
        }
    }
}

function togglePause() {
    if (!matchActive && !isPaused) return;

    // Check if we can unpause (only initiator can unpause within 5 min)
    if (isPaused && !canUnpause) {
        console.log("Cannot unpause - only the player who paused can unpause (or wait 5 min)");
        return;
    }

    const wantToPause = !isPaused;

    // Send to Firebase - the listener will handle the actual state change
    if (fb && fb.setPause) {
        fb.setPause(wantToPause);
    } else {
        // Fallback for solo/offline mode
        applyLocalPause(wantToPause, true);
    }
}

// Called by Firebase listener or directly for solo mode
function applyLocalPause(shouldPause, canUnpauseLocal = true) {
    if (shouldPause === isPaused) return; // No change

    isPaused = shouldPause;
    canUnpause = canUnpauseLocal;
    const overlay = document.getElementById('pause-overlay');

    if (isPaused) {
        // PAUSE
        console.log("Game Paused");
        overlay.classList.remove('hidden');

        // Update overlay text to show who can unpause
        const pauseText = overlay.querySelector('h2') || overlay;
        if (!canUnpause) {
            pauseText.textContent = "PAUSED - Waiting for opponent...";
        } else {
            pauseText.textContent = "PAUSED";
        }

        // Stop audio context (synthesized) and MP3 music
        if (arcade.audioCtx) {
            arcade.audioCtx.suspend();
        }
        // Pause MP3 music (preserves position for resume)
        if (arcade.audioElement) {
            arcade.audioElement.pause();
        }

        // Save pause time
        pauseStartTime = Date.now();

        // Kill physics loop
        clearTimeout(tickTimeout);
        tickTimeout = null;

    } else {
        // RESUME
        console.log("Game Resumed");
        overlay.classList.add('hidden');

        // Resume audio context and MP3
        if (arcade.audioCtx) {
            arcade.audioCtx.resume();
        }
        // Resume MP3 music only if not muted (check musicOn)
        if (arcade.audioElement && arcade.battleMusicActive && arcade.musicOn) {
            arcade.audioElement.play().catch(e => console.warn("Resume music failed:", e));
        }

        // Adjust game timer to account for pause duration
        if (pauseStartTime > 0) {
            const pauseDuration = Date.now() - pauseStartTime;
            startTime += pauseDuration;
            lastTickTime = Date.now(); // Reset physics delta
            pauseStartTime = 0;
        }

        // Restart physics loop
        tick();
    }
}

// Global for canUnpause tracking
let canUnpause = true;

window.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        togglePause();
    }
});
