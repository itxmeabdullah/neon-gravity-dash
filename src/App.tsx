import React, { useEffect, useRef, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { 
  Play, 
  RotateCcw, 
  Trophy, 
  Volume2, 
  VolumeX, 
  Music, 
  Pause, 
  Tv, 
  Flame, 
  ShieldAlert, 
  CheckCircle2, 
  X, 
  ArrowUpDown, 
  Coins,
  Sparkles,
  RefreshCw,
  Loader2
} from 'lucide-react';

import type { GameState, GravityDirection, Obstacle, Particle, LeaderboardEntry, Coin, FloatingText } from './types/game';
import { soundFx } from './lib/audio';
import { 
  subscribeToTopScores, 
  saveHighScore, 
  fetchLeaderboard 
} from './lib/firebaseLeaderboard';

// Virtual coordinate space (16:9 arcade ratio)
const V_WIDTH = 1000;
const V_HEIGHT = 562;
const CEILING_Y = 70;
const FLOOR_Y = 492;
const PLAYER_SIZE = 34;

interface Shockwave {
  x: number;
  y: number;
  r: number;
  maxR: number;
  color: string;
  alpha: number;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Game UI State
  const [gameState, setGameState] = useState<GameState>('MENU');
  const [score, setScore] = useState(0);
  const [distance, setDistance] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [orbsCount, setOrbsCount] = useState(0);
  const [coinsCount, setCoinsCount] = useState(0);
  const [comboMultiplier, setComboMultiplier] = useState(1);
  const [isNewHighScore, setIsNewHighScore] = useState(false);

  // Settings
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [scanlines, setScanlines] = useState(true);

  // Leaderboard & Modals
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [gameOverLeaderboard, setGameOverLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('ngd_player_name') || 'NEON_RUNNER');
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [milestoneMessage, setMilestoneMessage] = useState<string | null>(null);

  // Mutable Game Loop State References (avoids re-render lag during 60FPS loop)
  const gameRef = useRef({
    state: 'MENU' as GameState,
    distance: 0,
    score: 0,
    orbsCollected: 0,
    coinsCollected: 0,
    coinBonusScore: 0,
    combo: 1,
    lastCoinTimestamp: 0,
    speed: 400,
    baseSpeed: 400,
    gravity: 4200, // High snappy gravity acceleration
    gravityDir: 'DOWN' as GravityDirection,
    player: {
      x: 140,
      y: FLOOR_Y - PLAYER_SIZE,
      vy: 0,
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
      rotation: 0,
      targetRotation: 0,
      scaleX: 1,
      scaleY: 1,
      isOnGround: true,
      isOnCeiling: false,
    },
    obstacles: [] as Obstacle[],
    coins: [] as Coin[],
    floatingTexts: [] as FloatingText[],
    particles: [] as Particle[],
    shockwaves: [] as Shockwave[],
    speedLines: [] as { x: number; y: number; length: number; speed: number; alpha: number }[],
    stars: [] as { x: number; y: number; size: number; speed: number; alpha: number }[],
    citySilhouette: [] as { x: number; width: number; height: number; windows: { x: number; y: number; on: boolean }[] }[],
    gridOffset: 0,
    lastTime: 0,
    spawnTimer: 0,
    nextSpawnDistance: 260,
    coinSpawnTimer: 0,
    nextCoinSpawnDistance: 160,
    lastMilestone: 0,
    shakeDuration: 0,
    shakeIntensity: 0,
  });

  // Sync Audio Settings
  useEffect(() => {
    soundFx.setSoundMuted(!soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    soundFx.setMusicMuted(!musicEnabled);
  }, [musicEnabled]);

  // Load High Score from Local Storage
  useEffect(() => {
    const saved = localStorage.getItem('ngd_local_high_score');
    if (saved) {
      setHighScore(parseInt(saved, 10) || 0);
    }
  }, []);

  // Fetch Leaderboard handler (called on Game Over screen and on demand)
  const loadLeaderboard = useCallback(async () => {
    setLoadingLeaderboard(true);
    try {
      const scores = await fetchLeaderboard();
      setGameOverLeaderboard(scores);
      setLeaderboard(scores);
      if (scores.length > 0) {
        setHighScore((prev) => Math.max(prev, scores[0].score));
      }
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
    } finally {
      setLoadingLeaderboard(false);
    }
  }, []);

  // Leaderboard Subscription (real-time sync)
  useEffect(() => {
    const unsubscribe = subscribeToTopScores((scores) => {
      setLeaderboard(scores);
      setGameOverLeaderboard(scores);
      if (scores.length > 0) {
        const topScore = scores[0].score;
        setHighScore((prev) => Math.max(prev, topScore));
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // As soon as the Game Over screen appears, call fetchLeaderboard()
  useEffect(() => {
    if (gameState === 'GAMEOVER') {
      loadLeaderboard();
    }
  }, [gameState, loadLeaderboard]);

  // Initialize Background Parallax Visuals (Stars, City Skyline, Speed Lines)
  useEffect(() => {
    const g = gameRef.current;
    // Stars
    g.stars = [];
    for (let i = 0; i < 45; i++) {
      g.stars.push({
        x: Math.random() * V_WIDTH,
        y: CEILING_Y + Math.random() * (FLOOR_Y - CEILING_Y),
        size: Math.random() * 2 + 1,
        speed: Math.random() * 0.3 + 0.1,
        alpha: Math.random() * 0.7 + 0.3,
      });
    }

    // Distant City Skyline
    g.citySilhouette = [];
    let curX = 0;
    while (curX < V_WIDTH * 2) {
      const bWidth = Math.floor(Math.random() * 40 + 35);
      const bHeight = Math.floor(Math.random() * 110 + 60);
      const windows: { x: number; y: number; on: boolean }[] = [];
      const rows = Math.floor(bHeight / 16);
      const cols = Math.floor(bWidth / 12);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() > 0.45) {
            windows.push({ x: c * 10 + 5, y: r * 14 + 8, on: Math.random() > 0.2 });
          }
        }
      }
      g.citySilhouette.push({ x: curX, width: bWidth, height: bHeight, windows });
      curX += bWidth + Math.random() * 8;
    }

    // Parallax Speed lines
    g.speedLines = [];
    for (let i = 0; i < 15; i++) {
      g.speedLines.push({
        x: Math.random() * V_WIDTH,
        y: CEILING_Y + 15 + Math.random() * (FLOOR_Y - CEILING_Y - 30),
        length: Math.random() * 60 + 30,
        speed: Math.random() * 1.5 + 1.2,
        alpha: Math.random() * 0.3 + 0.1,
      });
    }
  }, []);

  // Snappy Gravity Flip Action Handler
  const flipGravity = useCallback(() => {
    const g = gameRef.current;
    if (g.state !== 'PLAYING') return;

    // Flip direction
    const newDir: GravityDirection = g.gravityDir === 'DOWN' ? 'UP' : 'DOWN';
    g.gravityDir = newDir;
    g.player.targetRotation = newDir === 'UP' ? Math.PI : 0;

    // Instant snappy vertical impulse for rapid responsiveness
    g.player.vy = newDir === 'UP' ? -760 : 760;
    g.player.isOnGround = false;
    g.player.isOnCeiling = false;

    // Squash & stretch launch distortion
    g.player.scaleX = 0.72;
    g.player.scaleY = 1.38;

    // Audio feedback with snappy sweep
    soundFx.playFlip(newDir);

    // Shockwave ring explosion
    const pColor = newDir === 'UP' ? '#ff007f' : '#00f0ff';
    g.shockwaves.push({
      x: g.player.x + PLAYER_SIZE / 2,
      y: g.player.y + PLAYER_SIZE / 2,
      r: 10,
      maxR: 70,
      color: pColor,
      alpha: 1,
    });

    // Spawn directional sparks
    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI * 2 * i) / 16;
      const speed = Math.random() * 180 + 100;
      g.particles.push({
        x: g.player.x + PLAYER_SIZE / 2,
        y: g.player.y + PLAYER_SIZE / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 3 + 2,
        color: pColor,
        alpha: 1,
        decay: 3.8,
        glow: true,
      });
    }
  }, []);

  // Helper to spawn coin formations (Lines, Arcs, or Waves)
  const spawnCoinFormation = useCallback((startX: number) => {
    const g = gameRef.current;
    const formationType = Math.random();
    const count = Math.floor(Math.random() * 2) + 3; // 3 to 4 coins
    const spacing = 45;

    if (formationType < 0.4) {
      // Parabolic Arc: Guides player across the corridor
      const goingUp = Math.random() > 0.5;
      const startY = goingUp ? FLOOR_Y - 45 : CEILING_Y + 45;
      const endY = goingUp ? CEILING_Y + 45 : FLOOR_Y - 45;

      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const y = startY + (endY - startY) * t;
        g.coins.push({
          id: `coin-${Date.now()}-${i}-${Math.random()}`,
          x: startX + i * spacing,
          y,
          baseY: y,
          radius: 13,
          value: 100,
          spin: Math.random() * Math.PI,
          collected: false,
          floatPhase: (i * 0.4),
        });
      }
    } else if (formationType < 0.75) {
      // Horizontal Run: hovering near ceiling or floor
      const nearCeiling = Math.random() > 0.5;
      const y = nearCeiling ? CEILING_Y + 45 : FLOOR_Y - 45;
      for (let i = 0; i < count; i++) {
        g.coins.push({
          id: `coin-${Date.now()}-${i}-${Math.random()}`,
          x: startX + i * spacing,
          y,
          baseY: y,
          radius: 13,
          value: 100,
          spin: Math.random() * Math.PI,
          collected: false,
          floatPhase: (i * 0.5),
        });
      }
    } else {
      // Mid-channel Wave
      const midY = (CEILING_Y + FLOOR_Y) / 2;
      for (let i = 0; i < count; i++) {
        const y = midY + Math.sin(i * 0.8) * 55;
        g.coins.push({
          id: `coin-${Date.now()}-${i}-${Math.random()}`,
          x: startX + i * spacing,
          y,
          baseY: y,
          radius: 13,
          value: 100,
          spin: Math.random() * Math.PI,
          collected: false,
          floatPhase: (i * 0.6),
        });
      }
    }
  }, []);

  // Start / Restart Game
  const startGame = useCallback(() => {
    soundFx.playClick();
    const g = gameRef.current;
    g.state = 'PLAYING';
    g.distance = 0;
    g.score = 0;
    g.orbsCollected = 0;
    g.coinsCollected = 0;
    g.coinBonusScore = 0;
    g.combo = 1;
    g.lastCoinTimestamp = 0;
    g.speed = 400;
    g.gravityDir = 'DOWN';
    g.player = {
      x: 140,
      y: FLOOR_Y - PLAYER_SIZE,
      vy: 0,
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
      rotation: 0,
      targetRotation: 0,
      scaleX: 1,
      scaleY: 1,
      isOnGround: true,
      isOnCeiling: false,
    };
    g.obstacles = [];
    g.coins = [];
    g.floatingTexts = [];
    g.particles = [];
    g.shockwaves = [];
    g.lastMilestone = 0;
    g.nextSpawnDistance = 220;
    g.nextCoinSpawnDistance = 140;
    g.shakeDuration = 0;

    setGameState('PLAYING');
    setScore(0);
    setDistance(0);
    setOrbsCount(0);
    setCoinsCount(0);
    setComboMultiplier(1);
    setIsNewHighScore(false);
    setScoreSubmitted(false);
    setMilestoneMessage(null);
  }, []);

  // Handle Game Over: Triggers crash effects and calls fetchLeaderboard()
  const triggerGameOver = useCallback((finalScore: number, finalDist: number) => {
    soundFx.playCrash();
    const g = gameRef.current;
    g.state = 'GAMEOVER';
    g.shakeDuration = 0.45;
    g.shakeIntensity = 18;

    // Create explosion debris particles
    for (let i = 0; i < 45; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 350 + 60;
      g.particles.push({
        x: g.player.x + PLAYER_SIZE / 2,
        y: g.player.y + PLAYER_SIZE / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 5 + 2,
        color: Math.random() > 0.5 ? '#ff007f' : (Math.random() > 0.5 ? '#00f0ff' : '#ffe600'),
        alpha: 1,
        decay: Math.random() * 1.5 + 0.8,
        glow: true,
      });
    }

    setGameState('GAMEOVER');
    setScore(finalScore);
    setDistance(finalDist);

    // Call fetchLeaderboard() as soon as the Game Over screen appears
    loadLeaderboard();

    // Check high score
    const currentHigh = parseInt(localStorage.getItem('ngd_local_high_score') || '0', 10);
    if (finalScore > currentHigh) {
      localStorage.setItem('ngd_local_high_score', finalScore.toString());
      setHighScore(finalScore);
      setIsNewHighScore(true);
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#00f0ff', '#ff007f', '#ffe600', '#9d4edd']
        });
      } catch {
        // safe confetti fallback
      }
    }
  }, [loadLeaderboard]);

  // Toggle Pause
  const togglePause = useCallback(() => {
    soundFx.playClick();
    setGameState((prev) => {
      const next = prev === 'PLAYING' ? 'PAUSED' : 'PLAYING';
      gameRef.current.state = next;
      return next;
    });
  }, []);

  // Input Listeners: Keyboard & Space
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        if (gameRef.current.state === 'PLAYING') {
          flipGravity();
        } else if (gameRef.current.state === 'MENU' || gameRef.current.state === 'GAMEOVER') {
          startGame();
        }
      } else if (e.code === 'KeyP' || e.code === 'Escape') {
        if (gameRef.current.state === 'PLAYING' || gameRef.current.state === 'PAUSED') {
          togglePause();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flipGravity, startGame, togglePause]);

  // Main Canvas Render & Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = (timestamp: number) => {
      const g = gameRef.current;
      if (!g.lastTime) g.lastTime = timestamp;
      const dt = Math.min((timestamp - g.lastTime) / 1000, 0.1);
      g.lastTime = timestamp;

      // UPDATE LOGIC (only when PLAYING)
      if (g.state === 'PLAYING') {
        // Progress distance & speed curve
        g.distance += (g.speed * dt) * 0.12;
        // Gradual speed scaling: 400 -> 820
        g.speed = g.baseSpeed + Math.min(420, g.distance * 0.14);

        // Score = distance + orbs bonus + coins bonus
        const calculatedScore = Math.floor(g.distance) + (g.orbsCollected * 150) + g.coinBonusScore;
        g.score = calculatedScore;
        setScore(calculatedScore);
        setDistance(Math.floor(g.distance));

        // Combo timeout decay (2.2 seconds without a coin drops combo)
        if (g.combo > 1 && timestamp - g.lastCoinTimestamp > 2200) {
          g.combo = 1;
          setComboMultiplier(1);
        }

        // Milestone alerts (every 500m)
        const currentMilestone = Math.floor(g.distance / 500) * 500;
        if (currentMilestone > 0 && currentMilestone !== g.lastMilestone) {
          g.lastMilestone = currentMilestone;
          soundFx.playScoreMilestone();
          setMilestoneMessage(`⚡ SPEED BOOST // ${currentMilestone}m REACHED ⚡`);
          setTimeout(() => setMilestoneMessage(null), 2500);
        }

        // Screen shake decay
        if (g.shakeDuration > 0) {
          g.shakeDuration -= dt;
        }

        // Grid parallax shift
        g.gridOffset = (g.gridOffset + g.speed * dt) % 40;

        // Snappy player physics with high acceleration and velocity clamp
        const accel = g.gravityDir === 'DOWN' ? g.gravity : -g.gravity;
        g.player.vy += accel * dt;
        // Terminal velocity clamp for snappy control
        g.player.vy = Math.max(-1250, Math.min(1250, g.player.vy));
        g.player.y += g.player.vy * dt;

        // Player rapid snappy rotation (increased tracking speed)
        const rotDiff = g.player.targetRotation - g.player.rotation;
        g.player.rotation += rotDiff * Math.min(1, dt * 32);

        // Recover squash & stretch to 1.0 smoothly
        g.player.scaleX += (1 - g.player.scaleX) * Math.min(1, dt * 16);
        g.player.scaleY += (1 - g.player.scaleY) * Math.min(1, dt * 16);

        // Ceiling collision & snappy landing squish
        if (g.player.y <= CEILING_Y) {
          g.player.y = CEILING_Y;
          if (g.gravityDir === 'UP') {
            if (Math.abs(g.player.vy) > 250) {
              // Impact squish
              g.player.scaleX = 1.35;
              g.player.scaleY = 0.65;
              // Landing sparks
              for (let s = 0; s < 6; s++) {
                g.particles.push({
                  x: g.player.x + Math.random() * PLAYER_SIZE,
                  y: CEILING_Y,
                  vx: (Math.random() - 0.5) * 160,
                  vy: Math.random() * 80 + 20,
                  size: 2,
                  color: '#ff007f',
                  alpha: 0.9,
                  decay: 4.5,
                  glow: true,
                });
              }
            }
            g.player.vy = 0;
            g.player.isOnCeiling = true;
          }
        } else {
          g.player.isOnCeiling = false;
        }

        // Floor collision & snappy landing squish
        if (g.player.y >= FLOOR_Y - g.player.height) {
          g.player.y = FLOOR_Y - g.player.height;
          if (g.gravityDir === 'DOWN') {
            if (Math.abs(g.player.vy) > 250) {
              // Impact squish
              g.player.scaleX = 1.35;
              g.player.scaleY = 0.65;
              // Landing sparks
              for (let s = 0; s < 6; s++) {
                g.particles.push({
                  x: g.player.x + Math.random() * PLAYER_SIZE,
                  y: FLOOR_Y,
                  vx: (Math.random() - 0.5) * 160,
                  vy: -Math.random() * 80 - 20,
                  size: 2,
                  color: '#00f0ff',
                  alpha: 0.9,
                  decay: 4.5,
                  glow: true,
                });
              }
            }
            g.player.vy = 0;
            g.player.isOnGround = true;
          }
        } else {
          g.player.isOnGround = false;
        }

        // Trail particles emitter behind player
        if (Math.random() > 0.1) {
          const trailColor = g.gravityDir === 'UP' ? '#ff007f' : '#00f0ff';
          g.particles.push({
            x: g.player.x + 4,
            y: g.player.y + (g.gravityDir === 'UP' ? 6 : g.player.height - 6),
            vx: -Math.random() * 110 - 50,
            vy: (Math.random() - 0.5) * 30,
            size: Math.random() * 3 + 2,
            color: trailColor,
            alpha: 0.85,
            decay: 2.8,
            glow: true,
          });
        }

        // OBSTACLES SPAWNING
        g.spawnTimer += g.speed * dt;
        if (g.spawnTimer >= g.nextSpawnDistance) {
          g.spawnTimer = 0;
          // Fair spacing
          g.nextSpawnDistance = Math.floor(Math.random() * 120 + 260 - Math.min(90, g.distance * 0.03));

          const roll = Math.random();
          const id = 'obs-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5);

          if (roll < 0.4) {
            // Floor Spike / Barrier
            const isSpike = Math.random() > 0.4;
            const h = Math.random() * 40 + 36;
            g.obstacles.push({
              id,
              x: V_WIDTH + 20,
              y: FLOOR_Y - h,
              width: isSpike ? 34 : 26,
              height: h,
              attachment: 'FLOOR',
              color: '#00f0ff',
              type: isSpike ? 'SPIKE' : 'BARRIER',
              passed: false,
            });
          } else if (roll < 0.75) {
            // Ceiling Spike / Barrier
            const isSpike = Math.random() > 0.4;
            const h = Math.random() * 40 + 36;
            g.obstacles.push({
              id,
              x: V_WIDTH + 20,
              y: CEILING_Y,
              width: isSpike ? 34 : 26,
              height: h,
              attachment: 'CEILING',
              color: '#ff007f',
              type: isSpike ? 'SPIKE' : 'BARRIER',
              passed: false,
            });
          } else if (roll < 0.88) {
            // Energy Crystal Orb (Mid-air bonus)
            const orbY = CEILING_Y + 70 + Math.random() * (FLOOR_Y - CEILING_Y - 140);
            g.obstacles.push({
              id,
              x: V_WIDTH + 20,
              y: orbY,
              width: 24,
              height: 24,
              attachment: 'FLOATING',
              color: '#ffe600',
              type: 'ORB',
              passed: false,
              pulsePhase: 0,
            });
          } else {
            // Dual laser hazard
            const isUpper = Math.random() > 0.5;
            g.obstacles.push({
              id,
              x: V_WIDTH + 20,
              y: isUpper ? CEILING_Y : FLOOR_Y - 55,
              width: 32,
              height: 55,
              attachment: isUpper ? 'CEILING' : 'FLOOR',
              color: isUpper ? '#ff007f' : '#00f0ff',
              type: 'LASER',
              passed: false,
              pulsePhase: 0,
            });
          }
        }

        // COINS SPAWNING IN FLOATING FORMATIONS
        g.coinSpawnTimer += g.speed * dt;
        if (g.coinSpawnTimer >= g.nextCoinSpawnDistance) {
          g.coinSpawnTimer = 0;
          g.nextCoinSpawnDistance = Math.floor(Math.random() * 140 + 200);
          spawnCoinFormation(V_WIDTH + 40);
        }

        // UPDATE & COLLIDE COINS
        const playerCenter = {
          x: g.player.x + PLAYER_SIZE / 2,
          y: g.player.y + PLAYER_SIZE / 2,
        };

        for (let i = g.coins.length - 1; i >= 0; i--) {
          const coin = g.coins[i];
          coin.x -= g.speed * dt;
          coin.spin += dt * 6; // 3D spin rotation
          coin.floatPhase += dt * 3.5;
          coin.y = coin.baseY + Math.sin(coin.floatPhase) * 6;

          // Subtle magnet pull when close (adds immense arcade satisfaction)
          const distToPlayer = Math.hypot(playerCenter.x - coin.x, playerCenter.y - coin.y);
          if (distToPlayer < 75 && !coin.collected) {
            coin.x += (playerCenter.x - coin.x) * dt * 7;
            coin.y += (playerCenter.y - coin.y) * dt * 7;
          }

          // Offscreen cull
          if (coin.x < -40) {
            g.coins.splice(i, 1);
            continue;
          }

          // Collection check
          if (!coin.collected && distToPlayer < (PLAYER_SIZE / 2 + coin.radius + 6)) {
            coin.collected = true;
            g.coinsCollected += 1;
            setCoinsCount(g.coinsCollected);

            // Combo chain calculation
            if (timestamp - g.lastCoinTimestamp < 2200) {
              g.combo = Math.min(5, g.combo + 1);
            } else {
              g.combo = 1;
            }
            g.lastCoinTimestamp = timestamp;
            setComboMultiplier(g.combo);

            // Points gained with multiplier
            const earnedPoints = coin.value * g.combo;
            g.coinBonusScore += earnedPoints;

            // Audio chime with pitch step
            soundFx.playCoinCollect(g.combo);

            // Floating score popup text
            g.floatingTexts.push({
              id: 'ft-' + Date.now() + Math.random(),
              x: coin.x,
              y: coin.y - 10,
              vy: -65,
              text: g.combo > 1 ? `+${earnedPoints} x${g.combo}!` : `+${earnedPoints}`,
              color: g.combo > 1 ? '#ff007f' : '#ffe600',
              alpha: 1,
            });

            // Golden star sparkles burst
            for (let p = 0; p < 12; p++) {
              const ang = (Math.PI * 2 * p) / 12;
              const spd = Math.random() * 140 + 70;
              g.particles.push({
                x: coin.x,
                y: coin.y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                size: Math.random() * 3 + 2,
                color: '#ffe600',
                alpha: 1,
                decay: 3.8,
                glow: true,
              });
            }

            g.coins.splice(i, 1);
          }
        }

        // UPDATE FLOATING TEXTS
        for (let i = g.floatingTexts.length - 1; i >= 0; i--) {
          const ft = g.floatingTexts[i];
          ft.y += ft.vy * dt;
          ft.alpha -= dt * 1.4;
          if (ft.alpha <= 0) {
            g.floatingTexts.splice(i, 1);
          }
        }

        // UPDATE SHOCKWAVES
        for (let i = g.shockwaves.length - 1; i >= 0; i--) {
          const sw = g.shockwaves[i];
          sw.r += (sw.maxR - sw.r) * dt * 14;
          sw.alpha -= dt * 2.5;
          if (sw.alpha <= 0) {
            g.shockwaves.splice(i, 1);
          }
        }

        // Move and collide obstacles
        for (let i = g.obstacles.length - 1; i >= 0; i--) {
          const obs = g.obstacles[i];
          obs.x -= g.speed * dt;

          if (obs.pulsePhase !== undefined) {
            obs.pulsePhase += dt * 6;
          }

          // Offscreen cull
          if (obs.x + obs.width < -50) {
            g.obstacles.splice(i, 1);
            continue;
          }

          // Collectible Orb Detection
          if (obs.type === 'ORB') {
            if (!obs.collected) {
              const dx = (g.player.x + PLAYER_SIZE / 2) - (obs.x + obs.width / 2);
              const dy = (g.player.y + PLAYER_SIZE / 2) - (obs.y + obs.height / 2);
              const dist = Math.hypot(dx, dy);

              if (dist < PLAYER_SIZE / 2 + obs.width / 2) {
                obs.collected = true;
                g.orbsCollected += 1;
                setOrbsCount(g.orbsCollected);
                soundFx.playOrbCollect();

                // Floating Orb score popup
                g.floatingTexts.push({
                  id: 'ft-orb-' + Date.now(),
                  x: obs.x,
                  y: obs.y - 12,
                  vy: -70,
                  text: '+150 CRYSTAL',
                  color: '#00f0ff',
                  alpha: 1,
                });

                // Golden burst
                for (let p = 0; p < 16; p++) {
                  const ang = (Math.PI * 2 * p) / 16;
                  const spd = Math.random() * 120 + 80;
                  g.particles.push({
                    x: obs.x + obs.width / 2,
                    y: obs.y + obs.height / 2,
                    vx: Math.cos(ang) * spd,
                    vy: Math.sin(ang) * spd,
                    size: Math.random() * 3 + 2,
                    color: '#ffe600',
                    alpha: 1,
                    decay: 3.5,
                    glow: true,
                  });
                }

                g.obstacles.splice(i, 1);
                continue;
              }
            }
          } else {
            // Collision detection with hazards (forgiving 4px padding for fair retro gameplay)
            const pBox = {
              left: g.player.x + 5,
              right: g.player.x + PLAYER_SIZE - 5,
              top: g.player.y + 5,
              bottom: g.player.y + PLAYER_SIZE - 5,
            };

            const oBox = {
              left: obs.x + 3,
              right: obs.x + obs.width - 3,
              top: obs.y + (obs.attachment === 'CEILING' ? 0 : 3),
              bottom: obs.y + obs.height - (obs.attachment === 'FLOOR' ? 0 : 3),
            };

            const isColliding = 
              pBox.right >= oBox.left &&
              pBox.left <= oBox.right &&
              pBox.bottom >= oBox.top &&
              pBox.top <= oBox.bottom;

            if (isColliding) {
              triggerGameOver(g.score, Math.floor(g.distance));
              break;
            }
          }
        }
      }

      // Update particles (alive in all states for explosion dissipation)
      for (let i = g.particles.length - 1; i >= 0; i--) {
        const p = g.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha -= p.decay * dt;
        if (p.alpha <= 0) {
          g.particles.splice(i, 1);
        }
      }

      // Update background parallax elements
      const bgSpeed = g.state === 'PLAYING' ? g.speed : 100;
      g.stars.forEach((s) => {
        s.x -= bgSpeed * dt * s.speed;
        if (s.x < 0) s.x = V_WIDTH;
      });

      g.speedLines.forEach((l) => {
        l.x -= bgSpeed * dt * l.speed;
        if (l.x + l.length < 0) {
          l.x = V_WIDTH + Math.random() * 100;
          l.y = CEILING_Y + 15 + Math.random() * (FLOOR_Y - CEILING_Y - 30);
        }
      });

      g.citySilhouette.forEach((b) => {
        b.x -= bgSpeed * dt * 0.18;
      });
      // Wrap city buildings
      const lastB = g.citySilhouette[g.citySilhouette.length - 1];
      if (g.citySilhouette[0] && g.citySilhouette[0].x + g.citySilhouette[0].width < -40) {
        const first = g.citySilhouette.shift()!;
        first.x = lastB ? lastB.x + lastB.width + 10 : V_WIDTH;
        g.citySilhouette.push(first);
      }

      // RENDER SECTION
      ctx.save();

      // Screen shake translation
      if (g.shakeDuration > 0) {
        const currentShake = (g.shakeDuration / 0.45) * g.shakeIntensity;
        ctx.translate(
          (Math.random() - 0.5) * currentShake,
          (Math.random() - 0.5) * currentShake
        );
      }

      // 1. Synthwave Deep Space Gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, V_HEIGHT);
      skyGrad.addColorStop(0, '#0a0319');
      skyGrad.addColorStop(0.3, '#19082d');
      skyGrad.addColorStop(0.65, '#2b0c3d');
      skyGrad.addColorStop(1, '#0e041d');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

      // 2. Stars
      g.stars.forEach((s) => {
        ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // 3. Synthwave Sunset Sun (Center Horizon)
      const sunX = V_WIDTH / 2;
      const sunY = (CEILING_Y + FLOOR_Y) / 2 + 10;
      const sunR = 86;

      ctx.save();
      // Sun Glow
      const sunGlow = ctx.createRadialGradient(sunX, sunY, sunR * 0.4, sunX, sunY, sunR * 1.8);
      sunGlow.addColorStop(0, 'rgba(255, 0, 128, 0.4)');
      sunGlow.addColorStop(0.6, 'rgba(255, 120, 0, 0.15)');
      sunGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Sun Body with Gradient
      const sunBody = ctx.createLinearGradient(sunX, sunY - sunR, sunX, sunY + sunR);
      sunBody.addColorStop(0, '#ffe600');
      sunBody.addColorStop(0.45, '#ff007f');
      sunBody.addColorStop(1, '#670080');
      ctx.fillStyle = sunBody;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
      ctx.fill();

      // Synthwave horizontal blind cutouts across bottom half of sun
      ctx.fillStyle = '#1c0828';
      const blindsCount = 6;
      for (let b = 1; b <= blindsCount; b++) {
        const bY = sunY + (b * (sunR / (blindsCount + 1)));
        const thickness = b * 1.4;
        ctx.fillRect(sunX - sunR, bY, sunR * 2, thickness);
      }
      ctx.restore();

      // 4. Distant City Skyline Silhouettes
      ctx.save();
      g.citySilhouette.forEach((b) => {
        const floorBase = FLOOR_Y;
        ctx.fillStyle = '#0f051b';
        ctx.fillRect(b.x, floorBase - b.height * 0.6, b.width, b.height * 0.6);
        ctx.strokeStyle = '#2b0f4c';
        ctx.lineWidth = 1;
        ctx.strokeRect(b.x, floorBase - b.height * 0.6, b.width, b.height * 0.6);

        // Windows
        b.windows.forEach((w) => {
          if (w.on) {
            ctx.fillStyle = Math.random() > 0.05 ? 'rgba(0, 240, 255, 0.65)' : 'rgba(255, 0, 128, 0.65)';
            ctx.fillRect(b.x + w.x, floorBase - b.height * 0.6 + w.y, 4, 4);
          }
        });
      });
      ctx.restore();

      // 5. Parallax Speed lines
      ctx.save();
      g.speedLines.forEach((l) => {
        ctx.strokeStyle = `rgba(0, 240, 255, ${l.alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(l.x + l.length, l.y);
        ctx.stroke();
      });
      ctx.restore();

      // 6. 3D Perspective Retro Grids (Floor and Ceiling)
      // Floor Grid (Neon Cyan)
      ctx.save();
      const floorGrad = ctx.createLinearGradient(0, FLOOR_Y, 0, V_HEIGHT);
      floorGrad.addColorStop(0, '#0c021c');
      floorGrad.addColorStop(1, '#05010b');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, FLOOR_Y, V_WIDTH, V_HEIGHT - FLOOR_Y);

      // Floor Top Glowing Border
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, FLOOR_Y);
      ctx.lineTo(V_WIDTH, FLOOR_Y);
      ctx.stroke();

      // Floor vertical running perspective lines
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.shadowBlur = 4;
      const fLineStep = 38;
      for (let x = -g.gridOffset; x < V_WIDTH + 80; x += fLineStep) {
        ctx.beginPath();
        ctx.moveTo(x, FLOOR_Y);
        ctx.lineTo(x + 25, V_HEIGHT);
        ctx.stroke();
      }

      // Floor horizontal depth lines
      for (let h = 1; h <= 4; h++) {
        const hy = FLOOR_Y + h * 17;
        ctx.strokeStyle = `rgba(0, 240, 255, ${0.4 - h * 0.07})`;
        ctx.beginPath();
        ctx.moveTo(0, hy);
        ctx.lineTo(V_WIDTH, hy);
        ctx.stroke();
      }
      ctx.restore();

      // Ceiling Grid (Neon Pink)
      ctx.save();
      const ceilGrad = ctx.createLinearGradient(0, CEILING_Y, 0, 0);
      ceilGrad.addColorStop(0, '#0c021c');
      ceilGrad.addColorStop(1, '#05010b');
      ctx.fillStyle = ceilGrad;
      ctx.fillRect(0, 0, V_WIDTH, CEILING_Y);

      // Ceiling Bottom Glowing Border
      ctx.strokeStyle = '#ff007f';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ff007f';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, CEILING_Y);
      ctx.lineTo(V_WIDTH, CEILING_Y);
      ctx.stroke();

      // Ceiling vertical running lines
      ctx.strokeStyle = 'rgba(255, 0, 128, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.shadowBlur = 4;
      for (let x = -g.gridOffset; x < V_WIDTH + 80; x += fLineStep) {
        ctx.beginPath();
        ctx.moveTo(x, CEILING_Y);
        ctx.lineTo(x + 25, 0);
        ctx.stroke();
      }

      // Ceiling horizontal depth lines
      for (let h = 1; h <= 3; h++) {
        const hy = CEILING_Y - h * 18;
        ctx.strokeStyle = `rgba(255, 0, 128, ${0.4 - h * 0.08})`;
        ctx.beginPath();
        ctx.moveTo(0, hy);
        ctx.lineTo(V_WIDTH, hy);
        ctx.stroke();
      }
      ctx.restore();

      // 7. Draw Shockwaves (Gravity Flip concentric rings)
      g.shockwaves.forEach((sw) => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, sw.alpha);
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = 3;
        ctx.shadowColor = sw.color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });

      // 8. Draw Floating Collectible Coins (Spinning 3D Gold Cyber Tokens)
      g.coins.forEach((coin) => {
        ctx.save();
        ctx.translate(coin.x, coin.y);
        
        // 3D spin projection
        const scaleX = Math.cos(coin.spin);
        ctx.scale(scaleX, 1);

        ctx.shadowColor = '#ffe600';
        ctx.shadowBlur = 12;

        // Outer golden rim
        ctx.beginPath();
        ctx.arc(0, 0, coin.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffaa00';
        ctx.fill();

        // Inner glowing face
        ctx.beginPath();
        ctx.arc(0, 0, coin.radius * 0.82, 0, Math.PI * 2);
        const coinGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, coin.radius * 0.82);
        coinGrad.addColorStop(0, '#ffffff');
        coinGrad.addColorStop(0.35, '#ffe600');
        coinGrad.addColorStop(1, '#ff9900');
        ctx.fillStyle = coinGrad;
        ctx.fill();

        // Stamped Star / Cyber Symbol in center
        ctx.fillStyle = '#7a3e00';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✦', 0, 1);

        // Highlight glint
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.restore();
      });

      // 9. Draw Obstacles & Collectibles
      g.obstacles.forEach((obs) => {
        ctx.save();
        ctx.shadowColor = obs.color;
        ctx.shadowBlur = 14;

        if (obs.type === 'SPIKE') {
          // Sharp Neon Spike (triangle)
          ctx.fillStyle = obs.color;
          ctx.beginPath();
          if (obs.attachment === 'FLOOR') {
            ctx.moveTo(obs.x, obs.y + obs.height);
            ctx.lineTo(obs.x + obs.width / 2, obs.y);
            ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
          } else {
            ctx.moveTo(obs.x, obs.y);
            ctx.lineTo(obs.x + obs.width / 2, obs.y + obs.height);
            ctx.lineTo(obs.x + obs.width, obs.y);
          }
          ctx.closePath();
          ctx.fill();

          // Inner hot neon core
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (obs.type === 'BARRIER') {
          // Neon Laser Pillar Barrier
          ctx.fillStyle = 'rgba(10, 4, 25, 0.9)';
          ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

          ctx.strokeStyle = obs.color;
          ctx.lineWidth = 2.5;
          ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);

          // Animated energy pulse line inside barrier
          const phase = (obs.pulsePhase || 0) % (obs.height - 10);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(obs.x + 3, obs.y + phase, obs.width - 6, 4);
        } else if (obs.type === 'LASER') {
          // High-tech laser gate
          ctx.fillStyle = obs.color;
          ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

          // Glowing laser pulses
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
        } else if (obs.type === 'ORB') {
          // Spinning Diamond Energy Orb
          const cx = obs.x + obs.width / 2;
          const cy = obs.y + obs.height / 2;
          const pulse = Math.sin(obs.pulsePhase || 0) * 3;
          const r = obs.width / 2 + pulse;

          ctx.translate(cx, cy);
          ctx.rotate(obs.pulsePhase ? obs.pulsePhase * 0.8 : 0);

          ctx.fillStyle = '#ffe600';
          ctx.beginPath();
          ctx.moveTo(0, -r);
          ctx.lineTo(r, 0);
          ctx.moveTo(0, r);
          ctx.lineTo(-r, 0);
          ctx.closePath();
          ctx.fill();

          // Inner glowing diamond
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      // 10. Draw Particles
      g.particles.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        if (p.glow) {
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 10;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // 11. Draw Floating Score Texts (e.g. +100, +200 x2!)
      g.floatingTexts.forEach((ft) => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, ft.alpha);
        ctx.font = 'bold 15px "Chakra Petch", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = ft.color;
        ctx.shadowColor = ft.color;
        ctx.shadowBlur = 10;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      });

      // 12. Draw Player Runner with Snappy Squash & Stretch
      if (g.state !== 'GAMEOVER') {
        ctx.save();
        const pCenterX = g.player.x + PLAYER_SIZE / 2;
        const pCenterY = g.player.y + PLAYER_SIZE / 2;
        ctx.translate(pCenterX, pCenterY);
        ctx.rotate(g.player.rotation);

        // Apply dynamic squash & stretch
        ctx.scale(g.player.scaleX, g.player.scaleY);

        const isCeil = g.gravityDir === 'UP';
        const primaryColor = isCeil ? '#ff007f' : '#00f0ff';
        const secondaryColor = isCeil ? '#ffe600' : '#ff007f';

        // Outer glow
        ctx.shadowColor = primaryColor;
        ctx.shadowBlur = 18;

        // Player Body: Sleek Cyber Dart / Arrow Head
        ctx.beginPath();
        ctx.moveTo(PLAYER_SIZE * 0.48, 0); // nose pointing right
        ctx.lineTo(-PLAYER_SIZE * 0.44, -PLAYER_SIZE * 0.42);
        ctx.lineTo(-PLAYER_SIZE * 0.22, 0); // inner exhaust notch
        ctx.lineTo(-PLAYER_SIZE * 0.44, PLAYER_SIZE * 0.42);
        ctx.closePath();

        ctx.fillStyle = '#100520';
        ctx.fill();

        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Glowing center energy diamond
        ctx.beginPath();
        ctx.moveTo(PLAYER_SIZE * 0.15, 0);
        ctx.lineTo(0, -PLAYER_SIZE * 0.18);
        ctx.lineTo(-PLAYER_SIZE * 0.15, 0);
        ctx.lineTo(0, PLAYER_SIZE * 0.18);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Directional thruster flame
        const flameLength = Math.random() * 14 + 10;
        ctx.beginPath();
        ctx.moveTo(-PLAYER_SIZE * 0.22, -PLAYER_SIZE * 0.15);
        ctx.lineTo(-PLAYER_SIZE * 0.22 - flameLength, 0);
        ctx.lineTo(-PLAYER_SIZE * 0.22, PLAYER_SIZE * 0.15);
        ctx.closePath();
        ctx.fillStyle = secondaryColor;
        ctx.fill();

        ctx.restore();
      }

      ctx.restore(); // Restore shake

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [triggerGameOver, spawnCoinFormation]);

  // 2. saveHighScore(username, score) submission handler
  const handleScoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    localStorage.setItem('ngd_player_name', playerName.trim());

    try {
      await saveHighScore(playerName, score, distance);
      setScoreSubmitted(true);
      // Re-fetch leaderboard immediately to show updated rankings
      await loadLeaderboard();
    } catch (err) {
      console.error('Failed to submit score:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-between min-h-screen bg-[#080214] text-slate-100 selection:bg-pink-500 selection:text-white">
      {/* Scanline CRT overlay */}
      {scanlines && <div className="absolute inset-0 crt-scanlines z-30 pointer-events-none opacity-85" />}

      {/* TOP BAR CONTRACT: Brand Title | Actions | Sound / Settings */}
      <header className="w-full max-w-6xl flex items-center justify-between gap-4 px-4 py-3 border-b border-purple-950/60 z-40 bg-[#080214]/90 backdrop-blur-md">
        {/* Brand Zone */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-pink-500 p-0.5 flex items-center justify-center shadow-lg shadow-pink-500/20">
            <div className="w-full h-full bg-[#0d0420] rounded-[6px] flex items-center justify-center">
              <ArrowUpDown className="w-4 h-4 text-cyan-400" />
            </div>
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold font-arcade tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-pink-400 to-yellow-400 whitespace-nowrap">
              NEON GRAVITY DASH
            </h1>
          </div>
        </div>

        {/* Live HUD (when PLAYING or PAUSED) */}
        {gameState !== 'MENU' && (
          <div className="flex items-center gap-3 sm:gap-6 font-mono-num text-xs sm:text-sm">
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-slate-400 tracking-wider">SCORE</span>
              <span className="font-bold text-cyan-300 text-glow-cyan text-sm sm:text-base">{score}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-slate-400 tracking-wider">DIST</span>
              <span className="font-semibold text-pink-400">{distance}m</span>
            </div>
            
            {/* Coins Collector HUD */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-yellow-400/90 tracking-wider flex items-center gap-0.5">
                <Coins className="w-3 h-3 text-yellow-400" />
                <span>COINS</span>
              </span>
              <div className="flex items-center gap-1 font-bold text-yellow-300 text-glow-yellow text-xs sm:text-sm">
                <span>{coinsCount}</span>
                {comboMultiplier > 1 && (
                  <span className="px-1 py-0.2 rounded bg-pink-950 border border-pink-500/80 text-[10px] text-pink-300 animate-pulse">
                    x{comboMultiplier}
                  </span>
                )}
              </div>
            </div>

            <div className="hidden sm:flex flex-col items-center">
              <span className="text-[10px] text-slate-400 tracking-wider">CRYSTALS</span>
              <span className="font-semibold text-cyan-300">+{orbsCount * 150}</span>
            </div>
          </div>
        )}

        {/* Right Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Pause Button */}
          {gameState === 'PLAYING' && (
            <button
              onClick={togglePause}
              title="Pause Game (P)"
              className="p-2 rounded-lg bg-purple-950/40 hover:bg-purple-900/60 border border-purple-800/40 text-slate-300 hover:text-white transition-colors"
            >
              <Pause className="w-4 h-4" />
            </button>
          )}

          {/* Leaderboard Button */}
          <button
            onClick={() => {
              soundFx.playClick();
              loadLeaderboard();
              setShowLeaderboard(true);
            }}
            title="Global Leaderboard"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-950/40 hover:bg-pink-900/60 border border-pink-700/50 text-pink-300 text-xs font-semibold hover:text-pink-100 transition-colors shadow-sm"
          >
            <Trophy className="w-3.5 h-3.5 text-pink-400" />
            <span className="hidden sm:inline">Rankings</span>
          </button>

          {/* Sound FX Toggle */}
          <button
            onClick={() => {
              setSoundEnabled(!soundEnabled);
              soundFx.playClick();
            }}
            title={soundEnabled ? 'Mute Sound' : 'Unmute Sound'}
            className="p-2 rounded-lg bg-purple-950/40 hover:bg-purple-900/60 border border-purple-800/40 text-slate-300 hover:text-white transition-colors"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          {/* Procedural Synthwave Music Toggle */}
          <button
            onClick={() => {
              setMusicEnabled(!musicEnabled);
              soundFx.playClick();
            }}
            title={musicEnabled ? 'Stop Synth BGM' : 'Start Synthwave BGM'}
            className={`p-2 rounded-lg border transition-colors ${
              musicEnabled 
                ? 'bg-pink-950/60 border-pink-500/60 text-pink-300 shadow-[0_0_10px_rgba(255,0,128,0.3)]' 
                : 'bg-purple-950/40 border-purple-800/40 text-slate-500 hover:text-slate-300'
            }`}
          >
            <Music className="w-4 h-4" />
          </button>

          {/* CRT Scanline Toggle */}
          <button
            onClick={() => setScanlines(!scanlines)}
            title="Toggle Retro CRT Lines"
            className={`p-2 rounded-lg border transition-colors ${
              scanlines ? 'bg-cyan-950/50 border-cyan-500/50 text-cyan-300' : 'bg-purple-950/40 border-purple-800/40 text-slate-500'
            }`}
          >
            <Tv className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* MAIN GAME ARENA CONTAINER */}
      <main className="relative flex-1 w-full max-w-5xl flex flex-col items-center justify-center p-2 sm:p-4 my-auto">
        {/* Milestone floating banner */}
        {milestoneMessage && (
          <div className="absolute top-6 z-30 px-4 py-1.5 rounded-full bg-pink-500/90 text-white font-arcade text-xs sm:text-sm tracking-wider font-bold shadow-lg shadow-pink-500/50 animate-bounce">
            {milestoneMessage}
          </div>
        )}

        {/* Arcade Cabinet Screen Container with Aspect Ratio */}
        <div 
          onPointerDown={(e) => {
            // Only trigger if clicking directly on the canvas/cabinet, not interactive children
            if ((e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'INPUT') {
              if (gameState === 'PLAYING') {
                flipGravity();
              }
            }
          }}
          className="relative w-full aspect-[16/9] max-h-[76vh] rounded-xl sm:rounded-2xl overflow-hidden border-2 border-purple-900/70 shadow-[0_0_35px_rgba(25,10,48,0.8),0_0_15px_rgba(0,240,255,0.15)] bg-black cursor-pointer select-none touch-none"
        >
          {/* Main HTML5 Canvas */}
          <canvas
            ref={canvasRef}
            width={V_WIDTH}
            height={V_HEIGHT}
            className="w-full h-full object-contain block"
          />

          {/* ==================== TITLE / START MENU OVERLAY ==================== */}
          {gameState === 'MENU' && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm p-6 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/40 bg-cyan-950/40 text-cyan-300 text-xs font-arcade tracking-widest mb-3">
                <Flame className="w-3.5 h-3.5 text-pink-400 animate-pulse" />
                <span>SYNTHWAVE ARCADE RUNNER</span>
              </div>

              <h2 className="text-3xl sm:text-5xl md:text-6xl font-extrabold font-arcade tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-pink-400 to-yellow-300 drop-shadow-[0_0_20px_rgba(255,0,128,0.5)] mb-3">
                NEON GRAVITY DASH
              </h2>

              <p className="max-w-md text-xs sm:text-sm text-slate-300 leading-relaxed mb-6">
                Defy physics with ultra-snappy gravity flips! Tap anywhere or press <kbd className="px-1.5 py-0.5 rounded bg-purple-900/80 border border-purple-700/60 font-mono-num text-[11px] text-cyan-300">SPACE</kbd> to launch between ceiling and floor. Collect floating golden coins and dodge deadly neon obstacles!
              </p>

              {/* Start Button */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startGame();
                  }}
                  className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-pink-600 via-purple-600 to-cyan-600 hover:from-pink-500 hover:to-cyan-500 text-white font-arcade font-bold tracking-wider text-sm sm:text-base shadow-[0_0_25px_rgba(255,0,128,0.5)] hover:scale-105 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" />
                  START RUN
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    soundFx.playClick();
                    loadLeaderboard();
                    setShowLeaderboard(true);
                  }}
                  className="px-5 py-3 rounded-xl bg-purple-950/60 hover:bg-purple-900/70 border border-purple-700/60 text-slate-200 font-arcade text-xs sm:text-sm tracking-wide transition-colors flex items-center gap-2"
                >
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  VIEW HIGH SCORES
                </button>
              </div>

              {/* Quick Controls Hint */}
              <div className="mt-6 flex items-center gap-4 text-[11px] text-slate-400">
                <span>🖱️ Tap / Click Screen to Flip</span>
                <span>·</span>
                <span>⌨️ Spacebar / Arrow Up</span>
                <span>·</span>
                <span>🪙 Collect Golden Coins</span>
              </div>
            </div>
          )}

          {/* ==================== PAUSED OVERLAY ==================== */}
          {gameState === 'PAUSED' && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md p-6 text-center">
              <h3 className="text-2xl sm:text-4xl font-arcade font-bold text-yellow-400 tracking-wider mb-4">
                SYSTEM PAUSED
              </h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePause();
                  }}
                  className="px-6 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-arcade text-sm font-semibold tracking-wider transition-colors"
                >
                  RESUME
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startGame();
                  }}
                  className="px-6 py-2.5 rounded-lg bg-purple-950 hover:bg-purple-900 border border-purple-700 text-slate-200 font-arcade text-sm transition-colors"
                >
                  RESTART
                </button>
              </div>
            </div>
          )}

          {/* ==================== GAME OVER SCREEN WITH DYNAMIC LEADERBOARD ==================== */}
          {gameState === 'GAMEOVER' && (
            <div 
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 z-20 flex flex-col bg-black/90 backdrop-blur-md p-3 sm:p-5 text-center overflow-y-auto"
            >
              {/* Header strip */}
              <div className="flex items-center justify-between w-full max-w-4xl mx-auto pb-2 mb-2 border-b border-purple-900/60">
                <div className="flex items-center gap-1.5 text-pink-500 font-arcade text-[11px] sm:text-xs tracking-widest uppercase">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>NEURAL LINK SEVERED</span>
                </div>
                <h3 className="text-xl sm:text-3xl font-extrabold font-arcade tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-pink-500 to-yellow-400 drop-shadow-[0_0_12px_rgba(255,0,128,0.6)]">
                  GAME OVER
                </h3>
                <div className="flex items-center gap-1 font-arcade text-[11px] text-cyan-400">
                  <span>TOP 10 PILOTS</span>
                </div>
              </div>

              {isNewHighScore && (
                <div className="mb-2 self-center px-3 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-400/50 text-yellow-300 font-arcade text-xs tracking-wider animate-pulse flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                  <span>NEW PERSONAL BEST!</span>
                </div>
              )}

              {/* Main Game Over Split Layout: Left Controls & Stats, Right Dynamic Leaderboard */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 w-full max-w-4xl mx-auto flex-1 items-stretch my-auto">
                {/* Left Column: Player Stats & Submit */}
                <div className="md:col-span-5 flex flex-col items-center justify-center p-3 rounded-xl bg-purple-950/30 border border-purple-800/40">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-2 w-full mb-3 font-mono-num">
                    <div className="p-2 rounded-lg bg-black/60 border border-purple-800/50 flex flex-col items-center">
                      <span className="text-[10px] text-slate-400 tracking-wider">SCORE</span>
                      <span className="text-base sm:text-lg font-bold text-cyan-300 text-glow-cyan">{score}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-black/60 border border-purple-800/50 flex flex-col items-center">
                      <span className="text-[10px] text-slate-400 tracking-wider">DIST</span>
                      <span className="text-base sm:text-lg font-bold text-pink-400">{distance}m</span>
                    </div>
                    <div className="p-2 rounded-lg bg-black/60 border border-purple-800/50 flex flex-col items-center">
                      <span className="text-[10px] text-yellow-400 tracking-wider">COINS</span>
                      <span className="text-base sm:text-lg font-bold text-yellow-300 text-glow-yellow">{coinsCount}</span>
                    </div>
                  </div>

                  {/* Play Again button */}
                  <button
                    onClick={() => startGame()}
                    className="w-full py-2.5 px-4 mb-3 rounded-xl bg-gradient-to-r from-pink-600 to-cyan-600 hover:from-pink-500 hover:to-cyan-500 text-white font-arcade font-bold tracking-wider text-sm shadow-[0_0_20px_rgba(255,0,128,0.4)] flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
                  >
                    <RotateCcw className="w-4 h-4" />
                    PLAY AGAIN
                  </button>

                  {/* Submit Call-sign Form (calls saveHighScore in background) */}
                  {!scoreSubmitted ? (
                    <form 
                      onSubmit={handleScoreSubmit}
                      className="w-full p-2.5 rounded-lg bg-black/50 border border-purple-800/50 flex flex-col gap-1.5"
                    >
                      <label className="text-[11px] text-slate-300 font-arcade tracking-wide text-left flex items-center justify-between">
                        <span>SUBMIT CALLSIGN:</span>
                        <span className="text-cyan-400 text-[10px]">GLOBAL LEADERBOARD</span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          maxLength={12}
                          value={playerName}
                          onChange={(e) => setPlayerName(e.target.value.toUpperCase())}
                          placeholder="CALLSIGN"
                          className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/70 border border-purple-700/60 text-cyan-300 font-arcade text-xs uppercase tracking-widest placeholder:text-slate-600 focus:outline-none focus:border-cyan-400"
                        />
                        <button
                          type="submit"
                          disabled={isSubmitting || !playerName.trim()}
                          className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-arcade text-xs font-semibold tracking-wider transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {isSubmitting ? 'SAVING...' : 'SAVE'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="w-full p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/50 flex items-center justify-center gap-1.5 text-xs font-arcade text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>SCORE RECORDED IN GLOBAL ARCHIVES!</span>
                    </div>
                  )}
                </div>

                {/* Right Column: Dynamic Top 10 Leaderboard on Game Over */}
                <div className="md:col-span-7 flex flex-col p-3 rounded-xl bg-purple-950/20 border border-purple-800/40 max-h-60 sm:max-h-72 overflow-hidden">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-purple-900/60">
                    <div className="flex items-center gap-1.5">
                      <Trophy className="w-4 h-4 text-yellow-400" />
                      <span className="font-arcade text-xs font-bold text-slate-100 tracking-wider">
                        GLOBAL TOP 10 PLAYERS
                      </span>
                    </div>
                    <button
                      onClick={() => loadLeaderboard()}
                      disabled={loadingLeaderboard}
                      title="Refresh Leaderboard"
                      className="p-1 rounded text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingLeaderboard ? 'animate-spin text-cyan-400' : ''}`} />
                    </button>
                  </div>

                  {/* Top 10 dynamic list */}
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 font-mono-num text-xs">
                    {loadingLeaderboard && gameOverLeaderboard.length === 0 ? (
                      <div className="flex items-center justify-center py-8 text-cyan-400 gap-2 font-arcade text-xs">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>LOADING GLOBAL LEADERBOARD...</span>
                      </div>
                    ) : gameOverLeaderboard.length === 0 ? (
                      <div className="text-center py-6 text-slate-500 font-arcade text-xs">
                        NO SCORES RECORDED YET. BE THE FIRST!
                      </div>
                    ) : (
                      gameOverLeaderboard.slice(0, 10).map((entry, idx) => {
                        const isTop3 = idx < 3;
                        const rankColors = [
                          'text-yellow-400 bg-yellow-950/50 border-yellow-500/50',
                          'text-slate-200 bg-slate-900/60 border-slate-500/50',
                          'text-amber-500 bg-amber-950/50 border-amber-600/50',
                        ];
                        const rankBadgeClass = isTop3 ? rankColors[idx] : 'text-slate-400 bg-purple-950/30 border-purple-800/30';
                        const isMe = entry.username.toUpperCase() === playerName.trim().toUpperCase() && scoreSubmitted;

                        return (
                          <div
                            key={entry.id || idx}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-colors ${
                              isMe 
                                ? 'bg-pink-950/50 border-pink-500 text-pink-200 shadow-[0_0_10px_rgba(255,0,128,0.2)]' 
                                : 'bg-black/50 border-purple-900/40 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[11px] border ${rankBadgeClass}`}>
                                {idx + 1}
                              </span>
                              <span className="font-arcade font-bold tracking-wider text-slate-100 text-xs">
                                {entry.username}
                              </span>
                              {isMe && (
                                <span className="px-1 py-0.2 rounded bg-pink-500 text-black text-[9px] font-bold">
                                  YOU
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="text-[10px] text-slate-500 hidden sm:inline">
                                {entry.distance}m
                              </span>
                              <span className="font-bold text-cyan-300 text-glow-cyan">
                                {entry.score}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MOBILE CONTROLS BAR */}
        <div className="w-full max-w-5xl mt-3 flex items-center justify-between gap-3 px-2">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-arcade">
            <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span>GRAVITY: {gameRef.current.gravityDir === 'UP' ? 'CEILING [INVERTED]' : 'FLOOR [STANDARD]'}</span>
            {comboMultiplier > 1 && (
              <span className="text-yellow-400 flex items-center gap-1 font-bold">
                <Sparkles className="w-3 h-3" />
                {comboMultiplier}X COMBO ACTIVE
              </span>
            )}
          </div>

          {/* Quick Tap Flip Button (especially handy on mobile) */}
          <button
            onClick={() => {
              if (gameState === 'PLAYING') {
                flipGravity();
              } else if (gameState === 'MENU' || gameState === 'GAMEOVER') {
                startGame();
              }
            }}
            className="sm:hidden px-4 py-2 rounded-lg bg-gradient-to-r from-pink-600 to-cyan-600 text-white font-arcade font-bold text-xs tracking-wider shadow-md shadow-pink-500/30 flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <ArrowUpDown className="w-4 h-4" />
            <span>TAP TO FLIP</span>
          </button>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="w-full max-w-6xl flex items-center justify-between gap-4 px-4 py-2.5 text-xs text-slate-500 border-t border-purple-950/40">
        <div className="flex items-center gap-2">
          <span>Neon Gravity Dash</span>
          <span>·</span>
          <span>HTML5 Canvas & Web Audio API</span>
        </div>
        <div className="text-[11px] text-slate-500">
          <span>Tap Screen or Spacebar to Flip Gravity</span>
        </div>
      </footer>

      {/* ==================== GLOBAL LEADERBOARD MODAL ==================== */}
      {showLeaderboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="relative w-full max-w-lg rounded-2xl bg-[#0f0521] border border-purple-800/60 shadow-[0_0_40px_rgba(255,0,128,0.2)] p-5 sm:p-6 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-purple-900/60 mb-4">
              <div className="flex items-center gap-2.5">
                <Trophy className="w-5 h-5 text-yellow-400" />
                <h3 className="font-arcade text-lg font-bold text-slate-100 tracking-wider">
                  TOP 10 PILOTS
                </h3>
              </div>
              <button
                onClick={() => setShowLeaderboard(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-purple-950/80 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sync Badge */}
            <div className="flex items-center justify-between text-xs font-arcade text-slate-400 mb-3 px-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>GLOBAL ARCADE LEADERBOARD</span>
              </div>
              <button
                onClick={() => loadLeaderboard()}
                className="text-cyan-400 hover:underline flex items-center gap-1 text-[11px] cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${loadingLeaderboard ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {/* Scores Table */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono-num text-xs sm:text-sm">
              {leaderboard.length === 0 ? (
                <div className="text-center py-8 text-slate-500 font-arcade">NO RUNNERS RECORDED YET</div>
              ) : (
                leaderboard.slice(0, 10).map((entry, idx) => {
                  const isTop3 = idx < 3;
                  const rankColors = [
                    'text-yellow-400 bg-yellow-950/40 border-yellow-500/40',
                    'text-slate-200 bg-slate-900/60 border-slate-500/40',
                    'text-amber-500 bg-amber-950/40 border-amber-600/40',
                  ];
                  const rankBadgeClass = isTop3 ? rankColors[idx] : 'text-slate-400 bg-purple-950/30 border-purple-800/30';

                  return (
                    <div
                      key={entry.id || idx}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-colors ${
                        entry.isCurrentPlayer 
                          ? 'bg-pink-950/30 border-pink-500/50 text-pink-200' 
                          : 'bg-purple-950/20 border-purple-900/40 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs border ${rankBadgeClass}`}>
                          {idx + 1}
                        </span>
                        <div className="flex flex-col">
                          <span className="font-arcade font-bold tracking-wider text-slate-100">
                            {entry.username}
                          </span>
                          <span className="text-[10px] text-slate-500">{entry.distance}m traveled</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-bold text-cyan-300 text-glow-cyan text-sm sm:text-base">
                          {entry.score}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Close Button */}
            <div className="pt-4 mt-3 border-t border-purple-900/60 flex justify-end">
              <button
                onClick={() => setShowLeaderboard(false)}
                className="px-5 py-2 rounded-xl bg-purple-900/50 hover:bg-purple-800/60 text-slate-200 font-arcade text-xs tracking-wider transition-colors cursor-pointer"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
