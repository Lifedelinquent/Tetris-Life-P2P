// Input layer: DAS/ARR auto-repeat, action helpers, key listeners.
// Returns a small API rather than mutating module-level state so this
// file has no globals. Pass dependencies in via createControls(deps).
//
// DAS / ARR / soft-drop / lock-delay timings are read live from the
// shared `settings` object so the settings panel can tune feel without
// a page reload.

import { MAX_LOCK_RESETS } from './config.js';
import { settings } from './settings.js';
import { animateNumber } from './vfx.js';

export function createControls(deps) {
    const {
        arcade,
        getEngine,         // () => current TetrisEngine (p1) or null
        getBattle,         // () => current BattleManager or null
        isMatchActive,     // () => boolean
        isPaused,          // () => boolean
        getButtonPrefix,   // () => 'p1' | 'p2'
        getScoreId,        // () => 'p1-pb' | 'p2-pb' | ''
        addScore,          // (n) => void (main owns the score var)
        getScore,          // () => current score
        broadcast,         // () => broadcastIfNetworked()
        onLock,            // (result, tSpinKind) => void
        onGameOver,        // (toppedOut: boolean) => void
    } = deps;

    // Held-key state for DAS/ARR.
    const heldKeys = {
        ArrowLeft:  { down: false, nextFireAt: 0 },
        ArrowRight: { down: false, nextFireAt: 0 },
        ArrowDown:  { down: false, nextFireAt: 0 },
    };

    function clearHeldKeys() {
        for (const key in heldKeys) {
            heldKeys[key].down = false;
            heldKeys[key].nextFireAt = 0;
        }
    }

    // --- Action helpers (called by keydown + auto-repeat tick) ---

    function actionMoveHorizontal(dx) {
        if (!isMatchActive() || isPaused()) return false;
        const p1 = getEngine();
        if (!p1) return false;
        p1.pos.x += dx;
        if (p1.collide()) {
            p1.pos.x -= dx; // revert into wall/block
            return false;
        }
        // Horizontal moves clear the rotation flag (T-spin requires the LAST
        // action before lock to be a rotation) and refresh lock delay.
        p1.lastMoveWasRotation = false;
        p1.tryLockDelayReset(performance.now(), MAX_LOCK_RESETS);
        if (arcade.playMove) arcade.playMove();
        broadcast();
        return true;
    }

    function actionRotate(dir) {
        if (!isMatchActive() || isPaused()) return false;
        const p1 = getEngine();
        if (!p1) return false;
        p1.rotate(dir);
        arcade.playRotate();
        p1.tryLockDelayReset(performance.now(), MAX_LOCK_RESETS);
        broadcast();
        return true;
    }

    function actionSoftDrop() {
        if (!isMatchActive() || isPaused()) return false;
        const p1 = getEngine();
        if (!p1) return false;
        const result = p1.drop();
        if (result.dropped) {
            // +1 point per soft-dropped cell - guideline scoring.
            addScore(1);
            const sid = getScoreId();
            if (sid) animateNumber(sid, getScore());
            broadcast();
        } else if (p1.groundedAtMs === null) {
            // Soft-drop landed the piece - start the lock timer immediately
            // instead of waiting up to a gravity tick to notice.
            p1.groundedAtMs = performance.now();
        }
        return true;
    }

    function actionHardDrop() {
        if (!isMatchActive() || isPaused()) return false;
        const p1 = getEngine();
        if (!p1) return false;
        const tSpinCheck = p1.isTSpin();
        const result = p1.hardDrop();
        onLock(result, tSpinCheck);
        if (p1.gameOver) onGameOver(true);
        return true;
    }

    function actionHold() {
        if (!isMatchActive() || isPaused()) return false;
        const p1 = getEngine();
        if (!p1) return false;
        p1.hold();
        if (arcade.playHold) arcade.playHold();
        broadcast();
        return true;
    }

    // --- Auto-repeat tick (RAF, gated by match state) ---

    function inputTick() {
        if (isMatchActive() && !isPaused() && getEngine()) {
            const now = performance.now();
            const left  = heldKeys.ArrowLeft;
            const right = heldKeys.ArrowRight;
            const down  = heldKeys.ArrowDown;

            if (left.down && now >= left.nextFireAt) {
                actionMoveHorizontal(-1);
                left.nextFireAt = now + settings.arrMs;
            }
            if (right.down && now >= right.nextFireAt) {
                actionMoveHorizontal(1);
                right.nextFireAt = now + settings.arrMs;
            }
            if (down.down && now >= down.nextFireAt) {
                actionSoftDrop();
                down.nextFireAt = now + settings.softDropMs;
            }
        }
        requestAnimationFrame(inputTick);
    }

    // --- Key listeners ---

    function onKeyDown(e) {
        if (!isMatchActive() || isPaused()) return;
        // We drive our own auto-repeat - ignore the OS-level keydown repeats.
        if (e.repeat) return;

        // Power-up hotkeys (single-press) - delegate to the buttons so the
        // visual handlers run too.
        const lower = e.key.toLowerCase();
        if (lower === 's' || lower === 'r' || lower === 'e' || lower === 'q') {
            const map = { s: 'shield', r: 'rush', e: 'twin', q: 'buster' };
            const btn = document.getElementById(`${getButtonPrefix()}-${map[lower]}-btn`);
            if (btn) btn.click();
            return;
        }

        // Movement keys with DAS/ARR
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            heldKeys.ArrowRight.down = false;
            actionMoveHorizontal(-1);
            heldKeys.ArrowLeft.down = true;
            heldKeys.ArrowLeft.nextFireAt = performance.now() + settings.dasMs;
            return;
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            heldKeys.ArrowLeft.down = false;
            actionMoveHorizontal(1);
            heldKeys.ArrowRight.down = true;
            heldKeys.ArrowRight.nextFireAt = performance.now() + settings.dasMs;
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            actionSoftDrop();
            heldKeys.ArrowDown.down = true;
            heldKeys.ArrowDown.nextFireAt = performance.now() + settings.softDropMs;
            return;
        }

        // Single-press actions
        if (e.key === 'ArrowUp')           { e.preventDefault(); actionRotate(1);  return; }
        if (e.key === ' ')                 { e.preventDefault(); actionHardDrop(); return; }
        if (e.key === 'c' || e.key === 'C') { actionHold(); return; }
    }

    function onKeyUp(e) {
        if (e.key in heldKeys) heldKeys[e.key].down = false;
    }

    function attachListeners() {
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        // Window blur may swallow keyup; clear held state so we don't
        // auto-repeat into the void on return.
        window.addEventListener('blur', clearHeldKeys);
        requestAnimationFrame(inputTick);
    }

    return { clearHeldKeys, attachListeners };
}
