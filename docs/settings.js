// Live, persisted user settings. The shape is one flat object so importers
// can read `settings.dasMs` directly and always get the latest value.
// Defaults come from config.js so a player's first session matches the
// shipped balance.

import * as cfg from './config.js';

const STORAGE_KEY = 'tetris_life_settings';

const DEFAULTS = {
    // Audio (initialized from older standalone keys for back-compat).
    musicVol: 0.3,
    sfxVol: 0.5,
    musicOn: false,    // user preference for whether music plays at all

    // Input feel - all milliseconds.
    dasMs:        cfg.DAS_MS,
    arrMs:        cfg.ARR_MS,
    softDropMs:   cfg.SOFT_DROP_REPEAT_MS,
    lockDelayMs:  cfg.LOCK_DELAY_MS,

    // Match shape.
    matchDurationMs: cfg.MATCH_DURATION_MS,
    // Speed curve as a percentage where 100 = the original "Normal" pacing
    // (level every 15s, gravity drops 50ms per level). 0 disables speedup
    // entirely; 200 doubles the rate so the game ramps to max speed in
    // ~2.5 min instead of ~5.
    speedCurvePct: 100,

    // Visual toggles.
    ghostPiece: true,
    scanlines:  true,
};

function _loadSaved() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {
        console.warn('Settings load failed:', e);
    }
    return {};
}

// Migrate the standalone volume keys (Phase 0 #21) into the new bag so
// users don't lose their saved volumes on the first run with this code.
function _migrateLegacyVolumes(obj) {
    try {
        const m = localStorage.getItem(cfg.STORAGE_MUSIC_VOL);
        if (m !== null && obj.musicVol === undefined) obj.musicVol = parseFloat(m);
        const s = localStorage.getItem(cfg.STORAGE_SFX_VOL);
        if (s !== null && obj.sfxVol === undefined) obj.sfxVol = parseFloat(s);
    } catch {}
    return obj;
}

const saved = _migrateLegacyVolumes(_loadSaved());
export const settings = { ...DEFAULTS, ...saved };

export function saveSettings() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.warn('Settings save failed:', e);
    }
}

export function setSetting(key, value) {
    settings[key] = value;
    saveSettings();
    _notify(key, value);
}

// Apply a setting in memory without persisting it. Used when a value is
// pushed in from a network broadcast (e.g. host -> guest match-settings sync),
// so the guest's own saved preferences aren't overwritten by what the host
// happens to be using.
export function applySettingTransient(key, value) {
    settings[key] = value;
    _notify(key, value);
}

// Tiny pub/sub so live-affecting subsystems (audio, CRT toggle, ghost piece)
// can react when a setting changes without polling.
const _listeners = new Set();
export function onSettingChange(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
}
function _notify(key, value) {
    for (const fn of _listeners) {
        try { fn(key, value); } catch (e) { console.warn('Setting listener:', e); }
    }
}

export function resetSettings() {
    Object.assign(settings, DEFAULTS);
    saveSettings();
    for (const k of Object.keys(DEFAULTS)) _notify(k, settings[k]);
}
