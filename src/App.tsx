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
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  useEffect(() => {
    // Calcular fechas siempre: hoy y +10 días
    const today = new Date();
    const startDateStr = today.toISOString().split('T')[0];
    const endDateObj = new Date(today);
    endDateObj.setDate(endDateObj.getDate() + 10);
    const endDateStr = endDateObj.toISOString().split('T')[0];

    // Función de búsqueda con coordenadas y fechas
    const runSearch = async (lat: number, lon: number, locStr: string) => {
      setIsSearching(true);
      try {
        const searchEvents = await fetchEvents(startDateStr, endDateStr);
        const searchRegistered = await fetchActivities();
        let filtered = [...searchEvents, ...searchRegistered];
        setAllActivities(filtered);

        const userCoords: [number, number] = [lat, lon];
        const BCNFALLBACK = '41.3851,2.1734';
        filtered = filtered.filter(act => {
          const coordStr = act.geo_epgs_4326_latlon || BCNFALLBACK;
          const coords = coordStr.split(',').map(Number);
          if (coords.length !== 2 || isNaN(coords[0]) || isNaN(coords[1])) return false;
          const dist = haversine(userCoords[0], userCoords[1], coords[0], coords[1]);
          return dist <= 5;
        });

        const startObj = new Date(startDateStr);
        const endObj = new Date(endDateStr);
        filtered = filtered.filter(act => {
          const actStart = act.start_date ? new Date(act.start_date) : null;
          const actEnd = act.end_date ? new Date(act.end_date) : null;
          // Excluir eventos que ya terminaron antes del inicio del rango
          if (actEnd && !isNaN(actEnd.getTime()) && actEnd < startObj) return false;
          // Excluir eventos que empiezan después del fin del rango
          if (actStart && !isNaN(actStart.getTime()) && actStart > endObj) return false;
          // Excluir eventos que empezaron antes de hoy y no tienen fecha de fin
          if (actStart && !isNaN(actStart.getTime()) && actStart < startObj && (!actEnd || isNaN(actEnd.getTime()))) return false;
          return true;
        });

        setActivities(filtered);
        setLastLocation(locStr);
        setLastRadius(5);

        if (filtered.length > 0) {
          setPanelOpen(false);
          showNotification('CityRadar Barcelona', `Found ${filtered.length} activities nearby!`);
        }
      } catch (error) {
        console.error('Failed to perform auto-search', error);
      } finally {
        setIsSearching(false);
      }
    };

    const loadData = async () => {
      // Establecer fechas en el formulario siempre
      setStartDate(startDateStr);
      setEndDate(endDateStr);

      requestNotificationPermission();

      // Barcelona como fallback
      const BARCELONA_LAT = 41.3851;
      const BARCELONA_LON = 2.1734;

      if (navigator.geolocation) {
        setIsLoadingLocation(true);
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            const locStr = `${latitude},${longitude}`;
            setLocation(locStr);
            setRadius(5);
            setIsLoadingLocation(false);
            await runSearch(latitude, longitude, locStr);
          },
          async () => {
            // Sin permiso o error: usar Barcelona como centro
            setIsLoadingLocation(false);
            const locStr = `${BARCELONA_LAT},${BARCELONA_LON}`;
            setLocation(locStr);
            setRadius(5);
            await runSearch(BARCELONA_LAT, BARCELONA_LON, locStr);
          },
          { timeout: 5000 }
        );
      } else {
        const locStr = `${BARCELONA_LAT},${BARCELONA_LON}`;
        setLocation(locStr);
        setRadius(5);
        await runSearch(BARCELONA_LAT, BARCELONA_LON, locStr);
      }
    };

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
      const events = await fetchEvents(startDate, endDate);
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
        const BCNFALLBACK = '41.3851,2.1734';
        filtered = filtered.filter(act => {
          const coordStr = act.geo_epgs_4326_latlon || BCNFALLBACK;
          const coords = coordStr.split(',').map(Number);
          if (coords.length !== 2 || isNaN(coords[0]) || isNaN(coords[1]) || !userCoords) return false;
          const dist = haversine(userCoords[0], userCoords[1], coords[0], coords[1]);
          return dist <= radius;
        });
      }
      if (startDate || endDate) {
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate + 'T23:59:59') : null;
        filtered = filtered.filter(act => {
          const actStart = act.start_date ? new Date(act.start_date) : null;
          const actEnd = act.end_date ? new Date(act.end_date) : null;
          // Excluir eventos que ya terminaron antes del inicio del rango
          if (start && actEnd && !isNaN(actEnd.getTime()) && actEnd < start) return false;
          // Excluir eventos que empiezan después del fin del rango
          if (end && actStart && !isNaN(actStart.getTime()) && actStart > end) return false;
          // Excluir eventos que empezaron antes del inicio del rango y no tienen fecha de fin
          if (start && actStart && !isNaN(actStart.getTime()) && actStart < start && (!actEnd || isNaN(actEnd.getTime()))) return false;
          return true;
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
      // Auto-hide panel when there are activities to show, keep open if empty state
      if (filtered.length > 0) {
        setPanelOpen(false);
      }
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
          <img src="/logo192.png" alt="CityRadar" style={{height: 50, width: 50}} />
          <div className="sidebar-title">CityRadar<br/>Barcelona</div>
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
                <button className="map-nav-btn-barcelona" onClick={handleGoToBarcelona} title="Back to Barcelona">🏠</button>
                {/* Panel flotante colapsable */}
                <div className={`floating-panel${panelOpen ? '' : ' floating-panel--collapsed'}`}>
                  <button
                    className="panel-toggle-btn"
                    onClick={() => setPanelOpen(o => !o)}
                    aria-expanded={panelOpen}
                  >
                    <span className="panel-toggle-icon">🔍</span>
                    {panelOpen && <span className="panel-toggle-label">Search</span>}
                    <span className={`panel-toggle-chevron${panelOpen ? ' panel-toggle-chevron--open' : ''}`}>▲</span>
                  </button>
                  {panelOpen && (
                    <QueryForm 
                      onSearch={handleSearch} 
                      onClear={handleClear}
                      isSearching={isSearching}
                      isLoadingLocation={isLoadingLocation}
                      setIsLoadingLocation={setIsLoadingLocation}
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
              <div className="activities-drawer">
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
        <footer className="App-footer">
          <p>CityRadar &copy; 2026 | Discover activities and events near you</p>
        </footer>
      </div>
    </div>
  );
}

export default App;




