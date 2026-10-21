export type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER';

export type GravityDirection = 'DOWN' | 'UP';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
  glow?: boolean;
}

export interface Coin {
  id: string;
  x: number;
  y: number;
  radius: number;
  value: number;
  spin: number;
  collected: boolean;
  baseY: number;
  floatPhase: number;
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  alpha: number;
}

export interface Obstacle {
  id: string;
  x: number;
  width: number;
  height: number;
  y: number;
  attachment: 'FLOOR' | 'CEILING' | 'FLOATING';
  color: string;
  type: 'SPIKE' | 'BARRIER' | 'LASER' | 'ORB' | 'COIN';
  passed: boolean;
  collected?: boolean;
  pulsePhase?: number;
}

export interface LeaderboardEntry {
  id?: string;
  username: string;
  score: number;
  distance: number;
  timestamp: number;
  isCurrentPlayer?: boolean;
}

export interface GameSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  scanlines: boolean;
}
