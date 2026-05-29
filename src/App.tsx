import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { FaHome, FaRegEdit } from 'react-icons/fa';
import { MdGpsFixed } from 'react-icons/md';
import QueryForm from './components/QueryForm';
import ActivityList, { ActivityModal, isHappeningNow, getTimeBadge, sortByTimeAndDistance } from './components/ActivityList';
import MapComponent, { CenterOn } from './components/MapComponent';
import RegistrationForm from './components/RegistrationForm';
import ItineraryPlanner from './components/ItineraryPlanner';
import type { Itinerary } from './components/ItineraryPlanner';
import { Activity, fetchEventsBySource } from './api';
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
    }
    // Ya no se abre automáticamente al llegar resultados
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearching]);

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
  const [rawActivities, setRawActivities] = useState<Activity[]>([]); // Último lote completo
  const [lastQuery, setLastQuery] = useState<{ location: string; startDate: string; endDate: string; radius: number } | null>(null);
  const [lastLocation, setLastLocation] = useState<string | undefined>(undefined);
  const [lastRadius, setLastRadius] = useState<number | undefined>(undefined);
  const [centerOn, setCenterOn] = useState<CenterOn | null>(null);
  const [selectedMapActivity, setSelectedMapActivity] = useState<Activity | null>(null);
  
  // Estado del formulario
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; });
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
  const [showDebugTable, setShowDebugTable] = useState(false);

  // ── Proximity notifications (Modo 1) ──────────────────────────────────────
  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const lastCheckedPosRef = useRef<[number, number] | null>(null);
  const lastNotifTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    if (activities.length === 0) return;

    const PROXIMITY_KM = 1;
    const MIN_MOVE_M = 100;
    const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutos entre notificaciones
    const HORIZON_MS = 2 * 60 * 60 * 1000; // solo eventos que empiezan en < 2h

    function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserCoords([latitude, longitude]);

        // ¿El usuario se movió > MIN_MOVE_M desde la última comprobación?
        const prev = lastCheckedPosRef.current;
        if (prev) {
          const moved = haversineM(prev[0], prev[1], latitude, longitude);
          if (moved < MIN_MOVE_M) return;
        }
        lastCheckedPosRef.current = [latitude, longitude];

        const now = Date.now();
        if (now - lastNotifTimeRef.current < COOLDOWN_MS) return;

        for (const act of activities) {
          if (notifiedIdsRef.current.has(act.id)) continue;

          // Verificar coordenadas
          const coordStr = act.geo_epgs_4326_latlon;
          if (!coordStr) continue;
          const parts = coordStr.split(',').map(Number);
          if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) continue;

          const distM = haversineM(latitude, longitude, parts[0], parts[1]);
          if (distM > PROXIMITY_KM * 1000) continue;

          // Verificar que el evento ocurre pronto o está en curso
          const happening = isHappeningNow(act);
          let startsSoon = false;
          if (act.start_date && act.start_time) {
            const eventStart = new Date(`${act.start_date}T${act.start_time}`).getTime();
            startsSoon = eventStart > now && eventStart - now < HORIZON_MS;
          } else if (act.start_date) {
            const eventStart = new Date(act.start_date).getTime();
            startsSoon = eventStart > now && eventStart - now < HORIZON_MS;
          }
          if (!happening && !startsSoon) continue;

          const distLabel = distM < 1000
            ? `${Math.round(distM)} m away`
            : `${(distM / 1000).toFixed(1)} km away`;
          const timeLabel = happening ? 'Happening now' : `Starts in ~${Math.round((new Date(`${act.start_date}T${act.start_time || '00:00'}`).getTime() - now) / 60000)} min`;

          showNotification(
            `📍 Nearby: ${act.name}`,
            `${distLabel} · ${timeLabel}`
          );

          notifiedIdsRef.current.add(act.id);
          lastNotifTimeRef.current = now;
          break; // una notificación por ciclo
        }
      },
      () => { /* silenciar errores de watchPosition */ },
      { enableHighAccuracy: false, maximumAge: 30000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [activities]);
  // ─────────────────────────────────────────────────────────────────────────

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
    // Calcular fechas siempre: hoy y +1 día, + hora actual (zona horaria Barcelona)
    const today = new Date();
    const BCN_TZ = 'Europe/Madrid';
    const startDateStr = today.toLocaleDateString('en-CA', { timeZone: BCN_TZ }); // YYYY-MM-DD en hora BCN
    // const bcnTimeStr = today.toLocaleTimeString('en-GB', { timeZone: BCN_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    // const currentTimeStr = bcnTimeStr; // HH:MM:SS en hora BCN (no usado)
    const endDateObj = new Date(today);
    endDateObj.setDate(endDateObj.getDate() + 1);
    const endDateStr = endDateObj.toLocaleDateString('en-CA', { timeZone: BCN_TZ }); // YYYY-MM-DD en hora BCN

    // ...existing code...

    const loadData = async () => {
      setIsSearching(true);
      setStartDate(startDateStr);
      setEndDate(endDateStr);

      requestNotificationPermission();

      // Barcelona como fallback
      const BARCELONA_LAT = 41.3851;
      const BARCELONA_LON = 2.1734;
      let didRun = false;

      const doInitialSearch = async (lat: number, lon: number, locStr: string) => {
        if (didRun) return;
        didRun = true;
        setLocation(locStr);
        setRadius(2);
        setUserCoords([lat, lon]);
        setLastLocation(locStr); // Asegura que el círculo se pinte desde el inicio
        setLastRadius(2);        // Asegura que el círculo se pinte desde el inicio
        setUsingFallback(lat === BARCELONA_LAT && lon === BARCELONA_LON);
        setIsLoadingLocation(false);
        setPanelOpen(false);
        setPinnedActivity(null);
        const startDate = startDateStr;
        const endDate = endDateStr;
        const currentTime = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        let queryKey = { location: locStr, startDate, endDate, radius: 2 };
        try {
          const bySource = await fetchEventsBySource({
            startDate,
            endDate,
            currentTime,
            lat,
            lon,
            radius: 2
          });
          let all = [...bySource.ticketmaster, ...bySource.allevents, ...bySource.opendata];
          setRawActivities(all);
          setLastQuery(queryKey);
          setActivities(all);
        } catch (e) {
          setRawActivities([]);
          setLastQuery(null);
          setActivities([]);
        } finally {
          setIsSearching(false);
        }
      };

      if (navigator.geolocation) {
        setIsLoadingLocation(true);
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            const locStr = `${latitude},${longitude}`;
            doInitialSearch(latitude, longitude, locStr);
          },
          () => {
            const locStr = `${BARCELONA_LAT},${BARCELONA_LON}`;
            doInitialSearch(BARCELONA_LAT, BARCELONA_LON, locStr);
          },
          { timeout: 5000 }
        );
      } else {
        const locStr = `${BARCELONA_LAT},${BARCELONA_LON}`;
        doInitialSearch(BARCELONA_LAT, BARCELONA_LON, locStr);
      }
    };

    loadData();
  }, []);

  // Filtrado con recarga desde la API
  // ...existing code...

  const handleSearch = async ({ location, startDate, endDate, radius, categories }: { location: string, startDate: string, endDate: string, radius: number, categories: string[] }) => {
    setIsSearching(true);
    setPanelOpen(false);
    setPinnedActivity(null);
    const queryKey = { location, startDate, endDate, radius };
    // Si la consulta es igual a la última, o el radio es menor (y hay cache), solo filtrar en frontend
    if (
      lastQuery &&
      lastQuery.location === location &&
      lastQuery.startDate === startDate &&
      lastQuery.endDate === endDate &&
      rawActivities.length > 0 &&
      radius <= lastQuery.radius // Nuevo: si el radio es menor o igual al cacheado
    ) {
      // Filtrar por distancia
      let filtered = rawActivities;
      const [lat, lon] = location.split(',').map(Number);
      if (!isNaN(lat) && !isNaN(lon)) {
        filtered = filtered.filter(act => {
          if (!act.geo_epgs_4326_latlon) return false;
          const [aLat, aLon] = act.geo_epgs_4326_latlon.split(',').map(Number);
          if (isNaN(aLat) || isNaN(aLon)) return false;
          // Haversine en km
          const R = 6371;
          const dLat = (aLat - lat) * Math.PI / 180;
          const dLon = (aLon - lon) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(aLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const dist = R * c;
          return dist <= radius;
        });
      }
      // Filtrar por categoría y/o timeFilter en frontend
      if (categories && categories.length > 0) {
        filtered = filtered.filter(act => act.category && categories.includes(act.category));
      }
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
      setLastRadius(radius);
      setLastLocation(location);
      setIsSearching(false);
      return;
    }
    try {
      const currentTime = new Date().toISOString().split('T')[1]; // HH:MM:SS.sss
      let lat: number | undefined, lon: number | undefined;
      if (location) {
        const parts = location.split(',').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          lat = parts[0];
          lon = parts[1];
        }
      }
      let category: string | undefined = undefined;
      if (categories && categories.length === 1) {
        category = categories[0];
      }
      // Carga progresiva: primero Ticketmaster y AllEvents, luego OpenData
      const bySource = await fetchEventsBySource({
        startDate,
        endDate,
        currentTime,
        lat,
        lon,
        radius,
        category
      });
      let partial = [...bySource.ticketmaster, ...bySource.allevents];
      setRawActivities([...bySource.ticketmaster, ...bySource.allevents, ...bySource.opendata]);
      setLastQuery(queryKey);
      setActivities(partial);
      setUserCoords(lat !== undefined && lon !== undefined ? [lat, lon] : [41.3851, 2.1734]);
      setUsingFallback(false);
      setLastLocation(lat !== undefined && lon !== undefined ? `${lat},${lon}` : '41.3851,2.1734');
      setLastRadius(radius);
      // Filtro temporal
      if (timeFilter !== 'any') {
        partial = partial.filter(act => {
          if (timeFilter === 'now') return isHappeningNow(act);
          const badge = getTimeBadge(act);
          if (!badge) return false;
          if (timeFilter === '30min') return ['Ahora', '30min'].includes(badge.label);
          if (timeFilter === '1h')    return ['Ahora', '30min', '1h'].includes(badge.label);
          if (timeFilter === '2h')    return ['Ahora', '30min', '1h', '2h'].includes(badge.label);
          if (timeFilter === '1dia')  return ['Ahora', '30min', '1h', '2h', '1día'].includes(badge.label);
          return false;
        });
        setActivities(partial);
      }
      // Cuando OpenData esté lista, unir y mostrar todo
      setTimeout(() => {
        let all = [...bySource.ticketmaster, ...bySource.allevents, ...bySource.opendata];
        if (timeFilter !== 'any') {
          all = all.filter(act => {
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
        setRawActivities(all);
        setActivities(all);
      }, 1000); // Simula llegada tardía de OpenData
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
          <div style={{ borderTop: '1px solid #ddd', marginTop: '10px', paddingTop: '10px' }}>
            <button
              className="sidebar-btn"
              onClick={() => setShowDebugTable(!showDebugTable)}
              title="Toggle categorization debug table"
              style={{
                background: showDebugTable ? '#3b82f6' : 'transparent',
                color: showDebugTable ? 'white' : '#666'
              }}
            >
              🔍 Debug{activities.length > 0 ? ` (${activities.length})` : ''}
            </button>
          </div>
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
        
        {/* Debug Table - Categorization Monitoring */}
        {showDebugTable && activities.length > 0 && (
          <div style={{
            background: '#1f2937', color: '#e5e7eb', padding: '20px', borderTop: '1px solid #374151',
            overflowX: 'auto', fontSize: '12px', fontFamily: 'monospace'
          }}>
            <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>🔍 Categorization Debug Table ({activities.length} events)</h3>
              <button
                onClick={() => setShowDebugTable(false)}
                style={{
                  background: '#ef4444', color: 'white', border: 'none', padding: '5px 10px',
                  borderRadius: '4px', cursor: 'pointer', fontSize: '12px'
                }}
              >
                Close
              </button>
            </div>
            <table style={{
              width: '100%', borderCollapse: 'collapse', marginBottom: '10px'
            }}>
              <thead>
                <tr style={{ background: '#111827', borderBottom: '2px solid #374151' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#60a5fa' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#60a5fa' }}>Origin</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#60a5fa' }}>Category</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#60a5fa' }}>Start Date</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#60a5fa' }}>Start Time</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((act, idx) => (
                  <tr key={act.id} style={{
                    background: idx % 2 === 0 ? '#111827' : '#1f2937',
                    borderBottom: '1px solid #374151'
                  }}>
                    <td style={{ padding: '8px 12px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {act.name.substring(0, 40)}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#fbbf24' }}>
                      {act.origen || 'unknown'}
                    </td>
                    <td style={{ 
                      padding: '8px 12px', 
                      color: act.category === 'other' ? '#ef4444' : '#10b981',
                      fontWeight: 'bold'
                    }}>
                      {act.category || 'other'}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#9ca3af' }}>
                      {act.start_date ? act.start_date.substring(0, 10) : '-'}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#9ca3af' }}>
                      {act.start_time || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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




