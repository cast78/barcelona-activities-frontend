import React, { useState, useEffect, useRef } from 'react';
import { useT } from './i18n/useT';
import './App.css';
import { FaHome, FaRegEdit, FaInstagram, FaTiktok, FaEnvelope } from 'react-icons/fa';
import QueryForm, { CATEGORIES, inferCategory } from './components/QueryForm';
import CategoryFilter from './components/CategoryFilter';
import ActivityList, { ActivityModal, isHappeningNow, getTimeBadge, sortByTimeAndDistance } from './components/ActivityList';
import MapComponent, { CenterOn } from './components/MapComponent';
import RegistrationForm from './components/RegistrationForm';
import ItineraryPlanner from './components/ItineraryPlanner';
import type { Itinerary } from './components/ItineraryPlanner';
import MyAgendaPanel from './components/MyAgendaPanel';
import { Activity, fetchEventsBySource, isAttending } from './api';
import { requestNotificationPermission, showNotification } from './notifications';
import RadiusSlider, { RADIUS_VALUES } from './components/RadiusSlider';
import LanguageSwitcher from './components/LanguageSwitcher';

const HomeIcon = FaHome as React.ElementType;
const EditIcon = FaRegEdit as React.ElementType;
const InstagramIcon = FaInstagram as React.ElementType;
const TiktokIcon = FaTiktok as React.ElementType;
const MailIcon = FaEnvelope as React.ElementType;

type Page = 'main' | 'register';

// Bottom sheet component that manages its own open/close state
function BottomSheetPanel({ activities, isSearching, userCoords, open, setOpen, onSelectOnMap, pinnedActivityId, onAttendChange }: {
  activities: Activity[];
  isSearching: boolean;
  userCoords: [number, number] | null;
  open: boolean;
  setOpen: (v: boolean) => void;
  onSelectOnMap: (activity: Activity) => void;
  pinnedActivityId?: string | null;
  onAttendChange?: () => void;
}) {
  const t = useT();

  // Auto-open when results arrive, auto-close when searching starts
  useEffect(() => {
    if (isSearching && window.innerWidth < 768) {
      setOpen(false);
    }
    // En escritorio el panel permanece visible; en movil se colapsa al buscar
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
              ? t('sheet.searching')
              : activities.length > 0
                ? t('sheet.found', { count: activities.length })
                : t('sheet.none')}
          </span>
          {!isSearching && activities.length > 0 && (
            <span className="bottom-sheet-hint">{open ? t('sheet.tapHide') : t('sheet.tapSee')}</span>
          )}
        </div>
        <span className={`bottom-sheet-chevron${open ? ' bottom-sheet-chevron--up' : ''}`}>▲</span>
      </div>
      <div className="bottom-sheet-body">
        <ActivityList activities={sortByTimeAndDistance(activities, userCoords)} userCoords={userCoords} onSelectOnMap={onSelectOnMap} pinnedActivityId={pinnedActivityId} onAttendChange={onAttendChange} />
      </div>
    </div>
  );
}

function App() {
  const t = useT();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [rawActivities, setRawActivities] = useState<Activity[]>([]); // Último lote completo

  const [lastLocation, setLastLocation] = useState<string | undefined>(undefined);
  const [lastRadius, setLastRadius] = useState<number | undefined>(undefined);
  const [centerOn, setCenterOn] = useState<CenterOn | null>(null);
  const [selectedMapActivity, setSelectedMapActivity] = useState<Activity | null>(null);
  
  // Estado del formulario
  const [location, setLocation] = useState("");
  const [addressLabel, setAddressLabel] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; });
  const [radius, setRadius] = useState(2);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [timeFilter, setTimeFilter] = useState<string>('any');
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(() => window.innerWidth >= 768);
  const [pinnedActivity, setPinnedActivity] = useState<Activity | null>(null);
  const [popupTrigger, setPopupTrigger] = useState(0);
  const [fitBoundsTrigger, setFitBoundsTrigger] = useState(0);
  const [showAgenda, setShowAgenda] = useState(false);
  const [agendaRefreshKey, setAgendaRefreshKey] = useState(0);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [showPlanner, setShowPlanner] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  const [showDebugTable, setShowDebugTable] = useState(false);

  // ── Proximity notifications (Modo 1) ──────────────────────────────────────
  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const lastCheckedPosRef = useRef<[number, number] | null>(null);
  const lastNotifTimeRef = useRef<number>(0);
  const floatingPanelRef = useRef<HTMLDivElement>(null);

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

  const handleGoToBarcelona = () => {
    if (userCoords) {
      setCenterOn({ lat: userCoords[0], lng: userCoords[1], zoom: 13 });
    } else {
      setCenterOn({ lat: 41.3851, lng: 2.1734, zoom: 13 });
    }
  };

  const handleSelectOnMap = (activity: Activity) => {
    if (!activity.geo_epgs_4326_latlon) return;
    const parts = activity.geo_epgs_4326_latlon.split(',').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      setCenterOn({ lat: parts[0], lng: parts[1], zoom: 13 });
      setSheetOpen(false);
      setPinnedActivity(activity);
      setPopupTrigger(t => t + 1);
    }
  };
  const [page, setPage] = useState<Page>('main');
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 768);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  // Cerrar el panel de búsqueda al hacer clic fuera de él
  useEffect(() => {
    if (!panelOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (floatingPanelRef.current && !floatingPanelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [panelOpen]);

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
        try {
          const bySource = await fetchEventsBySource({
            startDate,
            endDate,
            currentTime,
            lat,
            lon,
            radius: 2
          });
          let all = [
            ...bySource.ticketmaster,
            ...bySource.allevents,
            ...bySource.opendata,
            ...(bySource.usuarioCityRadar || [])
          ];
          setRawActivities(all);
          setActivities(all);
        } catch (e) {
          setRawActivities([]);
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
    const searchStart = Date.now();

    try {
      const currentTime = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      let lat: number | undefined, lon: number | undefined;
      if (location) {
        const parts = location.split(',').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          lat = parts[0];
          lon = parts[1];
        }
      }

      // Siempre consultar la API — sin caché en el formulario de búsqueda.
      // La categoría NO se pasa al backend: el backend devuelve todos los eventos del radio
      // y el frontend filtra por categoría usando inferCategory como fallback para fuentes
      // que no normalizan el campo category (ticketmaster, allevents).
      const bySource = await fetchEventsBySource({
        startDate,
        endDate,
        currentTime,
        lat,
        lon,
        radius
      });

      const all = [
        ...bySource.ticketmaster,
        ...bySource.allevents,
        ...bySource.opendata,
        ...(bySource.usuarioCityRadar || [])
      ];

      setRawActivities(all);
      setActivities(all); // activities = todos los eventos del radio, sin filtro de categoría
      setUserCoords(lat !== undefined && lon !== undefined ? [lat, lon] : [41.3851, 2.1734]);
      setUsingFallback(false);
      setLastLocation(lat !== undefined && lon !== undefined ? `${lat},${lon}` : '41.3851,2.1734');
      setLastRadius(radius);

      const elapsed = Date.now() - searchStart;
      const minDelay = 1400;
      if (elapsed < minDelay) {
        setTimeout(() => setIsSearching(false), minDelay - elapsed);
      } else {
        setIsSearching(false);
      }
    } catch (error) {
      console.error('Error fetching activities for search', error);
      setIsSearching(false);
    }
  };

  // Filtra rawActivities por un nuevo radio sin llamar a la API
  const handleRadiusSliderChange = (km: number) => {
    setRadius(km);
    setLastRadius(km);
    if (!lastLocation || rawActivities.length === 0) return;
    const [lat, lon] = lastLocation.split(',').map(Number);
    if (isNaN(lat) || isNaN(lon)) return;
    const filtered = rawActivities.filter(act => {
      if (!act.geo_epgs_4326_latlon) return false;
      const [aLat, aLon] = act.geo_epgs_4326_latlon.split(',').map(Number);
      if (isNaN(aLat) || isNaN(aLon)) return false;
      const R = 6371;
      const dLat = (aLat - lat) * Math.PI / 180;
      const dLon = (aLon - lon) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(aLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c <= km;
    });
    setActivities(filtered);
  };

  const handleClear = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrowObj = new Date(); tomorrowObj.setDate(tomorrowObj.getDate() + 1);
    const tomorrowStr = tomorrowObj.toISOString().split('T')[0];
    const resetLocation = lastLocation || "";
    setStartDate(todayStr);
    setEndDate(tomorrowStr);
    setLocation(resetLocation);
    setRadius(2);
    setSelectedCategories([]);
    setTimeFilter('any');
    //handleSearch({ location: resetLocation, startDate: todayStr, endDate: tomorrowStr, radius: 2, categories: [] });
  };

  // Al cambiar categoría con una actividad pinneada, hacer fitBounds y limpiar el pin
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pinnedActivity) {
      setPinnedActivity(null);
      setFitBoundsTrigger(t => t + 1);
    }
  // Solo disparar cuando cambia selectedCategories
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategories]);

  // filteredActivities: única fuente de verdad para categoría + timeFilter
  // activities = todos los eventos del radio actual (sin filtro de categoría)
  // filteredActivities = activities filtrado por categorías seleccionadas y timeFilter
  const _validCatIds = new Set(CATEGORIES.map(c => c.id));
  let filteredActivities = activities;
  if (selectedCategories.length > 0) {
    filteredActivities = filteredActivities.filter(act => {
      const effectiveCat = act.category && _validCatIds.has(act.category)
        ? act.category
        : inferCategory(act.name || '', act.body || '');
      return selectedCategories.includes(effectiveCat);
    });
  }
  if (timeFilter !== 'any') {
    filteredActivities = filteredActivities.filter(act => {
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

  // Eventos dentro del radio actual sin filtro de categoría — para los contadores del mapa
  const activitiesInRadius = (() => {
    if (!lastLocation || !lastRadius || rawActivities.length === 0) return rawActivities;
    const [lat, lon] = lastLocation.split(',').map(Number);
    if (isNaN(lat) || isNaN(lon)) return rawActivities;
    return rawActivities.filter(act => {
      if (!act.geo_epgs_4326_latlon) return false;
      const [aLat, aLon] = act.geo_epgs_4326_latlon.split(',').map(Number);
      if (isNaN(aLat) || isNaN(aLon)) return false;
      const R = 6371;
      const dLat = (aLat - lat) * Math.PI / 180;
      const dLon = (aLon - lon) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(aLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= lastRadius;
    });
  })();

  return (
    <div className="App">
      <aside className="App-sidebar">
        <div className="sidebar-logo">
          <img src="/logo192.png" alt="GoOnMap" style={{height: 65, width: 50, borderRadius: 3}} />
          <div className="sidebar-title sidebar-city--barcelona">Barcelona</div>         
        </div>
        <nav className="sidebar-nav">
          <button
            className={page === 'main' ? 'sidebar-btn active' : 'sidebar-btn'}
            onClick={() => setPage('main')}
            aria-label="Home"
          >
            <HomeIcon style={{ marginRight: 2 }} /> {t('nav.home')}
          </button>
          <button
            className={page === 'register' ? 'sidebar-btn active' : 'sidebar-btn'}
            onClick={() => setPage('register')}
            aria-label={t('nav.register')}
          >
            <EditIcon style={{ marginRight: 2 }} /> {t('nav.register')}
          </button>
          <button
            className={showAgenda ? 'sidebar-btn active' : 'sidebar-btn'}
            onClick={() => { setShowAgenda(a => !a); setAgendaRefreshKey(k => k + 1); }}
            aria-label={t('nav.agenda')}
            style={{ position: 'relative' }}
          >
            <span style={{ marginRight: 1 }}>🙋‍♂️</span> {t('nav.agenda')}
            {(() => { const count = activities.filter(a => isAttending(a.id)).length; return count > 0 ? (
              <span style={{
                position: 'absolute', top: 4, right: 8,
                background: '#25D366', color: '#fff',
                borderRadius: '999px', fontSize: '0.65rem',
                fontWeight: 800, padding: '1px 4px', minWidth: 18,
                textAlign: 'center', lineHeight: '16px',
              }}>{count}</span>
            ) : null; })()}
          </button>
          {/* Botón Debug oculto */}
        </nav>
      </aside>
      <div className="App-content">
        <header className="App-header">
          <div>
            <h1>{page === 'main' ? t('header.title') : t('header.titleRegister')}</h1>
          </div>
          <LanguageSwitcher />
        </header>
        <main className="App-main">
          {page === 'main' && (
            <>
              {/* Mapa ocupa todo el espacio disponible */}

              <div className="map-fullscreen" style={{ position: 'relative' }}>
                {/* Panel flotante de categorías */}
                <CategoryFilter
                  categories={CATEGORIES.map(c => c.id)}
                  selected={selectedCategories}
                  counts={activitiesInRadius.reduce((acc, activity) => {
                    const VALID_CAT_IDS = new Set(CATEGORIES.map(c => c.id));
                    const effectiveCat = activity.category && VALID_CAT_IDS.has(activity.category)
                      ? activity.category
                      : inferCategory(activity.name || '', activity.body || '');
                    acc[effectiveCat] = (acc[effectiveCat] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)}
                  onChange={setSelectedCategories}
                />
                <MapComponent activities={filteredActivities} userLocation={lastLocation} radiusKm={lastRadius} centerOn={centerOn} onActivitySelect={setSelectedMapActivity} openPopupForId={pinnedActivity?.id} openPopupSeq={popupTrigger} fitBoundsTrigger={fitBoundsTrigger} itinerary={itinerary} showRoute={showRoute} />

                {usingFallback && (
                  <div className="map-fallback-badge">
                    {t('sheet.fallbackBadge')}
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
                      <span className="radar-label">{t('sheet.searching')}</span>
                    </div>
                  </div>
                )}

                {/* Panel flotante de búsqueda (arriba-izquierda) */}
                <div ref={floatingPanelRef} className={`floating-panel${panelOpen ? '' : ' floating-panel--collapsed'}`}>
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
                      addressLabel={addressLabel}
                      setAddressLabel={setAddressLabel}
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
                          : <><span>✈️</span><span className="map-route-control__btn-text"> Ver ruta</span></>}
                      </button>
                    )}
                  </div>
                )}

                {/* Botón volver a Barcelona */}
                <button className="map-nav-btn-barcelona" onClick={handleGoToBarcelona} title="My position">🧭</button>

                {/* Slider de radio — arriba a la derecha */}
                <RadiusSlider
                  value={RADIUS_VALUES.includes(radius) ? radius : 2}
                  onChange={handleRadiusSliderChange}
                />

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
                  activities={filteredActivities}
                  isSearching={isSearching}
                  userCoords={userCoords}
                  open={sheetOpen}
                  setOpen={setSheetOpen}
                  onSelectOnMap={handleSelectOnMap}
                  pinnedActivityId={pinnedActivity?.id}
                  onAttendChange={() => setAgendaRefreshKey(k => k + 1)}
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
          <p>GoOnMap &copy; 2026 | {t('footer.tagline')}</p>
          <div className="footer-links">
            <a href="mailto:info@goonmap.es" className="footer-link footer-link--mail" title="Email">
              <MailIcon className="footer-link-icon" />
              <span>info@goonmap.es</span>
            </a>
            <a href="https://www.instagram.com/goonmap.app" target="_blank" rel="noopener noreferrer" className="footer-link footer-link--instagram" title="Instagram">
              <InstagramIcon className="footer-link-icon" />
              <span>goonmap.app</span>
            </a>
            <a href="https://www.tiktok.com/@goonmap" target="_blank" rel="noopener noreferrer" className="footer-link footer-link--tiktok" title="TikTok">
              <TiktokIcon className="footer-link-icon" />
              <span>@goonmap</span>
            </a>
          </div>
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

      {/* Mi Agenda */}
      {showAgenda && (
        <MyAgendaPanel
          key={agendaRefreshKey}
          activities={activities}
          onClose={() => setShowAgenda(false)}
          onAttendChange={() => setAgendaRefreshKey(k => k + 1)}
        />
      )}
    </div>
  );
}

export default App;




