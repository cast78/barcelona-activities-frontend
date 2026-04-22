import React, { useState, useEffect } from 'react';
import './App.css';
import { FaHome, FaRegEdit } from 'react-icons/fa';
import QueryForm, { CATEGORIES } from './components/QueryForm';
import ActivityList from './components/ActivityList';
import MapComponent, { CenterOn } from './components/MapComponent';
import RegistrationForm from './components/RegistrationForm';
import { fetchEvents, fetchActivities, Activity } from './api';
import { requestNotificationPermission, showNotification } from './notifications';

const HomeIcon = FaHome as React.ElementType;
const EditIcon = FaRegEdit as React.ElementType;

type Page = 'main' | 'register';

function App() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [lastLocation, setLastLocation] = useState<string | undefined>(undefined);
  const [lastRadius, setLastRadius] = useState<number | undefined>(undefined);
  const [centerOn, setCenterOn] = useState<CenterOn | null>(null);
  
  // Estado del formulario
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [radius, setRadius] = useState(5);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const handleGoToBarcelona = () => setCenterOn({ lat: 41.3851, lng: 2.1734, zoom: 11 });
  const [page, setPage] = useState<Page>('main');
  const [panelOpen, setPanelOpen] = useState(true);
  const [isSearching, setIsSearching] = useState(false);

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
    setIsSearching(true);
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
      setPanelOpen(false);
    } catch (error) {
      console.error('Error fetching activities for search', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClear = () => {
    setActivities(allActivities);
    setLastLocation(undefined);
    setLastRadius(undefined);
    setLocation("");
    setStartDate("");
    setEndDate("");
    setRadius(5);
    setSelectedCategories([]);
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
            <HomeIcon style={{ marginRight: 10 }} /> Home
          </button>
          <button
            className={page === 'register' ? 'sidebar-btn active' : 'sidebar-btn'}
            onClick={() => setPage('register')}
            aria-label="Register Activities"
          >
            <EditIcon style={{ marginRight: 10 }} /> Register Activities
          </button>
        </nav>
      </aside>
      <div className="App-content">
        <header className="App-header">
          <div>
            <h1>{page === "main" ? "Explore nearby activities and events" : "Register Activities"}</h1>
          </div>
        </header>
        <main className="App-main">
          {page === 'main' && (
            <>
              {/* Mapa con panel flotante dentro */}
              <div className="map-fullscreen">
                <MapComponent activities={activities} userLocation={lastLocation} radiusKm={lastRadius} centerOn={centerOn} />
                {/* Botón de navegación del mapa */}
                <button className="map-nav-btn-barcelona" onClick={handleGoToBarcelona} title="Volver a Barcelona">🏠</button>
                {/* Panel flotante colapsable */}
                <div className={`floating-panel${panelOpen ? '' : ' floating-panel--collapsed'}`}>
                  <button
                    className="panel-toggle-btn"
                    onClick={() => setPanelOpen(o => !o)}
                    aria-expanded={panelOpen}
                  >
                    <span className="panel-toggle-icon">🔍</span>
                    {panelOpen && <span className="panel-toggle-label">Búsqueda</span>}
                    {panelOpen && activities.length > 0 && (
                      <span className="result-count-badge" style={{ marginLeft: 0 }}>
                        {activities.length} {activities.length === 1 ? 'actividad' : 'actividades'}
                      </span>
                    )}
                    <span className={`panel-toggle-chevron${panelOpen ? ' panel-toggle-chevron--open' : ''}`}>▲</span>
                  </button>
                  {panelOpen && (
                    <QueryForm 
                      onSearch={handleSearch} 
                      onClear={handleClear}
                      isSearching={isSearching}
                      location={location}
                      setLocation={setLocation}
                      startDate={startDate}
                      setStartDate={setStartDate}
                      endDate={endDate}
                      setEndDate={setEndDate}
                      radius={radius}
                      setRadius={setRadius}
                      selectedCategories={selectedCategories}
                      setSelectedCategories={setSelectedCategories}
                    />
                  )}
                </div>
              </div>

              {/* Lista de actividades como drawer inferior */}
              <div className={`activities-drawer${activities.length === 0 ? ' activities-drawer--hidden' : ''}`}>
                <ActivityList activities={activities} />
              </div>
            </>
          )}
          {page === 'register' && (
            <div style={{ maxWidth: 580, margin: '2rem auto', padding: '0 1rem' }}>
              <RegistrationForm />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;




