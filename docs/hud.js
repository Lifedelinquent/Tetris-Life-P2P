// HUD updates: power-up button states, avatar swapping, lobby W/L
// records, and the end-of-match stats card. Pure functions - state is
// passed in by main.js so this module has no globals of its own.

import { MATCH_DURATION_MS, HOST_USER_ID, GUEST_USER_ID } from './config.js';
import { animateNumber } from './vfx.js';

// --- Power-up button styling driven by the BattleManager's currency ---

const POWERUP_STYLES = {
    shield: { id: 'shield-btn', glow: '0 0 15px #0DFF72, 0 0 30px #0DFF72',                     ready: 'shield' },
    rush:   { id: 'rush-btn',   glow: '0 0 15px #FFFF00, 0 0 30px #FFFF00',                     ready: 'lightning' },
    twin:   { id: 'twin-btn',   glow: '0 0 15px #FF00FF, 0 0 30px #FF00FF',                     ready: 'bomb' },
    buster: { id: 'buster-btn', glow: '0 0 15px #FFFFFF, 0 0 30px #00FFFF, 0 0 45px #FF00FF',   ready: 'colorBuster' },
};

export function updatePowerUpUI(battle, prefix) {
    if (!battle) return;
    const status = battle.getPowerUpStatus();

    for (const [, def] of Object.entries(POWERUP_STYLES)) {
        const btn = document.getElementById(`${prefix}-${def.id}`);
        if (!btn) continue;

        if (status[def.ready]) {
            btn.classList.add('ready');
            btn.disabled = false;
            btn.style.boxShadow = def.glow;
            btn.style.animation = 'pulse 1s infinite';
        } else {
            btn.classList.remove('ready');
            btn.disabled = true;
            btn.style.boxShadow = 'none';
            btn.style.animation = 'none';
        }
    }

    // Shield is special - while it's standing by, mark the button "active"
    // so the player sees their consumable is armed.
    const shieldBtn = document.getElementById(`${prefix}-shield-btn`);
    if (shieldBtn && battle.shieldActive) shieldBtn.classList.add('active');
}

// --- Avatar mood swapping based on score lead ---

function _faceFor(diff) {
    if (diff >= 1000) return 'excited';
    if (diff >= 200)  return 'happy';
    if (diff <= -1000) return 'mad';
    if (diff <= -200)  return 'sad';
    return 'normal';
}

export function updateAvatar({ fb, p2, score }) {
    if (!p2 || typeof p2.score === 'undefined') return;
    if (fb.userId !== HOST_USER_ID && fb.userId !== GUEST_USER_ID) return;

    const isHost = fb.userId === HOST_USER_ID;
    const myDiff   = score      - p2.score;
    const oppDiff  = p2.score   - score;
    const lifeDiff   = isHost ? myDiff  : oppDiff;
    const chronoDiff = isHost ? oppDiff : myDiff;

    const p1Avatar = document.getElementById('p1-avatar');
    if (p1Avatar) {
        // Brian uses "angry" instead of "mad" for the most-losing face
        const face = _faceFor(lifeDiff) === 'mad' ? 'angry' : _faceFor(lifeDiff);
        const path = `avatars/brian${face}.png`;
        if (!p1Avatar.src.includes(path)) p1Avatar.src = path;
    }
    const p2Avatar = document.getElementById('p2-avatar');
    if (p2Avatar) {
        const path = `avatars/fernando${_faceFor(chronoDiff)}.png`;
        if (!p2Avatar.src.includes(path)) p2Avatar.src = path;
    }
}

// --- Lobby W/L record displays ---

export function updateLobbyRecords(fb) {
    if (!fb) return;
    const myStats = fb.stats || { wins: 0, losses: 0 };
    const targetId = fb.isHost ? 'lobby-p1-record' : 'lobby-p2-record';
    const el = document.getElementById(targetId);
    if (el) el.innerText = `${myStats.wins || 0}W - ${myStats.losses || 0}L`;
}

export function updateOpponentRecord(fb, opponentStats) {
    if (!fb) return;
    const targetId = fb.isHost ? 'lobby-p2-record' : 'lobby-p1-record';
    const el = document.getElementById(targetId);
    if (el) el.innerText = `${opponentStats.wins}W - ${opponentStats.losses}L`;
}

// --- Match-end stats card ---

export function populateStatsCard({ battle, startTime, score }) {
    const lines    = battle ? battle.linesClearedTotal : 0;
    const tetris   = battle ? battle.tetrises          : 0;
    const maxCombo = battle ? battle.maxCombo          : 0;
    const attack   = battle ? battle.linesSent         : 0;

    const elapsedMs = startTime
        ? Math.min(MATCH_DURATION_MS, Date.now() - startTime)
        : 0;
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    const timeStr = `${m}:${s.toString().padStart(2, '0')}`;

    // APM = attack lines per minute. Floor at 1/60 minute so a near-instant
    // death doesn't divide by zero.
    const minutes = Math.max(1 / 60, elapsedMs / 60000);
    const apm = Math.round(attack / minutes);

    // Time string is set directly; numeric stats roll up via animateNumber.
    // Each gets its own start delay so the reveal flows top-to-bottom.
    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = val;
            el.dataset.target = val;
        }
    };
    setText('stat-time', timeStr);

    // Reset numeric targets to 0 first so animateNumber tweens up from 0
    // every time the card opens (otherwise rematches would show old values).
    const resetNum = (id) => {
        const el = document.getElementById(id);
        if (el) { el.textContent = '0'; el.dataset.target = '0'; }
    };
    ['stat-lines', 'stat-tetrises', 'stat-max-combo', 'stat-attack', 'stat-apm', 'stat-score']
        .forEach(resetNum);

    // Stagger so the numbers appear to count up in sequence with the row reveals.
    const tween = (id, target, delay) => {
        setTimeout(() => animateNumber(id, target), delay);
    };
    tween('stat-lines',     lines,    50);
    tween('stat-tetrises',  tetris,  150);
    tween('stat-max-combo', maxCombo, 250);
    tween('stat-attack',    attack,   350);
    tween('stat-apm',       apm,      450);
    tween('stat-score',     score,    700);
}
