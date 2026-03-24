import axios from 'axios';
import { API_URL } from './config';

// In-memory cache with TTL
const cache: Map<string, { data: any; timestamp: number }> = new Map();
const CACHE_TTL = 30_000; // 30 seconds

function getCached(key: string): any | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/** Clear all cached data — call after any mutation (POST/PUT/DELETE) */
export function invalidateCache(): void {
  cache.clear();
}

/** Cached GET request — returns cached data if fresh, otherwise fetches */
export async function cachedGet(url: string): Promise<any> {
  const cached = getCached(url);
  if (cached !== null) return cached;
  const res = await axios.get(url);
  setCache(url, res.data);
  return res.data;
}

// ── Convenience helpers for common data fetches ──

export async function fetchConfigData(configId: number) {
  const [branches, semesters, subjects, faculties, rooms] = await Promise.all([
    cachedGet(`${API_URL}/branches?config_id=${configId}`),
    cachedGet(`${API_URL}/semesters?config_id=${configId}`),
    cachedGet(`${API_URL}/subjects?config_id=${configId}`),
    cachedGet(`${API_URL}/faculties?config_id=${configId}`),
    cachedGet(`${API_URL}/rooms?config_id=${configId}`),
  ]);
  return { branches, semesters, subjects, faculties, rooms };
}

export async function fetchAllocations(configId: number) {
  return cachedGet(`${API_URL}/allocations?config_id=${configId}`);
}
