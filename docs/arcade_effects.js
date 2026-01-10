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
        const shapeIdx = Math.floor(Math.random() * this.shapes.length);
        const color = this.colors[shapeIdx];
        const shape = this.shapes[shapeIdx];

        return {
            x: Math.random() * this.canvas.width,
            y: randomY ? Math.random() * this.canvas.height : -100,
            rotation: 0,
            speed: 1 + Math.random() * 2,
            rotSpeed: (Math.random() - 0.5) * 0.05,
            shape: shape,
            color: color,
            size: 30
        };
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
            this.ctx.fillStyle = 'rgba(26, 26, 26, 0.2)'; // Trails effect
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            this.tetrominos.forEach((t, i) => {
                t.y += t.speed;
                t.rotation += t.rotSpeed;

                if (t.y > this.canvas.height + 100) {
                    this.tetrominos[i] = this.createTetromino();
                }

                this.drawTetromino(t, this.ctx);
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

    drawTetromino(t, ctx = this.ctx) {
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.rotation);

        ctx.fillStyle = t.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = t.color;

        t.shape.forEach((row, ry) => {
            row.forEach((val, rx) => {
                if (val) {
                    ctx.fillRect(
                        (rx - t.shape[0].length / 2) * t.size,
                        (ry - t.shape.length / 2) * t.size,
                        t.size - 2,
                        t.size - 2
                    );
                }
            });
        });

        ctx.restore();
    }

    // --- Audio ---

    initAudio() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // Master Gain
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = 1.0;
        this.masterGain.connect(this.audioCtx.destination);

        // BGM Gain
        this.bgmGain = this.audioCtx.createGain();
        this.bgmGain.gain.value = 0.2; // Default Music Level (20%)
        this.bgmGain.connect(this.masterGain);

        // SFX Gain
        this.sfxGain = this.audioCtx.createGain();
        this.sfxGain.gain.value = 0.5; // Default SFX Level
        this.sfxGain.connect(this.masterGain);

        // Load MP3s
        this.introBuffer = null;
        this.loopBuffer = null;
        this.currentMusicSource = null;
        this.loadGameMusic();

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
    }

    async loadGameMusic() {
        try {
            // Load Intro (classic.mp3)
            const res1 = await fetch('classic.mp3');
            const buf1 = await res1.arrayBuffer();
            this.introBuffer = await this.audioCtx.decodeAudioData(buf1);

            // Load Loop (loop.mp3)
            const res2 = await fetch('loop.mp3');
            const buf2 = await res2.arrayBuffer();
            this.loopBuffer = await this.audioCtx.decodeAudioData(buf2);

            console.log("Game Music Loaded (Intro + Loop)");
        } catch (e) {
            console.error("Failed to load game music:", e);
        }
    }

    playGameMusic(rate = 1.0) {
        if (!this.audioCtx || !this.introBuffer || !this.loopBuffer) return;

        this.stopGameMusic();
        this.isMusicPlaying = true;
        this.currentRate = rate || 1.0;

        // Play Intro
        const source = this.audioCtx.createBufferSource();
        source.buffer = this.introBuffer;
        source.loop = false;
        source.playbackRate.value = this.currentRate;
        source.connect(this.bgmGain); // Direct connect for Intro

        const startTime = this.audioCtx.currentTime;
        source.start(startTime);
        this.currentMusicSource = source;
        console.log(`Playing Intro at ${rate}x`);

        // Schedule Loop (Crossfade: Start 200ms early)
        const duration = this.introBuffer.duration / this.currentRate;
        const overlap = 0.2; // 200ms
        const delay = Math.max(0, duration - overlap) * 1000;

        // Store start time for speed adjustment calcs
        this.introStartTime = startTime;
        this.introDuration = duration;
        this.isIntro = true;

        this.transitionTimer = setTimeout(() => {
            if (this.isMusicPlaying) {
                this.playMusicLoop(this.currentRate);
            }
        }, delay);
    }

    playMusicLoop(rate) {
        if (!this.isMusicPlaying) return;

        this.isIntro = false;
        const source = this.audioCtx.createBufferSource();
        source.buffer = this.loopBuffer;
        source.loop = true;
        source.playbackRate.value = rate;

        // Crossfade Gain
        const fadeGain = this.audioCtx.createGain();
        fadeGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
        fadeGain.gain.linearRampToValueAtTime(1, this.audioCtx.currentTime + 3.0); // 3s Fade In (Matched overlap)

        source.connect(fadeGain);
        fadeGain.connect(this.bgmGain);

        source.start();
        this.currentMusicSource = source;
        console.log(`Playing Loop at ${rate}x (Fade In)`);
    }

    scheduleLoopTransition(delay) {
        this.transitionDelay = delay;
        this.transitionSetTime = Date.now();

        clearTimeout(this.transitionTimer);
        this.transitionTimer = setTimeout(() => {
            if (this.isMusicPlaying) {
                this.playMusicLoop(this.currentRate);
            }
        }, delay);
    }

    pauseGame() {
        if (this.audioCtx && this.audioCtx.state === 'running') {
            this.audioCtx.suspend();
        }

        // Freeze Transition Timer
        if (this.isIntro && this.transitionTimer) {
            clearTimeout(this.transitionTimer);
            const elapsed = Date.now() - this.transitionSetTime;
            this.transitionRemaining = Math.max(0, this.transitionDelay - elapsed);
        }
    }

    resumeGame() {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().then(() => {
                console.log('Audio context resumed after pause');
            }).catch(e => console.warn('Audio context resume failed:', e));
        }

        // Resume MP3 audio element for battle music (handles long pauses)
        if (this.battleMusicActive && this.audioElement) {
            // If paused, resume playback
            if (this.audioElement.paused && this.musicOn) {
                this.audioElement.play().catch(e => {
                    console.warn('Resume MP3 failed, starting new track:', e);
                    this.playRandomTrack();
                });
            }
        }

        // Resume Transition Timer
        if (this.isIntro && this.transitionRemaining > 0) {
            this.scheduleLoopTransition(this.transitionRemaining);
            this.transitionRemaining = 0;
        }
    }

    stopGameMusic() {
        this.isMusicPlaying = false;
        clearTimeout(this.transitionTimer);
        this.isIntro = false;
        this.transitionRemaining = 0; // Clear state

        if (this.currentMusicSource) {
            try {
                this.currentMusicSource.stop();
            } catch (e) { }
            this.currentMusicSource = null;
        }
    }

    setMusicSpeed(rate) {
        this.currentRate = rate;
        // For MP3 playback via HTML5 Audio
        if (this.audioElement && !this.panicMode) {
            // Don't override panic mode speed
            this.normalPlaybackRate = rate;
            this.audioElement.playbackRate = rate;
        }
        // Legacy Web Audio support
        if (this.currentMusicSource && this.currentMusicSource.playbackRate) {
            this.currentMusicSource.playbackRate.setValueAtTime(
                rate,
                this.audioCtx.currentTime
            );
        }
    }

    setMusicVolume(value) {
        const vol = Math.max(0, Math.min(1, parseFloat(value)));
        this.musicVolume = vol; // Store for reference

        // Update Web Audio gain (synthesized music)
        if (this.bgmGain) {
            this.bgmGain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
        }
        // Update HTML5 Audio element (MP3 music)
        if (this.audioElement) {
            this.audioElement.volume = vol;
        }
        // Update game over audio element if exists
        if (this.gameOverAudio) {
            this.gameOverAudio.volume = vol;
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

    setTempoScale(scale) {
        this.tempo = this.baseTempo * scale;
        // console.log("Music Tempo set to:", this.tempo);
    }

    resumeAudio() {
        if (!this.audioCtx) return;

        console.log(`Audio Context State: ${this.audioCtx.state}`);

        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().then(() => {
                console.log("Audio Context resumed successfully!");
            }).catch(e => {
                console.error("Failed to resume Audio Context:", e);
                alert("Audio Error: Browser prevented sound. Try clicking the page again.");
            });
        }
    }

    toggleMusic() {
        this.resumeAudio();

        // Use musicOn to track if anything is playing
        if (this.musicOn) {
            // MUTE - pause whatever is playing but remember battle mode
            console.log("Muting music...");
            if (this.audioElement) {
                this.audioElement.pause();
            }
            // Stop synth music scheduling
            clearTimeout(this.timerID);
            this.isPlayingMusic = false;
            this.musicOn = false;
            // DON'T reset battleMusicActive - we need to remember we're in battle
        } else {
            // UNMUTE - resume appropriate music type
            console.log("Unmuting music... battleMusicActive=", this.battleMusicActive);
            this.musicOn = true;

            // Check if we're in battle mode (battleMusicActive was set by startBattleMusic)
            if (this.battleMusicActive) {
                console.log("Resuming battle MP3 music...");
                // Resume MP3 from where it was paused
                if (this.audioElement && this.audioElement.src) {
                    this.audioElement.play().catch(e => {
                        console.warn("Resume failed, starting new track:", e);
                        this.playRandomTrack();
                    });
                } else {
                    this.playRandomTrack();
                }
            } else {
                // Lobby mode - synthesized music
                console.log("Starting lobby synth music...");
                this.playTestBeep();
                this.startMusic();
            }
        }
        return this.musicOn;
    }

    playTestBeep() {
        this.playSoftBeep(); // Alias for now
    }

    playSoftBeep() {
        if (!this.audioCtx || this.isMuted) return;
        this.resumeAudio();

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

    // --- Lobby Music (Synthesized) ---
    startMusic() {
        // For lobby - uses synthesized music
        if (this.isPlayingMusic) return;
        this.isPlayingMusic = true;
        this.musicOn = true;
        this.currentNoteIndex = 0;
        const now = this.audioCtx.currentTime + 0.1;
        this.nextNoteTime = now;
        this.nextDrumTime = now;
        this.drumBeat = 0;
        this.scheduler();
    }

    stopMusic() {
        this.musicOn = false;
        this.isPlayingMusic = false;
        clearTimeout(this.timerID);

        // Stop MP3 if playing
        if (this.audioElement) {
            this.fadeOut(() => {
                if (this.audioElement) this.audioElement.pause();
            });
        }
    }

    // --- Battle Music (MP3 Playlist at 40% volume) ---
    startBattleMusic() {
        // Stop lobby music first
        this.stopMusic();

        // Start MP3 playlist for battle
        this.musicOn = true;
        this.battleMusicActive = true;
        this.playRandomTrack();
    }

    stopBattleMusic() {
        this.battleMusicActive = false;
        this.stopMusic();
    }

    // --- Game Over Music ---
    playGameOverMusic() {
        // Stop any current music immediately
        this.stopBattleMusic();

        // Create game over audio element if not exists
        if (!this.gameOverAudio) {
            this.gameOverAudio = new Audio('music/46. Game Over BGM [Tetris Gameboy Theme].mp3');
            this.gameOverAudio.addEventListener('ended', () => {
                console.log("Game over music ended, starting lobby music...");
                // Start synthesized lobby music after game over music ends
                this.startMusic();
            });
        }

        // Set volume to match current music volume setting
        this.gameOverAudio.volume = this.musicVolume || 0.2;
        this.gameOverAudio.currentTime = 0; // Reset to start

        // Play game over music
        this.gameOverAudio.play().then(() => {
            console.log("Playing game over music...");
        }).catch(err => {
            console.warn("Game over music failed:", err);
            // Fallback: just start lobby music
            this.startMusic();
        });
    }

    stopGameOverMusic() {
        if (this.gameOverAudio) {
            this.gameOverAudio.pause();
            this.gameOverAudio.currentTime = 0;
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
            this.audioElement.addEventListener('ended', () => this.fadeToNextTrack());
        }

        this.audioElement.src = trackPath;
        this.audioElement.volume = 0; // Start silent for fade-in
        this.audioElement.playbackRate = this.panicMode ? this.panicPlaybackRate : this.normalPlaybackRate;

        // Play and fade in
        this.audioElement.play().then(() => {
            // Use current volume setting or default to 0.2 (20%)
            const targetVol = (typeof this.musicVolume !== 'undefined') ? this.musicVolume : 0.2;
            this.fadeIn(targetVol);
            console.log('Now playing:', trackPath);
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
            console.log('Panic mode:', enabled ? 'ON (1.35x speed)' : 'OFF (normal speed)');
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

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, this.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, this.audioCtx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.1);
    }

    playClickSound() {
        if (!this.audioCtx || this.isMuted) return;
        this.resumeAudio();

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
}
