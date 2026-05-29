import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export interface Activity {
  id: string;
  name: string;
  start_date: string;
  start_time?: string;
  end_time?: string;
  end_date: string;
  geo_epgs_4326_latlon?: string;
  body: string;
  category?: string;
  origen?: string;
  direccion?: string;
  venue_name?: string;
  likes?: number;
  attendees?: number;
}

export interface EventFilters {
  startDate?: string;
  endDate?: string;
  currentTime?: string;
  lat?: number;
  lon?: number;
  radius?: number;
  category?: string;
}

// Permite obtener resultados parciales por fuente si el backend lo soporta (opcional)
// Forzado: asegurar export fetchEventsBySource
// Si ya existe, este cambio no afecta la lógica.

export const fetchEventsBySource = async (filters: EventFilters = {}): Promise<{opendata: Activity[]; ticketmaster: Activity[]; allevents: Activity[]}> => {
  const params: Record<string, string | number> = {};
  if (filters.startDate) params.startDate = filters.startDate;
  if (filters.endDate) params.endDate = filters.endDate;
  if (filters.currentTime) params.currentTime = filters.currentTime;
  if (filters.lat !== undefined) params.lat = filters.lat;
  if (filters.lon !== undefined) params.lon = filters.lon;
  if (filters.radius !== undefined) params.radius = filters.radius;
  if (filters.category) params.category = filters.category;
  params.bySource = 1;
  const response = await axios.get(`${API_BASE_URL}/events`, { params });
  return response.data;
};

export const fetchActivities = async (): Promise<Activity[]> => {
  const response = await axios.get(`${API_BASE_URL}/activities`);
  return response.data;
};

export const addActivity = async (activity: Omit<Activity, 'id'>): Promise<Activity[]> => {
  const response = await axios.post(`${API_BASE_URL}/activities`, activity);
  return response.data;
};

// ── Local storage helpers for likes ──────────────────────────────────────────
const LIKES_KEY = 'cityradar_liked';
const LIKE_COUNTS_KEY = 'cityradar_like_counts';

export function getAllLikedLocal(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(LIKES_KEY) || '{}'); } catch { return {}; }
}
export function getLikeCountsLocal(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(LIKE_COUNTS_KEY) || '{}'); } catch { return {}; }
}
export function setLikedLocal(id: string, liked: boolean) {
  const data = getAllLikedLocal();
  data[id] = liked;
  localStorage.setItem(LIKES_KEY, JSON.stringify(data));
}
export function setLikeCountLocal(id: string, count: number) {
  const data = getLikeCountsLocal();
  data[id] = count;
  localStorage.setItem(LIKE_COUNTS_KEY, JSON.stringify(data));
}
export function isLiked(id: string): boolean {
  return !!getAllLikedLocal()[id];
}
export async function toggleLike(activityId: string, action: string): Promise<number> {
  try {
    const res = await axios.post(`${API_BASE_URL}/likes/${activityId}`, { action });
    return res.data?.likes ?? 0;
  } catch {
    return 0;
  }
}

// ── Local storage helpers for attendees ──────────────────────────────────────
const ATTEND_KEY = 'cityradar_attending';
const ATTEND_COUNTS_KEY = 'cityradar_attend_counts';

export function getAllAttendingLocal(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(ATTEND_KEY) || '{}'); } catch { return {}; }
}
export function getAttendCountsLocal(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(ATTEND_COUNTS_KEY) || '{}'); } catch { return {}; }
}
export function setAttendingLocal(id: string, attending: boolean) {
  const data = getAllAttendingLocal();
  data[id] = attending;
  localStorage.setItem(ATTEND_KEY, JSON.stringify(data));
}
export function setAttendCountLocal(id: string, count: number) {
  const data = getAttendCountsLocal();
  data[id] = count;
  localStorage.setItem(ATTEND_COUNTS_KEY, JSON.stringify(data));
}
export function isAttending(id: string): boolean {
  return !!getAllAttendingLocal()[id];
}
export async function toggleAttend(activityId: string, action: string): Promise<number> {
  try {
    const res = await axios.post(`${API_BASE_URL}/attend/${activityId}`, { action });
    return res.data?.attendees ?? 0;
  } catch {
    return 0;
  }
}

