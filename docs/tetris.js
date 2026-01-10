export const COLS = 12;
export const ROWS = 20;
export const BLOCK_SIZE = 40;

export const PIECES = {
    'I': [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
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
        this.activeBombs = []; // Array of { x, y, expiresAt, timerId }
        this.bombCountdown = 10000; // 10 seconds in ms

        // Color Buster - tracks the actual shape for BUSTER pieces
        this.busterShape = null;

        this.initBag();
        this.spawnPiece();
    }

    createEmptyGrid() {
        return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    }

    initBag() {
        if (this.bag.length === 0) {
            this.bag = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'].sort(() => Math.random() - 0.5);
        }
        while (this.nextPieces.length < 3) {
            if (this.bag.length === 0) this.initBag();
            this.nextPieces.push(this.bag.pop());
        }
        this.renderNext();
    }

    spawnPiece() {
        // Debug Log
        console.log('Spawning Piece. Queue before shift:', [...this.nextPieces]);
        const type = this.nextPieces.shift();
        console.log('Spawned Type:', type);
        this.initBag();
        this.currentPiece = type;
        this.pos = { x: Math.floor(COLS / 2) - 2, y: 0 };
        this.rotation = 0;
        this.canHold = true;
        this.lastMoveWasRotation = false;

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
        const oldRotation = this.rotation;
        this.rotation = (this.rotation + dir + 4) % 4;
        const matrix = this.getRotatedMatrix(this.currentPiece, this.rotation);

        const kicks = this.currentPiece === 'I' ? WALL_KICKS['I'] : WALL_KICKS['standard'];
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

    isTSpin() {
        if (this.currentPiece !== 'T' || !this.lastMoveWasRotation) return false;

        let corners = 0;
        const x = this.pos.x;
        const y = this.pos.y;

        // 3-corner rule
        const check = [[0, 0], [2, 0], [0, 2], [2, 2]];
        check.forEach(([dx, dy]) => {
            const bx = x + dx;
            const by = y + dy;
            if (bx < 0 || bx >= COLS || by >= ROWS || (by >= 0 && this.grid[by][bx] !== 0)) {
                corners++;
            }
        });
        return corners >= 3;
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
        const bombExpiresAt = isBomb ? Date.now() + this.bombCountdown : null;

        // For Buster: collect positions and adjacent colors
        const busterPositions = [];
        const touchedColors = {};

        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    const gridY = this.pos.y + y;
                    const gridX = this.pos.x + x;
                    if (gridY >= 0) {
                        // For normal pieces and bombs, place on grid
                        if (!isBuster) {
                            this.grid[gridY][gridX] = this.currentPiece;
                        } else {
                            busterPositions.push({ x: gridX, y: gridY });
                        }

                        // Register bomb blocks for countdown
                        if (isBomb) {
                            this.activeBombs.push({
                                x: gridX,
                                y: gridY,
                                expiresAt: bombExpiresAt
                            });
                        }
                    }
                }
            });
        });

        // Start bomb detonation callback if we just placed a bomb
        if (isBomb && this.onBombPlaced) {
            this.onBombPlaced(bombExpiresAt);
        }

        // Color Buster: Detect colors, remove most-touched, apply gravity
        if (isBuster) {
            this.executeColorBuster(busterPositions);
        }
    }

    // Color Buster: Find most-touched color, remove all of it, apply gravity
    executeColorBuster(busterPositions) {
        const touchedColors = {}; // Maps hex color to count
        const colorToTypes = {}; // Maps hex color to array of piece types with that color

        // Check all 4 directions (up, down, left, right) for each buster block
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [0, 0]]; // Include current pos if overlapping

        busterPositions.forEach(pos => {
            directions.forEach(([dy, dx]) => {
                const checkY = pos.y + dy;
                const checkX = pos.x + dx;

                if (checkY >= 0 && checkY < ROWS && checkX >= 0 && checkX < COLS) {
                    const pieceType = this.grid[checkY][checkX];
                    // Only count actual tetris piece types (not garbage, bomb, empty, buster)
                    if (pieceType && pieceType !== 0 && pieceType !== 'G' && pieceType !== 'BOMB' && pieceType !== 'B' && pieceType !== 'BUSTER') {
                        const hexColor = COLORS[pieceType];
                        if (hexColor) {
                            touchedColors[hexColor] = (touchedColors[hexColor] || 0) + 1;
                            // Track which piece types have this color
                            if (!colorToTypes[hexColor]) colorToTypes[hexColor] = new Set();
                            colorToTypes[hexColor].add(pieceType);
                        }
                    }
                }
            });
        });

        console.log('Color Buster touched colors (hex):', touchedColors);

        // Find the most touched hex color
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
            console.log('Color Buster: No colors touched!');
            return;
        }

        // If tied, pick random
        const targetHexColor = targetColors[Math.floor(Math.random() * targetColors.length)];
        console.log(`Color Buster: Busting all ${targetHexColor} blocks!`);

        // Count and remove all blocks with matching hex color
        let removedCount = 0; // blocks removed
        let particlesSpawned = 0;
        const PARTICLE_CAP = 20; // Prevent massive lag if clearing 50+ blocks

        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const pieceType = this.grid[y][x];
                if (pieceType && pieceType !== 0 && COLORS[pieceType] === targetHexColor) {
                    // Spawn effect at each removed block (capped)
                    if (particlesSpawned < PARTICLE_CAP) {
                        this.spawnBlockEffect(x * BLOCK_SIZE, y * BLOCK_SIZE, targetHexColor, 2);
                        particlesSpawned++;
                    }
                    this.grid[y][x] = 0;
                    removedCount++;
                } else if (pieceType && pieceType !== 0 && COLORS[pieceType] !== targetHexColor) {
                    // Debug log for misses (sample)
                    if (Math.random() < 0.01) console.log('Skipped block:', pieceType, COLORS[pieceType]);
                }
            }
        }

        console.log(`Color Buster: Removed ${removedCount} blocks of color ${targetHexColor}!`);

        // Apply gravity - make blocks fall down
        this.applyGravity();

        // Visual feedback
        if (window.arcade) {
            window.arcade.createFloatingText(`🌈 BUSTED ${removedCount}!`,
                window.innerWidth * 0.5, window.innerHeight * 0.4, targetHexColor);
        }
    }

    // Apply gravity after Color Buster removes blocks
    applyGravity() {
        // For each column, drop blocks down to fill empty spaces
        for (let x = 0; x < COLS; x++) {
            // Collect all non-empty blocks in this column (from bottom to top)
            const blocks = [];
            for (let y = ROWS - 1; y >= 0; y--) {
                if (this.grid[y][x] !== 0) {
                    blocks.push(this.grid[y][x]);
                    this.grid[y][x] = 0;
                }
            }

            // Place blocks back from bottom, filling in gaps
            let placeY = ROWS - 1;
            for (const block of blocks) {
                this.grid[placeY][x] = block;
                placeY--;
            }
        }
    }

    // Timer Mine Bomb Methods
    getBombTimeRemaining() {
        // Returns time remaining for active bombs (for rendering countdown)
        if (this.activeBombs.length === 0) return null;
        const now = Date.now();
        const minExpiry = Math.min(...this.activeBombs.map(b => b.expiresAt));
        return Math.max(0, Math.ceil((minExpiry - now) / 1000));
    }

    checkBombsCleared(clearedRows) {
        // Check if ANY bomb blocks were in cleared rows
        const initialCount = this.activeBombs.length;
        const bombsInClearedRows = this.activeBombs.filter(bomb =>
            clearedRows.includes(bomb.y)
        );

        if (bombsInClearedRows.length > 0) {
            // If ANY part of the bomb is cleared, FULLY defuse the entire bomb
            // This is more intuitive and rewards quick play
            console.log(`Bomb defused! Cleared ${bombsInClearedRows.length} of ${initialCount} bomb blocks`);

            // Remove ALL remaining bomb blocks from the grid
            for (let y = 0; y < this.grid.length; y++) {
                for (let x = 0; x < this.grid[y].length; x++) {
                    if (this.grid[y][x] === 'BOMB') {
                        this.grid[y][x] = 0; // Clear the bomb block
                    }
                }
            }

            // Clear all bomb tracking
            this.activeBombs = [];
            return true; // Bomb fully defused
        }

        return false; // No bombs cleared
    }

    updateBombPositions(clearedRows) {
        // After lines are cleared, bombs above cleared rows shift down
        this.activeBombs.forEach(bomb => {
            const rowsBelowCleared = clearedRows.filter(r => r > bomb.y).length;
            bomb.y += rowsBelowCleared;
        });
    }

    detonateBombs() {
        // Called when bomb timer expires - find and clear all BOMB blocks from grid
        console.log('detonateBombs called! activeBombs:', this.activeBombs.length);

        let detonatedCount = 0;

        // Scan entire grid for BOMB blocks (positions may have shifted)
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                if (this.grid[y][x] === 'BOMB') {
                    console.log(`Detonating bomb at (${x}, ${y})`);
                    this.grid[y][x] = 0;
                    // Spawn explosion effect
                    this.spawnBlockEffect(x * BLOCK_SIZE, y * BLOCK_SIZE, '#ff00ff', 4);
                    detonatedCount++;
                }
            }
        }

        this.activeBombs = [];
        console.log(`Detonated ${detonatedCount} bomb blocks`);

        // NOTE: Do NOT apply gravity here - bomb explosion should NOT help the player
        // by compacting their garbage lines. The bomb blocks just disappear.

        return detonatedCount > 0 ? 1 : 0; // Return 1 bomb detonation for 2 lines
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
        let bombDefused = false;
        const rowsToClear = [];

        // 1. Identify Rows
        for (let y = ROWS - 1; y >= 0; y--) {
            if (this.grid[y].every(value => value !== 0)) {
                rowsToClear.push(y);
            }
        }

        // 2. Check if any bombs are in the cleared rows (defuse them!)
        if (rowsToClear.length > 0 && this.activeBombs.length > 0) {
            bombDefused = this.checkBombsCleared(rowsToClear);
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
            if (bombDefused) {
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

        return { linesCleared, bombDefused };
    }

    drop() {
        this.pos.y++;
        if (this.collide()) {
            this.pos.y--;
            this.merge();
            const result = this.clearLines();
            this.spawnPiece();
            return { ...result, locked: true };
        }
        return { locked: false };
    }

    hardDrop() {
        while (!this.collide()) {
            this.pos.y++;
        }
        this.pos.y--;
        this.merge();
        const result = this.clearLines();
        this.spawnPiece();
        return { ...result, locked: true };
    }

    hold() {
        if (!this.canHold) return;
        if (this.holdPiece) {
            const temp = this.currentPiece;
            this.currentPiece = this.holdPiece;
            this.holdPiece = temp;
            this.pos = { x: Math.floor(COLS / 2) - 2, y: 0 };
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
        this.nextPieces.forEach((type, i) => {
            // BUSTER uses T-piece shape for display (actual shape assigned at spawn)
            const displayType = type === 'BUSTER' ? 'T' : type;
            const matrix = PIECES[displayType];

            if (!matrix) {
                console.warn(`No matrix for piece type: ${type}, displayType: ${displayType}`);
                return;
            }

            matrix.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value !== 0) {
                        // BUSTER gets rainbow glow in next queue
                        if (type === 'BUSTER') {
                            const hue = (Date.now() / 10 + x * 30 + y * 30) % 360;
                            ctx.fillStyle = `hsl(${hue}, 100%, 70%)`;
                            // No shadowBlur for performance
                        } else {
                            ctx.fillStyle = COLORS[type];
                            ctx.shadowBlur = 0;
                        }
                        ctx.fillRect(x * 20 + 10, y * 20 + i * 80 + 20, 18, 18);
                        ctx.strokeStyle = type === 'BUSTER' ? '#fff' : '#000';
                        ctx.strokeRect(x * 20 + 10, y * 20 + i * 80 + 20, 18, 18);
                    }
                });
            });

            // Reset shadow after BUSTER
            ctx.shadowBlur = 0;
        });
    }

    renderHold() {
        if (!this.holdCanvas || !this.holdPiece) return;
        const ctx = this.holdCanvas.getContext('2d');
        ctx.clearRect(0, 0, this.holdCanvas.width, this.holdCanvas.height);
        const matrix = PIECES[this.holdPiece];
        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    ctx.fillStyle = COLORS[this.holdPiece];
                    ctx.fillRect(x * 20 + 10, y * 20 + 20, 18, 18);
                    ctx.strokeStyle = '#000';
                    ctx.strokeRect(x * 20 + 10, y * 20 + 20, 18, 18);
                }
            });
        });
    }

    drawBlock(ctx, x, y, type) {
        // Special rendering for BUSTER blocks - rainbow glow effect (no shadowBlur for performance)
        if (type === 'BUSTER') {
            // Rainbow color cycling based on time
            const hue = (Date.now() / 10) % 360;
            const rainbowColor = `hsl(${hue}, 100%, 60%)`;

            // Rainbow fill
            ctx.fillStyle = rainbowColor;
            ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

            // Inner lighter fill
            ctx.fillStyle = `hsl(${hue}, 80%, 80%)`;
            ctx.fillRect(x * BLOCK_SIZE + 4, y * BLOCK_SIZE + 4, BLOCK_SIZE - 8, BLOCK_SIZE - 8);

            // Rainbow border
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(x * BLOCK_SIZE + 1, y * BLOCK_SIZE + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);

            // Draw rainbow emoji
            ctx.font = '20px Arial';
            ctx.fillText('🌈', x * BLOCK_SIZE + 8, y * BLOCK_SIZE + 26);
            return;
        }



        ctx.fillStyle = COLORS[type] || '#ff00ff';
        ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        ctx.strokeStyle = '#000';
        ctx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

        // Special rendering for BOMB blocks
        if (type === 'BOMB' || type === 'B') {
            const timeRemaining = this.getBombTimeRemaining();
            const isUrgent = timeRemaining !== null && timeRemaining <= 2;

            // Pulsing effect when urgent
            if (isUrgent && Math.floor(Date.now() / 200) % 2 === 0) {
                ctx.fillStyle = '#ff0000';
                ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
            }

            // Draw bomb emoji with lit fuse
            ctx.font = '24px Arial';
            ctx.fillText('💣', x * BLOCK_SIZE + 6, y * BLOCK_SIZE + 28);

            // Draw countdown timer
            if (timeRemaining !== null) {
                ctx.font = 'bold 14px Arial';
                ctx.fillStyle = isUrgent ? '#ff0000' : '#fff';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.strokeText(timeRemaining + 's', x * BLOCK_SIZE + 24, y * BLOCK_SIZE + 12);
                ctx.fillText(timeRemaining + 's', x * BLOCK_SIZE + 24, y * BLOCK_SIZE + 12);
            }
        }

        // Special rendering for BUSTER blocks - rainbow glow effect (no shadowBlur for performance)
        if (type === 'BUSTER') {
            // Rainbow color cycling based on time
            const hue = (Date.now() / 10) % 360;
            const rainbowColor = `hsl(${hue}, 100%, 60%)`;

            // Rainbow fill instead of shadow
            ctx.fillStyle = rainbowColor;
            ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

            // Inner lighter fill
            ctx.fillStyle = `hsl(${hue}, 80%, 80%)`;
            ctx.fillRect(x * BLOCK_SIZE + 4, y * BLOCK_SIZE + 4, BLOCK_SIZE - 8, BLOCK_SIZE - 8);

            // Rainbow border
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(x * BLOCK_SIZE + 1, y * BLOCK_SIZE + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);

            // Draw rainbow emoji
            ctx.font = '20px Arial';
            ctx.fillText('🌈', x * BLOCK_SIZE + 8, y * BLOCK_SIZE + 26);
        }
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

        // Draw Ghost
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
            this.ctx.globalAlpha = 0.25; // Slightly more visible
            matrix.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value !== 0) this.drawBlock(this.ctx, this.pos.x + x, finalGhostY + y, this.currentPiece);
                });
            });
            this.ctx.globalAlpha = 1.0;

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
