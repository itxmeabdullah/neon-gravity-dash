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
  Loader2,
  Smartphone,
  RotateCw,
  Maximize,
  Minimize
} from 'lucide-react';

import type { GameState, GravityDirection, Obstacle, Particle, LeaderboardEntry, Coin, FloatingText } from './types/game';
import { soundFx } from './lib/audio';
import { 
  subscribeToTopScores, 
  saveHighScore, 
  fetchLeaderboard 
} from './lib/firebaseLeaderboard';

// 1. Locked high-performance mobile resolution (800x450, 16:9)
const V_WIDTH = 800;
const V_HEIGHT = 450;
const CEILING_Y = 56;
const FLOOR_Y = 394;
const PLAYER_SIZE = 28;

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

  // Direct DOM refs for 60FPS HUD updates without triggering 60 React re-renders per second
  const scoreRef = useRef<HTMLSpanElement | null>(null);
  const distanceRef = useRef<HTMLSpanElement | null>(null);
  const coinsRef = useRef<HTMLSpanElement | null>(null);
  const comboRef = useRef<HTMLSpanElement | null>(null);

  // Game UI State (updated on game lifecycle transitions)
  const [gameState, setGameState] = useState<GameState>('MENU');
  const [finalScore, setFinalScore] = useState(0);
  const [finalDistance, setFinalDistance] = useState(0);
  const [finalCoins, setFinalCoins] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isNewHighScore, setIsNewHighScore] = useState(false);

  // Settings
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [scanlines, setScanlines] = useState(false); // Default off for top mobile performance

  // Leaderboard & Modals
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [gameOverLeaderboard, setGameOverLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('ngd_player_name') || 'NEON_RUNNER');
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [milestoneMessage, setMilestoneMessage] = useState<string | null>(null);
  
  // Responsive Device & Orientation Gate State
  const [isPortraitBlocked, setIsPortraitBlocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // High-performance mutable state reference
  const gameRef = useRef({
    state: 'MENU' as GameState,
    distance: 0,
    score: 0,
    orbsCollected: 0,
    coinsCollected: 0,
    coinBonusScore: 0,
    combo: 1,
    lastCoinTimestamp: 0,
    speed: 360,
    baseSpeed: 360,
    gravity: 3800, // Snappy gravity acceleration
    gravityDir: 'DOWN' as GravityDirection,
    player: {
      x: 110,
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
    citySilhouette: [] as { x: number; width: number; height: number; windows: { x: number; y: number }[] }[],
    gridOffset: 0,
    lastTime: 0,
    spawnTimer: 0,
    nextSpawnDistance: 240,
    coinSpawnTimer: 0,
    nextCoinSpawnDistance: 150,
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

  // Responsive device detector and orientation screen gate
  useEffect(() => {
    const checkDeviceOrientation = () => {
      if (typeof window === 'undefined') return;

      // 1. Detect if the user's device is a mobile phone / tablet
      const isTouch = 
        ('ontouchstart' in window) || 
        (navigator.maxTouchPoints > 0) || 
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPad Pro

      // Screen size check: physical min dimension < 1024 (covers phones and iPads/tablets)
      const minScreenDim = Math.min(window.screen.width, window.screen.height);
      const isMobileDevice = isMobileUA || (isTouch && minScreenDim < 1024);

      // 4. If it is a desktop/PC, bypass this check entirely and load the game immediately
      if (!isMobileDevice) {
        setIsPortraitBlocked(false);
        return;
      }

      // 2 & 3. If mobile device is in PORTRAIT mode, display blocking overlay
      const isPortrait = 
        window.innerHeight > window.innerWidth || 
        (window.matchMedia && window.matchMedia('(orientation: portrait)').matches);

      setIsPortraitBlocked(isPortrait);

      // If user rotates to portrait during active play, pause automatically
      if (isPortrait && gameRef.current.state === 'PLAYING') {
        gameRef.current.state = 'PAUSED';
        setGameState('PAUSED');
      }
    };

    // Check on load
    checkDeviceOrientation();

    // Listen to resize, orientationchange, and matchMedia query
    window.addEventListener('resize', checkDeviceOrientation);
    window.addEventListener('orientationchange', checkDeviceOrientation);

    const mql = window.matchMedia ? window.matchMedia('(orientation: landscape)') : null;
    const handleMql = () => checkDeviceOrientation();

    if (mql) {
      if (mql.addEventListener) {
        mql.addEventListener('change', handleMql);
      } else {
        (mql as unknown as { addListener: (cb: () => void) => void }).addListener(handleMql);
      }
    }

    return () => {
      window.removeEventListener('resize', checkDeviceOrientation);
      window.removeEventListener('orientationchange', checkDeviceOrientation);
      if (mql) {
        if (mql.removeEventListener) {
          mql.removeEventListener('change', handleMql);
        } else {
          (mql as unknown as { removeListener: (cb: () => void) => void }).removeListener(handleMql);
        }
      }
    };
  }, []);

  // Load High Score from Local Storage
  useEffect(() => {
    const saved = localStorage.getItem('ngd_local_high_score');
    if (saved) {
      setHighScore(parseInt(saved, 10) || 0);
    }
  }, []);

  // Track Fullscreen status
  useEffect(() => {
    const handleFsChange = () => {
      const isFs = Boolean(
        document.fullscreenElement || 
        ('webkitFullscreenElement' in document && (document as unknown as { webkitFullscreenElement: Element }).webkitFullscreenElement)
      );
      setIsFullscreen(isFs);
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  // 2. Force Full-Screen Mode API for mobile browsers
  const triggerFullscreen = useCallback(() => {
    try {
      const docEl = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
        mozRequestFullScreen?: () => Promise<void>;
        msRequestFullscreen?: () => Promise<void>;
      };
      const isAlreadyFs = Boolean(
        document.fullscreenElement || 
        ('webkitFullscreenElement' in document && (document as unknown as { webkitFullscreenElement: Element }).webkitFullscreenElement)
      );

      if (!isAlreadyFs) {
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen().catch(() => {});
        } else if (docEl.mozRequestFullScreen) {
          docEl.mozRequestFullScreen().catch(() => {});
        } else if (docEl.msRequestFullscreen) {
          docEl.msRequestFullscreen().catch(() => {});
        }
      }
    } catch {
      // browser permissions
    }
  }, []);

  const toggleFullscreen = useCallback((e?: React.MouseEvent | React.PointerEvent) => {
    if (e) e.stopPropagation();
    soundFx.playClick();
    try {
      const isFs = Boolean(
        document.fullscreenElement || 
        ('webkitFullscreenElement' in document && (document as unknown as { webkitFullscreenElement: Element }).webkitFullscreenElement)
      );
      if (!isFs) {
        triggerFullscreen();
      } else {
        const doc = document as Document & {
          webkitExitFullscreen?: () => Promise<void>;
        };
        if (doc.exitFullscreen) {
          doc.exitFullscreen().catch(() => {});
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen().catch(() => {});
        }
      }
    } catch {
      // safe
    }
  }, [triggerFullscreen]);

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

  // Initialize Background Parallax Visuals (Optimized count for mobile)
  useEffect(() => {
    const g = gameRef.current;
    // Stars (reduced count for mobile speed)
    g.stars = [];
    for (let i = 0; i < 28; i++) {
      g.stars.push({
        x: Math.random() * V_WIDTH,
        y: CEILING_Y + Math.random() * (FLOOR_Y - CEILING_Y),
        size: Math.random() * 1.5 + 1,
        speed: Math.random() * 0.25 + 0.1,
        alpha: Math.random() * 0.6 + 0.3,
      });
    }

    // Distant City Skyline
    g.citySilhouette = [];
    let curX = 0;
    while (curX < V_WIDTH * 2) {
      const bWidth = Math.floor(Math.random() * 35 + 30);
      const bHeight = Math.floor(Math.random() * 90 + 50);
      const windows: { x: number; y: number }[] = [];
      const rows = Math.floor(bHeight / 16);
      const cols = Math.floor(bWidth / 12);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() > 0.45) {
            windows.push({ x: c * 10 + 5, y: r * 14 + 6 });
          }
        }
      }
      g.citySilhouette.push({ x: curX, width: bWidth, height: bHeight, windows });
      curX += bWidth + 8;
    }

    // Parallax Speed lines (lean count)
    g.speedLines = [];
    for (let i = 0; i < 8; i++) {
      g.speedLines.push({
        x: Math.random() * V_WIDTH,
        y: CEILING_Y + 15 + Math.random() * (FLOOR_Y - CEILING_Y - 30),
        length: Math.random() * 50 + 25,
        speed: Math.random() * 1.4 + 1.1,
        alpha: Math.random() * 0.3 + 0.1,
      });
    }
  }, []);

  // Ref for debouncing rapid duplicate browser events (pointerdown + touchstart)
  const lastFlipTimeRef = useRef(0);

  // Snappy Gravity Flip Action Handler
  const flipGravity = useCallback(() => {
    const g = gameRef.current;
    if (g.state !== 'PLAYING') return;

    // Throttle against duplicate browser event dispatches (e.g., simultaneous pointerdown + touchstart or bubbled events)
    const now = performance.now();
    if (now - lastFlipTimeRef.current < 65) return;
    lastFlipTimeRef.current = now;

    // Flip direction
    const newDir: GravityDirection = g.gravityDir === 'DOWN' ? 'UP' : 'DOWN';
    g.gravityDir = newDir;
    g.player.targetRotation = newDir === 'UP' ? Math.PI : 0;

    // Snappy vertical impulse
    g.player.vy = newDir === 'UP' ? -680 : 680;
    g.player.isOnGround = false;
    g.player.isOnCeiling = false;

    // Launch squash & stretch
    g.player.scaleX = 0.75;
    g.player.scaleY = 1.35;

    // Fast sound
    soundFx.playFlip(newDir);

    // Shockwave ring
    const pColor = newDir === 'UP' ? '#ff007f' : '#00f0ff';
    g.shockwaves.push({
      x: g.player.x + PLAYER_SIZE / 2,
      y: g.player.y + PLAYER_SIZE / 2,
      r: 8,
      maxR: 55,
      color: pColor,
      alpha: 1,
    });

    // Mobile-optimized particle count (8 particles instead of 16)
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const speed = Math.random() * 140 + 80;
      g.particles.push({
        x: g.player.x + PLAYER_SIZE / 2,
        y: g.player.y + PLAYER_SIZE / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2.5,
        color: pColor,
        alpha: 1,
        decay: 4.0,
      });
    }
  }, []);

  // Helper to spawn coin formations
  const spawnCoinFormation = useCallback((startX: number) => {
    const g = gameRef.current;
    const formationType = Math.random();
    const count = 3;
    const spacing = 42;

    if (formationType < 0.45) {
      // Parabolic Arc across corridor
      const goingUp = Math.random() > 0.5;
      const startY = goingUp ? FLOOR_Y - 40 : CEILING_Y + 40;
      const endY = goingUp ? CEILING_Y + 40 : FLOOR_Y - 40;

      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const y = startY + (endY - startY) * t;
        g.coins.push({
          id: `coin-${Date.now()}-${i}`,
          x: startX + i * spacing,
          y,
          baseY: y,
          radius: 11,
          value: 100,
          spin: Math.random() * Math.PI,
          collected: false,
          floatPhase: i * 0.5,
        });
      }
    } else {
      // Straight line near ceiling or floor
      const nearCeiling = Math.random() > 0.5;
      const y = nearCeiling ? CEILING_Y + 38 : FLOOR_Y - 38;
      for (let i = 0; i < count; i++) {
        g.coins.push({
          id: `coin-${Date.now()}-${i}`,
          x: startX + i * spacing,
          y,
          baseY: y,
          radius: 11,
          value: 100,
          spin: Math.random() * Math.PI,
          collected: false,
          floatPhase: i * 0.5,
        });
      }
    }
  }, []);

  // Start / Restart Game
  const startGame = useCallback(() => {
    soundFx.playClick();
    triggerFullscreen();
    if (musicEnabled) {
      soundFx.startMusic();
    }
    const g = gameRef.current;
    g.state = 'PLAYING';
    g.distance = 0;
    g.score = 0;
    g.orbsCollected = 0;
    g.coinsCollected = 0;
    g.coinBonusScore = 0;
    g.combo = 1;
    g.lastCoinTimestamp = 0;
    g.speed = 360;
    g.gravityDir = 'DOWN';
    g.player = {
      x: 110,
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
    g.nextSpawnDistance = 200;
    g.nextCoinSpawnDistance = 140;
    g.shakeDuration = 0;

    // Reset direct DOM HUD elements
    if (scoreRef.current) scoreRef.current.textContent = '0';
    if (distanceRef.current) distanceRef.current.textContent = '0m';
    if (coinsRef.current) coinsRef.current.textContent = '0';
    if (comboRef.current) comboRef.current.textContent = '';

    setGameState('PLAYING');
    setIsNewHighScore(false);
    setScoreSubmitted(false);
    setMilestoneMessage(null);
  }, [musicEnabled, triggerFullscreen]);

  // Handle Game Over
  const triggerGameOver = useCallback((calculatedFinalScore: number, calculatedFinalDist: number) => {
    soundFx.playCrash();
    const g = gameRef.current;
    g.state = 'GAMEOVER';
    g.shakeDuration = 0.35;
    g.shakeIntensity = 14;

    // Lean particle count for mobile
    for (let i = 0; i < 24; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 260 + 50;
      g.particles.push({
        x: g.player.x + PLAYER_SIZE / 2,
        y: g.player.y + PLAYER_SIZE / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 3 + 2,
        color: Math.random() > 0.5 ? '#ff007f' : (Math.random() > 0.5 ? '#00f0ff' : '#ffe600'),
        alpha: 1,
        decay: Math.random() * 1.5 + 1.0,
      });
    }

    setGameState('GAMEOVER');
    setFinalScore(calculatedFinalScore);
    setFinalDistance(calculatedFinalDist);
    setFinalCoins(g.coinsCollected);

    // Call fetchLeaderboard() as soon as the Game Over screen appears
    loadLeaderboard();

    // Check high score
    const currentHigh = parseInt(localStorage.getItem('ngd_local_high_score') || '0', 10);
    if (calculatedFinalScore > currentHigh) {
      localStorage.setItem('ngd_local_high_score', calculatedFinalScore.toString());
      setHighScore(calculatedFinalScore);
      setIsNewHighScore(true);
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#00f0ff', '#ff007f', '#ffe600']
        });
      } catch {
        // safe fallback
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

  // Keyboard controls for desktop
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

  // 1. ABSOLUTE TOUCH & CLICK EVENT FIX FOR GRAVITY FLIP
  // Global window/document-level pointerdown and touchstart listener: window.addEventListener('pointerdown', (e) => { if(gameStarted && !isGameOver) { flipGravity(); e.preventDefault(); } });
  useEffect(() => {
    const handleGlobalPointerOrTouch = (e: PointerEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      // Do not block interactive UI buttons, inputs, form submissions, or links
      if (target && (target.closest('button') || target.closest('input') || target.closest('form') || target.closest('a') || target.closest('[data-no-flip]'))) {
        return;
      }

      const gameStarted = gameRef.current.state === 'PLAYING';
      const isGameOver = gameRef.current.state === 'GAMEOVER';

      if (musicEnabled) {
        soundFx.startMusic();
      }

      if (gameStarted && !isGameOver) {
        flipGravity();
        if (e.cancelable) e.preventDefault();
      } else if (gameRef.current.state === 'MENU') {
        triggerFullscreen();
        startGame();
        if (e.cancelable) e.preventDefault();
      }
    };

    // Attach to global window
    window.addEventListener('pointerdown', handleGlobalPointerOrTouch, { passive: false });
    window.addEventListener('touchstart', handleGlobalPointerOrTouch, { passive: false });

    // Also attach to canvas for immediate local hit-testing
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('pointerdown', handleGlobalPointerOrTouch, { passive: false });
      canvas.addEventListener('touchstart', handleGlobalPointerOrTouch, { passive: false });
    }

    return () => {
      window.removeEventListener('pointerdown', handleGlobalPointerOrTouch);
      window.removeEventListener('touchstart', handleGlobalPointerOrTouch);
      if (canvas) {
        canvas.removeEventListener('pointerdown', handleGlobalPointerOrTouch);
        canvas.removeEventListener('touchstart', handleGlobalPointerOrTouch);
      }
    };
  }, [flipGravity, startGame, musicEnabled, triggerFullscreen]);

  // 2. MAIN 60FPS ENGINE LOOP (NO EXPENSIVE SHADOW BLURS, DIRECT DOM HUD REFS)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); // alpha: false for faster mobile GPU pipeline
    if (!ctx) return;

    let animId: number;
    let hudTimer = 0;

    const render = (timestamp: number) => {
      const g = gameRef.current;
      if (!g.lastTime) g.lastTime = timestamp;
      const dt = Math.min((timestamp - g.lastTime) / 1000, 0.1);
      g.lastTime = timestamp;

      // UPDATE LOGIC (only when PLAYING)
      if (g.state === 'PLAYING') {
        // Progress distance & speed curve
        g.distance += (g.speed * dt) * 0.12;
        g.speed = g.baseSpeed + Math.min(380, g.distance * 0.13);

        const currentScore = Math.floor(g.distance) + (g.orbsCollected * 150) + g.coinBonusScore;
        g.score = currentScore;

        // Throttled HUD DOM updates (10 updates/sec instead of 60 virtual DOM React re-renders)
        hudTimer += dt;
        if (hudTimer >= 0.08) {
          hudTimer = 0;
          if (scoreRef.current) scoreRef.current.textContent = String(currentScore);
          if (distanceRef.current) distanceRef.current.textContent = `${Math.floor(g.distance)}m`;
          if (coinsRef.current) coinsRef.current.textContent = String(g.coinsCollected);
          if (comboRef.current) {
            comboRef.current.textContent = g.combo > 1 ? `x${g.combo}` : '';
          }
        }

        // Combo decay (2.2s window)
        if (g.combo > 1 && timestamp - g.lastCoinTimestamp > 2200) {
          g.combo = 1;
          if (comboRef.current) comboRef.current.textContent = '';
        }

        // Milestone alerts (every 500m)
        const currentMilestone = Math.floor(g.distance / 500) * 500;
        if (currentMilestone > 0 && currentMilestone !== g.lastMilestone) {
          g.lastMilestone = currentMilestone;
          soundFx.playScoreMilestone();
          setMilestoneMessage(`SPEED BOOST // ${currentMilestone}m REACHED`);
          setTimeout(() => setMilestoneMessage(null), 2200);
        }

        // Screen shake decay
        if (g.shakeDuration > 0) {
          g.shakeDuration -= dt;
        }

        // Grid parallax shift
        g.gridOffset = (g.gridOffset + g.speed * dt) % 35;

        // Player physics
        const accel = g.gravityDir === 'DOWN' ? g.gravity : -g.gravity;
        g.player.vy += accel * dt;
        g.player.vy = Math.max(-1050, Math.min(1050, g.player.vy));
        g.player.y += g.player.vy * dt;

        // Rotation & squash decay
        const rotDiff = g.player.targetRotation - g.player.rotation;
        g.player.rotation += rotDiff * Math.min(1, dt * 32);
        g.player.scaleX += (1 - g.player.scaleX) * Math.min(1, dt * 16);
        g.player.scaleY += (1 - g.player.scaleY) * Math.min(1, dt * 16);

        // Ceiling collision
        if (g.player.y <= CEILING_Y) {
          g.player.y = CEILING_Y;
          if (g.gravityDir === 'UP') {
            if (Math.abs(g.player.vy) > 250) {
              g.player.scaleX = 1.3;
              g.player.scaleY = 0.7;
            }
            g.player.vy = 0;
            g.player.isOnCeiling = true;
          }
        } else {
          g.player.isOnCeiling = false;
        }

        // Floor collision
        if (g.player.y >= FLOOR_Y - g.player.height) {
          g.player.y = FLOOR_Y - g.player.height;
          if (g.gravityDir === 'DOWN') {
            if (Math.abs(g.player.vy) > 250) {
              g.player.scaleX = 1.3;
              g.player.scaleY = 0.7;
            }
            g.player.vy = 0;
            g.player.isOnGround = true;
          }
        } else {
          g.player.isOnGround = false;
        }

        // Trail particles (lean spawn rate for 60fps mobile)
        if (Math.random() > 0.3) {
          const trailColor = g.gravityDir === 'UP' ? '#ff007f' : '#00f0ff';
          g.particles.push({
            x: g.player.x + 2,
            y: g.player.y + (g.gravityDir === 'UP' ? 4 : g.player.height - 4),
            vx: -Math.random() * 90 - 40,
            vy: (Math.random() - 0.5) * 20,
            size: 2.2,
            color: trailColor,
            alpha: 0.8,
            decay: 3.5,
          });
        }

        // Obstacles Spawning
        g.spawnTimer += g.speed * dt;
        if (g.spawnTimer >= g.nextSpawnDistance) {
          g.spawnTimer = 0;
          g.nextSpawnDistance = Math.floor(Math.random() * 100 + 240 - Math.min(70, g.distance * 0.03));

          const roll = Math.random();
          const id = 'obs-' + Date.now();

          if (roll < 0.42) {
            // Floor Spike / Barrier
            const isSpike = Math.random() > 0.4;
            const h = Math.random() * 32 + 30;
            g.obstacles.push({
              id,
              x: V_WIDTH + 15,
              y: FLOOR_Y - h,
              width: isSpike ? 28 : 22,
              height: h,
              attachment: 'FLOOR',
              color: '#00f0ff',
              type: isSpike ? 'SPIKE' : 'BARRIER',
              passed: false,
            });
          } else if (roll < 0.78) {
            // Ceiling Spike / Barrier
            const isSpike = Math.random() > 0.4;
            const h = Math.random() * 32 + 30;
            g.obstacles.push({
              id,
              x: V_WIDTH + 15,
              y: CEILING_Y,
              width: isSpike ? 28 : 22,
              height: h,
              attachment: 'CEILING',
              color: '#ff007f',
              type: isSpike ? 'SPIKE' : 'BARRIER',
              passed: false,
            });
          } else if (roll < 0.9) {
            // Energy Crystal Orb
            const orbY = CEILING_Y + 50 + Math.random() * (FLOOR_Y - CEILING_Y - 100);
            g.obstacles.push({
              id,
              x: V_WIDTH + 15,
              y: orbY,
              width: 20,
              height: 20,
              attachment: 'FLOATING',
              color: '#ffe600',
              type: 'ORB',
              passed: false,
              pulsePhase: 0,
            });
          } else {
            // Laser hazard
            const isUpper = Math.random() > 0.5;
            g.obstacles.push({
              id,
              x: V_WIDTH + 15,
              y: isUpper ? CEILING_Y : FLOOR_Y - 45,
              width: 26,
              height: 45,
              attachment: isUpper ? 'CEILING' : 'FLOOR',
              color: isUpper ? '#ff007f' : '#00f0ff',
              type: 'LASER',
              passed: false,
              pulsePhase: 0,
            });
          }
        }

        // Coins Spawning
        g.coinSpawnTimer += g.speed * dt;
        if (g.coinSpawnTimer >= g.nextCoinSpawnDistance) {
          g.coinSpawnTimer = 0;
          g.nextCoinSpawnDistance = Math.floor(Math.random() * 120 + 180);
          spawnCoinFormation(V_WIDTH + 30);
        }

        // Coins Update & Collision
        const pCenterX = g.player.x + PLAYER_SIZE / 2;
        const pCenterY = g.player.y + PLAYER_SIZE / 2;

        for (let i = g.coins.length - 1; i >= 0; i--) {
          const coin = g.coins[i];
          coin.x -= g.speed * dt;
          coin.spin += dt * 5;
          coin.floatPhase += dt * 3.5;
          coin.y = coin.baseY + Math.sin(coin.floatPhase) * 5;

          // Magnet pull
          const dx = pCenterX - coin.x;
          const dy = pCenterY - coin.y;
          const distToPlayer = Math.hypot(dx, dy);

          if (distToPlayer < 65 && !coin.collected) {
            coin.x += dx * dt * 8;
            coin.y += dy * dt * 8;
          }

          if (coin.x < -30) {
            g.coins.splice(i, 1);
            continue;
          }

          if (!coin.collected && distToPlayer < (PLAYER_SIZE / 2 + coin.radius + 5)) {
            coin.collected = true;
            g.coinsCollected += 1;

            if (timestamp - g.lastCoinTimestamp < 2200) {
              g.combo = Math.min(5, g.combo + 1);
            } else {
              g.combo = 1;
            }
            g.lastCoinTimestamp = timestamp;

            const earnedPoints = coin.value * g.combo;
            g.coinBonusScore += earnedPoints;

            soundFx.playCoinCollect(g.combo);

            g.floatingTexts.push({
              id: 'ft-' + Date.now() + Math.random(),
              x: coin.x,
              y: coin.y - 8,
              vy: -60,
              text: g.combo > 1 ? `+${earnedPoints} x${g.combo}` : `+${earnedPoints}`,
              color: g.combo > 1 ? '#ff007f' : '#ffe600',
              alpha: 1,
            });

            // Lean particle burst (6 sparks)
            for (let p = 0; p < 6; p++) {
              const ang = (Math.PI * 2 * p) / 6;
              const spd = Math.random() * 110 + 60;
              g.particles.push({
                x: coin.x,
                y: coin.y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                size: 2.5,
                color: '#ffe600',
                alpha: 1,
                decay: 4.0,
              });
            }

            g.coins.splice(i, 1);
          }
        }

        // Floating texts update
        for (let i = g.floatingTexts.length - 1; i >= 0; i--) {
          const ft = g.floatingTexts[i];
          ft.y += ft.vy * dt;
          ft.alpha -= dt * 1.5;
          if (ft.alpha <= 0) {
            g.floatingTexts.splice(i, 1);
          }
        }

        // Shockwaves update
        for (let i = g.shockwaves.length - 1; i >= 0; i--) {
          const sw = g.shockwaves[i];
          sw.r += (sw.maxR - sw.r) * dt * 14;
          sw.alpha -= dt * 2.8;
          if (sw.alpha <= 0) {
            g.shockwaves.splice(i, 1);
          }
        }

        // Obstacles collision
        for (let i = g.obstacles.length - 1; i >= 0; i--) {
          const obs = g.obstacles[i];
          obs.x -= g.speed * dt;

          if (obs.pulsePhase !== undefined) {
            obs.pulsePhase += dt * 6;
          }

          if (obs.x + obs.width < -40) {
            g.obstacles.splice(i, 1);
            continue;
          }

          if (obs.type === 'ORB') {
            if (!obs.collected) {
              const odx = pCenterX - (obs.x + obs.width / 2);
              const ody = pCenterY - (obs.y + obs.height / 2);
              const dist = Math.hypot(odx, ody);

              if (dist < PLAYER_SIZE / 2 + obs.width / 2) {
                obs.collected = true;
                g.orbsCollected += 1;
                soundFx.playOrbCollect();

                g.floatingTexts.push({
                  id: 'ft-orb-' + Date.now(),
                  x: obs.x,
                  y: obs.y - 10,
                  vy: -60,
                  text: '+150',
                  color: '#00f0ff',
                  alpha: 1,
                });

                g.obstacles.splice(i, 1);
                continue;
              }
            }
          } else {
            // Collision detection with hazards
            const pBox = {
              left: g.player.x + 4,
              right: g.player.x + PLAYER_SIZE - 4,
              top: g.player.y + 4,
              bottom: g.player.y + PLAYER_SIZE - 4,
            };

            const oBox = {
              left: obs.x + 2,
              right: obs.x + obs.width - 2,
              top: obs.y + (obs.attachment === 'CEILING' ? 0 : 2),
              bottom: obs.y + obs.height - (obs.attachment === 'FLOOR' ? 0 : 2),
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

      // Update particles
      for (let i = g.particles.length - 1; i >= 0; i--) {
        const p = g.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha -= p.decay * dt;
        if (p.alpha <= 0) {
          g.particles.splice(i, 1);
        }
      }

      // Update background elements
      const bgSpeed = g.state === 'PLAYING' ? g.speed : 90;
      g.stars.forEach((s) => {
        s.x -= bgSpeed * dt * s.speed;
        if (s.x < 0) s.x = V_WIDTH;
      });

      g.speedLines.forEach((l) => {
        l.x -= bgSpeed * dt * l.speed;
        if (l.x + l.length < 0) {
          l.x = V_WIDTH + Math.random() * 80;
          l.y = CEILING_Y + 15 + Math.random() * (FLOOR_Y - CEILING_Y - 30);
        }
      });

      g.citySilhouette.forEach((b) => {
        b.x -= bgSpeed * dt * 0.16;
      });
      if (g.citySilhouette[0] && g.citySilhouette[0].x + g.citySilhouette[0].width < -30) {
        const first = g.citySilhouette.shift()!;
        const last = g.citySilhouette[g.citySilhouette.length - 1];
        first.x = last ? last.x + last.width + 8 : V_WIDTH;
        g.citySilhouette.push(first);
      }

      // ==================== FAST RENDER PIPELINE (ZERO SHADOWS/BLURS) ====================
      ctx.save();

      // Screen shake translation
      if (g.shakeDuration > 0) {
        const currentShake = (g.shakeDuration / 0.35) * g.shakeIntensity;
        ctx.translate(
          (Math.random() - 0.5) * currentShake,
          (Math.random() - 0.5) * currentShake
        );
      }

      // 1. Deep Space Gradient Background
      const skyGrad = ctx.createLinearGradient(0, 0, 0, V_HEIGHT);
      skyGrad.addColorStop(0, '#090216');
      skyGrad.addColorStop(0.5, '#1e0836');
      skyGrad.addColorStop(1, '#0c031d');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

      // 2. Stars (Fast direct fill)
      ctx.fillStyle = '#ffffff';
      g.stars.forEach((s) => {
        ctx.fillRect(s.x, s.y, s.size, s.size);
      });

      // 3. Synthwave Sun (Fast gradient fill, zero shadowBlur)
      const sunX = V_WIDTH / 2;
      const sunY = (CEILING_Y + FLOOR_Y) / 2 + 8;
      const sunR = 70;

      const sunBody = ctx.createLinearGradient(sunX, sunY - sunR, sunX, sunY + sunR);
      sunBody.addColorStop(0, '#ffe600');
      sunBody.addColorStop(0.5, '#ff007f');
      sunBody.addColorStop(1, '#660080');
      ctx.fillStyle = sunBody;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
      ctx.fill();

      // Horizontal blind cutouts
      ctx.fillStyle = '#1e0836';
      const blindsCount = 5;
      for (let b = 1; b <= blindsCount; b++) {
        const bY = sunY + (b * (sunR / (blindsCount + 1)));
        ctx.fillRect(sunX - sunR, bY, sunR * 2, b * 1.3);
      }

      // 4. Distant City Skyline Silhouettes
      ctx.fillStyle = '#0f051c';
      g.citySilhouette.forEach((b) => {
        ctx.fillRect(b.x, FLOOR_Y - b.height * 0.55, b.width, b.height * 0.55);
      });

      // 5. Parallax Speed lines (Crisp solid lines)
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      g.speedLines.forEach((l) => {
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(l.x + l.length, l.y);
      });
      ctx.stroke();

      // 6. Floor & Ceiling Grids (Fast solid colors, zero shadow blur)
      // Floor Base
      ctx.fillStyle = '#070110';
      ctx.fillRect(0, FLOOR_Y, V_WIDTH, V_HEIGHT - FLOOR_Y);
      // Floor Border Line
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, FLOOR_Y);
      ctx.lineTo(V_WIDTH, FLOOR_Y);
      ctx.stroke();

      // Floor vertical running perspective lines
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const fLineStep = 32;
      for (let x = -g.gridOffset; x < V_WIDTH + 60; x += fLineStep) {
        ctx.moveTo(x, FLOOR_Y);
        ctx.lineTo(x + 20, V_HEIGHT);
      }
      // Floor horizontal depth lines
      for (let h = 1; h <= 3; h++) {
        const hy = FLOOR_Y + h * 16;
        ctx.moveTo(0, hy);
        ctx.lineTo(V_WIDTH, hy);
      }
      ctx.stroke();

      // Ceiling Base
      ctx.fillStyle = '#070110';
      ctx.fillRect(0, 0, V_WIDTH, CEILING_Y);
      // Ceiling Border Line
      ctx.strokeStyle = '#ff007f';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, CEILING_Y);
      ctx.lineTo(V_WIDTH, CEILING_Y);
      ctx.stroke();

      // Ceiling vertical running lines
      ctx.strokeStyle = 'rgba(255, 0, 128, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -g.gridOffset; x < V_WIDTH + 60; x += fLineStep) {
        ctx.moveTo(x, CEILING_Y);
        ctx.lineTo(x + 20, 0);
      }
      for (let h = 1; h <= 2; h++) {
        const hy = CEILING_Y - h * 16;
        ctx.moveTo(0, hy);
        ctx.lineTo(V_WIDTH, hy);
      }
      ctx.stroke();

      // 7. Shockwaves (Solid crisp rings)
      g.shockwaves.forEach((sw) => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, sw.alpha);
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });

      // 8. Floating Collectible Coins (Zero shadowBlur, fast 2D geometry)
      g.coins.forEach((coin) => {
        ctx.save();
        ctx.translate(coin.x, coin.y);
        ctx.scale(Math.cos(coin.spin), 1);

        // Outer rim
        ctx.fillStyle = '#ffaa00';
        ctx.beginPath();
        ctx.arc(0, 0, coin.radius, 0, Math.PI * 2);
        ctx.fill();

        // Inner face
        ctx.fillStyle = '#ffe600';
        ctx.beginPath();
        ctx.arc(0, 0, coin.radius * 0.78, 0, Math.PI * 2);
        ctx.fill();

        // Stamped center star
        ctx.fillStyle = '#7a3e00';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✦', 0, 1);

        ctx.restore();
      });

      // 9. Obstacles & Hazards (Crisp solid shapes)
      g.obstacles.forEach((obs) => {
        if (obs.type === 'SPIKE') {
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

          // Highlight edge
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        } else if (obs.type === 'BARRIER') {
          ctx.fillStyle = '#110526';
          ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

          ctx.strokeStyle = obs.color;
          ctx.lineWidth = 2;
          ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);

          const phase = (obs.pulsePhase || 0) % (obs.height - 8);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(obs.x + 2, obs.y + phase, obs.width - 4, 3);
        } else if (obs.type === 'LASER') {
          ctx.fillStyle = obs.color;
          ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
        } else if (obs.type === 'ORB') {
          ctx.save();
          const cx = obs.x + obs.width / 2;
          const cy = obs.y + obs.height / 2;
          ctx.translate(cx, cy);
          ctx.rotate(obs.pulsePhase ? obs.pulsePhase * 0.8 : 0);

          const r = obs.width / 2;
          ctx.fillStyle = '#ffe600';
          ctx.beginPath();
          ctx.moveTo(0, -r);
          ctx.lineTo(r, 0);
          ctx.moveTo(0, r);
          ctx.lineTo(-r, 0);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-2.5, -2.5, 5, 5);
          ctx.restore();
        }
      });

      // 10. Particles (Fast direct rects)
      g.particles.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        ctx.restore();
      });

      // 11. Floating Score Texts
      g.floatingTexts.forEach((ft) => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, ft.alpha);
        ctx.font = 'bold 13px "Chakra Petch", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      });

      // 12. Player Runner (Crisp polygon, no shadow blur)
      if (g.state !== 'GAMEOVER') {
        ctx.save();
        const pcX = g.player.x + PLAYER_SIZE / 2;
        const pcY = g.player.y + PLAYER_SIZE / 2;
        ctx.translate(pcX, pcY);
        ctx.rotate(g.player.rotation);
        ctx.scale(g.player.scaleX, g.player.scaleY);

        const isCeil = g.gravityDir === 'UP';
        const primaryColor = isCeil ? '#ff007f' : '#00f0ff';
        const secondaryColor = isCeil ? '#ffe600' : '#ff007f';

        // Ship Body
        ctx.beginPath();
        ctx.moveTo(PLAYER_SIZE * 0.48, 0);
        ctx.lineTo(-PLAYER_SIZE * 0.44, -PLAYER_SIZE * 0.42);
        ctx.lineTo(-PLAYER_SIZE * 0.22, 0);
        ctx.lineTo(-PLAYER_SIZE * 0.44, PLAYER_SIZE * 0.42);
        ctx.closePath();

        ctx.fillStyle = '#120526';
        ctx.fill();

        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 2.2;
        ctx.stroke();

        // Inner glowing core
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-2, -2, 4, 4);

        // Thruster flame
        ctx.fillStyle = secondaryColor;
        ctx.beginPath();
        ctx.moveTo(-PLAYER_SIZE * 0.22, -PLAYER_SIZE * 0.15);
        ctx.lineTo(-PLAYER_SIZE * 0.22 - (Math.random() * 10 + 8), 0);
        ctx.lineTo(-PLAYER_SIZE * 0.22, PLAYER_SIZE * 0.15);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }

      ctx.restore(); // Restore shake

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [triggerGameOver, spawnCoinFormation]);

  // High score submission
  const handleScoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    localStorage.setItem('ngd_player_name', playerName.trim());

    try {
      await saveHighScore(playerName, finalScore, finalDistance);
      setScoreSubmitted(true);
      await loadLeaderboard();
    } catch (err) {
      console.error('Failed to submit score:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-black text-slate-100 select-none touch-none">
      {/* Optional CRT scanline overlay (off by default for top mobile performance) */}
      {scanlines && <div className="absolute inset-0 crt-scanlines z-20 pointer-events-none opacity-60" />}

      {/* 1. True Full-Screen Responsive HTML5 Canvas (100vw x 100vh with object-cover) */}
      <canvas
        ref={canvasRef}
        width={V_WIDTH}
        height={V_HEIGHT}
        className="absolute inset-0 w-full h-full object-cover block touch-none cursor-pointer"
      />

      {/* Floating Milestone Banner */}
      {milestoneMessage && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 px-4 py-1 rounded-full bg-gradient-to-r from-pink-600 via-purple-600 to-cyan-500 text-white font-arcade text-xs tracking-wider font-bold shadow-[0_0_20px_rgba(255,0,128,0.5)] animate-bounce pointer-events-none">
          {milestoneMessage}
        </div>
      )}

      {/* ==================== FLOATING TOP-LEFT HUD (Non-blocking for thumb controls) ==================== */}
      {gameState !== 'MENU' && (
        <div 
          className="absolute top-2 left-2 sm:top-3 sm:left-3 z-30 flex items-center gap-2 sm:gap-3 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-[#090216]/80 backdrop-blur-md border border-purple-800/50 shadow-[0_4px_20px_rgba(0,0,0,0.6)] font-mono-num pointer-events-none"
        >
          {/* Score */}
          <div className="flex flex-col">
            <span className="text-[8px] sm:text-[9px] text-cyan-400 font-arcade tracking-wider leading-none">SCORE</span>
            <span ref={scoreRef} className="font-bold text-cyan-300 text-xs sm:text-sm leading-tight">0</span>
          </div>

          <div className="w-[1px] h-5 bg-purple-800/60" />

          {/* Distance */}
          <div className="flex flex-col">
            <span className="text-[8px] sm:text-[9px] text-pink-400 font-arcade tracking-wider leading-none">DIST</span>
            <span ref={distanceRef} className="font-semibold text-pink-300 text-xs sm:text-sm leading-tight">0m</span>
          </div>

          <div className="w-[1px] h-5 bg-purple-800/60" />

          {/* Coins & Combo */}
          <div className="flex flex-col">
            <span className="text-[8px] sm:text-[9px] text-yellow-400 font-arcade tracking-wider leading-none flex items-center gap-0.5">
              <Coins className="w-2.5 h-2.5 text-yellow-400" />
              <span>COINS</span>
            </span>
            <div className="flex items-center gap-1 font-bold text-yellow-300 text-xs sm:text-sm leading-tight">
              <span ref={coinsRef}>0</span>
              <span ref={comboRef} className="text-[9px] text-pink-400 font-bold" />
            </div>
          </div>
        </div>
      )}

      {/* ==================== FLOATING TOP-RIGHT COMPACT CONTROLS ==================== */}
      <div 
        className="absolute top-2 right-2 sm:top-3 sm:right-3 z-30 flex items-center gap-1 sm:gap-1.5"
      >
        {/* Pause Button (Only while playing) */}
        {gameState === 'PLAYING' && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              togglePause();
            }}
            title="Pause Game (P)"
            className="p-1.5 sm:p-2 rounded-lg bg-[#090216]/80 backdrop-blur-md border border-purple-800/50 hover:border-cyan-400/60 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Leaderboard Button */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            soundFx.playClick();
            loadLeaderboard();
            setShowLeaderboard(true);
          }}
          title="Rankings"
          className="p-1.5 sm:p-2 sm:px-2.5 rounded-lg bg-[#090216]/80 backdrop-blur-md border border-pink-700/50 hover:border-pink-500 text-pink-300 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
        >
          <Trophy className="w-3.5 h-3.5 text-yellow-400" />
          <span className="hidden md:inline font-arcade text-[10px]">Rankings</span>
        </button>

        {/* Sound FX Toggle */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setSoundEnabled(!soundEnabled);
            soundFx.playClick();
          }}
          title={soundEnabled ? 'Mute Sound' : 'Unmute Sound'}
          className="p-1.5 sm:p-2 rounded-lg bg-[#090216]/80 backdrop-blur-md border border-purple-800/50 text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-cyan-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
        </button>

        {/* Cyberpunk BGM Toggle */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setMusicEnabled(!musicEnabled);
            soundFx.playClick();
          }}
          title={musicEnabled ? 'Mute BGM' : 'Unmute BGM'}
          className={`p-1.5 sm:p-2 rounded-lg border backdrop-blur-md transition-all cursor-pointer flex items-center gap-1 ${
            musicEnabled 
              ? 'bg-pink-950/70 border-pink-500 text-pink-300 shadow-[0_0_10px_rgba(255,0,128,0.3)]' 
              : 'bg-[#090216]/80 border-purple-800/50 text-slate-500 hover:text-slate-300'
          }`}
        >
          <Music className={`w-3.5 h-3.5 ${musicEnabled ? 'animate-pulse text-pink-400' : ''}`} />
          <span className="hidden lg:inline text-[9px] font-arcade font-bold">
            {musicEnabled ? 'BGM' : 'OFF'}
          </span>
        </button>

        {/* Fullscreen Mode Toggle Button */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          className="p-1.5 sm:p-2 rounded-lg bg-[#090216]/80 backdrop-blur-md border border-purple-800/50 hover:border-cyan-400/60 text-slate-300 hover:text-cyan-300 transition-colors cursor-pointer"
        >
          {isFullscreen ? <Minimize className="w-3.5 h-3.5 text-cyan-400" /> : <Maximize className="w-3.5 h-3.5 text-slate-300" />}
        </button>
      </div>

      {/* ==================== TITLE / START MENU OVERLAY ==================== */}
      {gameState === 'MENU' && (
        <div 
          onPointerDown={(e) => {
            const target = e.target as HTMLElement | null;
            if (target && (target.closest('button') || target.closest('a'))) return;
            e.preventDefault();
            triggerFullscreen();
            startGame();
          }}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm p-4 text-center cursor-pointer select-none"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-cyan-500/40 bg-cyan-950/50 text-cyan-300 text-[10px] sm:text-xs font-arcade tracking-widest mb-3 shadow-[0_0_15px_rgba(0,240,255,0.25)]">
            <Flame className="w-3.5 h-3.5 text-pink-400 animate-pulse" />
            <span>100% FULLSCREEN RETRO ENDLESS RUNNER</span>
          </div>

          <h2 className="text-3xl sm:text-5xl md:text-6xl font-extrabold font-arcade tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-pink-400 to-yellow-300 mb-2 drop-shadow-[0_0_20px_rgba(255,0,128,0.4)]">
            NEON GRAVITY DASH
          </h2>

          <p className="max-w-md text-xs sm:text-sm text-slate-300 leading-relaxed font-arcade mb-5 px-2">
            Tap anywhere to flip gravity instantly! Collect golden coins, dodge floor & ceiling laser spikes, and survive at hyper speed.
          </p>

          {/* Start Run button */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                triggerFullscreen();
                startGame();
              }}
              className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-pink-600 via-purple-600 to-cyan-500 hover:from-pink-500 hover:to-cyan-400 text-white font-arcade font-bold tracking-wider text-sm sm:text-base shadow-[0_0_25px_rgba(255,0,128,0.4)] hover:scale-105 active:scale-95 transition-all flex items-center gap-2.5 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current text-white" />
              <span>START RUN</span>
            </button>

            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                soundFx.playClick();
                loadLeaderboard();
                setShowLeaderboard(true);
              }}
              className="px-5 py-3 rounded-2xl bg-purple-950/70 hover:bg-purple-900/80 border border-purple-700/60 text-slate-200 font-arcade text-xs sm:text-sm tracking-wide transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Trophy className="w-4 h-4 text-yellow-400" />
              <span>LEADERBOARD</span>
            </button>
          </div>

          {highScore > 0 && (
            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 border border-purple-800/40 text-yellow-400 font-mono-num text-xs">
              <Trophy className="w-3 h-3" />
              <span>PERSONAL BEST: {highScore} PTS</span>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3 text-[10px] text-slate-400 font-arcade">
            <span>📱 TAP ANYWHERE TO FLIP GRAVITY</span>
            <span>·</span>
            <span>⌨️ SPACE / UP ARROW</span>
          </div>
        </div>
      )}

      {/* ==================== PAUSED OVERLAY ==================== */}
      {gameState === 'PAUSED' && (
        <div 
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-4 text-center"
        >
          <h3 className="text-2xl sm:text-4xl font-arcade font-bold text-yellow-400 tracking-wider mb-4 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]">
            SYSTEM PAUSED
          </h3>
          <div className="flex items-center gap-3">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                togglePause();
              }}
              className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-arcade text-xs sm:text-sm font-semibold tracking-wider transition-colors cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.4)]"
            >
              RESUME
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                triggerFullscreen();
                startGame();
              }}
              className="px-6 py-2.5 rounded-xl bg-purple-950 hover:bg-purple-900 border border-purple-700 text-slate-200 font-arcade text-xs sm:text-sm transition-colors cursor-pointer"
            >
              RESTART
            </button>
          </div>
        </div>
      )}

      {/* ==================== GAME OVER SCREEN ==================== */}
      {gameState === 'GAMEOVER' && (
        <div 
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute inset-0 z-20 flex flex-col bg-black/85 backdrop-blur-md p-3 sm:p-5 text-center overflow-y-auto"
        >
          {/* Header strip */}
          <div className="flex items-center justify-between w-full max-w-4xl mx-auto pb-2 mb-2 border-b border-purple-900/60">
            <div className="flex items-center gap-1 text-pink-500 font-arcade text-[10px] sm:text-xs uppercase">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>NEURAL LINK TERMINATED</span>
            </div>
            <h3 className="text-xl sm:text-3xl font-extrabold font-arcade tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-pink-500 to-yellow-400">
              GAME OVER
            </h3>
            <div className="text-[10px] sm:text-xs text-cyan-400 font-arcade">
              <span>GLOBAL HALL OF FAME</span>
            </div>
          </div>

          {isNewHighScore && (
            <div className="mb-2 self-center px-4 py-1 rounded-full bg-yellow-500/20 border border-yellow-400/60 text-yellow-300 font-arcade text-xs tracking-wider animate-pulse flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-yellow-400" />
              <span>NEW PERSONAL RECORD ACHIEVED!</span>
            </div>
          )}

          {/* Game Over Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 w-full max-w-4xl mx-auto flex-1 items-stretch my-auto">
            {/* Left Column: Player Stats & Actions */}
            <div className="md:col-span-5 flex flex-col items-center justify-center p-3 rounded-2xl bg-purple-950/40 border border-purple-800/50 backdrop-blur-sm">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 w-full mb-3 font-mono-num">
                <div className="p-2 rounded-xl bg-black/70 border border-purple-800/50 flex flex-col items-center">
                  <span className="text-[9px] text-cyan-400 font-arcade tracking-wider">SCORE</span>
                  <span className="text-base sm:text-lg font-bold text-cyan-300">{finalScore}</span>
                </div>
                <div className="p-2 rounded-xl bg-black/70 border border-purple-800/50 flex flex-col items-center">
                  <span className="text-[9px] text-pink-400 font-arcade tracking-wider">DIST</span>
                  <span className="text-base sm:text-lg font-bold text-pink-400">{finalDistance}m</span>
                </div>
                <div className="p-2 rounded-xl bg-black/70 border border-purple-800/50 flex flex-col items-center">
                  <span className="text-[9px] text-yellow-400 font-arcade tracking-wider">COINS</span>
                  <span className="text-base sm:text-lg font-bold text-yellow-300">{finalCoins}</span>
                </div>
              </div>

              {/* Play Again */}
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerFullscreen();
                  startGame();
                }}
                className="w-full py-3 px-4 mb-3 rounded-xl bg-gradient-to-r from-pink-600 to-cyan-600 hover:from-pink-500 hover:to-cyan-500 text-white font-arcade font-bold tracking-wider text-xs sm:text-sm shadow-[0_0_20px_rgba(0,240,255,0.3)] flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                <span>PLAY AGAIN</span>
              </button>

              {/* Submit Callsign */}
              {!scoreSubmitted ? (
                <form 
                  onSubmit={handleScoreSubmit}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="w-full p-2.5 rounded-xl bg-black/60 border border-purple-800/60 flex flex-col gap-2"
                >
                  <label className="text-[10px] text-slate-300 font-arcade text-left flex items-center justify-between">
                    <span>SAVE YOUR CALLSIGN:</span>
                    <span className="text-cyan-400 text-[9px]">GLOBAL RANK</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={12}
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value.toUpperCase())}
                      placeholder="CALLSIGN"
                      className="flex-1 px-3 py-1.5 rounded-lg bg-black/80 border border-purple-700/60 text-cyan-300 font-arcade text-xs uppercase placeholder:text-slate-600 focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      type="submit"
                      disabled={isSubmitting || !playerName.trim()}
                      className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-arcade text-xs font-semibold cursor-pointer whitespace-nowrap shadow-[0_0_10px_rgba(0,240,255,0.3)]"
                    >
                      {isSubmitting ? 'SAVING...' : 'SAVE'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="w-full p-2 rounded-xl bg-emerald-950/50 border border-emerald-500/60 flex items-center justify-center gap-1.5 text-xs font-arcade text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>CALLSIGN SAVED TO ARCHIVES!</span>
                </div>
              )}
            </div>

            {/* Right Column: Global Top 10 Leaderboard */}
            <div className="md:col-span-7 flex flex-col p-3 rounded-2xl bg-purple-950/30 border border-purple-800/50 max-h-64 sm:max-h-80 overflow-hidden">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-purple-900/60">
                <div className="flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  <span className="font-arcade text-xs font-bold text-slate-100 tracking-wider">
                    GLOBAL TOP 10 PILOTS
                  </span>
                </div>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    loadLeaderboard();
                  }}
                  disabled={loadingLeaderboard}
                  title="Refresh Leaderboard"
                  className="p-1 rounded text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingLeaderboard ? 'animate-spin text-cyan-400' : ''}`} />
                </button>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 font-mono-num text-xs">
                {loadingLeaderboard && gameOverLeaderboard.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-cyan-400 gap-2 font-arcade text-xs">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>LOADING GLOBAL SCORES...</span>
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
                            ? 'bg-pink-950/50 border-pink-500 text-pink-200' 
                            : 'bg-black/60 border-purple-900/40 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] border ${rankBadgeClass}`}>
                            {idx + 1}
                          </span>
                          <span className="font-arcade font-bold tracking-wider text-slate-100 text-xs sm:text-sm">
                            {entry.username}
                          </span>
                          {isMe && (
                            <span className="px-1.5 py-0.2 rounded bg-pink-500 text-black text-[9px] font-bold">
                              YOU
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-slate-500 hidden sm:inline">
                            {entry.distance}m
                          </span>
                          <span className="font-bold text-cyan-300 sm:text-sm">
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

      {/* ==================== GLOBAL LEADERBOARD MODAL ==================== */}
      {showLeaderboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-[#0f0521] border border-purple-800/60 shadow-2xl p-4 sm:p-5 flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-purple-900/60 mb-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <h3 className="font-arcade text-base font-bold text-slate-100 tracking-wider">
                  TOP 10 PILOTS
                </h3>
              </div>
              <button
                onClick={() => setShowLeaderboard(false)}
                className="p-1 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sync Badge */}
            <div className="flex items-center justify-between text-[11px] font-arcade text-slate-400 mb-2.5 px-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span>GLOBAL ARCHIVES</span>
              </div>
              <button
                onClick={() => loadLeaderboard()}
                className="text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${loadingLeaderboard ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {/* Scores Table */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 font-mono-num text-xs">
              {leaderboard.length === 0 ? (
                <div className="text-center py-6 text-slate-500 font-arcade">NO RUNNERS RECORDED YET</div>
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
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-colors ${
                        entry.isCurrentPlayer 
                          ? 'bg-pink-950/30 border-pink-500/50 text-pink-200' 
                          : 'bg-purple-950/20 border-purple-900/40 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] border ${rankBadgeClass}`}>
                          {idx + 1}
                        </span>
                        <div className="flex flex-col">
                          <span className="font-arcade font-bold tracking-wider text-slate-100">
                            {entry.username}
                          </span>
                          <span className="text-[9px] text-slate-500">{entry.distance}m</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-bold text-cyan-300">
                          {entry.score}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Close Button */}
            <div className="pt-3 mt-2 border-t border-purple-900/60 flex justify-end">
              <button
                onClick={() => setShowLeaderboard(false)}
                className="px-4 py-1.5 rounded-lg bg-purple-900/50 hover:bg-purple-800/60 text-slate-200 font-arcade text-xs tracking-wider transition-colors cursor-pointer"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== RESPONSIVE DEVICE & ORIENTATION SCREEN GATE ==================== */}
      {isPortraitBlocked && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#070114] px-6 text-center select-none overflow-hidden">
          {/* Ambient synthwave background grid & glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-pink-900/25 via-purple-950/40 to-[#070114] pointer-events-none" />
          <div className="absolute inset-0 crt-scanlines opacity-40 pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center max-w-sm mx-auto">
            {/* Status Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-pink-500/50 bg-pink-950/60 text-pink-300 font-arcade text-[11px] tracking-widest mb-6 shadow-[0_0_15px_rgba(255,0,128,0.3)]">
              <RotateCw className="w-3.5 h-3.5 animate-spin text-pink-400" />
              <span>ORIENTATION LOCK // ROTATION REQUIRED</span>
            </div>

            {/* Rotating Smartphone Visual with Glowing Screen & Arrows */}
            <div className="relative w-36 h-36 flex items-center justify-center mb-6">
              {/* Outer pulsing neon ring */}
              <div className="absolute inset-2 rounded-full border border-cyan-500/30 animate-ping opacity-40 pointer-events-none" />
              <div className="absolute inset-0 rounded-full border border-purple-500/30 pointer-events-none" />

              {/* Animated Rotating Phone Device */}
              <div className="relative animate-phone-rotate flex items-center justify-center">
                <div className="w-16 h-28 rounded-2xl border-2 border-cyan-400 bg-[#0d0422] p-1.5 shadow-[0_0_30px_rgba(0,240,255,0.4)] flex flex-col justify-between items-center transition-all">
                  {/* Top phone notch/speaker */}
                  <div className="w-4 h-1 rounded-full bg-cyan-700/80" />
                  
                  {/* Phone screen graphic */}
                  <div className="w-full flex-1 rounded-lg bg-purple-950/80 border border-purple-800/80 my-1 flex flex-col items-center justify-center p-1 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-t from-pink-500/20 to-transparent" />
                    <ArrowUpDown className="w-5 h-5 text-pink-400 animate-bounce relative z-10" />
                    <span className="text-[7px] font-arcade font-bold text-cyan-300 tracking-tighter mt-1 relative z-10">
                      16:9
                    </span>
                  </div>

                  {/* Bottom indicator */}
                  <div className="w-5 h-1 rounded-full bg-cyan-500/80" />
                </div>
              </div>

              {/* Decorative rotation orbit arrows */}
              <div className="absolute -inset-1 pointer-events-none flex items-center justify-center">
                <RotateCw className="w-28 h-28 text-pink-500/20 animate-spin" style={{ animationDuration: '8s' }} />
              </div>
            </div>

            {/* Clear Primary Instruction */}
            <h2 className="text-xl sm:text-2xl font-bold font-arcade tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-pink-400 to-yellow-300 mb-3 leading-snug">
              Please rotate your phone to Landscape mode to play Neon Gravity Dash.
            </h2>

            {/* Explanatory Context */}
            <p className="text-xs text-slate-300/90 leading-relaxed font-arcade mb-6 max-w-xs">
              Neon Gravity Dash is optimized for a 16:9 widescreen arcade field of view, locked 60 FPS performance, and two-thumb reflex controls.
            </p>

            {/* Live Indicator Pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/70 border border-purple-800/60 text-[11px] font-mono-num text-slate-400 mb-4">
              <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
              <span>WAITING FOR LANDSCAPE ORIENTATION...</span>
            </div>

            {/* Subtle Bypass button for development / testing */}
            <button
              onClick={() => setIsPortraitBlocked(false)}
              className="text-[10px] text-slate-500 hover:text-slate-300 underline font-arcade transition-colors cursor-pointer"
            >
              (Bypass check and preview in portrait)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
