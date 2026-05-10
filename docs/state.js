// Mutable runtime state shared across modules. A single `state` object so
// that `state.score = 5` from any importer mutates the same field.
//
// Why an object and not separate `export let` bindings? ES module bindings
// are read-only from the outside - importers can read them but can't
// reassign. Wrapping mutables in an object sidesteps that limit and keeps
// our existing imperative code working.

export const state = {
    // Engines + battle
    p1: null,           // local player's TetrisEngine
    p2: null,           // remote player's TetrisEngine (network mirror)
    p1Battle: null,     // local player's BattleManager

    // Match lifecycle
    matchActive: false,
    startTime: 0,
    pauseStartTime: 0,
    isPaused: false,
    canUnpause: true,
    gameInitialized: false,
    resultRecorded: false,

    // Scoring + display targets
    score: 0,
    currentSpeed: 1000,
    myScoreId: '',           // 'p1-pb' or 'p2-pb' depending on local side
    myButtonPrefix: 'p1',    // 'p1' or 'p2' depending on local side

    // Gravity tick bookkeeping
    lastTickTime: 0,
    tickTimeout: null,

    // Networking
    fb: null,                // P2PHandler instance (or solo mock)
    selectedUserId: null,    // chosen identity once a room connects
    isP2PReady: false,

    // Subsystems (set up at boot)
    arcade: null             // ArcadeManager instance
};
