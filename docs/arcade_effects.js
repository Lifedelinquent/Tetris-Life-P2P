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

    resumeAudio() {
        if (!this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(e => {
                console.error("Failed to resume Audio Context:", e);
            });
        }
    }

    toggleMusic() {
        this.resumeAudio();

        // Use musicOn to track if anything is playing
        if (this.musicOn) {
            // MUTE - pause whatever is playing but remember battle mode
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
            this.musicOn = true;

            // Check if we're in battle mode (battleMusicActive was set by startBattleMusic)
            if (this.battleMusicActive) {
                // Resume MP3 from where it was paused
                if (this.audioElement && this.audioElement.src) {
                    this.audioElement.play().catch(() => {
                        this.playRandomTrack();
                    });
                } else {
                    this.playRandomTrack();
                }
            } else {
                // Lobby mode - synthesized music
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
                // Start synthesized lobby music after game over music ends
                this.startMusic();
            });
        }

        // Set volume to match current music volume setting
        this.gameOverAudio.volume = this.musicVolume || 0.2;
        this.gameOverAudio.currentTime = 0; // Reset to start

        // Play game over music; on failure fall straight back to lobby music
        this.gameOverAudio.play().catch(() => {
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

    // --- Action SFX ---
    // Tiny click for horizontal moves. Very quiet so DAS auto-repeat doesn't
    // become a buzz - it should sit just under the music.
    playMove() {
        if (!this.audioCtx || this.isMuted) return;
        this.resumeAudio();
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
}
