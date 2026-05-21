import { TetrisEngine } from './tetris.js';
import { BattleManager } from './battle.js';
import { ArcadeManager } from './arcade_effects.js';
import { P2PHandler } from './p2p.js';
import * as cfg from './config.js';
import {
    shakeSide,
    flashScreen,
    playShieldFX,
    playShieldBlockedFX,
    playLightningFX,
    playBombFlyFX,
    playBusterFX,
    animateNumber,
} from './vfx.js';
import * as hud from './hud.js';
import { createControls } from './controls.js';
import {
    settings,
    setSetting,
    applySettingTransient,
    resetSettings,
    onSettingChange,
} from './settings.js';

// Which settings sync from host to guest. These are the ones that materially
// affect gameplay state (timing). Per-player feel/audio settings stay local.
const HOST_SYNCED_SETTINGS = [
    'matchDurationMs', 
    'speedCurvePct', 
    'lockDelayMs',
    'shieldCost',
    'lightningCost',
    'bombCost',
    'colorBusterCost'
];

function _snapshotHostSyncedSettings() {
    const out = {};
    for (const k of HOST_SYNCED_SETTINGS) out[k] = settings[k];
    return out;
}

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

    // Timer UI (counts DOWN from the user-configured match duration)
    const remaining = Math.max(0, settings.matchDurationMs - elapsed);
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const timerEl = document.getElementById('timer');
    timerEl.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    // Last 10s: red urgency tint
    timerEl.style.color = (remaining <= 10000) ? '#ff3333' : '#e74c3c';

    // Time up - end the match if it hasn't already ended.
    if (remaining <= 0 && matchActive) {
        endMatchOnTime();
        return;
    }

    // Speed curve scales with settings.speedCurvePct (100 = original pacing).
    //   pct=0   -> never level up (gravity stays at start speed)
    //   pct=100 -> level every 15s, -50ms/level (default)
    //   pct=200 -> level every 7.5s, -100ms/level (max speed in ~2.5 min)
    const pct = Math.max(0, settings.speedCurvePct);
    const decrement = (cfg.GRAVITY_DECREMENT * pct) / 100;
    const levelInterval = pct > 0 ? (cfg.LEVEL_INTERVAL_MS * 100) / pct : Infinity;
    const level = Math.floor(elapsed / levelInterval) + 1;

    let targetSpeed = Math.max(
        cfg.GRAVITY_FLOOR_MS,
        cfg.GRAVITY_START_MS - ((level - 1) * decrement)
    );

    // MP3 tempo sync: same level-driven multiplier so music intensifies
    // alongside gravity.
    if (!isNaN(level) && level > 0 && level !== Infinity) {
        arcade.setMusicSpeed(1 + ((level - 1) * cfg.MUSIC_PER_LEVEL));
    }

    // Stats UI (Score) - the animated tween handles smoothness; gameLoop
    // calls happen ~60Hz so this is just keeping the displayed value in sync
    // when nothing else changed it.
    if (myScoreId) animateNumber(myScoreId, score);

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


// Push the music on/off state into both toggle buttons so they always
// show the same thing regardless of which one was clicked last.
function _syncMusicButtons(isOn) {
    const lobby = document.getElementById('music-toggle');
    if (lobby) lobby.innerText = isOn ? '🎵 MUSIC: ON' : '🎵 MUSIC: OFF';
    const inGame = document.getElementById('ingame-music-toggle');
    if (inGame) inGame.innerText = isOn ? '🔊' : '🔇';
}

window.addEventListener('load', () => {
    try {
        // Browsers require a user gesture to start audio. arcade.init() ran
        // at module load (already created the suspended AudioContext); on
        // the first click we resume it. If the user had music ON last time,
        // we also kick playback now so the UI promise ("MUSIC: ON") is true.
        let audioInitialized = false;
        document.addEventListener('click', () => {
            if (audioInitialized) return;
            audioInitialized = true;
            arcade.resumeAudio();
            if (arcade.musicOn) {
                arcade.startMusic();
            }
            // Trigger welcome announcer!
            setTimeout(() => {
                if (arcade && typeof arcade.announceWelcome === 'function') {
                    arcade.announceWelcome();
                }
            }, 300);
        });

        // Apply the persisted musicOn preference so the engine matches
        // the user's last choice across reloads.
        arcade.musicOn = settings.musicOn;
        _syncMusicButtons(settings.musicOn);

        // Music toggle button functionality - both the lobby button and the
        // in-game button drive the same `arcade.toggleMusic()` so they share
        // a single source of truth and stay visually in sync.
        const musicBtn = document.getElementById('music-toggle');
        if (musicBtn) {
            musicBtn.addEventListener('click', () => {
                const isOn = arcade.toggleMusic();
                setSetting('musicOn', isOn);
                _syncMusicButtons(isOn);
            });
        }

        // In-game volume sliders mirror the settings panel - both update
        // the same `settings.musicVol` / `settings.sfxVol` so the values
        // stay synced. The arcade audio gains follow via onSettingChange.
        const musicSlider = document.getElementById('music-slider');
        if (musicSlider) {
            musicSlider.value = settings.musicVol;
            arcade.setMusicVolume(settings.musicVol);
            musicSlider.addEventListener('input', (e) => {
                setSetting('musicVol', parseFloat(e.target.value));
            });
        }

        const sfxSlider = document.getElementById('sfx-slider');
        if (sfxSlider) {
            sfxSlider.value = settings.sfxVol;
            arcade.setSfxVolume(settings.sfxVol);
            sfxSlider.addEventListener('input', (e) => {
                setSetting('sfxVol', parseFloat(e.target.value));
            });
        }

        // In-game music toggle uses the same shared state as the lobby button.
        const inGameMusicBtn = document.getElementById('ingame-music-toggle');
        if (inGameMusicBtn) {
            inGameMusicBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOn = arcade.toggleMusic();
                setSetting('musicOn', isOn);
                _syncMusicButtons(isOn);
                if (isOn) arcade.playClickSound();
                inGameMusicBtn.blur();
            });
        }

    } catch (e) {
        console.error("Arcade Init Failed:", e);
        alert("Arcade Init Failed: " + e.message);
    }
});

let p1, p2, p1Battle;
let matchActive = false;
let startTime;
let currentMatchSeed = null;

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
let resultRecorded = false; // Prevent duplicate win/loss recording

// A full no-op mock so Solo mode can run all the same code paths as P2P.
// Every method the rest of the code calls is present and returns sensibly.
function createSoloMock() {
    const stats = { name: 'Solo', wins: 0, losses: 0, pb: 0 };
    const noop = () => { };
    const asyncNoop = async () => { };
    const cleanup = () => { };
    return {
        userId: 'Solo',
        opponentId: null,
        isHost: false,
        connected: false,
        stats,
        opponentStats: null,
        // lifecycle
        initPlayer: async () => stats,
        setOnline: noop,
        destroy: noop,
        // outgoing
        sendGameState: asyncNoop,
        sendAttack: asyncNoop,
        sendBomb: asyncNoop,
        sendStats: noop,
        sendMatchSettings: noop,
        // listeners (return cleanup so callers can compose without breaking)
        listenToMatchStart: () => cleanup,
        listenToMatch: () => cleanup,
        listenToAttacks: () => cleanup,
        listenToBombs: () => cleanup,
        listenToOnline: () => cleanup,
        listenToReadyStatus: () => cleanup,
        listenToOpponentStats: () => cleanup,
        listenToMatchSettings: () => cleanup,
        listenToRematch: () => cleanup,
        listenToPause: (cb) => { cb({ paused: false, pausedBy: null, pausedAt: null, canUnpause: true }); return cleanup; },
        // ready / pause / rematch
        setReady: noop,
        clearReadyForPlayer: noop,
        setPause: (paused) => applyLocalPause(paused, true),
        setRematch: noop,
        triggerMatchStart: async () => Date.now() + 3000,
        // stats
        recordWin: () => { stats.wins++; },
        recordLoss: () => { stats.losses++; },
        resetStats: () => { stats.wins = 0; stats.losses = 0; },
        updatePB: async (score) => { if (score > stats.pb) stats.pb = score; }
    };
}

async function initGame(userId, seed = null) {
    if (gameInitialized) return;
    gameInitialized = true;
    currentMatchSeed = seed;

    // For solo mode, create a mock handler if one wasn't already attached.
    if (userId === "Solo" && !fb) {
        fb = createSoloMock();
    }

    try {
        let stats;

        // Use the mock handler's init (which is instant)
        stats = await fb.initPlayer(userId);

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
            remoteHold = document.getElementById('p2-hold');

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
            remoteHold = document.getElementById('p1-hold');

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
        p1 = new TetrisEngine(localCanvas, localNext, localHold, seed);
        p1.showGhost = settings.ghostPiece;
        p1Battle = new BattleManager(p1, userId === 'Lifedelinquent' || userId === 'Solo');
        p1Battle.onShieldUsed = () => updatePowerUpUI(); // Update UI when shield is consumed

        // Wire power-up button click handlers for the local side only.
        setupPowerUpButton(myButtonPrefix);
        updatePowerUpCostsUI();
        updatePowerUpUI();

        // p2 variable acts as the REMOTE ENGINE (Network Updates).
        // Hide ghost on opponent regardless of setting - their ghost is
        // not actually meaningful since we only render their broadcast grid.
        p2 = new TetrisEngine(remoteCanvas, remoteNext, remoteHold);
        p2.showGhost = false;

        // --- Presence & Match Start Logic ---
        if (userId === "Solo") {
            // Immediate Start
            startCountdown(Date.now() + 3000);
            return; // EXIT initGame, skip network listeners
        }

        // 1. Announce I am online
        fb.setOnline();

        // NOTE: listenToMatchStart is registered ONLY in setupP2PReadySystem()
        // to avoid duplicate listeners that fire startCountdown() twice on
        // rematch (Bug #1 - caused music to start randomly/halfway/not at all).

        // 2b. Listen for Pause State Sync (Both players pause/unpause together)
        fb.listenToPause((pauseState) => {
            applyLocalPause(pauseState.paused, pauseState.canUnpause);
        });

        const opponentId = userId === "Lifedelinquent" ? "ChronoKoala" : "Lifedelinquent";


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

                    // Opponent next pieces preview
                    if (oppState.nextPieces && p2) {
                        p2.nextPieces = oppState.nextPieces;
                        p2.renderNext();
                    }

                    // Opponent hold piece preview
                    if (oppState.holdPiece !== undefined && p2) {
                        p2.holdPiece = oppState.holdPiece;
                        p2.renderHold();
                    }

                    // Active Piece
                    if (oppState.activePiece) {
                        const p = oppState.activePiece;
                        // Only trigger win if explicitly game_over === true (not just truthy/undefined)
                        if (p.game_over === true) {
                            if (matchActive && !resultRecorded) {
                                // Record the win locally + bump session KO and reflect it in the HUD
                                if (p1Battle) {
                                    p1Battle.koCount++;
                                    const myKoId = userId === "Lifedelinquent" ? 'p1-ko' : 'p2-ko';
                                    const myKoEl = document.getElementById(myKoId);
                                    if (myKoEl) myKoEl.innerText = p1Battle.koCount;
                                }
                                if (fb && fb.recordWin) {
                                    fb.recordWin();
                                }
                                handleGameOver(false, "WIN");
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
                            // Lines Sent (Attack Score) - kept on p2 so the time-up
                            // tie-break has authoritative opponent data.
                            if (p.linesSent !== undefined) {
                                p2.linesSent = p.linesSent;
                                const targetId = userId === "Lifedelinquent" ? 'p2-lines-sent' : 'p1-lines-sent';
                                const el = document.getElementById(targetId);
                                if (el) el.innerText = p.linesSent;
                            }
                            // Opponent lines bank update
                            if (p.linesBank !== undefined) {
                                const targetId = userId === "Lifedelinquent" ? 'p2-lines-bank' : 'p1-lines-bank';
                                const el = document.getElementById(targetId);
                                if (el) el.innerText = p.linesBank;
                            }
                            // Mirror opponent's combo + B2B onto their side of the HUD.
                            if (p.combo !== undefined || p.backToBack !== undefined) {
                                const opponentPrefix = userId === "Lifedelinquent" ? 'p2' : 'p1';
                                BattleManager.renderComboUI(opponentPrefix, p.combo || 0, !!p.backToBack);
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

function startCountdown(targetStartTime, seed = null) {
    // Force Interrupt: Stop any running game loop logic
    matchActive = false;
    startTime = null;
    resultRecorded = false; // Reset for new match

    if (seed !== null) {
        currentMatchSeed = seed;
    }

    // Reset Game State - only if p1 already exists (rematch scenario)
    // For first game start, initGame already set up p1
    if (p1 && p1.canvas) {
        const carriedKoCount = p1Battle ? p1Battle.koCount : 0;
        p1 = new TetrisEngine(p1.canvas, p1.nextCanvas, p1.holdCanvas, currentMatchSeed);
        p1.showGhost = settings.ghostPiece;
        p1Battle = new BattleManager(p1, myButtonPrefix === 'p1');
        p1Battle.koCount = carriedKoCount; // Persist session KOs across rematches
        p1Battle.onShieldUsed = () => updatePowerUpUI(); // Update UI when shield is consumed
        p1Battle.setupBombDetonation(); // Re-register bomb detonation callback
    }
    if (p2 && p2.canvas) {
        p2 = new TetrisEngine(p2.canvas, p2.nextCanvas, p2.holdCanvas);
        p2.showGhost = false;
    }

    score = 0; // RESET SCORE!
    // Clear both score displays + their tween targets so animateNumber
    // doesn't think the prior score is still pending.
    ['p1-pb', 'p2-pb'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = '0';
            el.dataset.target = '0';
        }
    });

    // Reset power-up UI (removes old highlights)
    updatePowerUpCostsUI();
    updatePowerUpUI();

    // Reset lines-sent display + state for both players (used by time tie-break)
    const p1SentEl = document.getElementById('p1-lines-sent');
    const p2SentEl = document.getElementById('p2-lines-sent');
    if (p1SentEl) p1SentEl.innerText = '0';
    if (p2SentEl) p2SentEl.innerText = '0';
    if (p2) p2.linesSent = 0;

    // Reset lines-bank display for both players
    const p1BankEl = document.getElementById('p1-lines-bank');
    const p2BankEl = document.getElementById('p2-lines-bank');
    if (p1BankEl) p1BankEl.innerText = '0';
    if (p2BankEl) p2BankEl.innerText = '0';

    // Hide combo + B2B UI for both sides so leftover state from the
    // previous match doesn't linger into the new one.
    BattleManager.renderComboUI('p1', 0, false);
    BattleManager.renderComboUI('p2', 0, false);

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

    let lastDiff = null;
    const interval = setInterval(() => {
        const now = Date.now();
        const diff = Math.ceil((targetStartTime - now) / 1000);

        if (diff > 0) {
            if (diff !== lastDiff) {
                text.innerText = diff;
                arcade.playSoftBeep(); // Beep on count
                lastDiff = diff;
            }
        } else {
            clearInterval(interval);
            text.innerText = "GO!";
            arcade.playClickSound(); // Go sound
            setTimeout(() => overlay.classList.add('hidden'), 500);

            // Audio Switch - Start battle music (MP3 playlist at 40%)
            arcade.stopGameOverMusic(); // Stop any game over music still playing
            arcade.stopMusic(); // Stop lobby synth music
            arcade.normalPlaybackRate = 1.0; // Reset speed from previous match (Bug #4)
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
function handleLock(result, isTSpin = false) {
    if (!result.locked) return;

    // Scoring: Landing = 25
    score += 25;

    // Hard drop bonus: +2 per cell fallen. Pop a "+N" near the player's
    // attack box so the reward is visible.
    if (result.wasHardDrop && result.cellsDropped > 0) {
        const hardBonus = result.cellsDropped * 2;
        score += hardBonus;
        if (window.arcade) {
            const x = p1Battle.isPlayer1 ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
            window.arcade.createFloatingText(`+${hardBonus}`, x, window.innerHeight * 0.55, '#FFD700');
        }
    }

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

        // Visual punctuation scaled to clear size
        if (result.linesCleared === 4) {
            // TETRIS - heavy shake + yellow flash
            shakeSide(myButtonPrefix, 'heavy');
            flashScreen('tetris');
        } else if (result.linesCleared === 3) {
            shakeSide(myButtonPrefix, 'light');
        }

        // T-spin feedback - distinct text per kind, sting plays in #9.
        if (isTSpin === 'full' || isTSpin === 'mini') {
            const x = p1Battle.isPlayer1 ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
            const text = isTSpin === 'mini' ? 'T-SPIN MINI' : 'T-SPIN!';
            const color = isTSpin === 'mini' ? '#ffffff' : '#FFD700';
            arcade.createFloatingText(text, x, window.innerHeight * 0.42, color);
            if (arcade.playTSpin) arcade.playTSpin();
            shakeSide(myButtonPrefix, isTSpin === 'full' ? 'heavy' : 'light');
            flashScreen('tspin');
        }

        // If bomb was defused, clear the matching per-bomb timer(s)
        if (result.bombDefused && p1Battle && result.defusedBombIds) {
            for (const id of result.defusedBombIds) {
                p1Battle._bombTimers = p1Battle._bombTimers.filter(bt => bt.id !== id);
            }
        }
    } else if (result.wasHardDrop) {
        // Slam SFX is louder than a gravity-driven settle.
        (arcade.playHardDrop || arcade.playLand).call(arcade);
    } else {
        arcade.playLand();
    }

    // Color Buster handling: refund the cost on a fizzle, treat a productive
    // bust as a "clear" for combo purposes (no row clear, no attack).
    if (result.busterResult) {
        if (!result.busterResult.busted) {
            p1Battle.refundColorBuster();
            updatePowerUpUI();
        }
        // else: combo is preserved by skipping the calculateAttack reset path below
    }

    // Lock-time score update gets the celebratory pop on big jumps.
    if (myScoreId) animateNumber(myScoreId, score, { pop: true });
    updateAvatar();

    // Compute raw attack (combo + B2B + T-Spin bonuses) from this clear,
    // then counter pending garbage 1:1 against the attack.
    // A successful buster preserves combo without sending attack.
    let rawAttack = 0;
    if (result.busterResult && result.busterResult.busted) {
        // No-op: keep combo state, no attack
    } else {
        rawAttack = p1Battle.calculateAttack(result.linesCleared, isTSpin);
    }

    // Floating COMBO callout - the inline meter is small and easy to miss.
    if (result.linesCleared > 0 && p1Battle.combo > 1) {
        const x = p1Battle.isPlayer1 ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
        const color = p1Battle.combo > 6 ? '#FF0D72' : '#FFE138';
        arcade.createFloatingText(`COMBO ×${p1Battle.combo}`, x, window.innerHeight * 0.48, color);
    }

    // All-Clear (Perfect Clear): if the clear emptied the board entirely,
    // award a fixed +6 attack and play a dramatic flourish.
    if (result.linesCleared > 0 && p1.grid.every(row => row.every(cell => cell === 0))) {
        rawAttack += 6;
        const x = p1Battle.isPlayer1 ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
        arcade.createFloatingText("✨ ALL CLEAR ✨", x, window.innerHeight * 0.35, '#FFD700');
        if (arcade.playAllClear) arcade.playAllClear();
        flashScreen('allclear');
        shakeSide(myButtonPrefix, 'heavy');
    }

    const attackLines = p1Battle.counterAttack(rawAttack);

    // Track outgoing attack regardless of mode so the end-of-match stats
    // card (and APM) is meaningful even in Solo. Sending to the opponent
    // is the only network-specific step.
    if (attackLines > 0) {
        p1Battle.linesSent += attackLines;
        const mySentId = myButtonPrefix === 'p1' ? 'p1-lines-sent' : 'p2-lines-sent';
        const sentEl = document.getElementById(mySentId);
        if (sentEl) sentEl.innerText = p1Battle.linesSent;

        if (fb.userId !== "Solo") {
            const opponentId = fb.userId === "Lifedelinquent" ? "ChronoKoala" : "Lifedelinquent";
            fb.sendAttack(opponentId, attackLines);
        }
    }
    // DoT system handles garbage application automatically via timer

    // Update State (New Piece)
    broadcastIfNetworked(true);

    // Game Over Check - callers (tick / controls) also check p1.gameOver
    // after handleLock returns, but catching it here ensures the state is
    // cleaned up immediately if lockPiece triggered game over.
    if (p1.gameOver) {
        handleGameOver(true);
    }
}

// VFX helpers live in vfx.js (shakeSide, flashScreen, playShieldFX, ...).
// We re-export a few onto window so cross-module callers (battle.js) can
// reach them without setting up an import graph.
window.shakeSide = shakeSide;
window.flashScreen = flashScreen;
window.playShieldFX = playShieldFX;
window.playShieldBlockedFX = playShieldBlockedFX;
window.playLightningFX = playLightningFX;
window.playBombFlyFX = playBombFlyFX;
window.playBusterFX = playBusterFX;

// Build the activePiece payload broadcast to the opponent.
// Always include `linesSent` so the opponent's attack counter stays current.
function buildActivePiecePayload() {
    return {
        type: p1.currentPiece,
        pos: p1.pos,
        rotation: p1.rotation,
        score: score,
        linesSent: p1Battle ? p1Battle.linesSent : 0,
        combo: p1Battle ? p1Battle.combo : 0,
        backToBack: p1Battle ? p1Battle.backToBack : false,
        linesBank: p1Battle ? p1Battle.totalLinesCleared : 0
    };
}

// Main Game Loop (Gravity)
let lastTickTime = 0;

function tick() {
    if (!matchActive || isPaused) return;

    // Tick-driven timers (only run while active and unpaused).
    if (p1Battle) {
        p1Battle.updateBombs();
        p1Battle.updateDoT();
    }

    const now = Date.now();
    if (lastTickTime === 0) lastTickTime = now;

    let delta = now - lastTickTime;

    // Safety cap: If delta is huge (e.g. computer sleep), don't spiral. Max 10 ticks.
    if (delta > currentSpeed * 10) {
        delta = currentSpeed;
        lastTickTime = now - delta;
    }

    // Accumulator: while enough time has passed, attempt a gravity step.
    while (delta >= currentSpeed) {
        const dropResult = p1.drop();

        if (dropResult.dropped) {
            // Still falling: broadcast and clear any stale grounded state.
            p1.groundedAtMs = null;
            broadcastIfNetworked(false);
        } else {
            // Touching the floor - start the lock-delay timer if it isn't already.
            if (p1.groundedAtMs === null) p1.groundedAtMs = performance.now();
        }

        delta -= currentSpeed;
        lastTickTime += currentSpeed;
    }

    // Independent of gravity: if the lock-delay timer has elapsed, lock now.
    if (matchActive && p1.shouldLock(performance.now(), settings.lockDelayMs)) {
        const isTSpin = p1.isTSpin();
        const lockResult = p1.lockPiece();
        handleLock(lockResult, isTSpin);
        if (p1.gameOver) {
            handleGameOver(true);
            return;
        }
    }

    // Check if grid changed during tick (e.g. from bombs, DoT, etc.)
    if (p1 && p1.gridChanged) {
        broadcastIfNetworked(true);
        p1.gridChanged = false;
    }

    // Schedule next check
    // We can check often (e.g. 50ms) to hit the targetSpeed accurately.
    // Background throttling will force this to ~1000ms, which the while loop handles.
    clearTimeout(tickTimeout);
    tickTimeout = setTimeout(() => {
        tick();
    }, 50); // High polling rate for precision in foreground, auto-throttles in background
}

function handleGameOver(toppedOut, overrideResult) {
    // Guard: if the result has already been decided and shown, don't
    // re-enter. Multiple code paths (handleLock, tick, controls) may all
    // detect p1.gameOver and call this; only the first one should act.
    if (!matchActive && resultRecorded) return;

    matchActive = false;
    clearTimeout(tickTimeout);
    controls.clearHeldKeys(); // no phantom auto-repeat into the next match
    arcade.stopBattleMusic();

    // An explicit result (e.g. "WIN" from opponent's game_over signal)
    // takes priority over the topped-out inference.
    if (overrideResult) {
        if (!resultRecorded) resultRecorded = true;
        showResultScreen(overrideResult);
        return;
    }

    if (toppedOut && !resultRecorded) {
        resultRecorded = true;
        if (fb && fb.recordLoss) fb.recordLoss();
        // Notify opponent so they record a WIN.
        fb.sendGameState(p1.grid, p1Battle.koCount, p1Battle.pendingGarbage, { game_over: true });
        showResultScreen("LOSE");
        return;
    }

    // Fallback: shouldn't normally reach here, but show DRAW as safety net.
    if (!resultRecorded) {
        resultRecorded = true;
        showResultScreen("DRAW");
    }
}

// Time expired with neither player topped out. Compare attack-sent (linesSent)
// for the tie-break: more attack = winner. Each side computes locally - both
// have the same data via P2P broadcasts.
function endMatchOnTime() {
    matchActive = false;
    clearTimeout(tickTimeout);
    controls.clearHeldKeys();
    arcade.stopBattleMusic();

    if (resultRecorded) {
        showResultScreen("DRAW");
        return;
    }
    resultRecorded = true;

    if (fb.userId === "Solo") {
        showResultScreen("TIME UP");
        return;
    }

    const myAttack = p1Battle ? p1Battle.linesSent : 0;
    const oppAttack = (p2 && typeof p2.linesSent === 'number') ? p2.linesSent : 0;

    let result;
    if (myAttack > oppAttack) {
        result = "WIN";
        if (fb && fb.recordWin) fb.recordWin();
        if (p1Battle) {
            p1Battle.koCount++;
            const myKoId = fb.userId === "Lifedelinquent" ? 'p1-ko' : 'p2-ko';
            const myKoEl = document.getElementById(myKoId);
            if (myKoEl) myKoEl.innerText = p1Battle.koCount;
        }
    } else if (myAttack < oppAttack) {
        result = "LOSE";
        if (fb && fb.recordLoss) fb.recordLoss();
    } else {
        result = "DRAW";
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

    // Populate the stats card from the local match's BattleManager.
    populateStatsCard();

    // Re-trigger the staggered row reveal (so rematches play it again too).
    const card = document.getElementById('stats-card');
    if (card) {
        card.classList.remove('revealing');
        void card.offsetWidth;
        card.classList.add('revealing');
    }

    document.getElementById('game-over-screen').classList.remove('hidden');

    // Play game over music (plays once, then starts lobby music)
    arcade.playGameOverMusic();
}

function populateStatsCard() {
    hud.populateStatsCard({ battle: p1Battle, startTime, score });
}

function updatePowerUpCostsUI() {
    const shieldVal = settings.shieldCost;
    const lightningVal = settings.lightningCost;
    const bombVal = settings.bombCost;
    const busterVal = settings.colorBusterCost;

    ['p1', 'p2'].forEach(prefix => {
        const shieldEl = document.getElementById(`${prefix}-shield-cost`);
        const lightningEl = document.getElementById(`${prefix}-lightning-cost`);
        const bombEl = document.getElementById(`${prefix}-bomb-cost`);
        const busterEl = document.getElementById(`${prefix}-buster-cost`);

        if (shieldEl) shieldEl.textContent = shieldVal;
        if (lightningEl) lightningEl.textContent = lightningVal;
        if (bombEl) bombEl.textContent = bombVal;
        if (busterEl) busterEl.textContent = busterVal;
    });
}

function updatePowerUpUI() {
    hud.updatePowerUpUI(p1Battle, myButtonPrefix);
    const bankEl = document.getElementById(`${myButtonPrefix}-lines-bank`);
    if (bankEl && p1Battle) {
        bankEl.textContent = p1Battle.totalLinesCleared;
    }
}

// Used by both the input layer and the gravity tick to push state to the
// opponent. Lives in main.js because it touches several gameplay globals.
function broadcastIfNetworked(gridChanged = false) {
    if (fb && fb.userId !== "Solo") {
        fb.sendGameState(
            gridChanged ? p1.grid : null,
            p1Battle.koCount,
            p1Battle.pendingGarbage,
            buildActivePiecePayload(),
            p1.nextPieces,
            p1.holdPiece
        );
    }
}

// Input layer (DAS/ARR + key listeners) lives in controls.js. We wire it
// here with getters/setters so it can read the latest game state without
// needing a shared globals module.
const controls = createControls({
    arcade,
    getEngine:        () => p1,
    getBattle:        () => p1Battle,
    isMatchActive:    () => matchActive,
    isPaused:         () => isPaused,
    getButtonPrefix:  () => myButtonPrefix,
    getScoreId:       () => myScoreId,
    addScore:         (n) => { score += n; },
    getScore:         () => score,
    broadcast:        broadcastIfNetworked,
    onLock:           (r, ts) => handleLock(r, ts),
    onGameOver:       (t) => handleGameOver(t),
});
controls.attachListeners();

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
            if (p1Battle.usePowerUp('shield')) {
                shieldBtn.classList.add('active');
                updatePowerUpUI();
                (arcade.playShieldUp || arcade.playClickSound).call(arcade);
                playShieldFX(myButtonPrefix);
            }
        };
    }

    if (rushBtn) {
        rushBtn.onclick = () => {
            if (!p1Battle) return;
            if (p1Battle.usePowerUp('rush')) {
                updatePowerUpUI();
                (arcade.playLightning || arcade.playClickSound).call(arcade);
                playLightningFX(myButtonPrefix);
            }
        };
    }

    if (twinBtn) {
        twinBtn.onclick = () => {
            if (!p1Battle) return;
            const result = p1Battle.usePowerUp('twin');
            if (result === 'sendBomb') {
                if (fb.userId === "Solo") {
                    // Solo mode: no opponent to bomb — refund the cost and
                    // let the player know.
                    p1Battle.totalLinesCleared += p1Battle.BOMB_COST;
                    updatePowerUpUI();
                    const x = p1Battle.isPlayer1 ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
                    arcade.createFloatingText("NO OPPONENT!", x, window.innerHeight * 0.4, '#FFD700');
                    return;
                }
                // Send timer mine bomb to opponent's queue via multiplayer
                const opponentId = fb.userId === "Lifedelinquent" ? "ChronoKoala" : "Lifedelinquent";
                fb.sendBomb(opponentId);
                updatePowerUpUI();
                (arcade.playBombSent || arcade.playClickSound).call(arcade);

                // Visual feedback for sender
                const x = fb.userId === "Lifedelinquent" ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
                arcade.createFloatingText("💣 BOMB SENT!", x, window.innerHeight * 0.4, '#ff00ff');
                playBombFlyFX(myButtonPrefix);
            }
        };
    }

    if (busterBtn) {
        busterBtn.onclick = () => {
            if (!p1Battle) return;
            if (p1Battle.usePowerUp('colorBuster')) {
                updatePowerUpUI();
                (arcade.playBuster || arcade.playClickSound).call(arcade);
                playBusterFX(myButtonPrefix);
            }
        };
    }
}

// Power-up buttons are wired once we know which side is local.
// `initGame` calls setupPowerUpButton(myButtonPrefix) - see initGame().

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
            document.getElementById('room-code-display').innerText = roomCode;
            document.getElementById('create-room-panel').querySelector('h3').innerText = '📡 ROOM READY!';
        },
        // onConnect - opponent joined
        () => {
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

function updateLobbyRecords() {
    hud.updateLobbyRecords(fb);
}

function updateOpponentRecord(opponentStats) {
    hud.updateOpponentRecord(fb, opponentStats);
}

// Setup P2P ready system after connection
function setupP2PReadySystem() {
    // Update lobby records display for my stats
    updateLobbyRecords();

    // Send my stats to opponent
    fb.sendStats();

    // Listen for opponent stats
    fb.listenToOpponentStats((opponentStats) => {
        updateOpponentRecord(opponentStats);
    });

    // --- Match-settings sync ---
    // Host is authoritative for the gameplay-affecting subset so both clients
    // run on the same numbers. Guest receives via transient apply (no save),
    // so the guest's own saved preferences aren't clobbered.
    fb.listenToMatchSettings((hostSettings) => {
        if (fb.isHost) return; // ignore echoes of our own broadcasts
        for (const k of HOST_SYNCED_SETTINGS) {
            if (hostSettings[k] !== undefined) {
                applySettingTransient(k, hostSettings[k]);
            }
        }
        // If the panel is open, reflect the incoming values immediately.
        _refreshSettingsUI();
    });
    if (fb.isHost) {
        fb.sendMatchSettings(_snapshotHostSyncedSettings());
    }

    // Setup reset stats button
    const resetBtn = document.getElementById('reset-stats-btn');
    if (resetBtn) {
        resetBtn.onclick = () => {
            if (confirm('Reset your win/loss record to 0-0?')) {
                fb.resetStats();
                updateLobbyRecords();
                // Re-send updated stats to opponent
                fb.sendStats();
            }
        };
    }

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
            fb.triggerMatchStart();
        }
    });

    // Listen for match start
    fb.listenToMatchStart(async (timestamp, seed) => {
        // Hide P2P screen, show game
        document.getElementById('p2p-screen').classList.add('hidden');
        document.getElementById('game-container').classList.remove('hidden');
        await initGame(selectedUserId, seed);
        startCountdown(timestamp, seed);
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
    document.getElementById('p2p-screen').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    initGame('Solo');
    startCountdown(Date.now() + 3000);
};

// Arcade Button Hover Sounds (Delegated for modern feel and dynamically created buttons)
document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('button, input, #open-settings-btn');
    if (el) {
        const isLobby = el.closest('#p2p-screen');
        const isSettings = el.closest('#settings-modal') || el.id === 'open-settings-btn';
        if (isLobby || isSettings) {
            if (!el.dataset.hovered) {
                el.dataset.hovered = 'true';
                if (arcade && typeof arcade.playHoverSound === 'function') {
                    arcade.playHoverSound();
                }
                el.addEventListener('mouseleave', () => {
                    delete el.dataset.hovered;
                }, { once: true });
            }
        }
    }
});

function updateAvatar() {
    hud.updateAvatar({ fb, p2, score });
}

function togglePause() {
    if (!matchActive && !isPaused) return;

    // Check if we can unpause (only initiator can unpause within 5 min)
    if (isPaused && !canUnpause) {
        return;
    }

    const wantToPause = !isPaused;

    // The listener handles the actual state change
    if (fb && fb.setPause) {
        fb.setPause(wantToPause);
    } else {
        // Fallback for solo/offline mode
        applyLocalPause(wantToPause, true);
    }
}

function applyLocalPause(shouldPause, canUnpauseLocal = true) {
    if (shouldPause === isPaused) return; // No change

    isPaused = shouldPause;
    canUnpause = canUnpauseLocal;
    const overlay = document.getElementById('pause-overlay');

    if (isPaused) {
        // PAUSE
        overlay.classList.remove('hidden');

        // Cancel any held movement keys: when unpaused the player should
        // start with a fresh press, not surprise auto-repeats.
        controls.clearHeldKeys();

        // Update overlay text to show who can unpause
        const pauseTitle = document.getElementById('pause-title');
        if (pauseTitle) {
            pauseTitle.textContent = canUnpause ? "PAUSED" : "PAUSED - Waiting for opponent...";
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
    // ESC also closes the settings modal - but only if it's the topmost overlay.
    const settingsModal = document.getElementById('settings-modal');
    if (e.key === 'Escape' && settingsModal && !settingsModal.classList.contains('hidden')) {
        closeSettingsPanel();
        return;
    }
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        togglePause();
    }
});

// --- Settings panel wiring ---

function openSettingsPanel() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    _refreshSettingsUI();
    modal.classList.remove('hidden');
    arcade.playClickSound();
}

function closeSettingsPanel() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    arcade.playClickSound();
}

// Format milliseconds as M:SS for the match-duration slider readout.
function _fmtDuration(ms) {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

// Push current `settings` values into the panel inputs. Called every time
// the panel opens so it reflects whatever the live state is.
function _refreshSettingsUI() {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const setNum = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };

    set('set-music-vol', settings.musicVol);
    setNum('set-music-vol-out', settings.musicVol.toFixed(2));
    set('set-sfx-vol', settings.sfxVol);
    setNum('set-sfx-vol-out', settings.sfxVol.toFixed(2));

    set('set-das', settings.dasMs);   setNum('set-das-out',  settings.dasMs + 'ms');
    set('set-arr', settings.arrMs);   setNum('set-arr-out',  settings.arrMs + 'ms');
    set('set-soft', settings.softDropMs); setNum('set-soft-out', settings.softDropMs + 'ms');
    set('set-lock', settings.lockDelayMs); setNum('set-lock-out', settings.lockDelayMs + 'ms');

    set('set-duration', Math.round(settings.matchDurationMs / 1000));
    setNum('set-duration-out', _fmtDuration(settings.matchDurationMs));
    set('set-speed', settings.speedCurvePct);
    setNum('set-speed-out', settings.speedCurvePct + '%');

    // Power-up cost sliders
    set('set-shield-cost', settings.shieldCost);
    setNum('set-shield-cost-out', settings.shieldCost);
    set('set-lightning-cost', settings.lightningCost);
    setNum('set-lightning-cost-out', settings.lightningCost);
    set('set-bomb-cost', settings.bombCost);
    setNum('set-bomb-cost-out', settings.bombCost);
    set('set-buster-cost', settings.colorBusterCost);
    setNum('set-buster-cost-out', settings.colorBusterCost);

    setChk('set-ghost', settings.ghostPiece);
    setChk('set-scanlines', settings.scanlines);

    // In multiplayer, host controls match settings - disable the inputs
    // on the guest side and surface a one-line note.
    const isGuest = fb && fb.connected && !fb.isHost;
    [
        'set-duration', 'set-speed', 'set-lock',
        'set-shield-cost', 'set-lightning-cost', 'set-bomb-cost', 'set-buster-cost'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = isGuest;
    });
    document.getElementById('match-host-note')?.classList.toggle('hidden', !isGuest);
    document.getElementById('match-host-note-powerups')?.classList.toggle('hidden', !isGuest);
}

// Wire every input in the panel to a setSetting() call. Each binding also
// updates the displayed numeric so users see the value change live.
function _wireSettingsPanelInputs() {
    const bindRange = (id, key, fmt) => {
        const inp = document.getElementById(id);
        const out = document.getElementById(id + '-out');
        if (!inp) return;
        inp.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            setSetting(key, v);
            if (out) out.textContent = fmt(v);
        });
    };
    const bindCheckbox = (id, key) => {
        const inp = document.getElementById(id);
        if (!inp) return;
        inp.addEventListener('change', (e) => setSetting(key, e.target.checked));
    };

    bindRange('set-music-vol', 'musicVol',     v => v.toFixed(2));
    bindRange('set-sfx-vol',   'sfxVol',       v => v.toFixed(2));
    bindRange('set-das',       'dasMs',        v => v + 'ms');
    bindRange('set-arr',       'arrMs',        v => v + 'ms');
    bindRange('set-soft',      'softDropMs',   v => v + 'ms');
    bindRange('set-lock',      'lockDelayMs',  v => v + 'ms');
    bindRange('set-speed',     'speedCurvePct', v => v + '%');
    bindRange('set-shield-cost', 'shieldCost', v => v);
    bindRange('set-lightning-cost', 'lightningCost', v => v);
    bindRange('set-bomb-cost', 'bombCost', v => v);
    bindRange('set-buster-cost', 'colorBusterCost', v => v);

    // Match duration slider is in seconds for usability; we store ms.
    const durInp = document.getElementById('set-duration');
    const durOut = document.getElementById('set-duration-out');
    if (durInp) {
        durInp.addEventListener('input', (e) => {
            const ms = parseInt(e.target.value, 10) * 1000;
            setSetting('matchDurationMs', ms);
            if (durOut) durOut.textContent = _fmtDuration(ms);
        });
    }

    bindCheckbox('set-ghost',     'ghostPiece');
    bindCheckbox('set-scanlines', 'scanlines');

    document.getElementById('settings-reset')?.addEventListener('click', () => {
        resetSettings();
        _refreshSettingsUI();
        arcade.playClickSound();
    });

    document.getElementById('settings-close')?.addEventListener('click', closeSettingsPanel);
    document.getElementById('open-settings-btn')?.addEventListener('click', openSettingsPanel);
    // Backdrop click also dismisses.
    document.querySelector('#settings-modal .settings-backdrop')
        ?.addEventListener('click', closeSettingsPanel);
}
_wireSettingsPanelInputs();

// React to setting changes. Audio gains and visual toggles update live.
onSettingChange((key, value) => {
    if (key === 'musicVol') {
        arcade.setMusicVolume(value);
        const slider = document.getElementById('music-slider');
        if (slider && parseFloat(slider.value) !== value) slider.value = value;
    } else if (key === 'sfxVol') {
        arcade.setSfxVolume(value);
        const slider = document.getElementById('sfx-slider');
        if (slider && parseFloat(slider.value) !== value) slider.value = value;
    } else if (key === 'scanlines') {
        document.body.classList.toggle('no-crt', !value);
    } else if (key === 'ghostPiece') {
        if (p1) p1.showGhost = value;
        if (p2) p2.showGhost = value;
    } else if (['shieldCost', 'lightningCost', 'bombCost', 'colorBusterCost'].includes(key)) {
        if (p1Battle) {
            if (key === 'shieldCost') p1Battle.SHIELD_COST = value;
            else if (key === 'lightningCost') p1Battle.LIGHTNING_COST = value;
            else if (key === 'bombCost') p1Battle.BOMB_COST = value;
            else if (key === 'colorBusterCost') p1Battle.COLOR_BUSTER_COST = value;
        }
        updatePowerUpCostsUI();
        updatePowerUpUI();
    }

    // Host: broadcast match-affecting settings so the guest mirrors them.
    // Skip guest's own setting writes (which only happen via the transient
    // apply path, which uses _notify directly without persisting - those
    // still flow through here but `!fb.isHost` blocks the rebroadcast).
    if (HOST_SYNCED_SETTINGS.includes(key) && fb && fb.isHost && fb.sendMatchSettings) {
        fb.sendMatchSettings(_snapshotHostSyncedSettings());
    }
});

// Apply visual settings on boot so refresh respects saved state.
document.body.classList.toggle('no-crt', !settings.scanlines);
