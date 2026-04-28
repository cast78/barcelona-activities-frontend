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

