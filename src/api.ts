import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export interface Activity {
  id: string;
  name: string;
  start_date: string;
  start_time?: string;
  end_date: string;
  geo_epgs_4326_latlon: string;
  body: string;
  category?: string;
  origen?: string;
  direccion?: string;
  venue_name?: string;
  likes?: number;
  attendees?: number;
}

export const fetchEvents = async (startDate?: string, endDate?: string): Promise<Activity[]> => {
  const params: Record<string, string> = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
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

export const toggleLike = async (id: string, action: 'like' | 'unlike'): Promise<number> => {
  const response = await axios.post(`${API_BASE_URL}/likes/${encodeURIComponent(id)}`, { action });
  return response.data.likes;
};

export const isLiked = (id: string): boolean => {
  try {
    return !!JSON.parse(localStorage.getItem('liked_activities') || '{}')[id];
  } catch { return false; }
};

export const setLikedLocal = (id: string, value: boolean): void => {
  try {
    const liked = JSON.parse(localStorage.getItem('liked_activities') || '{}');
    if (value) liked[id] = true; else delete liked[id];
    localStorage.setItem('liked_activities', JSON.stringify(liked));
  } catch {}
};

export const getAllLikedLocal = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem('liked_activities') || '{}');
  } catch { return {}; }
};

export const getLikeCountsLocal = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem('like_counts') || '{}');
  } catch { return {}; }
};

export const setLikeCountLocal = (id: string, count: number): void => {
  try {
    const counts = getLikeCountsLocal();
    if (count > 0) counts[id] = count; else delete counts[id];
    localStorage.setItem('like_counts', JSON.stringify(counts));
  } catch {};
};

// ── Attendees ────────────────────────────────────────────────────────────────

export const toggleAttend = async (id: string, action: 'attend' | 'unattend'): Promise<number> => {
  const response = await axios.post(`${API_BASE_URL}/attend/${encodeURIComponent(id)}`, { action });
  return response.data.attendees;
};

export const isAttending = (id: string): boolean => {
  try {
    return !!JSON.parse(localStorage.getItem('attending_activities') || '{}')[id];
  } catch { return false; }
};

export const setAttendingLocal = (id: string, value: boolean): void => {
  try {
    const att = JSON.parse(localStorage.getItem('attending_activities') || '{}');
    if (value) att[id] = true; else delete att[id];
    localStorage.setItem('attending_activities', JSON.stringify(att));
  } catch {};
};

export const getAllAttendingLocal = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem('attending_activities') || '{}');
  } catch { return {}; }
};

export const getAttendCountsLocal = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem('attend_counts') || '{}');
  } catch { return {}; }
};

export const setAttendCountLocal = (id: string, count: number): void => {
  try {
    const counts = getAttendCountsLocal();
    if (count > 0) counts[id] = count; else delete counts[id];
    localStorage.setItem('attend_counts', JSON.stringify(counts));
  } catch {};
};

