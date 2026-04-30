import React, { useState, useEffect } from 'react';
import './App.css';
import { FaHome, FaRegEdit } from 'react-icons/fa';
import { MdGpsFixed } from 'react-icons/md';
import QueryForm, { CATEGORIES } from './components/QueryForm';
import ActivityList, { ActivityModal } from './components/ActivityList';
import MapComponent, { CenterOn } from './components/MapComponent';
import RegistrationForm from './components/RegistrationForm';
import { fetchEvents, fetchActivities, Activity } from './api';
import { requestNotificationPermission, showNotification } from './notifications';

const HomeIcon = FaHome as React.ElementType;
const EditIcon = FaRegEdit as React.ElementType;
const GpsIcon = MdGpsFixed as React.ElementType;

type Page = 'main' | 'register';

// Bottom sheet component that manages its own open/close state
function BottomSheetPanel({ activities, isSearching }: { activities: Activity[]; isSearching: boolean }) {
  const [open, setOpen] = useState(false);

  // Auto-open when results arrive, auto-close when searching starts
  useEffect(() => {
    if (isSearching) {
      setOpen(false);
    } else if (activities.length > 0) {
      setOpen(true);
    }
  }, [isSearching, activities.length]);

  return (
    <div className={`bottom-sheet${open ? ' bottom-sheet--expanded' : ' bottom-sheet--collapsed'}`}>
      <div
        className="bottom-sheet-handle"
        role="button"
        aria-expanded={open}
        aria-label="Toggle activity list"
        onClick={() => setOpen(o => !o)}
      >
        <div className="bottom-sheet-pill-wrap">
          <div className="bottom-sheet-pill" />
        </div>
        <div className="bottom-sheet-info">
          <span className="bottom-sheet-count">
            {isSearching
              ? 'Searching activities...'
              : activities.length > 0
                ? `${activities.length} activit${activities.length === 1 ? 'y' : 'ies'} found`
                : 'No activities — adjust filters'}
          </span>
          {!isSearching && activities.length > 0 && (
            <span className="bottom-sheet-hint">Tap to {open ? 'hide' : 'see'} the list</span>
          )}
        </div>
        <span className={`bottom-sheet-chevron${open ? ' bottom-sheet-chevron--up' : ''}`}>▲</span>
      </div>
      <div className="bottom-sheet-body">
        <ActivityList activities={activities} />
      </div>
    </div>
  );
}

function App() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [lastLocation, setLastLocation] = useState<string | undefined>(undefined);
  const [lastRadius, setLastRadius] = useState<number | undefined>(undefined);
  const [centerOn, setCenterOn] = useState<CenterOn | null>(null);
  const [selectedMapActivity, setSelectedMapActivity] = useState<Activity | null>(null);
  
  // Estado del formulario
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [radius, setRadius] = useState(2);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const handleGoToBarcelona = () => setCenterOn({ lat: 41.3851, lng: 2.1734, zoom: 11 });
  const [page, setPage] = useState<Page>('main');
  const [panelOpen, setPanelOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  useEffect(() => {
    // Calcular fechas siempre: hoy y +10 días
    const today = new Date();
    const startDateStr = today.toISOString().split('T')[0];
    const endDateObj = new Date(today);
    endDateObj.setDate(endDateObj.getDate() + 3);
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
        setPanelOpen(false);

        if (filtered.length > 0) {
          showNotification('CityRadar Barcelona', `Found ${filtered.length} activities nearby!`);
        }
      } catch (error) {
        console.error('Failed to perform auto-search', error);
      } finally {
        setIsSearching(false);
      }
    };

    const loadData = async () => {
      // Mostrar radar inmediatamente al cargar
      setIsSearching(true);
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
            setRadius(2);
            setIsLoadingLocation(false);
            await runSearch(latitude, longitude, locStr);
          },
          async () => {
            // Sin permiso o error: usar Barcelona como centro
            setIsLoadingLocation(false);
            const locStr = `${BARCELONA_LAT},${BARCELONA_LON}`;
            setLocation(locStr);
            setRadius(2);
            await runSearch(BARCELONA_LAT, BARCELONA_LON, locStr);
          },
          { timeout: 5000 }
        );
      } else {
        const locStr = `${BARCELONA_LAT},${BARCELONA_LON}`;
        setLocation(locStr);
        setRadius(2);
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
    setPanelOpen(false);
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
    setRadius(2);
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
              {/* Mapa ocupa todo el espacio disponible */}
              <div className="map-fullscreen">
                <MapComponent activities={activities} userLocation={lastLocation} radiusKm={lastRadius} centerOn={centerOn} onActivitySelect={setSelectedMapActivity} />

                {/* Radar overlay mientras se buscan/cargan actividades */}
                {isSearching && (
                  <div className="radar-overlay">
                    <div className="radar-widget">
                      <div className="radar-ring radar-ring--outer" />
                      <div className="radar-ring radar-ring--mid" />
                      <div className="radar-ring radar-ring--inner" />
                      <div className="radar-sweep" />
                      <div className="radar-sweep radar-sweep--reverse" />
                      <div className="radar-crosshair" />
                      <div className="radar-dot" />
                      <span className="radar-label">CityRadar Scanning...</span>
                    </div>
                  </div>
                )}

                {/* Panel flotante de búsqueda (arriba-izquierda) */}
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

                {/* Botón volver a Barcelona */}
                <button className="map-nav-btn-barcelona" onClick={handleGoToBarcelona} title="Back to Barcelona"><GpsIcon size={16} color="#333" /></button>

                {/* Bottom sheet de actividades — se abre de abajo hacia arriba */}
                <BottomSheetPanel activities={activities} isSearching={isSearching} />
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

      {/* Modal de detalle abierto desde el mapa */}
      {selectedMapActivity && (
        <ActivityModal
          activity={selectedMapActivity}
          onClose={() => setSelectedMapActivity(null)}
        />
      )}
    </div>
  );
}

export default App;




