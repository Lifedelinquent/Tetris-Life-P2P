export class BattleManager {
    constructor(engine, isPlayer1) {
        this.engine = engine;
        this.isPlayer1 = isPlayer1;

        // DoT Garbage System
        this.pendingGarbage = 0;      // Total garbage waiting to be applied
        this.dotTimer = null;          // Interval for applying garbage over time
        this.DOT_RATE = 2;             // Lines to apply per tick
        this.DOT_INTERVAL = 2000;      // 2 seconds between applications

        this.koCount = 0;
        this.combo = 0;
        this.backToBack = false;
        this.linesSent = 0; // Track total lines sent to opponent

        // Power-up Currency System (lines = currency)
        this.totalLinesCleared = 0;    // Lines available to spend
        this.SHIELD_COST = 3;          // Shield costs 3 lines
        this.LIGHTNING_COST = 6;       // Lightning costs 6 lines
        this.BOMB_COST = 9;            // Bomb costs 9 lines
        this.COLOR_BUSTER_COST = 17;   // Color Buster costs 17 lines

        this.shieldActive = false; // Blocks next attack
        this.onShieldUsed = null; // Callback for when shield is consumed (set by main.js)

        // Effects (Passed from main.js usually, but we need access)
        this.arcadeRef = window.arcadeManager; // Global reference or passed in? 
        // Better to pass in constructor, but for now we'll rely on global or attach later
    }

    // Start the DoT timer when garbage is received
    startDoTTimer() {
        if (this.dotTimer) return; // Already running

        this.dotTimer = setInterval(() => {
            if (this.pendingGarbage > 0) {
                const toApply = Math.min(this.DOT_RATE, this.pendingGarbage);
                this.addGarbage(toApply);
                this.pendingGarbage -= toApply;
                this.updateMeter();

                // Stop timer if no more garbage
                if (this.pendingGarbage <= 0) {
                    this.stopDoTTimer();
                }
            }
        }, this.DOT_INTERVAL);
    }

    stopDoTTimer() {
        if (this.dotTimer) {
            clearInterval(this.dotTimer);
            this.dotTimer = null;
        }
    }

    onLineClear(count) {
        // Visual Effect
        if (window.arcade) {
            const centerX = this.isPlayer1 ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
            const centerY = window.innerHeight * 0.5;
            window.arcade.createExplosion(centerX, centerY, '#0DC2FF', count * 10);
        }

        // Add lines as currency
        this.totalLinesCleared += count;

        return true; // Always notify UI to update (may have new power-ups available)
    }

    // Counter system: Lines cleared reduce pending garbage
    // Returns how many lines to actually send as attack (after countering)
    counterGarbage(linesCleared) {
        if (this.pendingGarbage > 0 && linesCleared > 0) {
            const countered = Math.min(this.pendingGarbage, linesCleared);
            this.pendingGarbage -= countered;
            this.updateMeter();

            // Return remaining lines that can be used as attack
            return linesCleared - countered;
        }
        return linesCleared;
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
                this.engine.nextPieces.unshift('I', 'I', 'I');
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

        console.log('Color Buster activated! Next pieces:', this.engine.nextPieces);
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
        // Insert BOMB at the front of the next pieces queue
        this.engine.nextPieces.unshift('BOMB');
        this.engine.renderNext();

        if (window.arcade) {
            const x = this.isPlayer1 ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
            window.arcade.createFloatingText("💣 BOMB INCOMING!", x, window.innerHeight * 0.3, '#ff00ff');
        }

        console.log('Received bomb! Next pieces:', this.engine.nextPieces);
    }

    // Setup bomb detonation callback - stores expiry time for game loop checking
    setupBombDetonation(onDetonateCallback) {
        this.bombExpiresAt = null; // Track when bomb should detonate
        console.log('setupBombDetonation called, setting up onBombPlaced callback');

        this.engine.onBombPlaced = (expiresAt) => {
            console.log(`onBombPlaced callback triggered! expiresAt=${expiresAt}, isPlayer1=${this.isPlayer1}`);
            this.bombExpiresAt = expiresAt;
        };
    }

    // Called from main.js tick() - only runs when game is active (not paused)
    updateBombs() {
        if (!this.bombExpiresAt) return;

        const now = Date.now();
        const timeLeft = Math.ceil((this.bombExpiresAt - now) / 1000);
        console.log(`updateBombs: timeLeft=${timeLeft}s, bombExpiresAt=${this.bombExpiresAt}`);
        if (now >= this.bombExpiresAt) {
            console.log('Bomb timer expired! Checking for active bombs...');
            console.log('activeBombs:', this.engine.activeBombs);

            // Always try to detonate - scan grid for any remaining BOMB blocks
            const bombCount = this.engine.detonateBombs();
            console.log('detonateBombs returned:', bombCount);

            if (bombCount > 0) {
                console.log(`BOOM! Bomb detonated, adding 2 garbage lines`);
                // Add 2 lines of garbage
                this.pendingGarbage += 2;
                this.updateMeter();
                this.startDoTTimer();

                if (window.arcade) {
                    const x = this.isPlayer1 ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
                    window.arcade.createFloatingText("💥 BOOM! +2 LINES!", x, window.innerHeight * 0.4, '#FF0D72');
                }
            } else {
                console.log('No bombs to detonate (all defused)');
            }

            this.bombExpiresAt = null; // Clear the timer
        }
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
            return; // BLOCKED
        }

        // Regular garbage (no more old bomb effect - bombs now go through queue)
        this.pendingGarbage += lines;
        if (window.arcade && lines > 0) {
            const x = this.isPlayer1 ? window.innerWidth * 0.35 : window.innerWidth * 0.65;
            window.arcade.createFloatingText("INCOMING " + lines, x, window.innerHeight * 0.3, '#FF0D72');
        }

        this.updateMeter();
        this.startDoTTimer();
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

    // calculateAttack - Now works with counter system
    calculateAttack(linesCleared, isTSpin) {
        // Track combo even for single lines
        if (linesCleared > 0) {
            this.combo++;
        } else {
            this.combo = 0;
        }

        this.updateComboUI(); // Visual Update

        if (linesCleared === 0) return 0;

        // Require at least 2 lines to send garbage (makes game last longer)
        if (linesCleared < 2 && !isTSpin) return 0;

        // Attack formula: 2 lines = 1, 3 lines = 2, 4 lines = 3
        let linesToSend = linesCleared - 1;

        // T-Spin Bonus (always sends garbage even for 1 line)
        if (isTSpin) linesToSend += 2;

        // Combo bonus (every 3 combos = +1 line)
        linesToSend += Math.floor(this.combo / 3);

        // Back-to-Back bonus for Tetrises and T-Spins
        if (linesCleared === 4 || isTSpin) {
            if (this.backToBack) linesToSend += 1;
            this.backToBack = true;
        } else if (linesCleared > 0) {
            this.backToBack = false;
        }
        return linesToSend;
    }

    updateComboUI() {
        const id = this.isPlayer1 ? 'p1-combo' : 'p2-combo';
        const container = document.getElementById(id + '-container');
        const fill = document.getElementById(id + '-fill');

        if (!container || !fill) return;

        if (this.combo > 1) {
            container.style.display = 'block';
            // Cap visual at 10 for full bar
            const percentage = Math.min(100, (this.combo / 10) * 100);
            fill.style.width = percentage + '%';

            // Color shift based on intensity
            if (this.combo > 6) {
                fill.style.background = `linear-gradient(90deg, #FF0D72, #FF0000)`; // Red hot
                fill.style.boxShadow = '0 0 15px #FF0000';
            } else {
                fill.style.background = `linear-gradient(90deg, #0DC2FF, #FFE138, #FF0D72)`;
                fill.style.boxShadow = '0 0 10px currentColor';
            }
        } else {
            container.style.display = 'none';
            fill.style.width = '0%';
        }
    }

    addGarbage(lines) {
        const cols = this.engine.grid[0].length;
        for (let i = 0; i < lines; i++) {
            const row = Array(cols).fill('G');
            const hole = Math.floor(Math.random() * cols);
            row[hole] = 0;
            this.engine.grid.shift();
            this.engine.grid.push(row);
        }
    }

    updateMeter() {
        const total = this.pendingGarbage;
        const meter = document.getElementById(`${this.isPlayer1 ? 'p1' : 'p2'}-garbage-meter`);
        if (meter) {
            meter.innerHTML = `<div class="garbage-fill" style="height: ${Math.min(total * 30, 600)}px"></div>`;
        }
    }

    resetAfterKO() {
        this.stopDoTTimer();
        this.pendingGarbage = 0;
        this.engine.grid = this.engine.createEmptyGrid();
        this.updateMeter();
        this.engine.spawnPiece();
    }
}

