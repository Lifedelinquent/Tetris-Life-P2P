import { BOMB_COUNTDOWN_MS } from './config.js';

export const COLS = 12;
export const ROWS = 20;
export const BLOCK_SIZE = 40;

export const PIECES = {
    'I': [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    'LIGHTNING_I': [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], // Lightning power-up I-piece (can't be held)
    'J': [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    'L': [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
    'O': [[1, 1], [1, 1]],
    'S': [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    'T': [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    'Z': [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
    'BOMB': [[1, 1], [1, 1]], // Timer Mine Bomb - 2x2 like O-piece
    // BUSTER uses a random normal shape at runtime, stored in BUSTER_SHAPES
};

// Shapes that the Color Buster can take (random selection)
export const BUSTER_SHAPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

export const COLORS = {
    'I': '#00f0f0',
    'LIGHTNING_I': '#00f0f0', // Same visual as I — blocked from hold
    'J': '#0000f0',
    'L': '#f0a000',
    'O': '#f0f000',
    'S': '#00f000',
    'T': '#a000f0',
    'Z': '#f00000',
    'G': '#777777', // Garbage
    'B': '#ff00ff', // Bomb (legacy)
    'BOMB': '#ff00ff', // Timer Mine Bomb
    'BUSTER': '#ffffff' // Color Buster - glowing white/rainbow
};

// SRS Wall Kick Data
const WALL_KICKS = {
    'standard': [
        [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
        [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
        [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
        [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]
    ],
    'I': [
        [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
        [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
        [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
        [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]]
    ]
};

export class TetrisEngine {
    constructor(canvas, nextCanvas, holdCanvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.nextCanvas = nextCanvas;
        this.holdCanvas = holdCanvas;
        this.grid = this.createEmptyGrid();
        this.bag = [];
        this.nextPieces = [];
        this.holdPiece = null;
        this.canHold = true;
        this.currentPiece = null;
        this.pos = { x: 0, y: 0 };
        this.rotation = 0;
        this.score = 0;
        this.gameOver = false;
        this.particles = []; // VFX System

        // Timer Mine Bomb System
        this.activeBombs = []; // Array of { id, x, y }
        this._nextBombId = 0;  // Monotonic per-bomb ID
        this.bombCountdown = BOMB_COUNTDOWN_MS;

        // Color Buster - tracks the actual shape for BUSTER pieces
        this.busterShape = null;

        // Visual toggles - main.js sets these from the settings module.
        this.showGhost = true;

        this.initBag();
        this.spawnPiece();
    }

    createEmptyGrid() {
        return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    }

    initBag() {
        if (this.bag.length === 0) {
            const types = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
            // Fisher-Yates: uniform shuffle (`.sort(() => Math.random()-0.5)` is biased)
            for (let i = types.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [types[i], types[j]] = [types[j], types[i]];
            }
            this.bag = types;
        }
        while (this.nextPieces.length < 3) {
            if (this.bag.length === 0) this.initBag();
            this.nextPieces.push(this.bag.pop());
        }
        this.renderNext();
    }

    spawnPiece() {
        const type = this.nextPieces.shift();
        this.initBag();
        this.currentPiece = type;
        // Spawn one row above the visible grid so pieces "rise into view"
        // and (more importantly) we only top-out when the piece's filled
        // cells actually overlap the stack, not when it merely touches the
        // top edge. Negative rows are skipped by collide() so this is safe.
        this.pos = { x: Math.floor(COLS / 2) - 2, y: -1 };
        this.rotation = 0;
        this.canHold = true;
        this.lastMoveWasRotation = false;

        // Lock-delay state - resets per piece. The caller (main.js) drives
        // the timer and decides when to actually lock.
        this.groundedAtMs = null;
        this.lockResetsUsed = 0;

        // If this is a Color Buster, assign a random normal tetris shape
        if (type === 'BUSTER') {
            this.busterShape = BUSTER_SHAPES[Math.floor(Math.random() * BUSTER_SHAPES.length)];
        } else {
            this.busterShape = null;
        }

        // Check Danger Mode (if highest block is above row 5)
        let highestY = ROWS;
        // Scan grid for highest block
        for (let y = 0; y < ROWS; y++) {
            if (this.grid[y].some(val => val !== 0)) {
                highestY = y;
                break;
            }
        }

        // Find container via canvas parent (assuming .main-board-container)
        const container = this.canvas.parentElement;
        if (container) {
            if (highestY < 6) { // Top 6 rows populated
                container.classList.add('danger-mode');
            } else {
                container.classList.remove('danger-mode');
            }
        }

        if (this.collide()) {
            this.gameOver = true;
        }
    }

    rotate(dir) {
        // O-piece and BOMB (which uses the O-piece shape) should never rotate.
        if (this.currentPiece === 'O' || this.currentPiece === 'BOMB') return;

        // LIGHTNING_I uses the same kick table as I.

        const oldRotation = this.rotation;
        this.rotation = (this.rotation + dir + 4) % 4;
        const matrix = this.getRotatedMatrix(this.currentPiece, this.rotation);

        const kicks = (this.currentPiece === 'I' || this.currentPiece === 'LIGHTNING_I') ? WALL_KICKS['I'] : WALL_KICKS['standard'];
        const kickIndex = dir === 1 ? oldRotation : this.rotation;
        const kickSet = kicks[kickIndex];

        for (let i = 0; i < kickSet.length; i++) {
            const [dx, dy] = kickSet[i];
            this.pos.x += dx;
            this.pos.y -= dy;
            if (!this.collide()) {
                this.lastMoveWasRotation = true;
                return;
            }
            this.pos.x -= dx;
            this.pos.y += dy;
        }

        this.rotation = oldRotation;
    }

    // Returns true if the piece is touching the floor or another block below.
    isGrounded() {
        this.pos.y++;
        const blocked = this.collide();
        this.pos.y--;
        return blocked;
    }

    // Lock-delay reset request from the caller after a successful move/rotate.
    // Each piece is allowed at most `maxResets` refreshes - after that the
    // lock timer keeps running regardless of further input (anti-stall).
    tryLockDelayReset(now, maxResets) {
        if (!this.isGrounded()) {
            this.groundedAtMs = null;
            return;
        }
        if (this.groundedAtMs === null || this.lockResetsUsed < maxResets) {
            this.groundedAtMs = now;
            this.lockResetsUsed++;
        }
    }

    // True if grounded and lock delay has elapsed.
    shouldLock(now, lockDelayMs) {
        return this.groundedAtMs !== null && (now - this.groundedAtMs) >= lockDelayMs;
    }

    // Returns null (no T-spin), 'mini', or 'full'.
    //  - Requires a T-piece whose last successful action was a rotation.
    //  - 3-corner rule: at least 3 of the 4 corners around the 3x3 box must
    //    be filled (by walls, floor, or stack).
    //  - "Pointing" corners are the two on the side the T-tip faces.
    //    Both pointing corners filled => full T-spin; otherwise mini.
    isTSpin() {
        if (this.currentPiece !== 'T' || !this.lastMoveWasRotation) return null;

        const x = this.pos.x;
        const y = this.pos.y;

        // Corner indices: 0=TL, 1=TR, 2=BL, 3=BR
        const corners = [[0, 0], [2, 0], [0, 2], [2, 2]];
        const filled = corners.map(([dx, dy]) => {
            const bx = x + dx;
            const by = y + dy;
            const outOfBounds = bx < 0 || bx >= COLS || by >= ROWS;
            const blocked = by >= 0 && by < ROWS && this.grid[by] && this.grid[by][bx] !== 0;
            return outOfBounds || blocked;
        });
        const totalFilled = filled.filter(Boolean).length;
        if (totalFilled < 3) return null;

        // Pointing corners by rotation. The T-tip points: 0=up, 1=right, 2=down, 3=left.
        //  rot 0 (tip up):    pointing = TL, TR  (indices 0, 1)
        //  rot 1 (tip right): pointing = TR, BR  (indices 1, 3)
        //  rot 2 (tip down):  pointing = BR, BL  (indices 3, 2)
        //  rot 3 (tip left):  pointing = BL, TL  (indices 2, 0)
        const pointingByRotation = [[0, 1], [1, 3], [3, 2], [2, 0]];
        const [a, b] = pointingByRotation[this.rotation];
        const pointingFilled = (filled[a] ? 1 : 0) + (filled[b] ? 1 : 0);

        return pointingFilled === 2 ? 'full' : 'mini';
    }

    getRotatedMatrix(type, rotation) {
        try {
            // BUSTER uses its assigned random shape, not a fixed shape
            const actualType = (type === 'BUSTER' && this.busterShape) ? this.busterShape : type;
            let matrix = PIECES[actualType];

            if (!matrix) {
                console.warn(`getRotatedMatrix invalid type: ${type}, actual: ${actualType}`);
                // Fallback to I piece if everything fails, or 1x1
                matrix = PIECES['I'] || [[1]];
            }

            // Clone matrix to avoid reference issues
            matrix = matrix.map(row => [...row]);

            for (let i = 0; i < rotation; i++) {
                matrix = matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]).reverse());
            }
            return matrix;
        } catch (e) {
            console.error('getRotatedMatrix CRASH:', e);
            return [[1]];
        }
    }

    collide() {
        const matrix = this.getRotatedMatrix(this.currentPiece, this.rotation);
        for (let y = 0; y < matrix.length; y++) {
            for (let x = 0; x < matrix[y].length; x++) {
                if (matrix[y][x] !== 0) {
                    const boardX = this.pos.x + x;
                    const boardY = this.pos.y + y;

                    // Safety: Check if row exists before accessing column
                    if (boardY >= 0 && (!this.grid[boardY])) {
                        return true; // Treat invalid row as collision
                    }

                    if (boardX < 0 || boardX >= COLS || boardY >= ROWS || (boardY >= 0 && this.grid[boardY][boardX] !== 0)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    merge() {
        const matrix = this.getRotatedMatrix(this.currentPiece, this.rotation);
        const isBomb = this.currentPiece === 'BOMB';
        const isBuster = this.currentPiece === 'BUSTER';
        // LIGHTNING_I stores as 'I' on the grid (it's just a normal I once placed).
        const gridType = this.currentPiece === 'LIGHTNING_I' ? 'I' : this.currentPiece;

        // Each bomb placement gets a unique ID so timers are independent.
        const bombId = isBomb ? this._nextBombId++ : null;

        const busterPositions = [];

        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    const gridY = this.pos.y + y;
                    const gridX = this.pos.x + x;
                    if (gridY >= 0) {
                        if (!isBuster) {
                            this.grid[gridY][gridX] = gridType;
                        } else {
                            busterPositions.push({ x: gridX, y: gridY });
                        }

                        if (isBomb) {
                            this.activeBombs.push({
                                id: bombId,
                                x: gridX,
                                y: gridY
                            });
                        }
                    }
                }
            });
        });

        if (isBomb && this.onBombPlaced) {
            this.onBombPlaced(bombId);
        }

        // Color Buster: detect target color, remove, gravity. Returns metadata.
        this.lastBusterResult = isBuster
            ? this.executeColorBuster(busterPositions)
            : null;
    }

    // Color Buster: find most-touched color, remove all of it, apply gravity.
    // Returns { busted: boolean, removed: number, color: string|null }.
    executeColorBuster(busterPositions) {
        const touchedColors = {};
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [0, 0]];

        busterPositions.forEach(pos => {
            directions.forEach(([dy, dx]) => {
                const checkY = pos.y + dy;
                const checkX = pos.x + dx;
                if (checkY >= 0 && checkY < ROWS && checkX >= 0 && checkX < COLS) {
                    const pieceType = this.grid[checkY][checkX];
                    if (pieceType && pieceType !== 'G' && pieceType !== 'BOMB' && pieceType !== 'B' && pieceType !== 'BUSTER') {
                        const hexColor = COLORS[pieceType];
                        if (hexColor) {
                            touchedColors[hexColor] = (touchedColors[hexColor] || 0) + 1;
                        }
                    }
                }
            });
        });

        let maxCount = 0;
        let targetColors = [];
        for (const [hexColor, count] of Object.entries(touchedColors)) {
            if (count > maxCount) {
                maxCount = count;
                targetColors = [hexColor];
            } else if (count === maxCount) {
                targetColors.push(hexColor);
            }
        }

        if (targetColors.length === 0) {
            // Fizzle: no neighbors. Caller (BattleManager) will refund the cost.
            return { busted: false, removed: 0, color: null };
        }

        const targetHexColor = targetColors[Math.floor(Math.random() * targetColors.length)];

        let removedCount = 0;
        let particlesSpawned = 0;
        const PARTICLE_CAP = 20;

        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const pieceType = this.grid[y][x];
                if (pieceType && COLORS[pieceType] === targetHexColor) {
                    if (particlesSpawned < PARTICLE_CAP) {
                        this.spawnBlockEffect(x * BLOCK_SIZE, y * BLOCK_SIZE, targetHexColor, 2);
                        particlesSpawned++;
                    }
                    this.grid[y][x] = 0;
                    removedCount++;
                }
            }
        }

        this.applyGravity();

        if (window.arcade) {
            window.arcade.createFloatingText(`🌈 BUSTED ${removedCount}!`,
                window.innerWidth * 0.5, window.innerHeight * 0.4, targetHexColor);
        }

        return { busted: true, removed: removedCount, color: targetHexColor };
    }

    // Apply gravity after Color Buster removes blocks
    applyGravity() {
        // Track BOMB cell relocations so activeBombs stays in sync — otherwise
        // a bomb that drops here keeps stale (x, y) and breaks per-bomb timer
        // lookup, defuse detection, and detonation grid cleanup.
        const bombMoves = [];

        for (let x = 0; x < COLS; x++) {
            // Collect non-empty cells with their origin y so we can map moves.
            const cells = [];
            for (let y = ROWS - 1; y >= 0; y--) {
                if (this.grid[y][x] !== 0) {
                    cells.push({ type: this.grid[y][x], fromY: y });
                    this.grid[y][x] = 0;
                }
            }

            // Place blocks back from bottom, filling in gaps
            let placeY = ROWS - 1;
            for (const cell of cells) {
                this.grid[placeY][x] = cell.type;
                if (cell.type === 'BOMB' && placeY !== cell.fromY) {
                    bombMoves.push({ x, fromY: cell.fromY, toY: placeY });
                }
                placeY--;
            }
        }

        for (const m of bombMoves) {
            const bomb = this.activeBombs.find(b => b.x === m.x && b.y === m.fromY);
            if (bomb) bomb.y = m.toY;
        }
    }

    // Timer Mine Bomb Methods - the BattleManager owns the (pausable) timer
    // and may set bombSecondsProvider to delegate the displayed countdown.
    // bombId is optional; if given returns that bomb's remaining time.
    getBombTimeRemaining(bombId) {
        if (this.activeBombs.length === 0) return null;
        if (typeof this.bombSecondsProvider === 'function') {
            return this.bombSecondsProvider(bombId);
        }
        return null;
    }

    checkBombsCleared(clearedRows) {
        // Find which individual bomb IDs had blocks in the cleared rows.
        const defusedIds = new Set();
        for (const bomb of this.activeBombs) {
            if (clearedRows.includes(bomb.y)) {
                defusedIds.add(bomb.id);
            }
        }

        if (defusedIds.size === 0) return []; // No bombs cleared

        // For each defused bomb, remove ALL of its blocks from the grid
        // (a 2x2 bomb might only have 1 row cleared — defuse the whole bomb).
        const defusedBombs = this.activeBombs.filter(b => defusedIds.has(b.id));
        for (const b of defusedBombs) {
            if (b.y >= 0 && b.y < this.grid.length && this.grid[b.y][b.x] === 'BOMB') {
                this.grid[b.y][b.x] = 0;
            }
        }

        // Remove only the defused bombs from tracking.
        this.activeBombs = this.activeBombs.filter(b => !defusedIds.has(b.id));
        return Array.from(defusedIds); // Return defused bomb IDs
    }

    updateBombPositions(clearedRows) {
        // After lines are cleared, bombs above cleared rows shift down
        this.activeBombs.forEach(bomb => {
            const rowsBelowCleared = clearedRows.filter(r => r > bomb.y).length;
            bomb.y += rowsBelowCleared;
        });
    }

    // Legacy: detonate ALL bombs at once.
    detonateBombs() {
        let detonatedCount = 0;
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                if (this.grid[y][x] === 'BOMB') {
                    this.grid[y][x] = 0;
                    this.spawnBlockEffect(x * BLOCK_SIZE, y * BLOCK_SIZE, '#ff00ff', 4);
                    detonatedCount++;
                }
            }
        }
        this.activeBombs = [];
        return detonatedCount > 0 ? 1 : 0;
    }

    // Per-bomb detonation: only detonate the bomb with the given ID.
    detonateBombById(bombId) {
        const blocks = this.activeBombs.filter(b => b.id === bombId);
        let detonatedCount = 0;
        for (const b of blocks) {
            if (b.y >= 0 && b.y < ROWS && b.x >= 0 && b.x < COLS && this.grid[b.y][b.x] === 'BOMB') {
                this.grid[b.y][b.x] = 0;
                this.spawnBlockEffect(b.x * BLOCK_SIZE, b.y * BLOCK_SIZE, '#ff00ff', 4);
                detonatedCount++;
            }
        }
        this.activeBombs = this.activeBombs.filter(b => b.id !== bombId);
        return detonatedCount;
    }

    spawnBlockEffect(x, y, color, intensity) {
        // Intensity 1: Dissolve (Fade out in place)
        // Intensity 2: Crumble (Break into chunks, gravity)
        // Intensity 3: Shatter (High velocity debris)
        // Intensity 4: Explosion (Bright, fast, sparkle)

        if (intensity === 1) {
            this.particles.push({
                x: x, y: y,
                vx: 0, vy: -0.5,
                life: 1.0, decay: 0.016, // ~1 second at 60fps
                color: color,
                size: BLOCK_SIZE,
                type: 'particle', gravity: 0
            });
        } else if (intensity === 2) {
            // 4 Chunks - ~1 second
            for (let i = 0; i < 4; i++) {
                this.particles.push({
                    x: x + (i % 2) * 20,
                    y: y + Math.floor(i / 2) * 20,
                    vx: (Math.random() - 0.5) * 4,
                    vy: (Math.random() * -5) - 2,
                    life: 1.0, decay: 0.016, // ~1 second
                    color: color,
                    size: 18,
                    type: 'particle', gravity: 0.4
                });
            }
        } else if (intensity >= 3) {
            // Shatter (8-12 Chunks) - 1.2-1.5s for bigger clears
            const count = intensity === 3 ? 8 : 16;
            const speed = intensity === 3 ? 8 : 15;
            const lifespan = intensity === 4 ? 1.5 : 1.2; // Tetris gets longer celebration
            for (let i = 0; i < count; i++) {
                this.particles.push({
                    x: x + BLOCK_SIZE / 2,
                    y: y + BLOCK_SIZE / 2,
                    vx: (Math.random() - 0.5) * speed,
                    vy: (Math.random() - 0.5) * speed,
                    life: lifespan, decay: 0.016 + Math.random() * 0.008, // ~1.2-1.5s
                    color: intensity === 4 ? '#FFF' : color, // Flash white for Tetris
                    size: Math.random() * 10 + 5,
                    type: 'particle', gravity: intensity === 4 ? 0.1 : 0.4
                });
            }
        }
    }

    clearLines() {
        let linesCleared = 0;
        let defusedBombIds = []; // Array of per-bomb IDs that were defused
        const rowsToClear = [];

        // 1. Identify Rows
        for (let y = ROWS - 1; y >= 0; y--) {
            if (this.grid[y].every(value => value !== 0)) {
                rowsToClear.push(y);
            }
        }

        // 2. Check if any bombs are in the cleared rows (defuse them!)
        if (rowsToClear.length > 0 && this.activeBombs.length > 0) {
            defusedBombIds = this.checkBombsCleared(rowsToClear);
        }

        // 3. Animate Rows
        const intensity = rowsToClear.length;
        if (intensity > 0) {
            rowsToClear.forEach(y => {
                for (let x = 0; x < COLS; x++) {
                    const type = this.grid[y][x];
                    if (type !== 0 && COLORS[type]) {
                        this.spawnBlockEffect(x * BLOCK_SIZE, y * BLOCK_SIZE, COLORS[type], intensity);
                    }
                }
            });

            // Special FX
            const cx = (COLS * BLOCK_SIZE) / 2;
            const cy = rowsToClear[0] * BLOCK_SIZE;
            if (intensity === 4) this.spawnText("TETRIS!", cx - 100, cy, '#0DFF72');
            else if (intensity === 3) this.spawnText("TRIPLE", cx - 80, cy, '#F538FF');

            // Bomb defused message
            if (defusedBombIds.length > 0) {
                this.spawnText("DEFUSED!", cx - 80, cy + 40, '#0DFF72');
            }
        }

        // 4. Remove Rows (Safe Method: Filter + Replenish)
        const newGrid = this.grid.filter((row, index) => !rowsToClear.includes(index));

        // Add new empty rows at the top to match height
        while (newGrid.length < ROWS) {
            newGrid.unshift(Array(COLS).fill(0));
        }

        this.grid = newGrid;
        linesCleared = intensity;

        // 5. Update bomb positions after rows shift
        if (rowsToClear.length > 0 && this.activeBombs.length > 0) {
            this.updateBombPositions(rowsToClear);
        }

        return { linesCleared, bombDefused: defusedBombIds.length > 0, defusedBombIds };
    }

    // Try to fall by one row. Returns { dropped: boolean }.
    // Lock decisions are driven externally via shouldLock() / lockPiece(),
    // so a drop blocked by the floor no longer auto-locks.
    drop() {
        this.pos.y++;
        if (this.collide()) {
            this.pos.y--;
            return { dropped: false };
        }
        // Falling counts as a non-rotation move for T-spin tracking.
        this.lastMoveWasRotation = false;
        return { dropped: true };
    }

    // Merge current piece, clear lines, spawn next. Used both by hardDrop
    // and by main.js when the lock-delay timer expires.
    lockPiece() {
        this.merge();
        const busterResult = this.lastBusterResult;
        const result = this.clearLines();
        this.spawnPiece();
        return { ...result, busterResult, locked: true };
    }

    // Hard drop bypasses lock delay - falls all the way and locks immediately.
    // Returns the lock result with `cellsDropped` for scoring.
    hardDrop() {
        let cellsDropped = 0;
        while (!this.collide()) {
            this.pos.y++;
            cellsDropped++;
        }
        this.pos.y--;
        cellsDropped--; // last increment was the colliding step
        this.lastMoveWasRotation = false;
        const result = this.lockPiece();
        result.cellsDropped = Math.max(0, cellsDropped);
        result.wasHardDrop = true;
        return result;
    }

    hold() {
        if (!this.canHold) return;

        // BOMB, BUSTER, and LIGHTNING_I pieces cannot be held.
        // Bombs need time-pressure; busters need positional commitment;
        // Lightning I-pieces were paid for with lines — holding them
        // would let the player bank free I-pieces indefinitely.
        if (this.currentPiece === 'BOMB' || this.currentPiece === 'BUSTER' || this.currentPiece === 'LIGHTNING_I') return;

        if (this.holdPiece) {
            const temp = this.currentPiece;
            this.currentPiece = this.holdPiece;
            this.holdPiece = temp;
            // Match the spawn-buffer y so the swapped piece also rises into view.
            this.pos = { x: Math.floor(COLS / 2) - 2, y: -1 };
            this.rotation = 0;
            this.lastMoveWasRotation = false;
            this.groundedAtMs = null;
            this.lockResetsUsed = 0;

            // Restore busterShape if swapping a BUSTER back from hold.
            if (this.currentPiece === 'BUSTER' && !this.busterShape) {
                this.busterShape = BUSTER_SHAPES[Math.floor(Math.random() * BUSTER_SHAPES.length)];
            } else if (this.currentPiece !== 'BUSTER') {
                this.busterShape = null;
            }
        } else {
            this.holdPiece = this.currentPiece;
            this.spawnPiece();
        }
        this.canHold = false;
        this.renderHold();
    }

    renderNext() {
        if (!this.nextCanvas) return;
        const ctx = this.nextCanvas.getContext('2d');
        ctx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
        const cell = 20;

        this.nextPieces.forEach((type, i) => {
            // BUSTER doesn't have a fixed shape - show a T as a stand-in.
            // LIGHTNING_I uses the I shape/color in the preview.
            const displayType = type === 'BUSTER' ? 'T' : type;
            const matrix = PIECES[displayType];
            if (!matrix) return;

            matrix.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value === 0) return;
                    const px = x * cell + 10;
                    const py = y * cell + i * 80 + 20;
                    if (type === 'BUSTER') {
                        const hue = (Date.now() / 10 + x * 30 + y * 30) % 360;
                        this.drawBeveledCube(ctx, px, py, cell - 2, `hsl(${hue}, 100%, 60%)`);
                    } else {
                        this.drawBeveledCube(ctx, px, py, cell - 2, COLORS[type] || COLORS['I']);
                    }
                });
            });
        });
    }

    renderHold() {
        if (!this.holdCanvas || !this.holdPiece) return;
        const ctx = this.holdCanvas.getContext('2d');
        ctx.clearRect(0, 0, this.holdCanvas.width, this.holdCanvas.height);
        const matrix = PIECES[this.holdPiece];
        if (!matrix) return;
        const cell = 20;

        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value === 0) return;
                this.drawBeveledCube(
                    ctx,
                    x * cell + 10, y * cell + 20,
                    cell - 2,
                    COLORS[this.holdPiece]
                );
            });
        });
    }

    // Shared beveled-cube renderer. Works for any base color (hex, hsl)
    // because the highlight/shadow are rgba overlays that don't need to know
    // the source color space. Used by both the main board (BLOCK_SIZE) and
    // the NEXT/HOLD previews (smaller size).
    drawBeveledCube(ctx, px, py, size, baseColor) {
        const bevel = Math.max(2, Math.floor(size / 10));

        // Main fill
        ctx.fillStyle = baseColor;
        ctx.fillRect(px, py, size, size);

        // Glossy curved highlight: a vertical white-to-transparent gradient
        // centered on the upper third gives the cube a soft sheen instead
        // of a flat top-left rectangle. Cheap (1 gradient per block) and
        // adds a lot of perceived depth.
        const gloss = ctx.createLinearGradient(px, py, px, py + size);
        gloss.addColorStop(0,    'rgba(255, 255, 255, 0.38)');
        gloss.addColorStop(0.45, 'rgba(255, 255, 255, 0.05)');
        gloss.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
        gloss.addColorStop(1,    'rgba(0, 0, 0, 0.30)');
        ctx.fillStyle = gloss;
        ctx.fillRect(px, py, size, size);

        // Crisp top + left edge highlight to keep the bevel "lip" reading
        // even with the gloss in place.
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.fillRect(px, py, size, 1);
        ctx.fillRect(px, py, 1, size);

        // Bottom + right shadow edge.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(px, py + size - 1, size, 1);
        ctx.fillRect(px + size - 1, py, 1, size);

        // Inner bevel band (the chunky rim) - top/left lighter, bot/right darker
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(px + 1, py + 1, size - 2, bevel - 1);
        ctx.fillRect(px + 1, py + 1, bevel - 1, size - 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(px + 1, py + size - bevel, size - 2, bevel - 1);
        ctx.fillRect(px + size - bevel, py + 1, bevel - 1, size - 2);

        // Crisp 1px keyline so adjacent blocks read as separate cubes
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
    }

    drawBlock(ctx, x, y, type) {
        const px = x * BLOCK_SIZE;
        const py = y * BLOCK_SIZE;

        // BUSTER: rainbow cube. Uses the bevel renderer with a time-cycling hue.
        if (type === 'BUSTER') {
            const hue = (Date.now() / 10) % 360;
            this.drawBeveledCube(ctx, px, py, BLOCK_SIZE, `hsl(${hue}, 100%, 55%)`);
            ctx.font = '20px Arial';
            ctx.fillText('🌈', px + 8, py + 26);
            return;
        }

        // BOMB: red-tinted cube + emoji + countdown.
        if (type === 'BOMB' || type === 'B') {
            // Each grid cell maps to exactly one bomb in activeBombs; pass its
            // id so the displayed countdown matches that specific bomb instead
            // of falling back to the soonest-expiring one.
            const owner = this.activeBombs.find(b => b.x === x && b.y === y);
            const timeRemaining = this.getBombTimeRemaining(owner ? owner.id : undefined);
            const isUrgent = timeRemaining !== null && timeRemaining <= 2;
            const pulsing = isUrgent && Math.floor(Date.now() / 200) % 2 === 0;
            const baseColor = pulsing ? '#ff3030' : COLORS['BOMB'];
            this.drawBeveledCube(ctx, px, py, BLOCK_SIZE, baseColor);

            ctx.font = '24px Arial';
            ctx.fillText('💣', px + 6, py + 28);

            if (timeRemaining !== null) {
                ctx.font = 'bold 14px Arial';
                ctx.fillStyle = isUrgent ? '#ff3030' : '#fff';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.strokeText(timeRemaining + 's', px + 24, py + 12);
                ctx.fillText(timeRemaining + 's', px + 24, py + 12);
            }
            return;
        }

        // Garbage block: muted slate, but still beveled so the playfield reads
        // as cubes even where the opponent has buried you.
        if (type === 'G') {
            this.drawBeveledCube(ctx, px, py, BLOCK_SIZE, '#555a66');
            return;
        }

        // Regular tetromino
        this.drawBeveledCube(ctx, px, py, BLOCK_SIZE, COLORS[type] || '#ff00ff');
    }

    render() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Safety: Ensure grid exists
        if (!this.grid || this.grid.length === 0) return;

        // Draw Grid
        this.grid.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) this.drawBlock(this.ctx, x, y, value);
            });
        });

        // Safety: Need a valid piece to draw ghost/piece
        if (!this.currentPiece || (!PIECES[this.currentPiece] && this.currentPiece !== 'BUSTER')) return;

        // Draw Ghost (skipped when settings disable it)
        const ghostY = this.pos.y;

        try {
            // Clone pos to avoid mutation side-effects during crash calculation
            const originalY = this.pos.y;

            while (!this.collide()) {
                this.pos.y++;
            }
            const finalGhostY = this.pos.y - 1;
            this.pos.y = originalY; // Restore

            const matrix = this.getRotatedMatrix(this.currentPiece, this.rotation);

            if (this.showGhost) {
                this.ctx.globalAlpha = 0.25;
                matrix.forEach((row, y) => {
                    row.forEach((value, x) => {
                        if (value !== 0) this.drawBlock(this.ctx, this.pos.x + x, finalGhostY + y, this.currentPiece);
                    });
                });
                this.ctx.globalAlpha = 1.0;
            }

            // Draw Current Piece
            matrix.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value !== 0) this.drawBlock(this.ctx, this.pos.x + x, this.pos.y + y, this.currentPiece);
                });
            });

            // BUSTER Target Color Preview - show which color will be removed
            if (this.currentPiece === 'BUSTER') {
                const targetColor = this.getBusterTargetColor(finalGhostY);
                if (targetColor) {
                    this.highlightTargetColor(targetColor);
                }
            }
        } catch (e) {
            console.warn("Render error:", e);
            // Restore pos if crash
            this.pos.y = ghostY;
        }

        // Render Effects
        this.updateEffects();
        this.drawEffects();
    }

    // Calculate which color the BUSTER would target at the given Y position
    getBusterTargetColor(ghostY) {
        const matrix = this.getRotatedMatrix(this.currentPiece, this.rotation);
        const touchedColors = {}; // Map hex color to count
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [0, 0]];

        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    const gridY = ghostY + y;
                    const gridX = this.pos.x + x;

                    directions.forEach(([dy, dx]) => {
                        const checkY = gridY + dy;
                        const checkX = gridX + dx;

                        if (checkY >= 0 && checkY < ROWS && checkX >= 0 && checkX < COLS) {
                            const pieceType = this.grid[checkY][checkX];
                            if (pieceType && pieceType !== 0 && pieceType !== 'G' && pieceType !== 'BOMB' && pieceType !== 'B' && pieceType !== 'BUSTER') {
                                const hexColor = COLORS[pieceType];
                                if (hexColor) {
                                    touchedColors[hexColor] = (touchedColors[hexColor] || 0) + 1;
                                }
                            }
                        }
                    });
                }
            });
        });

        // Find most touched hex color
        let maxCount = 0;
        let targetHexColor = null;

        for (const [hexColor, count] of Object.entries(touchedColors)) {
            if (count > maxCount) {
                maxCount = count;
                targetHexColor = hexColor;
            }
        }

        return targetHexColor;
    }

    // Highlight all blocks of the target hex color with a pulsing indicator (no shadowBlur for performance)
    highlightTargetColor(targetHexColor) {
        const hue = (Date.now() / 10) % 360;

        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const pieceType = this.grid[y][x];
                if (pieceType && COLORS[pieceType] === targetHexColor) {
                    // Draw pulsing border around target blocks (no shadow for performance)
                    this.ctx.strokeStyle = `hsl(${hue}, 100%, 70%)`;
                    this.ctx.lineWidth = 3;
                    this.ctx.strokeRect(x * BLOCK_SIZE + 2, y * BLOCK_SIZE + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);

                    // Draw X indicator
                    this.ctx.font = 'bold 16px Arial';
                    this.ctx.fillStyle = '#ff0000';
                    this.ctx.fillText('✕', x * BLOCK_SIZE + 12, y * BLOCK_SIZE + 26);
                }
            }
        }

        // Draw target color indicator at top of screen
        this.ctx.fillStyle = targetHexColor;
        this.ctx.fillRect(COLS * BLOCK_SIZE / 2 - 30, 10, 60, 30);
        this.ctx.strokeStyle = `hsl(${hue}, 100%, 60%)`;
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(COLS * BLOCK_SIZE / 2 - 30, 10, 60, 30);
        this.ctx.font = 'bold 12px Arial';
        this.ctx.fillStyle = '#000';
        this.ctx.fillText('TARGET', COLS * BLOCK_SIZE / 2 - 24, 30);
    }

    // --- VFX System ---

    spawnParticles(x, y, amount, color, type = 'square') {
        for (let i = 0; i < amount; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * (type === 'row' ? COLS * BLOCK_SIZE : BLOCK_SIZE),
                y: y + (Math.random() - 0.5) * BLOCK_SIZE,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1.0,
                decay: 0.02 + Math.random() * 0.03,
                color: color || '#fff',
                size: Math.random() * 5 + 3,
                type: 'particle',
                gravity: 0.2
            });
        }
    }

    spawnText(text, x, y, color = '#fff') {
        // Research-based timing: 2.5-3s for fast-paced games
        const isTetris = text.includes('TETRIS');
        this.particles.push({
            x: x,
            y: y,
            vx: 0,
            vy: -0.5, // Float up moderately
            life: isTetris ? 3.0 : 2.5, // Tetris gets slightly longer (2.5-3s)
            decay: 0.016, // ~2.5-3 seconds at 60fps
            text: text,
            color: color,
            type: 'text',
            size: isTetris ? 55 : 45 // Tetris slightly larger
        });
    }

    updateEffects() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= p.decay;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            p.x += p.vx;
            p.y += p.vy;

            if (p.type === 'particle') {
                p.vy += p.gravity;
            }
        }
    }

    drawEffects() {
        this.ctx.save();
        this.particles.forEach(p => {
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;

            if (p.type === 'text') {
                this.ctx.font = `bold ${p.size}px "Press Start 2P", Arial`;
                this.ctx.strokeStyle = 'black';
                this.ctx.lineWidth = 4;
                this.ctx.strokeText(p.text, p.x, p.y);
                this.ctx.fillText(p.text, p.x, p.y);
            } else {
                this.ctx.fillRect(p.x, p.y, p.size, p.size);
            }
        });
        this.ctx.restore();
    }
}
