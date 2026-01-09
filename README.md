# Tetris Life Battle - P2P Edition 🎮

A real-time multiplayer Tetris battle game using peer-to-peer WebRTC connections. No server limits, no quotas - just pure P2P fun!

**🎮 Play Now:** [https://lifedelinquent.github.io/Tetris-Life-P2P/](https://lifedelinquent.github.io/Tetris-Life-P2P/)

## How to Play

### Multiplayer
1. **Host:** Click "CREATE ROOM" → Share the 4-letter code with your friend
2. **Guest:** Click "JOIN ROOM" → Enter the code
3. Both click **READY** → Game starts!

### Controls
| Key | Action |
|-----|--------|
| ← → | Move left/right |
| ↓ | Soft drop |
| ↑ | Rotate |
| Space | Hard drop |
| C | Hold piece |
| P / Esc | Pause |

### Power-ups
Spend cleared lines to unleash abilities!

| Key | Power-up | Cost | Effect |
|-----|----------|------|--------|
| S | Shield 🛡️ | 3 lines | Block next attack |
| R | Lightning ⚡ | 6 lines | Get 3 I-pieces |
| E | Bomb 💣 | 9 lines | Send timed bomb (10s) |
| Q | Color Buster 🌈 | 17 lines | Remove all blocks of one color |

## Tech Stack
- **P2P:** PeerJS / WebRTC
- **Audio:** Web Audio API + MP3 playlist
- **Hosting:** GitHub Pages (static)

## Local Development
```bash
# Clone the repo
git clone https://github.com/Lifedelinquent/Tetris-Life-P2P.git
cd Tetris-Life-P2P

# Serve locally
npx serve docs -l 3000

# Open http://localhost:3000
```

## Credits
- Created by Lifedelinquent & ChronoKoala
- Music: Tetris remixes and classic themes
- Built with ❤️ and lots of falling blocks

---
*No Firebase, no limits - just you and your friend!*
