import {
    DOT_RATE_LINES,
    DOT_INTERVAL_MS,
    SHIELD_COST,
    LIGHTNING_COST,
    BOMB_COST,
    COLOR_BUSTER_COST,
} from './config.js';

export class BattleManager {
    constructor(engine, isPlayer1) {
        this.engine = engine;
        this.isPlayer1 = isPlayer1;

        // DoT Garbage System (tick-driven so pause freezes it).
        // Each entry in pendingGarbageQueue is { lines, hole } so all rows
        // from a single attack share one hole column.
        this.pendingGarbage = 0;
        this.pendingGarbageQueue = [];
        this.DOT_RATE = DOT_RATE_LINES;
        this.DOT_INTERVAL = DOT_INTERVAL_MS;
        this._dotElapsedMs = 0;
        this._lastDotTickTime = 0;

        this.koCount = 0;
        this.combo = 0;
        this.backToBack = false;
        this.linesSent = 0; // Track total lines sent to opponent

        // Per-match stats for the end-of-match summary card.
        this.linesClearedTotal = 0; // distinct from totalLinesCleared (currency)
        this.tetrises = 0;
        this.maxCombo = 0;

        // Power-up Currency System (lines = currency)
        this.totalLinesCleared = 0;
        this.SHIELD_COST       = SHIELD_COST;
        this.LIGHTNING_COST    = LIGHTNING_COST;
        this.BOMB_COST         = BOMB_COST;
        this.COLOR_BUSTER_COST = COLOR_BUSTER_COST;

        this.shieldActive = false;
        this.onShieldUsed = null; // Set by main.js to refresh the shield button.
    }

    // Reset the DoT pacing - called when fresh garbage arrives so the
    // first chunk doesn't apply too soon (or too late) after queuing.
    startDoTTimer() {
        this._dotElapsedMs = 0;
        this._lastDotTickTime = Date.now();
    }

    stopDoTTimer() {
        this._dotElapsedMs = 0;
        this._lastDotTickTime = 0;
    }

    // Called from main.js tick() while the game is active (and unpaused).
    updateDoT() {
        if (this.pendingGarbage <= 0) return;

        const now = Date.now();
        if (this._lastDotTickTime === 0) this._lastDotTickTime = now;
        const delta = Math.min(now - this._lastDotTickTime, 1000); // cap stalls
        this._lastDotTickTime = now;
        this._dotElapsedMs += delta;

        while (this._dotElapsedMs >= this.DOT_INTERVAL && this.pendingGarbage > 0) {
            const toApply = Math.min(this.DOT_RATE, this.pendingGarbage);
            this.addGarbage(toApply);
            this.pendingGarbage -= toApply;
            this.updateMeter();
            this._dotElapsedMs -= this.DOT_INTERVAL;
        }

        if (this.pendingGarbage <= 0) this.stopDoTTimer();
    }

    onLineClear(count) {
        // Visual Effect
        if (window.arcade) {
            const centerX = this.isPlayer1 ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
            const centerY = window.innerHeight * 0.5;
            window.arcade.createExplosion(centerX, centerY, '#0DC2FF', count * 10);
        }

        // Add lines as currency + roll match-stat counters.
        this.totalLinesCleared += count;
        this.linesClearedTotal += count;
        if (count === 4) this.tetrises++;

        return true; // Always notify UI to update (may have new power-ups available)
    }

    // Counter system: outgoing attack reduces pending garbage 1:1.
    // Returns the leftover attack to actually send to the opponent.
    counterAttack(attackLines) {
        if (this.pendingGarbage > 0 && attackLines > 0) {
            const countered = Math.min(this.pendingGarbage, attackLines);
            this.pendingGarbage -= countered;
            this.updateMeter();
            return attackLines - countered;
        }
        return attackLines;
    }

    usePowerUp(type) {
        if (type === 'shield') {
            if (this.totalLinesCleared >= this.SHIELD_COST && !this.shieldActive) {
                this.totalLinesCleared -= this.SHIELD_COST; // Spend lines
                this.shieldActive = true;
                this.updateShieldVisuals();
                return true;
            }
        } else if (type === 'rush') { // Lightning -> 3 I pieces
            if (this.totalLinesCleared >= this.LIGHTNING_COST) {
                this.totalLinesCleared -= this.LIGHTNING_COST; // Spend lines
                // Tag as LIGHTNING_I so hold() blocks them (lines already spent).
                this.engine.nextPieces.unshift('LIGHTNING_I', 'LIGHTNING_I', 'LIGHTNING_I');
                this.engine.renderNext();
                return true;
            }
        } else if (type === 'twin') { // Bomb -> Timer Mine Bomb
            if (this.totalLinesCleared >= this.BOMB_COST) {
                this.totalLinesCleared -= this.BOMB_COST; // Spend lines
                return 'sendBomb';
            }
        } else if (type === 'colorBuster') { // Color Buster - busts all blocks of most-touched color
            if (this.totalLinesCleared >= this.COLOR_BUSTER_COST) {
                this.totalLinesCleared -= this.COLOR_BUSTER_COST; // Spend lines
                this.activateColorBuster();
                return true;
            }
        }

        return false;
    }

    // Color Buster: Insert a glowing BUSTER piece into the next queue
    activateColorBuster() {
        // Insert BUSTER at the front of the next pieces queue
        this.engine.nextPieces.unshift('BUSTER');
        this.engine.renderNext();

        if (window.arcade) {
            const x = this.isPlayer1 ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
            window.arcade.createFloatingText("🌈 COLOR BUSTER!", x, window.innerHeight * 0.3, '#ffffff');
        }
    }

    // Called when a Buster locks but had no neighbors to target -
    // refund the cost so the player isn't punished for an empty board.
    refundColorBuster() {
        this.totalLinesCleared += this.COLOR_BUSTER_COST;
        if (window.arcade) {
            const x = this.isPlayer1 ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
            window.arcade.createFloatingText("NO TARGET — REFUNDED", x, window.innerHeight * 0.4, '#FFD700');
        }
    }

    // Helper method for UI to check power-up availability
    getPowerUpStatus() {
        return {
            shield: this.totalLinesCleared >= this.SHIELD_COST && !this.shieldActive,
            lightning: this.totalLinesCleared >= this.LIGHTNING_COST,
            bomb: this.totalLinesCleared >= this.BOMB_COST,
            colorBuster: this.totalLinesCleared >= this.COLOR_BUSTER_COST,
            totalLines: this.totalLinesCleared
        };
    }

    // Timer Mine Bomb: Receive a bomb piece into our queue
    receiveBomb() {
        // Shield blocks bomb insertion — the shield is meant to block
        // "the next incoming attack" and a bomb is the most dangerous one.
        if (this.shieldActive) {
            this.shieldActive = false;
            this.updateShieldVisuals();
            if (this.onShieldUsed) this.onShieldUsed();

            if (window.arcade) {
                const x = this.isPlayer1 ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
                window.arcade.createFloatingText("BOMB BLOCKED!", x, window.innerHeight * 0.4, '#0DFF72');
            }
            if (window.playShieldBlockedFX) window.playShieldBlockedFX(this.isPlayer1 ? 'p1' : 'p2');
            return; // BLOCKED
        }

        // Insert BOMB at the front of the next pieces queue
        this.engine.nextPieces.unshift('BOMB');
        this.engine.renderNext();

        if (window.arcade) {
            const x = this.isPlayer1 ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
            window.arcade.createFloatingText("💣 BOMB INCOMING!", x, window.innerHeight * 0.3, '#ff00ff');
        }
    }

    // Setup bomb detonation callback - per-bomb pausable timers.
    // Each placed bomb gets its own independent countdown so multiple
    // bombs tick and detonate independently.
    setupBombDetonation() {
        // Array of { id, remainingMs, lastTickTime }. id links to engine.activeBombs.
        this._bombTimers = [];
        this._nextBombId = 0;

        // Engine fires this when a BOMB piece is placed.
        this.engine.onBombPlaced = (bombId) => {
            this._bombTimers.push({
                id: bombId,
                remainingMs: this.engine.bombCountdown,
                lastTickTime: Date.now()
            });
        };

        // Let the engine's renderer read our pausable countdown per bomb.
        this.engine.bombSecondsProvider = (bombId) => this.getBombSecondsRemaining(bombId);
    }

    // Called from main.js tick() - only runs when game is active (not paused),
    // so wall-clock deltas during gameplay are safe; pauses freeze the bomb.
    updateBombs() {
        if (this._bombTimers.length === 0) return;

        const now = Date.now();
        const expired = [];

        for (const bt of this._bombTimers) {
            if (bt.lastTickTime === 0) bt.lastTickTime = now;
            const delta = now - bt.lastTickTime;
            bt.lastTickTime = now;

            // Cap delta so a long stall (sleep, alt-tab) doesn't insta-detonate
            bt.remainingMs -= Math.min(delta, 1000);

            if (bt.remainingMs <= 0) {
                expired.push(bt.id);
            }
        }

        // Detonate each expired bomb individually.
        for (const bombId of expired) {
            const count = this.engine.detonateBombById(bombId);

            if (count > 0) {
                this._enqueueGarbage(2);
                this.updateMeter();
                this.startDoTTimer();

                if (window.arcade) {
                    const x = this.isPlayer1 ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
                    window.arcade.createFloatingText("💥 BOOM! +2 LINES!", x, window.innerHeight * 0.4, '#FF0D72');
                }
                if (window.shakeSide) window.shakeSide(this.isPlayer1 ? 'p1' : 'p2', 'heavy');
                if (window.flashScreen) window.flashScreen('bomb');
            }

            // Remove the timer entry.
            this._bombTimers = this._bombTimers.filter(bt => bt.id !== bombId);
        }
    }

    // Used by the engine renderer to display the on-block countdown.
    // If bombId is given, return that bomb's remaining time.
    // If no bombId (legacy / fallback), return the soonest-expiring bomb.
    getBombSecondsRemaining(bombId) {
        if (this._bombTimers.length === 0) return null;
        let timer;
        if (bombId !== undefined) {
            timer = this._bombTimers.find(bt => bt.id === bombId);
        }
        if (!timer) {
            // Fallback: use soonest-expiring bomb.
            timer = this._bombTimers.reduce((a, b) => a.remainingMs < b.remainingMs ? a : b);
        }
        return Math.max(0, Math.ceil(timer.remainingMs / 1000));
    }

    receiveGarbage(lines, effect) {
        // Shield Logic: Block 100% of ONE attack
        if (this.shieldActive) {
            this.shieldActive = false;
            this.updateShieldVisuals();

            // Notify UI to update button state
            if (this.onShieldUsed) this.onShieldUsed();

            if (window.arcade) {
                const x = this.isPlayer1 ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
                // Show how many lines were blocked
                const blockText = lines > 0 ? `BLOCKED ${lines} LINES!` : "BLOCKED!";
                window.arcade.createFloatingText(blockText, x, window.innerHeight * 0.4, '#0DFF72');
            }
            // Visual: green inner flash on the protected board.
            if (window.playShieldBlockedFX) window.playShieldBlockedFX(this.isPlayer1 ? 'p1' : 'p2');
            return; // BLOCKED
        }

        // Each attack burst gets its own hole. Lines from the same burst
        // will share that hole when they're eventually applied.
        this._enqueueGarbage(lines);

        if (window.arcade && lines > 0) {
            const x = this.isPlayer1 ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
            window.arcade.createFloatingText("INCOMING " + lines, x, window.innerHeight * 0.3, '#FF0D72');
        }
        // Heavy hits (3+ lines) jolt the receiver's board for emphasis.
        if (lines >= 3 && window.shakeSide) {
            window.shakeSide(this.isPlayer1 ? 'p1' : 'p2', lines >= 5 ? 'heavy' : 'light');
        }

        this.updateMeter();
        this.startDoTTimer();
    }

    // Add a garbage burst to the queue. Each burst stores its own hole column.
    _enqueueGarbage(lines) {
        if (lines <= 0) return;
        const cols = this.engine.grid[0].length;
        const hole = Math.floor(Math.random() * cols);
        this.pendingGarbageQueue.push({ lines, hole });
        this.pendingGarbage += lines;
    }

    updateShieldVisuals() {
        // Updated to target the sidebar indicator
        const indicatorId = this.isPlayer1 ? 'p1-shield-indicator' : 'p2-shield-indicator';
        const indicator = document.getElementById(indicatorId);
        if (indicator) {
            if (this.shieldActive) {
                indicator.classList.remove('hidden');
            } else {
                indicator.classList.add('hidden');
            }
        }
    }

    // Compute outgoing attack from a clear. Combo/B2B state is updated here
    // as a side effect (single source of truth).
    //   tSpinKind: null | 'mini' | 'full'
    calculateAttack(linesCleared, tSpinKind) {
        const isTSpin = tSpinKind === 'full' || tSpinKind === 'mini';

        if (linesCleared > 0) {
            this.combo++;
            if (this.combo > this.maxCombo) this.maxCombo = this.combo;
        } else {
            this.combo = 0;
        }

        // Back-to-Back: Tetris or any T-spin extends the chain; any other
        // line clear breaks it. A drop with no clear preserves it.
        let b2bBonus = 0;
        if (linesCleared > 0) {
            if (linesCleared === 4 || isTSpin) {
                if (this.backToBack) b2bBonus = 1;
                this.backToBack = true;
            } else {
                this.backToBack = false;
            }
        }

        this.updateComboUI();

        if (linesCleared === 0) return 0;

        // Base: single = 0, 2 lines = 1, 3 lines = 2, 4 lines = 3.
        // Single line clears send 0 base damage but still carry combo bonus.
        let linesToSend = linesCleared - 1;

        // T-spin bonus: full = +2, mini = +1
        if (tSpinKind === 'full') linesToSend += 2;
        else if (tSpinKind === 'mini') linesToSend += 1;

        // Combo bonus stacks on top regardless of clear size
        linesToSend += this.getComboBonus();

        linesToSend += b2bBonus;

        return linesToSend;
    }

    // Get combo bonus lines based on current combo count
    getComboBonus() {
        // 1x = no bonus (first line clear)
        // 2x = 1 line, 3x = 2 lines, 4x = 4 lines, 5x+ = 5 lines
        if (this.combo <= 1) return 0;
        if (this.combo === 2) return 1;
        if (this.combo === 3) return 2;
        if (this.combo === 4) return 4;
        return 5; // 5x and beyond
    }

    updateComboUI() {
        BattleManager.renderComboUI(this.isPlayer1 ? 'p1' : 'p2', this.combo, this.backToBack);
    }

    // Render combo + B2B for an arbitrary side. Used both for the local
    // player's own UI and for mirroring the opponent's combo over the wire.
    static renderComboUI(prefix, combo, backToBack) {
        const wrap  = document.getElementById(`${prefix}-combo-wrap`);
        const fill  = document.getElementById(`${prefix}-combo-fill`);
        const count = document.getElementById(`${prefix}-combo-count`);
        const badge = document.getElementById(`${prefix}-b2b-badge`);

        if (!wrap || !fill) return;

        if (combo > 1) {
            wrap.style.display = 'flex';
            if (count) {
                const previous = parseInt(count.textContent, 10) || 0;
                count.textContent = combo;
                // Scale-pop on every increment; restart by force-reflowing.
                if (combo > previous) {
                    count.classList.remove('combo-bump');
                    void count.offsetWidth;
                    count.classList.add('combo-bump');
                }
            }

            const percentage = Math.min(100, (combo / 10) * 100);
            fill.style.width = percentage + '%';

            if (combo > 6) {
                fill.style.background = `linear-gradient(90deg, #FF0D72, #FF0000)`;
                fill.style.boxShadow = '0 0 15px #FF0000';
            } else {
                fill.style.background = `linear-gradient(90deg, #0DC2FF, #FFE138, #FF0D72)`;
                fill.style.boxShadow = '0 0 10px currentColor';
            }
        } else {
            wrap.style.display = 'none';
            fill.style.width = '0%';
            // Reset the displayed count so the bump-animation diff starts
            // from a clean baseline next time the wrap reappears.
            if (count) count.textContent = '0';
        }

        if (badge) {
            badge.classList.toggle('hidden', !backToBack);
        }
    }

    // Apply N garbage rows, draining from pendingGarbageQueue (each burst's
    // own hole). Bursts are FIFO, so the oldest still-pending attack drains
    // first - and rows from the same burst all share one hole.
    addGarbage(lines) {
        const cols = this.engine.grid[0].length;
        let toApply = lines;
        while (toApply > 0 && this.pendingGarbageQueue.length > 0) {
            const front = this.pendingGarbageQueue[0];
            const take = Math.min(toApply, front.lines);
            for (let i = 0; i < take; i++) {
                const row = Array(cols).fill('G');
                row[front.hole] = 0;
                this.engine.grid.shift();
                this.engine.grid.push(row);
            }
            front.lines -= take;
            toApply -= take;
            if (front.lines === 0) this.pendingGarbageQueue.shift();
        }
    }

    updateMeter() {
        const meter = document.getElementById(`${this.isPlayer1 ? 'p1' : 'p2'}-garbage-meter`);
        if (!meter) return;
        const fill = meter.querySelector('.garbage-fill');
        if (fill) {
            fill.style.height = `${Math.min(this.pendingGarbage * 30, 600)}px`;
        }
    }

    resetAfterKO() {
        this.stopDoTTimer();
        this.pendingGarbage = 0;
        this.pendingGarbageQueue = [];
        this.engine.grid = this.engine.createEmptyGrid();
        this.updateMeter();
        this.engine.spawnPiece();
    }
}

