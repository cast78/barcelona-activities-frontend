import React, { useState, useEffect } from 'react';
import './App.css';
import { FaHome, FaRegEdit } from 'react-icons/fa';

import QueryForm, { CATEGORIES } from './components/QueryForm';
import ActivityList from './components/ActivityList';
import MapComponent from './components/MapComponent';
import RegistrationForm from './components/RegistrationForm';

import { fetchEvents, fetchActivities, Activity } from './api';
import { requestNotificationPermission, showNotification } from './notifications';

type Page = 'main' | 'register';

function App() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [lastLocation, setLastLocation] = useState<string | undefined>(undefined);
  const [lastRadius, setLastRadius] = useState<number | undefined>(undefined);
  const [page, setPage] = useState<Page>('main');

  useEffect(() => {
    const loadData = async () => {
      try {
        const events = await fetchEvents();
        const registered = await fetchActivities();
        const all = [...events, ...registered];
        setActivities(all);
        setAllActivities(all);
        if (events.length > 0) {
          showNotification('Barcelona Activities', `Found ${events.length} events nearby!`);
        }
      } catch (error) {
        console.error('Failed to load data', error);
      }
    };
    requestNotificationPermission();
    loadData();
  }, []);

  // Filtrado con recarga desde la API
  // Haversine formula para calcular distancia entre dos puntos
  function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  const handleSearch = async ({ location, startDate, endDate, radius, categories }: { location: string, startDate: string, endDate: string, radius: number, categories: string[] }) => {
    try {
      const events = await fetchEvents();
      const registered = await fetchActivities();
      let filtered = [...events, ...registered];
      let userCoords: [number, number] | null = null;
      if (location) {
        const parts = location.split(',').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          userCoords = [parts[0], parts[1]];
          setLastLocation(location);
          setLastRadius(radius);
        } else {
          setLastLocation(undefined);
          setLastRadius(undefined);
        }
      } else {
        setLastLocation(undefined);
        setLastRadius(undefined);
      }
      if (userCoords) {
        filtered = filtered.filter(act => {
          if (!act.geo_epgs_4326_latlon) return false;
          const coords = act.geo_epgs_4326_latlon.split(',').map(Number);
          if (coords.length !== 2 || isNaN(coords[0]) || isNaN(coords[1]) || !userCoords) return false;
          const dist = haversine(userCoords[0], userCoords[1], coords[0], coords[1]);
          return dist <= radius;
        });
      }
      if (startDate) {
        const start = new Date(startDate);
        filtered = filtered.filter(act => {
          if (!act.start_date) return true;
          const actStart = new Date(act.start_date);
          return actStart >= start;
        });
      }
      if (endDate) {
        const end = new Date(endDate);
        filtered = filtered.filter(act => {
          if (!act.end_date) return true;
          const actEnd = new Date(act.end_date);
          return actEnd <= end;
        });
      }
      if (categories && categories.length > 0) {
        const activeCategories = CATEGORIES.filter(c => categories.includes(c.id));
        filtered = filtered.filter(act => {
          // Si tiene categoria almacenada, usarla directamente
          if (act.category) {
            return categories.includes(act.category);
          }
          // Fallback: inferir por palabras clave en nombre/descripcion
          const text = ((act.name || '') + ' ' + (act.body || '')).toLowerCase();
          return activeCategories.some(cat => cat.keywords.some(kw => text.includes(kw)));
        });
      }
      setActivities(filtered);
      setAllActivities([...events, ...registered]);
    } catch (error) {
      console.error('Error fetching activities for search', error);
    }
  };

  const handleClear = () => {
    setActivities(allActivities);
    setLastLocation(undefined);
    setLastRadius(undefined);
  };

  return (
    <div className="App">
      <aside className="App-sidebar">
        <div className="sidebar-logo">
          <span style={{ fontSize: "1.4rem" }}>🏙️</span>
          <div className="sidebar-title">Barcelona<br/>Activities</div>
        </div>
        <nav className="sidebar-nav">
          <button
            className={page === 'main' ? 'sidebar-btn active' : 'sidebar-btn'}
            onClick={() => setPage('main')}
            aria-label="Home"
          >
            {/* @ts-expect-error React-icons type workaround */}
            <FaHome style={{ marginRight: 10 }} /> Home
          </button>
          <button
            className={page === 'register' ? 'sidebar-btn active' : 'sidebar-btn'}
            onClick={() => setPage('register')}
            aria-label="Register Activities"
          >
            {/* @ts-expect-error React-icons type workaround */}
            <FaRegEdit style={{ marginRight: 10 }} /> Register Activities
          </button>
        </nav>
      </aside>
      <div className="App-content">
        <header className="App-header">
          <div>
            <h1>{page === "main" ? "Home" : "Register Activities"}</h1>
            <p className="header-subtitle">
              {page === "main"
                ? "Explora actividades y eventos en Barcelona"
                : "Añade una nueva actividad al mapa"}
            </p>
          </div>
        </header>
        <main className="App-main">
          {page === 'main' && (
            <>
              <div className="main-content-flex">
                <div className="main-form-col">
                  <QueryForm onSearch={handleSearch} onClear={handleClear} resultCount={activities.length} />
                </div>
                <div className="main-map-col">
                  <MapComponent activities={activities} userLocation={lastLocation} radiusKm={lastRadius} mapHeight={"520px"} />
                </div>
              </div>
              <ActivityList activities={activities} />
            </>
          )}
          {page === 'register' && (
            <div style={{ maxWidth: 580, margin: '2rem auto' }}>
              <RegistrationForm />
            </div>
          )}
        </main>
        <footer className="App-footer">
          <p>&copy; 2026 Barcelona Activities</p>
        </footer>
      </div>
    </div>
  );
}

export default App;




