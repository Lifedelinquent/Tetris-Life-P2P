// Centralized tunables. Anything that's a "magic number" used across files
// belongs here, so balance/feel tuning is one find-and-replace away from
// the gameplay code.

// --- Match shape ---
export const MATCH_DURATION_MS = 120000;   // 2 minutes per match

// --- Gravity / level pacing ---
export const LEVEL_INTERVAL_MS = 15000;    // level up every 15 s
export const GRAVITY_START_MS  = 1200;     // initial drop interval
export const GRAVITY_FLOOR_MS  = 180;      // fastest drop interval
export const GRAVITY_DECREMENT = 50;       // how much per level
export const MUSIC_PER_LEVEL   = 0.02;     // 2% playback rate per level

// --- Input feel (Phase 1 #1, #2) ---
export const DAS_MS              = 150;    // delay before auto-repeat
export const ARR_MS              = 30;     // horizontal repeat cadence
export const SOFT_DROP_REPEAT_MS = 30;     // soft-drop repeat cadence
export const LOCK_DELAY_MS       = 500;    // grace before piece locks
export const MAX_LOCK_RESETS     = 15;     // how many move/rotate refreshes per piece

// --- Battle / power-ups ---
export const SHIELD_COST       = 3;        // line cost
export const LIGHTNING_COST    = 6;
export const BOMB_COST         = 9;
export const COLOR_BUSTER_COST = 17;
export const BOMB_COUNTDOWN_MS = 10000;    // 10 s fuse
export const ALL_CLEAR_BONUS   = 6;        // attack bonus for perfect clear

// --- Garbage application ---
export const DOT_RATE_LINES = 2;           // lines applied per DoT tick
export const DOT_INTERVAL_MS = 2000;       // ms between applications

// --- Identity (still hardcoded; Phase 3 stretch will de-hardcode) ---
export const HOST_USER_ID  = 'Lifedelinquent';
export const GUEST_USER_ID = 'ChronoKoala';

// --- Storage keys ---
export const STORAGE_STATS_KEY  = 'tetris_life_my_stats';
export const STORAGE_MUSIC_VOL  = 'tetris_life_music_vol';
export const STORAGE_SFX_VOL    = 'tetris_life_sfx_vol';
