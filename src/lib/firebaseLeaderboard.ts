import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs,
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  type Firestore,
  type Unsubscribe
} from 'firebase/firestore';
import type { LeaderboardEntry } from '../types/game';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

export const firebaseConfig: FirebaseConfig = {
  apiKey: "AIzaSyCRUXpfus911OBGE2Ow1I9qUx9XXvdTKww",
  authDomain: "neongravitydash.firebaseapp.com",
  projectId: "neongravitydash",
  storageBucket: "neongravitydash.firebasestorage.app",
  messagingSenderId: "589660391106",
  appId: "1:589660391106:web:dcf97cf2351ea7d4b71d5b",
  measurementId: "G-8KTFX5SSZE"
};

export function isFirebaseConfigured(): boolean {
  return true;
}

export function getStoredFirebaseConfig(): FirebaseConfig {
  return firebaseConfig;
}

export function saveFirebaseConfig(_config: FirebaseConfig) {
  // Live credentials configured directly
}

const LOCAL_STORAGE_KEY = 'neon_gravity_dash_leaderboard';

// Pre-seeded fallback scores if offline or empty database
const SEED_SCORES: LeaderboardEntry[] = [
  { id: 'seed-1', username: 'NEON_VIPER', score: 14250, distance: 3820, timestamp: Date.now() - 3600000 * 2 },
  { id: 'seed-2', username: 'CYBER_ACE', score: 11840, distance: 3100, timestamp: Date.now() - 3600000 * 5 },
  { id: 'seed-3', username: 'GRID_RUNNER', score: 9450, distance: 2640, timestamp: Date.now() - 3600000 * 12 },
  { id: 'seed-4', username: 'SYNTH_GHOST', score: 7920, distance: 2190, timestamp: Date.now() - 3600000 * 18 },
  { id: 'seed-5', username: 'RETRO_BLASTER', score: 6300, distance: 1810, timestamp: Date.now() - 3600000 * 24 },
  { id: 'seed-6', username: 'ZERO_GRAV', score: 5120, distance: 1490, timestamp: Date.now() - 3600000 * 30 },
  { id: 'seed-7', username: 'LASER_PULSE', score: 4300, distance: 1250, timestamp: Date.now() - 3600000 * 40 },
  { id: 'seed-8', username: 'CHROMA_DASH', score: 3450, distance: 980, timestamp: Date.now() - 3600000 * 50 },
  { id: 'seed-9', username: 'VAPOR_WAVE', score: 2800, distance: 820, timestamp: Date.now() - 3600000 * 65 },
  { id: 'seed-10', username: 'PIXEL_DRIFT', score: 1950, distance: 580, timestamp: Date.now() - 3600000 * 80 },
];

// Initialize Firebase App & Firestore
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

export const db: Firestore = getFirestore(app);

// Local Storage helpers for fallback
function getLocalScores(): LeaderboardEntry[] {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data) as LeaderboardEntry[];
      return parsed.sort((a, b) => b.score - a.score).slice(0, 10);
    }
  } catch {
    // fallback
  }
  return SEED_SCORES;
}

function saveLocalScore(username: string, score: number, distance: number = 0): LeaderboardEntry[] {
  const current = getLocalScores();
  const newEntry: LeaderboardEntry = {
    id: 'local-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    username: username.trim().toUpperCase() || 'PLAYER',
    score,
    distance,
    timestamp: Date.now(),
    isCurrentPlayer: true
  };

  const updated = [...current, newEntry]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

/**
 * 2. saveHighScore(username, score)
 * Adds a document to the "leaderboard" collection in Firestore
 */
export async function saveHighScore(
  username: string, 
  score: number, 
  distance: number = 0
): Promise<{ success: boolean; id?: string }> {
  const cleanUsername = username.trim().toUpperCase() || 'PLAYER';
  const cleanScore = Math.floor(score);
  const cleanDistance = Math.floor(distance);

  try {
    const docRef = await addDoc(collection(db, 'leaderboard'), {
      username: cleanUsername,
      score: cleanScore,
      distance: cleanDistance,
      timestamp: serverTimestamp()
    });

    // Also mirror to local storage
    saveLocalScore(cleanUsername, cleanScore, cleanDistance);

    return { success: true, id: docRef.id };
  } catch (err) {
    console.warn('Firestore write failed, saving to local fallback storage:', err);
    saveLocalScore(cleanUsername, cleanScore, cleanDistance);
    return { success: true };
  }
}

/**
 * 3. fetchLeaderboard()
 * Queries the "leaderboard" collection, orders by score descending,
 * limits to top 10 players, and returns the list of scores.
 */
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const leaderboardQuery = query(
      collection(db, 'leaderboard'),
      orderBy('score', 'desc'),
      limit(10)
    );

    const snapshot = await getDocs(leaderboardQuery);
    const results: LeaderboardEntry[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      results.push({
        id: doc.id,
        username: data.username || 'ANONYMOUS',
        score: typeof data.score === 'number' ? data.score : 0,
        distance: typeof data.distance === 'number' ? data.distance : 0,
        timestamp: data.timestamp?.toMillis ? data.timestamp.toMillis() : Date.now()
      });
    });

    if (results.length > 0) {
      return results;
    }
  } catch (err) {
    console.warn('Could not fetch from Firestore, using local fallback:', err);
  }

  return getLocalScores();
}

/**
 * Real-time listener for the Top 10 High Scores
 */
export function subscribeToTopScores(
  onUpdate: (scores: LeaderboardEntry[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  try {
    const q = query(
      collection(db, 'leaderboard'),
      orderBy('score', 'desc'),
      limit(10)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const scores: LeaderboardEntry[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          scores.push({
            id: doc.id,
            username: data.username || 'ANONYMOUS',
            score: data.score || 0,
            distance: data.distance || 0,
            timestamp: data.timestamp?.toMillis ? data.timestamp.toMillis() : Date.now()
          });
        });

        if (scores.length === 0) {
          onUpdate(SEED_SCORES);
        } else {
          onUpdate(scores);
        }
      },
      (err) => {
        console.warn('Firestore listener fallback to getLocalScores:', err);
        if (onError) onError(err);
        onUpdate(getLocalScores());
      }
    );
  } catch (err) {
    console.warn('Could not initialize snapshot listener:', err);
    onUpdate(getLocalScores());
    return () => {};
  }
}
