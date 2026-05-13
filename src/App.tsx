import React, { useState, useEffect } from 'react';
import './App.css';
import { FaHome, FaRegEdit } from 'react-icons/fa';
import { MdGpsFixed } from 'react-icons/md';
import QueryForm, { CATEGORIES } from './components/QueryForm';
import ActivityList, { ActivityModal, isHappeningNow, getTimeBadge, sortByTimeAndDistance } from './components/ActivityList';
import MapComponent, { CenterOn } from './components/MapComponent';
import RegistrationForm from './components/RegistrationForm';
import ItineraryPlanner from './components/ItineraryPlanner';
import type { Itinerary } from './components/ItineraryPlanner';
import { fetchEvents, fetchActivities, Activity } from './api';
import { requestNotificationPermission, showNotification } from './notifications';

const HomeIcon = FaHome as React.ElementType;
const EditIcon = FaRegEdit as React.ElementType;
const GpsIcon = MdGpsFixed as React.ElementType;

type Page = 'main' | 'register';

// Bottom sheet component that manages its own open/close state
function BottomSheetPanel({ activities, isSearching, userCoords, open, setOpen, onSelectOnMap, pinnedActivityId }: {
  activities: Activity[];
  isSearching: boolean;
  userCoords: [number, number] | null;
  open: boolean;
  setOpen: (v: boolean) => void;
  onSelectOnMap: (activity: Activity) => void;
  pinnedActivityId?: string | null;
}) {

  // Auto-open when results arrive, auto-close when searching starts
  useEffect(() => {
    if (isSearching) {
      setOpen(false);
    } else if (activities.length > 0) {
      setOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearching, activities.length]);

  return (
    <div className={`bottom-sheet${open ? ' bottom-sheet--expanded' : ' bottom-sheet--collapsed'}`}>
      <div
        className="bottom-sheet-handle"
        role="button"
        aria-expanded={open}
        aria-label="Toggle activity list"
        onClick={() => setOpen(!open)}
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
        <ActivityList activities={sortByTimeAndDistance(activities, userCoords)} userCoords={userCoords} onSelectOnMap={onSelectOnMap} pinnedActivityId={pinnedActivityId} />
      </div>
    </div>
  );
}

function App() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [lastLocation, setLastLocation] = useState<string | undefined>(undefined);
  const [lastRadius, setLastRadius] = useState<number | undefined>(undefined);
  const [centerOn, setCenterOn] = useState<CenterOn | null>(null);
  const [selectedMapActivity, setSelectedMapActivity] = useState<Activity | null>(null);
  
  // Estado del formulario
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 2); return d.toISOString().split('T')[0]; });
  const [radius, setRadius] = useState(2);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [timeFilter, setTimeFilter] = useState<string>('any');
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pinnedActivity, setPinnedActivity] = useState<Activity | null>(null);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [showPlanner, setShowPlanner] = useState(false);
  const [showRoute, setShowRoute] = useState(false);

  const handleGoToBarcelona = () => setCenterOn({ lat: 41.3851, lng: 2.1734, zoom: 11 });

  const handleSelectOnMap = (activity: Activity) => {
    if (!activity.geo_epgs_4326_latlon) return;
    const parts = activity.geo_epgs_4326_latlon.split(',').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      setCenterOn({ lat: parts[0], lng: parts[1], zoom: 16 });
      setSheetOpen(false);
      setPinnedActivity(activity);
    }
  };
  const [page, setPage] = useState<Page>('main');
  const [panelOpen, setPanelOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  useEffect(() => {
    // Calcular fechas siempre: hoy y +10 días
    const today = new Date();
    const startDateStr = today.toISOString().split('T')[0];
    const endDateObj = new Date(today);
    endDateObj.setDate(endDateObj.getDate() + 2);
    const endDateStr = endDateObj.toISOString().split('T')[0];

    // Función de búsqueda con coordenadas y fechas
    const runSearch = async (lat: number, lon: number, locStr: string) => {
      setIsSearching(true);
      try {
        const searchEvents = await fetchEvents(startDateStr, endDateStr);
        const searchRegistered = await fetchActivities();
        let filtered = [...searchEvents, ...searchRegistered];

        const startObj = new Date(startDateStr);
        const endObj = new Date(endDateStr + 'T23:59:59');
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
        const userCoords: [number, number] = [lat, lon];
        const BCNFALLBACK = '41.3851,2.1734';
        filtered = filtered.filter(act => {
          const coordStr = act.geo_epgs_4326_latlon || BCNFALLBACK;
          const coords = coordStr.split(',').map(Number);
          if (coords.length !== 2 || isNaN(coords[0]) || isNaN(coords[1])) return false;
          const dist = haversine(userCoords[0], userCoords[1], coords[0], coords[1]);
          return dist <= 2;
        });

        setActivities(filtered);
        setLastLocation(locStr);
        setLastRadius(2);
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
            setUserCoords([latitude, longitude]);
            setUsingFallback(false);
            await runSearch(latitude, longitude, locStr);
          },
          async () => {
            // Sin permiso o error: usar Barcelona como centro
            setIsLoadingLocation(false);
            const locStr = `${BARCELONA_LAT},${BARCELONA_LON}`;
            setLocation(locStr);
            setRadius(2);
            setUserCoords([BARCELONA_LAT, BARCELONA_LON]);
            setUsingFallback(true);
            await runSearch(BARCELONA_LAT, BARCELONA_LON, locStr);
          },
          { timeout: 5000 }
        );
      } else {
        const locStr = `${BARCELONA_LAT},${BARCELONA_LON}`;
        setLocation(locStr);
        setRadius(2);
        setUserCoords([BARCELONA_LAT, BARCELONA_LON]);
        setUsingFallback(true);
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
    setPinnedActivity(null);
    try {
      const events = await fetchEvents(startDate, endDate);
      const registered = await fetchActivities();
      let filtered = [...events, ...registered];
      const BARCELONA_FALLBACK: [number, number] = [41.3851, 2.1734];
      let searchCoords: [number, number] = BARCELONA_FALLBACK;
      if (location) {
        const parts = location.split(',').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          searchCoords = [parts[0], parts[1]];
        }
      }
      setUserCoords(searchCoords);
      setUsingFallback(false);
      setLastLocation(`${searchCoords[0]},${searchCoords[1]}`);
      setLastRadius(radius);
      const BCNFALLBACK = '41.3851,2.1734';
      filtered = filtered.filter(act => {
        const coordStr = act.geo_epgs_4326_latlon || BCNFALLBACK;
        const coords = coordStr.split(',').map(Number);
        if (coords.length !== 2 || isNaN(coords[0]) || isNaN(coords[1])) return false;
        const dist = haversine(searchCoords[0], searchCoords[1], coords[0], coords[1]);
        return dist <= radius;
      });
      const effectiveStart = startDate || new Date().toISOString().split('T')[0];
      if (effectiveStart || endDate) {
        const start = new Date(effectiveStart);
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
          if (act.category) return categories.includes(act.category);
          const text = ((act.name || '') + ' ' + (act.body || '')).toLowerCase();
          return activeCategories.some(cat => cat.keywords.some(kw => text.includes(kw)));
        });
      }
      // Filtro temporal
      if (timeFilter !== 'any') {
        filtered = filtered.filter(act => {
          if (timeFilter === 'now') return isHappeningNow(act);
          const badge = getTimeBadge(act);
          if (!badge) return false;
          if (timeFilter === '30min') return ['Ahora', '30min'].includes(badge.label);
          if (timeFilter === '1h')    return ['Ahora', '30min', '1h'].includes(badge.label);
          if (timeFilter === '2h')    return ['Ahora', '30min', '1h', '2h'].includes(badge.label);
          if (timeFilter === '1dia')  return ['Ahora', '30min', '1h', '2h', '1día'].includes(badge.label);
          return false;
        });
      }
      setActivities(filtered);
    } catch (error) {
      console.error('Error fetching activities for search', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClear = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrowObj = new Date(); tomorrowObj.setDate(tomorrowObj.getDate() + 2);
    const tomorrowStr = tomorrowObj.toISOString().split('T')[0];
    const resetLocation = lastLocation || "";
    const resetRadius = lastRadius || 2;
    setStartDate(todayStr);
    setEndDate(tomorrowStr);
    setLocation(resetLocation);
    setRadius(resetRadius);
    setSelectedCategories([]);
    setTimeFilter('any');
    //handleSearch({ location: resetLocation, startDate: todayStr, endDate: tomorrowStr, radius: resetRadius, categories: [] });
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
                <MapComponent activities={activities} userLocation={lastLocation} radiusKm={lastRadius} centerOn={centerOn} onActivitySelect={setSelectedMapActivity} openPopupForId={pinnedActivity?.id} itinerary={itinerary} showRoute={showRoute} />

                {usingFallback && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 800,
                    background: 'rgba(234,179,8,0.92)', color: '#1c1917',
                    fontSize: '0.72rem', fontWeight: 600,
                    padding: '0.35rem 1rem', textAlign: 'center',
                    backdropFilter: 'blur(4px)', pointerEvents: 'none'
                  }}>
                    📍 Usando Barcelona como referencia · Activa la ubicación para ver distancias reales
                  </div>
                )}

                {/* Chip flotante de actividad seleccionada en mapa — eliminado, ahora la tarjeta en la lista se destaca */}

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
                      <span className="radar-label">Buscando eventos cerca de ti...</span>
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
                      timeFilter={timeFilter}
                      setTimeFilter={setTimeFilter}
                    />
                  )}
                </div>

                {/* Segmented control: Planificar + toggle capa ruta/explorar */}
                {activities.length >= 2 && !isSearching && (
                  <div className="map-route-control">
                    <button
                      className="map-route-control__btn map-route-control__btn--plan"
                      onClick={() => setShowPlanner(true)}
                      title="Planificar ruta"
                    >
                      🗺️<span className="map-route-control__btn-text"> Planificar</span>
                    </button>
                    {itinerary && (
                      <button
                        className={`map-route-control__btn map-route-control__btn--layer${showRoute ? ' active' : ''}`}
                        onClick={() => setShowRoute(r => !r)}
                        title={showRoute ? 'Modo explorar' : 'Ver ruta'}
                      >
                        {showRoute
                          ? <><span>🔍</span><span className="map-route-control__btn-text"> Explorar</span></>
                          : <><span>🧭</span><span className="map-route-control__btn-text"> Ver ruta</span></>}
                      </button>
                    )}
                  </div>
                )}

                {/* Botón volver a Barcelona */}
                <button className="map-nav-btn-barcelona" onClick={handleGoToBarcelona} title="Back to Barcelona"><GpsIcon size={16} color="#333" /></button>

                {/* Leyenda de colores de ruta */}
                {itinerary && showRoute && (
                  <div className="map-route-legend">
                    {[
                      { mode: 'walking', color: '#10b981', dash: '6 4', label: 'A pie' },
                      { mode: 'cycling', color: '#f59e0b', dash: '10 4', label: 'Bici' },
                      { mode: 'metro',   color: '#ef4444', dash: undefined, label: 'Metro' },
                    ].filter(l => itinerary.stops.some(s => s.travelMode === l.mode)).map(l => (
                      <div key={l.mode} className="map-route-legend__item">
                        <svg width="28" height="6" className="map-route-legend__line">
                          <line x1="0" y1="3" x2="28" y2="3"
                            stroke={l.color} strokeWidth="3"
                            strokeDasharray={l.dash} />
                        </svg>
                        <span className="map-route-legend__label">{l.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Bottom sheet de actividades — se abre de abajo hacia arriba */}
                <BottomSheetPanel
                  activities={activities}
                  isSearching={isSearching}
                  userCoords={userCoords}
                  open={sheetOpen}
                  setOpen={setSheetOpen}
                  onSelectOnMap={handleSelectOnMap}
                  pinnedActivityId={pinnedActivity?.id}
                />
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
          userCoords={userCoords}
        />
      )}

      {/* Planificador de ruta */}
      {showPlanner && (
        <ItineraryPlanner
          activities={activities}
          userCoords={userCoords}
          endDate={endDate}
          onClose={() => setShowPlanner(false)}
          onItineraryReady={(itin) => { setItinerary(itin); setShowRoute(itin !== null); }}
          initialItinerary={itinerary}
        />
      )}
    </div>
  );
}

export default App;




