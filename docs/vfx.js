// Visual effects: screen shake, white flash, and power-up activation
// animations. Everything here is pure DOM manipulation - no game state -
// so this module is fully self-contained.

// --- Screen shake ---
// Re-trigger a CSS keyframe by removing the class, forcing reflow, then
// re-adding. Without the reflow the browser dedupes the add/remove and the
// animation doesn't restart.
function shakeElement(el, intensity = 'light') {
    if (!el) return;
    el.classList.remove('shake-light', 'shake-heavy');
    void el.offsetWidth;
    el.classList.add(intensity === 'heavy' ? 'shake-heavy' : 'shake-light');
}

// Shake one player's split. side = 'p1' | 'p2'.
export function shakeSide(side, intensity = 'light') {
    shakeElement(document.querySelector(`.${side}-split`), intensity);
}

// --- White flash ---
// Quick screen-wide flash for big plays. `kind` tints the flash so the
// player can read the type of payoff at a glance:
//   'tetris'    yellow
//   'tspin'     gold
//   'allclear'  cyan
//   default     white
const FLASH_COLORS = {
    tetris:   '#FFE138',
    tspin:    '#FFD700',
    allclear: '#0DC2FF',
    bomb:     '#FF3B7A',
};
export function flashScreen(kind = 'default') {
    const flash = document.getElementById('flash-overlay');
    if (!flash) return;
    flash.style.background = FLASH_COLORS[kind] || '#fff';
    flash.classList.add('flash');
    setTimeout(() => flash.classList.remove('flash'), 70);
}

// --- Power-up activation effects ---
// Each effect attaches a self-cleaning DOM element inside a player's
// .main-board-container, removed after its CSS animation duration.

function _boardEl(side) {
    return document.querySelector(`.${side}-split .main-board-container`);
}

export function playShieldFX(side) {
    const board = _boardEl(side);
    if (!board) return;
    const ring = document.createElement('div');
    ring.className = 'fx-shield-ring';
    board.appendChild(ring);
    setTimeout(() => ring.remove(), 700);
}

export function playShieldBlockedFX(side) {
    const board = _boardEl(side);
    if (!board) return;
    const flash = document.createElement('div');
    flash.className = 'fx-shield-blocked';
    board.appendChild(flash);
    setTimeout(() => flash.remove(), 550);
}

// Generate a zigzag SVG path string from top to bottom of a 100x100 viewBox.
// Each segment kicks left/right by a random offset so every bolt looks unique.
function _zigzagPath() {
    const segments = 6 + Math.floor(Math.random() * 3);
    const stepY = 100 / segments;
    let x = 50 + (Math.random() * 30 - 15);
    let path = `M ${x.toFixed(1)} 0`;
    for (let i = 1; i <= segments; i++) {
        x = Math.max(8, Math.min(92, x + (Math.random() * 40 - 20)));
        path += ` L ${x.toFixed(1)} ${(i * stepY).toFixed(1)}`;
    }
    return path;
}

export function playLightningFX(side) {
    const board = _boardEl(side);
    if (!board) return;
    // Three bolts at 30/55/80% width, staggered. Each is its own SVG so the
    // jagged path animates cleanly via stroke-dashoffset.
    [30, 55, 80].forEach((leftPct, i) => {
        const wrap = document.createElement('div');
        wrap.className = 'fx-lightning-bolt';
        wrap.style.left = `${leftPct}%`;
        wrap.style.transform = 'translateX(-50%)';
        wrap.style.animationDelay = `${i * 80}ms`;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');
        // Outer halo (wider, soft yellow)
        const halo = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        halo.setAttribute('d', _zigzagPath());
        halo.setAttribute('class', 'fx-bolt-halo');
        // Inner core (sharp white)
        const core = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        core.setAttribute('d', halo.getAttribute('d'));
        core.setAttribute('class', 'fx-bolt-core');
        svg.appendChild(halo);
        svg.appendChild(core);
        wrap.appendChild(svg);
        board.appendChild(wrap);
        setTimeout(() => wrap.remove(), 600 + i * 80);
    });
}

export function playBombFlyFX(senderSide) {
    const senderBoard = _boardEl(senderSide);
    const oppSide = senderSide === 'p1' ? 'p2' : 'p1';
    const oppBoard = _boardEl(oppSide);
    if (!senderBoard || !oppBoard) return;

    const sr = senderBoard.getBoundingClientRect();
    const or = oppBoard.getBoundingClientRect();

    const wrap = document.createElement('div');
    wrap.className = 'fx-bomb-flying-wrap';
    wrap.style.left = `${sr.left + sr.width / 2}px`;
    wrap.style.top  = `${sr.top + sr.height / 2}px`;
    const inner = document.createElement('div');
    inner.className = 'fx-bomb-flying';
    inner.textContent = '💣';
    wrap.appendChild(inner);
    document.body.appendChild(wrap);

    requestAnimationFrame(() => {
        wrap.style.left = `${or.left + or.width / 2}px`;
        wrap.style.top  = `${or.top + or.height / 2}px`;
    });
    setTimeout(() => wrap.remove(), 850);

    // Sparkle trail: drop a tiny pink particle at the bomb's current screen
    // position every 30ms over the 750ms flight. Each sparkle fades and
    // floats slightly upward, giving the projectile a real sense of motion.
    const startTime = performance.now();
    const sparkleInterval = setInterval(() => {
        const elapsed = performance.now() - startTime;
        if (elapsed >= 720) {
            clearInterval(sparkleInterval);
            return;
        }
        const rect = wrap.getBoundingClientRect();
        const sparkle = document.createElement('div');
        sparkle.className = 'fx-bomb-sparkle';
        sparkle.style.left = `${rect.left + rect.width / 2 + (Math.random() * 30 - 15)}px`;
        sparkle.style.top  = `${rect.top  + rect.height / 2 + (Math.random() * 30 - 15)}px`;
        document.body.appendChild(sparkle);
        setTimeout(() => sparkle.remove(), 600);
    }, 30);
}

export function playBusterFX(side) {
    const board = _boardEl(side);
    if (!board) return;
    // Three concentric rainbow waves staggered 100ms apart - the layered
    // shockwave reads much more powerful than a single ring.
    [0, 110, 220].forEach((delay, i) => {
        const wave = document.createElement('div');
        wave.className = 'fx-buster-wave';
        wave.style.animationDelay = `${delay}ms`;
        // Each successive ring is a touch fainter so the eye reads a falloff.
        wave.style.opacity = (1 - i * 0.18).toFixed(2);
        board.appendChild(wave);
        setTimeout(() => wave.remove(), 800 + delay);
    });

    // Center burst flash to mark the activation moment.
    const flash = document.createElement('div');
    flash.className = 'fx-buster-burst';
    board.appendChild(flash);
    setTimeout(() => flash.remove(), 350);
}

// --- Animated number counter ---
// Tweens an integer counter on a DOM element (easeOutCubic, 120-450ms).
// Cancels any in-flight tween on the same element so rapid updates feel
// smooth instead of fighting each other. `pop=true` adds a brief scale/glow.
const _numberTweens = {};
export function animateNumber(elId, newVal, opts = {}) {
    const el = document.getElementById(elId);
    if (!el) return;
    const oldVal = parseInt(el.dataset.target || el.textContent, 10) || 0;
    el.dataset.target = newVal;
    if (newVal === oldVal) return;

    if (_numberTweens[elId]) cancelAnimationFrame(_numberTweens[elId]);
    const start = performance.now();
    const delta = newVal - oldVal;
    const duration = Math.min(450, Math.max(120, Math.abs(delta) * 1.5));

    const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.floor(oldVal + delta * eased);
        if (t < 1) {
            _numberTweens[elId] = requestAnimationFrame(step);
        } else {
            el.textContent = newVal;
            delete _numberTweens[elId];
        }
    };
    _numberTweens[elId] = requestAnimationFrame(step);

    if (opts.pop && delta >= 50) {
        el.classList.remove('score-pop');
        void el.offsetWidth;
        el.classList.add('score-pop');
    }
}
