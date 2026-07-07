const CUBE_VERTICES = [
    [-0.5, -0.5, -0.5],
    [ 0.5, -0.5, -0.5],
    [ 0.5,  0.5, -0.5],
    [-0.5,  0.5, -0.5],
    [-0.5, -0.5,  0.5],
    [ 0.5, -0.5,  0.5],
    [ 0.5,  0.5,  0.5],
    [-0.5,  0.5,  0.5]
];

const CUBE_FACES = [
    [0, 1, 2, 3], // Back face
    [1, 5, 6, 2], // Right face
    [5, 4, 7, 6], // Front face
    [4, 0, 3, 7], // Left face
    [4, 5, 1, 0], // Bottom face
    [3, 2, 6, 7]  // Top face
];

const FACE_NORMALS = [
    [0, 0, -1],
    [1, 0, 0],
    [0, 0, 1],
    [-1, 0, 0],
    [0, -1, 0],
    [0, 1, 0]
];

const LIGHT_DIR = [0.577, -0.577, -0.577];

export class ArcadeManager {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        // Effect Overlay
        this.effectCanvas = null;
        this.effectCtx = null;
        this.particles = [];
        this.floatingTexts = [];

        this.tetrominos = [];
        this.colors = ['#FF0D72', '#0DC2FF', '#0DFF72', '#F538FF', '#FF8E0D', '#FFE138', '#3877FF'];
        this.shapes = [
            [[1, 1, 1, 1]], // I
            [[1, 0, 0], [1, 1, 1]], // J
            [[0, 0, 1], [1, 1, 1]], // L
            [[1, 1], [1, 1]], // O
            [[0, 1, 1], [1, 1, 0]], // S
            [[0, 1, 0], [1, 1, 1]], // T
            [[1, 1, 0], [0, 1, 1]]  // Z
        ];

        this.shapes3D = [
            // I shape
            [[-1.5, 0, 0], [-0.5, 0, 0], [0.5, 0, 0], [1.5, 0, 0]],
            // J shape
            [[-0.75, -0.75, 0], [-0.75, 0.25, 0], [0.25, 0.25, 0], [1.25, 0.25, 0]],
            // L shape
            [[0.75, -0.75, 0], [-1.25, 0.25, 0], [-0.25, 0.25, 0], [0.75, 0.25, 0]],
            // O shape
            [[-0.5, -0.5, 0], [0.5, -0.5, 0], [-0.5, 0.5, 0], [0.5, 0.5, 0]],
            // S shape
            [[0, -0.5, 0], [1, -0.5, 0], [-1, 0.5, 0], [0, 0.5, 0]],
            // T shape
            [[0, -0.75, 0], [-1, 0.25, 0], [0, 0.25, 0], [1, 0.25, 0]],
            // Z shape
            [[-1, -0.5, 0], [0, -0.5, 0], [0, 0.5, 0], [1, 0.5, 0]]
        ];

        // Audio
        this.audioCtx = null;
        this.isMuted = false;

        // MP3 Playlist System
        this.musicPlaylist = [
            'music/01.mp3',
            'music/01. Dance Of The Sugar Plum Fairy.mp3',
            'music/02. Battle Theme [Tetris Type A GB Remix] [Default Theme].mp3',
            'music/28. Battle Theme [Overworld Remix Super Mario Bros] [Super Mario Bros Theme].mp3',
            'music/31. Battle Theme [Overworld Theme Remix] [Legend of Zelda Theme].mp3',
            'music/34. Battle Theme [Donkey Kong 1981 Level Remix] [Donkey Kong Theme].mp3',
            'classic.mp3',
            'loop.mp3'
        ];
        this.currentTrackIndex = -1;
        this.audioElement = null;
        this.musicOn = false;
        this.panicMode = false;
        this.normalPlaybackRate = 1.0;
        this.panicPlaybackRate = 1.35;
        this.fadeInterval = null;
    }

    init() {
        this.initVisuals();
        this.initAudio();
        this.animate();

        // Resize handler
        window.addEventListener('resize', () => this.resize());
    }

    initVisuals() {
        this.canvas = document.getElementById('arcade-bg');
        if (this.canvas) this.ctx = this.canvas.getContext('2d');

        this.effectCanvas = document.getElementById('effects-canvas');
        if (this.effectCanvas) {
            this.effectCtx = this.effectCanvas.getContext('2d');
            this.effectCanvas.width = window.innerWidth;
            this.effectCanvas.height = window.innerHeight;
        }

        this.resize();

        // Create initial batch
        for (let i = 0; i < 10; i++) {
            this.tetrominos.push(this.createTetromino(true));
        }
    }

    resize() {
        if (this.canvas) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
        if (this.effectCanvas) {
            this.effectCanvas.width = window.innerWidth;
            this.effectCanvas.height = window.innerHeight;
        }
    }

    createTetromino(randomY = false) {
        const shapeIdx = Math.floor(Math.random() * this.shapes3D.length);
        const color = this.colors[shapeIdx];
        const cubes = this.shapes3D[shapeIdx];

        return {
            x: Math.random() * this.canvas.width,
            y: randomY ? Math.random() * this.canvas.height : -150,
            z: Math.random() * 300, // Depth from 0 to 300
            rx: Math.random() * Math.PI * 2,
            ry: Math.random() * Math.PI * 2,
            rz: Math.random() * Math.PI * 2,
            speed: 0.8 + Math.random() * 1.5,
            rotSpeedX: (Math.random() - 0.5) * 0.03,
            rotSpeedY: (Math.random() - 0.5) * 0.03,
            rotSpeedZ: (Math.random() - 0.5) * 0.03,
            cubes: cubes,
            color: color,
            size: 20 + Math.random() * 10
        };
    }

    rotate3D(v, rx, ry, rz) {
        let [x, y, z] = v;
        if (rz !== 0) {
            const cos = Math.cos(rz), sin = Math.sin(rz);
            const nx = x * cos - y * sin;
            const ny = x * sin + y * cos;
            x = nx; y = ny;
        }
        if (ry !== 0) {
            const cos = Math.cos(ry), sin = Math.sin(ry);
            const nx = x * cos + z * sin;
            const nz = -x * sin + z * cos;
            x = nx; z = nz;
        }
        if (rx !== 0) {
            const cos = Math.cos(rx), sin = Math.sin(rx);
            const ny = y * cos - z * sin;
            const nz = y * sin + z * cos;
            y = ny; z = nz;
        }
        return [x, y, z];
    }

    draw3DTetromino(t, ctx = this.ctx) {
        const focalLength = 500;
        const baseAlpha = 0.15 + 0.65 * (1.0 - t.z / 300);
        const allFaces = [];

        t.cubes.forEach((cubeLocalCenter) => {
            const cubeVertices = [];
            CUBE_VERTICES.forEach((uv) => {
                const lx = (cubeLocalCenter[0] + uv[0]) * t.size;
                const ly = (cubeLocalCenter[1] + uv[1]) * t.size;
                const lz = (cubeLocalCenter[2] + uv[2]) * t.size;

                const rotated = this.rotate3D([lx, ly, lz], t.rx, t.ry, t.rz);

                const absX = t.x + rotated[0];
                const absY = t.y + rotated[1];
                const absZ = t.z + rotated[2];

                const scale = focalLength / (focalLength + absZ);
                const projX = t.x + rotated[0] * scale;
                const projY = t.y + rotated[1] * scale;

                cubeVertices.push({ x: projX, y: projY, z: absZ });
            });

            CUBE_FACES.forEach((faceIndices, faceIdx) => {
                const localNormal = FACE_NORMALS[faceIdx];
                const rotNormal = this.rotate3D(localNormal, t.rx, t.ry, t.rz);

                if (rotNormal[2] < 0) {
                    const avgZ = (cubeVertices[faceIndices[0]].z +
                                  cubeVertices[faceIndices[1]].z +
                                  cubeVertices[faceIndices[2]].z +
                                  cubeVertices[faceIndices[3]].z) / 4;

                    const dotProduct = rotNormal[0] * LIGHT_DIR[0] +
                                      rotNormal[1] * LIGHT_DIR[1] +
                                      rotNormal[2] * LIGHT_DIR[2];

                    allFaces.push({
                        vertices: faceIndices.map(idx => cubeVertices[idx]),
                        avgZ: avgZ,
                        dotProduct: dotProduct,
                        color: t.color
                    });
                }
            });
        });

        allFaces.sort((a, b) => b.avgZ - a.avgZ);

        allFaces.forEach((face) => {
            ctx.beginPath();
            ctx.moveTo(face.vertices[0].x, face.vertices[0].y);
            ctx.lineTo(face.vertices[1].x, face.vertices[1].y);
            ctx.lineTo(face.vertices[2].x, face.vertices[2].y);
            ctx.lineTo(face.vertices[3].x, face.vertices[3].y);
            ctx.closePath();

            ctx.fillStyle = face.color;
            ctx.globalAlpha = 0.5 * baseAlpha;
            ctx.fill();

            if (face.dotProduct < 0) {
                ctx.fillStyle = '#000000';
                ctx.globalAlpha = Math.min(0.65, -face.dotProduct * 0.65) * baseAlpha;
                ctx.fill();
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = Math.min(0.35, face.dotProduct * 0.35) * baseAlpha;
                ctx.fill();
            }

            ctx.strokeStyle = face.color;
            ctx.lineWidth = 1.8;
            ctx.globalAlpha = 0.85 * baseAlpha;
            ctx.shadowBlur = 12;
            ctx.shadowColor = face.color;
            ctx.stroke();
            ctx.shadowBlur = 0;
        });

        ctx.globalAlpha = 1.0;
    }

    // --- Particle System ---
    createExplosion(x, y, color, count = 15) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1.0,
                color: color,
                size: Math.random() * 5 + 2
            });
        }
    }

    createFloatingText(text, x, y, color = '#fff') {
        const el = document.createElement('div');
        el.className = 'floating-text';
        el.innerText = text;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.color = color;
        // Research-based timing: 2.5s for fast-paced games
        el.style.position = 'absolute';
        el.style.fontSize = '2.5rem'; // Readable but not overwhelming
        el.style.fontWeight = 'bold';
        el.style.fontFamily = "'Press Start 2P', cursive";
        el.style.textShadow = `0 0 15px ${color}, 0 0 30px ${color}, 2px 2px 0 #000`; // Double glow + shadow
        el.style.pointerEvents = 'none';
        el.style.zIndex = '1000';
        el.style.transition = 'all 2.5s ease-out'; // Research-based 2.5s
        el.style.transform = 'scale(1.1)'; // Start slightly larger
        el.style.textAlign = 'center';
        el.style.whiteSpace = 'nowrap';

        document.body.appendChild(el);

        // Pop effect: short delay, then fade while rising
        setTimeout(() => {
            el.style.transform = 'translateY(-80px) scale(0.9)';
            el.style.opacity = '0';
        }, 300); // 300ms delay before fade starts

        setTimeout(() => el.remove(), 3000); // Remove after 3s total
    }

    animate() {
        if (this.ctx) {
            this.ctx.fillStyle = 'rgba(15, 15, 22, 0.25)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            this.tetrominos.forEach((t, i) => {
                t.y += t.speed;
                t.rx += t.rotSpeedX;
                t.ry += t.rotSpeedY;
                t.rz += t.rotSpeedZ;

                if (t.y > this.canvas.height + 150) {
                    this.tetrominos[i] = this.createTetromino();
                }

                this.draw3DTetromino(t, this.ctx);
            });
        }

        // Draw FG Effects
        if (this.effectCtx) {
            this.effectCtx.clearRect(0, 0, this.effectCanvas.width, this.effectCanvas.height);

            // Particles
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.2; // Gravity
                p.life -= 0.02;

                if (p.life <= 0) {
                    this.particles.splice(i, 1);
                    continue;
                }

                this.effectCtx.fillStyle = p.color;
                this.effectCtx.globalAlpha = p.life;
                this.effectCtx.beginPath();
                this.effectCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.effectCtx.fill();
                this.effectCtx.globalAlpha = 1.0;
            }
        }

        requestAnimationFrame(() => this.animate());
    }

    // --- Audio ---

    initAudio() {
        // Idempotent. init() and the main.js first-click handler both used
        // to call this; the second call would replace audioCtx and orphan
        // the original gain nodes (silent music with confused state).
        if (this.audioCtx) return;
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // Master Gain
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = 1.0;
        this.masterGain.connect(this.audioCtx.destination);

        // BGM Gain - the master volume slider drives this.
        this.bgmGain = this.audioCtx.createGain();
        this.bgmGain.gain.value = 0.3; // Default Music Level (30%)
        this.bgmGain.connect(this.masterGain);

        // SFX Gain
        this.sfxGain = this.audioCtx.createGain();
        this.sfxGain.gain.value = 0.5; // Default SFX Level
        this.sfxGain.connect(this.masterGain);

        // Fallback: Ensure Frequencies Exist
        if (!this.noteFreqs) {
            this.noteFreqs = {
                'A4': 440.00, 'B4': 493.88, 'C5': 523.25, 'D5': 587.33,
                'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00
            };
        }

        // Tetris Theme A (Korobeiniki) Simplified
        this.melody = [
            { note: 'E5', dur: 1 }, { note: 'B4', dur: 0.5 }, { note: 'C5', dur: 0.5 }, { note: 'D5', dur: 1 }, { note: 'C5', dur: 0.5 }, { note: 'B4', dur: 0.5 },
            { note: 'A4', dur: 1 }, { note: 'A4', dur: 0.5 }, { note: 'C5', dur: 0.5 }, { note: 'E5', dur: 1 }, { note: 'D5', dur: 0.5 }, { note: 'C5', dur: 0.5 },
            { note: 'B4', dur: 1 }, { note: 'B4', dur: 0.5 }, { note: 'C5', dur: 0.5 }, { note: 'D5', dur: 1 }, { note: 'E5', dur: 1 },
            { note: 'C5', dur: 1 }, { note: 'A4', dur: 1 }, { note: 'A4', dur: 2 },
            // Section B
            { note: 'D5', dur: 1.5 }, { note: 'F5', dur: 0.5 }, { note: 'A5', dur: 1 }, { note: 'G5', dur: 0.5 }, { note: 'F5', dur: 0.5 },
            { note: 'E5', dur: 1.5 }, { note: 'C5', dur: 0.5 }, { note: 'E5', dur: 1 }, { note: 'D5', dur: 0.5 }, { note: 'C5', dur: 0.5 },
            { note: 'B4', dur: 1 }, { note: 'B4', dur: 0.5 }, { note: 'C5', dur: 0.5 }, { note: 'D5', dur: 1 }, { note: 'E5', dur: 1 },
            { note: 'C5', dur: 1 }, { note: 'A4', dur: 1 }, { note: 'A4', dur: 2 }
        ];

        this.baseTempo = 140;
        this.tempo = this.baseTempo;

        // MP3 Game Music Init
        this.gameMusicBuffer = null;
        this.gameMusicSource = null;

        // BGM media elements routing through Web Audio BGM Gain
        this.audioElement = new Audio();
        this.audioElement.crossOrigin = "anonymous";
        this.audioElement.addEventListener('ended', () => this.fadeToNextTrack());
        try {
            this.audioSource = this.audioCtx.createMediaElementSource(this.audioElement);
            this.audioSource.connect(this.bgmGain);
        } catch (e) {
            console.warn("Failed to create BGM source node in initAudio:", e);
        }

        this.gameOverAudio = new Audio('music/46. Game Over BGM [Tetris Gameboy Theme].mp3');
        this.gameOverAudio.crossOrigin = "anonymous";
        try {
            this.gameOverSource = this.audioCtx.createMediaElementSource(this.gameOverAudio);
            this.gameOverSource.connect(this.bgmGain);
        } catch (e) {
            console.warn("Failed to create GameOver BGM source node in initAudio:", e);
        }

        // Drums
        this.drumsEnabled = false;
        this.nextDrumTime = 0;
        this.drumBeat = 0;

        // Create Noise Buffer for Drums
        const bufferSize = this.audioCtx.sampleRate * 2; // 2 seconds
        const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        this.noiseBuffer = buffer;

        this._loadSfxSamples();
    }

    // --- Premium SFX samples (AI-generated, docs/sfx/*.mp3) ---
    //
    // Each play* method tries its sample first and falls back to the old
    // oscillator synth if the file hasn't loaded (or failed to fetch), so
    // audio keeps working offline or mid-load.

    _loadSfxSamples() {
        this.sfxBuffers = {};
        const names = [
            'move', 'rotate', 'land', 'snap', 'harddrop', 'hold',
            'clear1', 'clear2', 'clear3', 'tetris', 'tspin', 'allclear', 'combo',
            'shield', 'lightning', 'bomb', 'buster', 'garbage',
            'click', 'hover', 'countdown', 'go', 'sting'
        ];
        // Bump the version when regenerating samples so cached copies refresh.
        const SFX_VERSION = 2;
        names.forEach(name => {
            fetch(`sfx/${name}.mp3?v=${SFX_VERSION}`)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.arrayBuffer();
                })
                .then(data => this.audioCtx.decodeAudioData(data))
                .then(buf => { this.sfxBuffers[name] = buf; })
                .catch(e => console.warn(`SFX sample "${name}" unavailable, using synth fallback:`, e.message));
        });
    }

    // Plays a loaded sample through the SFX gain. Returns false when the
    // buffer isn't ready so callers can fall back to their synth version.
    _playSample(name, { volume = 1, rate = 1 } = {}) {
        const buf = this.sfxBuffers && this.sfxBuffers[name];
        if (!buf || !this.audioCtx) return false;
        this.resumeAudio();
        const src = this.audioCtx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = rate;
        const gain = this.audioCtx.createGain();
        gain.gain.value = volume;
        src.connect(gain);
        gain.connect(this.sfxGain);
        src.start();
        return true;
    }

    setMusicSpeed(rate) {
        this.currentRate = rate;
        // MP3 playback via HTML5 Audio (skip while in panic mode so we don't fight it)
        if (this.audioElement && !this.panicMode) {
            this.normalPlaybackRate = rate;
            this.audioElement.playbackRate = rate;
        }
    }

    setMusicVolume(value) {
        const vol = Math.max(0, Math.min(1, parseFloat(value)));
        this.musicVolume = vol;

        // Cancel any in-flight fade so the user's drag wins. Without this
        // the fade keeps stepping toward the captured-at-start target and
        // fights every slider change for ~1.5s.
        if (this.fadeInterval) {
            clearInterval(this.fadeInterval);
            this.fadeInterval = null;
        }

        if (this.bgmGain) {
            this.bgmGain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
        }
    }

    setSfxVolume(value) {
        if (this.sfxGain) {
            const vol = Math.max(0, Math.min(1, parseFloat(value)));
            this.sfxGain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
        }
    }

    setDrums(enabled) {
        this.drumsEnabled = enabled;
        if (enabled && !this.nextDrumTime) {
            this.nextDrumTime = this.audioCtx ? this.audioCtx.currentTime : 0;
        }
    }

    resumeAudio() {
        if (!this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(e => {
                console.error("Failed to resume Audio Context:", e);
            });
        }
    }

    // --- Music subsystem ---
    //
    // Single source of truth for "should music be playing?":
    //   this.musicOn          - user preference (persisted by main.js).
    //   this.battleMusicActive - which mode we're in (false = lobby/synth,
    //                            true = battle/MP3). NEVER toggled by the
    //                            on/off state - only by lifecycle transitions.
    //
    // Every API method either flips musicOn OR transitions modes (not both),
    // and `_playCurrent()` is the single place that actually starts audio.

    _stopSynth() {
        clearTimeout(this.timerID);
        this.isPlayingMusic = false;
    }

    _pauseMp3() {
        if (this.audioElement) {
            try { this.audioElement.pause(); } catch (e) { /* not yet loaded */ }
        }
    }

    // Plays the music appropriate to the current mode, but only if
    // musicOn is true. Safe to call any number of times.
    _playCurrent() {
        if (!this.musicOn || !this.audioCtx) return;

        if (this.battleMusicActive) {
            // Battle mode: resume MP3 if we have one paused, else start fresh.
            if (this.audioElement && this.audioElement.src && this.audioElement.paused) {
                this.audioElement.play().catch(() => this.playRandomTrack());
            } else if (!this.audioElement || !this.audioElement.src) {
                this.playRandomTrack();
            }
        } else {
            // Lobby mode: synthesized melody.
            if (!this.isPlayingMusic) {
                this.isPlayingMusic = true;
                const now = this.audioCtx.currentTime + 0.1;
                this.currentNoteIndex = 0;
                this.nextNoteTime = now;
                this.nextDrumTime = now;
                this.drumBeat = 0;
                this.scheduler();
            }
        }
    }

    // Flips the on/off preference and applies it. Returns the new state.
    toggleMusic() {
        this.resumeAudio();
        this.musicOn = !this.musicOn;
        if (this.musicOn) {
            this._playCurrent();
        } else {
            this._stopSynth();
            this._pauseMp3();
        }
        return this.musicOn;
    }

    playTestBeep() {
        this.playSoftBeep(); // Alias for now
    }

    playSoftBeep() {
        if (!this.audioCtx || this.isMuted) return;
        this.resumeAudio();
        if (this._playSample('countdown', { volume: 0.6 })) return;

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        // Gentle "blip"
        osc.frequency.value = 660; // Lower pitch
        osc.type = 'sine'; // Sine wave is softer than square/saw

        gain.gain.setValueAtTime(0.05, this.audioCtx.currentTime); // Very quiet
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.1);
    }

    playClickSound() {
        if (!this.audioCtx || this.isMuted) return;
        this.resumeAudio();
        if (this._playSample('click', { volume: 0.65 })) return;

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(220, this.audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(880, this.audioCtx.currentTime + 0.1);
        osc.frequency.linearRampToValueAtTime(440, this.audioCtx.currentTime + 0.3);

        gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, this.audioCtx.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.3);
    }

    // Switch to lobby mode (synthesized melody). Plays only if musicOn.
    startMusic() {
        this.battleMusicActive = false;
        this._pauseMp3();
        this._playCurrent();
    }

    // Pause all audio without changing the user's on/off preference.
    // Use this for explicit "be quiet now" moments (pause, etc.).
    stopMusic() {
        this._stopSynth();
        this._pauseMp3();
    }

    // Switch to battle mode (MP3 playlist). Plays only if musicOn.
    startBattleMusic() {
        this.battleMusicActive = true;
        this.normalPlaybackRate = 1.0; // Reset from previous match's speed curve
        this._stopSynth();
        this._playCurrent();
    }

    // Transition back to lobby mode (but don't auto-start - the game-over
    // flow does its own MP3 sting and then resumes lobby music itself).
    stopBattleMusic() {
        this.battleMusicActive = false;
        this._pauseMp3();
    }

    // Plays the game-over sting (if music is on), then transitions back to
    // lobby mode. If music is off, just transitions silently.
    playGameOverMusic() {
        this.stopBattleMusic(); // mode -> lobby, MP3 paused

        if (!this.gameOverAudio) {
            this.gameOverAudio = new Audio('music/46. Game Over BGM [Tetris Gameboy Theme].mp3');
            this.gameOverAudio.crossOrigin = "anonymous";
            try {
                this.gameOverSource = this.audioCtx.createMediaElementSource(this.gameOverAudio);
                this.gameOverSource.connect(this.bgmGain);
            } catch (e) {
                console.warn(e);
            }
        }

        // Use a named handler so we can remove it in stopGameOverMusic.
        // This prevents stale callbacks from firing after a new match starts.
        if (this._gameOverEndedHandler) {
            this.gameOverAudio.removeEventListener('ended', this._gameOverEndedHandler);
        }
        this._gameOverEndedHandler = () => {
            // After the sting ends, kick lobby music. _playCurrent
            // respects musicOn so this is a no-op if the player muted.
            this._playCurrent();
        };
        this.gameOverAudio.addEventListener('ended', this._gameOverEndedHandler);

        this.gameOverAudio.volume = 1.0;
        this.gameOverAudio.currentTime = 0;

        if (this.musicOn) {
            this.gameOverAudio.play().catch(() => this._playCurrent());
        }
        // If music is off, the lobby will already be silent and the next
        // toggle from the user will start the lobby sting.
    }

    stopGameOverMusic() {
        if (this.gameOverAudio) {
            this.gameOverAudio.pause();
            this.gameOverAudio.currentTime = 0;
            // Remove the ended handler so it can't fire after we've moved on
            // to a new match (prevents stale lobby-music starts).
            if (this._gameOverEndedHandler) {
                this.gameOverAudio.removeEventListener('ended', this._gameOverEndedHandler);
                this._gameOverEndedHandler = null;
            }
        }
    }

    // --- MP3 Playlist System ---

    playRandomTrack() {
        if (!this.musicOn) return;

        // Pick random track (different from current)
        let newIndex;
        do {
            newIndex = Math.floor(Math.random() * this.musicPlaylist.length);
        } while (newIndex === this.currentTrackIndex && this.musicPlaylist.length > 1);

        this.currentTrackIndex = newIndex;
        const trackPath = this.musicPlaylist[newIndex];

        // Create or reuse audio element
        if (!this.audioElement) {
            this.audioElement = new Audio();
            this.audioElement.crossOrigin = "anonymous";
            this.audioElement.addEventListener('ended', () => this.fadeToNextTrack());
            try {
                this.audioSource = this.audioCtx.createMediaElementSource(this.audioElement);
                this.audioSource.connect(this.bgmGain);
            } catch (e) {
                console.warn(e);
            }
        }

        this.audioElement.src = trackPath;
        this.audioElement.volume = 0; // Start silent for fade-in
        this.audioElement.playbackRate = this.panicMode ? this.panicPlaybackRate : this.normalPlaybackRate;

        // Play and fade in
        this.audioElement.play().then(() => {
            this.fadeIn(1.0);
        }).catch(err => {
            console.warn('Music playback failed:', err);
        });
    }

    fadeToNextTrack() {
        if (!this.musicOn) return;

        // Fade out current, then play next
        this.fadeOut(() => {
            this.playRandomTrack();
        });
    }

    fadeIn(targetVolume = 0.3, duration = 1500) {
        if (this.fadeInterval) clearInterval(this.fadeInterval);

        const steps = 30;
        const stepTime = duration / steps;
        const volumeStep = targetVolume / steps;
        let currentStep = 0;

        this.fadeInterval = setInterval(() => {
            currentStep++;
            if (this.audioElement) {
                this.audioElement.volume = Math.min(targetVolume, volumeStep * currentStep);
            }
            if (currentStep >= steps) {
                clearInterval(this.fadeInterval);
                this.fadeInterval = null;
            }
        }, stepTime);
    }

    fadeOut(callback, duration = 800) {
        if (this.fadeInterval) clearInterval(this.fadeInterval);
        if (!this.audioElement) {
            if (callback) callback();
            return;
        }

        const steps = 20;
        const stepTime = duration / steps;
        const startVolume = this.audioElement.volume;
        const volumeStep = startVolume / steps;
        let currentStep = 0;

        this.fadeInterval = setInterval(() => {
            currentStep++;
            if (this.audioElement) {
                this.audioElement.volume = Math.max(0, startVolume - (volumeStep * currentStep));
            }
            if (currentStep >= steps) {
                clearInterval(this.fadeInterval);
                this.fadeInterval = null;
                if (callback) callback();
            }
        }, stepTime);
    }

    setPanicMode(enabled) {
        if (this.panicMode === enabled) return;
        this.panicMode = enabled;

        if (this.audioElement) {
            // Smooth transition of playback rate
            const targetRate = enabled ? this.panicPlaybackRate : this.normalPlaybackRate;
            this.audioElement.playbackRate = targetRate;
        }
    }

    // NOTE: toggleMusic is defined earlier in this file with battle mode support
    scheduler() {
        // Melody Scheduler
        // Lookahead: Increased to 1.5s to survive background throttling (1s max delay)
        const lookahead = 1.5;

        // Safety: Ensure melody exists
        if (!this.melody || this.melody.length === 0) {
            console.warn("Melody not loaded yet.");
            return;
        }

        while (this.nextNoteTime < this.audioCtx.currentTime + lookahead) {
            const note = this.melody[this.currentNoteIndex];
            if (note) {
                this.playNote(note);
            } else {
                // Should not happen if advanceNote logic is correct, but safety net:
                this.currentNoteIndex = 0;
            }
            this.advanceNote();
        }

        // Drum Scheduler (Quarter Notes)
        if (this.drumsEnabled) {
            while (this.nextDrumTime < this.audioCtx.currentTime + lookahead) {
                this.playDrum(this.drumBeat % 4);
                this.drumBeat++;
                this.nextDrumTime += (60.0 / this.tempo); // One beat
            }
        } else {
            // Keep synced
            if (this.nextDrumTime < this.audioCtx.currentTime) {
                this.nextDrumTime = this.audioCtx.currentTime + (60.0 / this.tempo);
            }
        }

        if (this.isPlayingMusic) {
            this.timerID = setTimeout(() => this.scheduler(), 500); // Check every 0.5s instead of 25ms.
            // Since we schedule 1.5s ahead, updating every 0.5s is plenty safe and saves CPU.
        }
    }

    playDrum(beat) {
        // 0: Kick, 1: Snare, 2: Kick, 3: Snare
        // Always Hi-Hat?

        const t = this.nextDrumTime;

        // Hi-Hat (Every beat, closed)
        this.playNoise(t, 0.05, 10000, 0.05); // Very short, high pitch

        if (beat === 0 || beat === 2) {
            // Kick
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.frequency.setValueAtTime(150, t);
            osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.5);
            gain.gain.setValueAtTime(0.8, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
            osc.connect(gain);
            gain.connect(this.bgmGain);
            osc.start(t);
            osc.stop(t + 0.5);
        }

        if (beat === 1 || beat === 3) {
            // Snare (Noise + Tone)
            this.playNoise(t, 0.2, 1000, 0.2); // Noise body

            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(250, t);
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.connect(gain);
            gain.connect(this.bgmGain);
            osc.start(t);
            osc.stop(t + 0.2);
        }
    }

    playNoise(time, duration, filterFreq, vol) {
        const src = this.audioCtx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = filterFreq;
        const gain = this.audioCtx.createGain();
        gain.gain.setValueAtTime(vol, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.bgmGain);
        src.start(time);
        src.stop(time + duration);
    }

    advanceNote() {
        const beatTime = 60.0 / this.tempo;
        const currentNote = this.melody[this.currentNoteIndex];
        this.nextNoteTime += currentNote.dur * beatTime;

        this.currentNoteIndex++;
        if (this.currentNoteIndex >= this.melody.length) {
            this.currentNoteIndex = 0;
        }
    }

    playNote(noteObj) {
        if (!this.noteFreqs[noteObj.note]) return;

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        const filter = this.audioCtx.createBiquadFilter();

        osc.type = 'sawtooth'; // Richer sound
        osc.frequency.value = this.noteFreqs[noteObj.note];

        // Filter envelope for "plucky" sound
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(this.noteFreqs[noteObj.note] * 4, this.nextNoteTime);
        filter.frequency.exponentialRampToValueAtTime(this.noteFreqs[noteObj.note], this.nextNoteTime + 0.1);

        // Amplitude Envelope
        // Note: Global volume is handled by this.musicGain, so we keep these values relative
        gain.gain.setValueAtTime(0.5, this.nextNoteTime);
        gain.gain.linearRampToValueAtTime(0.3, this.nextNoteTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, this.nextNoteTime + (noteObj.dur * (60 / this.tempo)));

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.bgmGain);

        osc.start(this.nextNoteTime);
        osc.stop(this.nextNoteTime + (noteObj.dur * (60 / this.tempo)) + 0.1);
    }

    playRotate() {
        if (!this.audioCtx) return;
        this.resumeAudio(); // Ensure context is running
        // Slight pitch variance keeps rapid rotations from sounding robotic.
        if (this._playSample('rotate', { volume: 0.55, rate: 0.96 + Math.random() * 0.08 })) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, this.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, this.audioCtx.currentTime + 0.05);

        gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.05);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.05);
    }

    playLand() {
        if (!this.audioCtx) return;
        this.resumeAudio();
        // TETR.IO-style soft lock click - clean pop, no bass.
        if (this._playSample('land', { volume: 0.5, rate: 0.97 + Math.random() * 0.06 })) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(120, this.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.audioCtx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);

        // Lowpass filter for "thud"
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, this.audioCtx.currentTime);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.1);
    }

    playLineClear(lines) {
        if (!this.audioCtx) return;
        this.resumeAudio();
        const sampleName = lines >= 4 ? 'tetris' : `clear${lines}`;
        const sampleVol = lines >= 4 ? 1.0 : 0.75 + lines * 0.05;
        if (this._playSample(sampleName, { volume: sampleVol })) return;
        const now = this.audioCtx.currentTime;

        const createBeep = (freq, startTime, dur, type = 'sine') => {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, startTime);
            gain.gain.setValueAtTime(0.2, startTime);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + dur);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(startTime);
            osc.stop(startTime + dur);
        };

        if (lines === 1) {
            // C6
            createBeep(1046.50, now, 0.3);
        }
        else if (lines === 2) {
            // C6 + E6
            createBeep(1046.50, now, 0.4);
            createBeep(1318.51, now, 0.4);
        }
        else if (lines === 3) {
            // C6 + E6 + G6 (Major Triad)
            createBeep(1046.50, now, 0.5);
            createBeep(1318.51, now + 0.05, 0.5);
            createBeep(1567.98, now + 0.10, 0.5);
        }
        else if (lines >= 4) {
            // TETRIS / 5-LINES: Power Sweep!
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(1760, now + 0.5); // Sweep Up

            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(now);
            osc.stop(now + 0.8);

            // Add a sparkle
            createBeep(2093.00, now + 0.2, 0.6, 'triangle');
        }
    }

    playHoverSound() {
        if (!this.audioCtx || this.isMuted) return;
        this.resumeAudio();
        if (this._playSample('hover', { volume: 0.35 })) return;
        const now = this.audioCtx.currentTime;

        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const gain1 = this.audioCtx.createGain();
        const gain2 = this.audioCtx.createGain();

        // Dual frequency sweep: a crisp, high electronic retro blip
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(650, now);
        osc1.frequency.exponentialRampToValueAtTime(1300, now + 0.08);
        gain1.gain.setValueAtTime(0.06, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(975, now + 0.025);
        osc2.frequency.exponentialRampToValueAtTime(1950, now + 0.10);
        gain2.gain.setValueAtTime(0.04, now + 0.025);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.10);

        osc1.connect(gain1);
        gain1.connect(this.sfxGain);
        osc2.connect(gain2);
        gain2.connect(this.sfxGain);

        osc1.start(now);
        osc1.stop(now + 0.08);
        osc2.start(now + 0.025);
        osc2.stop(now + 0.10);
    }

    playAnnouncerSting() {
        if (!this.audioCtx || this.isMuted) return;
        this.resumeAudio();
        if (this._playSample('sting', { volume: 0.9 })) return;
        const now = this.audioCtx.currentTime;

        // Epic cabinet synth power-up sound (rising chords)
        const baseFreqs = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
        baseFreqs.forEach((freq, idx) => {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            const filter = this.audioCtx.createBiquadFilter();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now);
            osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.35);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(freq * 3, now);
            filter.frequency.exponentialRampToValueAtTime(freq * 1.2, now + 0.35);

            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.sfxGain);

            osc.start(now);
            osc.stop(now + 0.45);
        });
    }

    announceWelcome() {
        if (!('speechSynthesis' in window)) return;
        this.resumeAudio();

        // 1. Play the announcer sting SFX
        this.playAnnouncerSting();

        // 2. Pronounce the welcome message with a short delay
        setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance("Welcome to Tetris Life Battle");
            const voices = window.speechSynthesis.getVoices();

            // Try to find a good deep English announcer voice
            let selectedVoice = null;
            const keywords = ['google us english', 'microsoft david', 'male', 'english', 'en-us', 'en'];
            for (const kw of keywords) {
                selectedVoice = voices.find(v => v.name.toLowerCase().includes(kw) || v.lang.toLowerCase().includes(kw));
                if (selectedVoice) break;
            }

            if (selectedVoice) {
                utterance.voice = selectedVoice;
            }

            utterance.pitch = 0.70; // Low-pitch announcer feel
            utterance.rate = 0.85;  // Slightly slow, clear articulation
            
            // Sync volume with user's SFX slider
            const sfxVol = (this.sfxGain && this.sfxGain.gain) ? this.sfxGain.gain.value : 0.5;
            utterance.volume = sfxVol;

            window.speechSynthesis.speak(utterance);
        }, 150);
    }

    // --- Action SFX ---
    // Tiny click for horizontal moves. Very quiet so DAS auto-repeat doesn't
    // become a buzz - it should sit just under the music.
    playMove() {
        if (!this.audioCtx || this.isMuted) return;
        this.resumeAudio();
        // Quiet + pitch-jittered so DAS auto-repeat stays a texture, not a buzz.
        if (this._playSample('move', { volume: 0.3, rate: 0.95 + Math.random() * 0.1 })) return;
        const t = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, t);
        gain.gain.setValueAtTime(0.025, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.04);
    }

    // Beefy slam for hard drop - low square hit + lowpass thud, longer than land.
    playHardDrop() {
        if (!this.audioCtx || this.isMuted) return;
        this.resumeAudio();
        // TETR.IO-style: the lock click pitched down for body, a crisp snap
        // transient on top, and only a whisper of the old thud for weight.
        if (this._playSample('land', { volume: 0.85, rate: 0.8 })) {
            this._playSample('snap', { volume: 0.5, rate: 0.95 + Math.random() * 0.1 });
            this._playSample('harddrop', { volume: 0.15 });
            return;
        }
        const t = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        const filter = this.audioCtx.createBiquadFilter();
        osc.type = 'square';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, t);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
        osc.connect(filter); filter.connect(gain); gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.2);
    }

    // Two-tone swap for hold piece.
    playHold() {
        if (!this.audioCtx || this.isMuted) return;
        this.resumeAudio();
        if (this._playSample('hold', { volume: 0.6 })) return;
        const t = this.audioCtx.currentTime;
        const beep = (freq, start, dur) => {
            const o = this.audioCtx.createOscillator();
            const g = this.audioCtx.createGain();
            o.type = 'triangle';
            o.frequency.setValueAtTime(freq, start);
            g.gain.setValueAtTime(0.12, start);
            g.gain.exponentialRampToValueAtTime(0.001, start + dur);
            o.connect(g); g.connect(this.sfxGain);
            o.start(start); o.stop(start + dur);
        };
        beep(660, t,        0.08);
        beep(880, t + 0.06, 0.10);
    }

    // Bright triadic sting for shield activation.
    playShieldUp() {
        if (!this.audioCtx || this.isMuted) return;
        this.resumeAudio();
        if (this._playSample('shield', { volume: 0.85 })) return;
        const t = this.audioCtx.currentTime;
        const beep = (freq, start, dur) => {
            const o = this.audioCtx.createOscillator();
            const g = this.audioCtx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(freq, start);
            g.gain.setValueAtTime(0.18, start);
            g.gain.exponentialRampToValueAtTime(0.001, start + dur);
            o.connect(g); g.connect(this.sfxGain);
            o.start(start); o.stop(start + dur);
        };
        beep(523, t,        0.12); // C5
        beep(659, t + 0.05, 0.14); // E5
        beep(784, t + 0.10, 0.20); // G5
    }

    // Three rapid zaps for the lightning power-up.
    playLightning() {
        if (!this.audioCtx || this.isMuted) return;
        this.resumeAudio();
        if (this._playSample('lightning', { volume: 0.85 })) return;
        const t = this.audioCtx.currentTime;
        for (let i = 0; i < 3; i++) {
            const start = t + i * 0.07;
            const o = this.audioCtx.createOscillator();
            const g = this.audioCtx.createGain();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(1200, start);
            o.frequency.exponentialRampToValueAtTime(400, start + 0.06);
            g.gain.setValueAtTime(0.15, start);
            g.gain.exponentialRampToValueAtTime(0.001, start + 0.06);
            o.connect(g); g.connect(this.sfxGain);
            o.start(start); o.stop(start + 0.07);
        }
    }

    // Rising fuse-tick for a bomb being sent.
    playBombSent() {
        if (!this.audioCtx || this.isMuted) return;
        this.resumeAudio();
        if (this._playSample('bomb', { volume: 0.85 })) return;
        const t = this.audioCtx.currentTime;
        for (let i = 0; i < 4; i++) {
            const start = t + i * 0.05;
            const o = this.audioCtx.createOscillator();
            const g = this.audioCtx.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(1200 + i * 200, start);
            g.gain.setValueAtTime(0.08, start);
            g.gain.exponentialRampToValueAtTime(0.001, start + 0.04);
            o.connect(g); g.connect(this.sfxGain);
            o.start(start); o.stop(start + 0.05);
        }
    }

    // Ascending rainbow chime for color buster.
    playBuster() {
        if (!this.audioCtx || this.isMuted) return;
        this.resumeAudio();
        if (this._playSample('buster', { volume: 0.85 })) return;
        const t = this.audioCtx.currentTime;
        const notes = [523, 659, 784, 988, 1175]; // C E G B D6
        notes.forEach((freq, i) => {
            const start = t + i * 0.06;
            const o = this.audioCtx.createOscillator();
            const g = this.audioCtx.createGain();
            o.type = 'triangle';
            o.frequency.setValueAtTime(freq, start);
            g.gain.setValueAtTime(0.12, start);
            g.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
            o.connect(g); g.connect(this.sfxGain);
            o.start(start); o.stop(start + 0.2);
        });
    }

    // Snappy descending sting for T-spin success.
    playTSpin() {
        if (!this.audioCtx || this.isMuted) return;
        this.resumeAudio();
        if (this._playSample('tspin', { volume: 0.85 })) return;
        const t = this.audioCtx.currentTime;
        const o = this.audioCtx.createOscillator();
        const g = this.audioCtx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(1500, t);
        o.frequency.exponentialRampToValueAtTime(500, t + 0.25);
        g.gain.setValueAtTime(0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g); g.connect(this.sfxGain);
        o.start(t); o.stop(t + 0.32);
    }

    // Bright fanfare for All-Clear.
    playAllClear() {
        if (!this.audioCtx || this.isMuted) return;
        this.resumeAudio();
        if (this._playSample('allclear', { volume: 1.0 })) return;
        const t = this.audioCtx.currentTime;
        const notes = [659, 784, 988, 1319]; // E G B E6 - bright major
        notes.forEach((freq, i) => {
            const start = t + i * 0.08;
            const o = this.audioCtx.createOscillator();
            const g = this.audioCtx.createGain();
            o.type = 'triangle';
            o.frequency.setValueAtTime(freq, start);
            g.gain.setValueAtTime(0.2, start);
            g.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
            o.connect(g); g.connect(this.sfxGain);
            o.start(start); o.stop(start + 0.5);
        });
    }

    // TETR.IO-style combo tone: same chime pitched up a semitone per combo
    // step, capped an octave above base so long combos don't turn into a
    // dog whistle. Layers on top of the line-clear sound.
    playCombo(combo) {
        if (!this.audioCtx || this.isMuted || combo < 2) return;
        this.resumeAudio();
        const semitones = Math.min(combo - 2, 12);
        const rate = Math.pow(2, semitones / 12);
        if (this._playSample('combo', { volume: 0.7, rate })) return;
        // Synth fallback: rising sine pluck at the same pitch curve.
        const t = this.audioCtx.currentTime;
        const o = this.audioCtx.createOscillator();
        const g = this.audioCtx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(660 * rate, t);
        g.gain.setValueAtTime(0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        o.connect(g); g.connect(this.sfxGain);
        o.start(t); o.stop(t + 0.16);
    }

    // Punchy start signal at the end of the match countdown.
    playGo() {
        if (!this.audioCtx || this.isMuted) return;
        this.resumeAudio();
        if (this._playSample('go', { volume: 0.9 })) return;
        this.playClickSound();
    }

    // Ominous rumble when opponent garbage is queued against you.
    playGarbageWarning() {
        if (!this.audioCtx || this.isMuted) return;
        this.resumeAudio();
        if (this._playSample('garbage', { volume: 0.8 })) return;
        // Synth fallback: short low rumble.
        const t = this.audioCtx.currentTime;
        const o = this.audioCtx.createOscillator();
        const g = this.audioCtx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(90, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g); g.connect(this.sfxGain);
        o.start(t); o.stop(t + 0.32);
    }
}
