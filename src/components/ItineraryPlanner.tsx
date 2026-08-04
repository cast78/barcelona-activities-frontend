import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useT } from '../i18n/useT';
import { Activity } from '../api';
import { CATEGORIES, inferCategory } from './QueryForm';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TravelMode = 'walking' | 'cycling' | 'metro';

export interface ItineraryStop {
  activity: Activity;
  arrivalTime: Date;       // when user arrives
  departureTime: Date;     // when user leaves (after activity)
  travelMinutes: number;   // travel from previous stop
  travelMode: TravelMode;
  distanceKm: number;
  routeGeometry?: [number, number][];  // lat,lon pairs from OSRM
}

export interface Itinerary {
  stops: ItineraryStop[];
  totalMinutes: number;
  totalDistanceKm: number;
  startCoords: [number, number];
}

// ── Duration heuristics ───────────────────────────────────────────────────────

const DURATION_BY_CATEGORY: Record<string, number> = {
  music:   120,
  show:    120,
  culture: 90,
  sport:   90,
  nature:  90,
  food:    60,
  family:  60,
  night:   120,
  other:   60,
};

function estimateDurationMin(activity: Activity): number {
  const catId = activity.category || inferCategory(activity.name || '', activity.body || '');
  return DURATION_BY_CATEGORY[catId] ?? 60;
}

// ── Travel time calculation ───────────────────────────────────────────────────

// Metro heuristic: walk to station (4min) + wait (2min) + ride at 28km/h + walk from station (4min)
function metroMinutes(distanceKm: number): number {
  const rideMin = (distanceKm / 28) * 60;
  return Math.round(4 + 2 + rideMin + 4);
}

async function getTravelTime(
  from: [number, number],
  to: [number, number],
  mode: TravelMode
): Promise<{ minutes: number; distanceKm: number; geometry: [number, number][] }> {
  const distKm = haversineKm(from[0], from[1], to[0], to[1]);

  if (mode === 'metro') {
    return { minutes: metroMinutes(distKm), distanceKm: distKm, geometry: [from, to] };
  }

  const osrmMode = mode === 'cycling' ? 'bike' : 'foot';
  try {
    const url = `https://router.project-osrm.org/route/v1/${osrmMode}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=simplified&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('OSRM error');
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) throw new Error('No route');
    const minutes = Math.ceil(route.duration / 60);
    const distance = route.distance / 1000;
    const coords: [number, number][] = route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
    return { minutes, distanceKm: distance, geometry: coords };
  } catch {
    // fallback to linear estimate
    const speed = mode === 'cycling' ? 14 : 4.5; // km/h
    return {
      minutes: Math.ceil((distKm / speed) * 60),
      distanceKm: distKm,
      geometry: [from, to],
    };
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Greedy algorithm ──────────────────────────────────────────────────────────

export async function buildItinerary(
  activities: Activity[],
  userCoords: [number, number],
  mode: TravelMode,
  endDate: string   // ISO date string from search params
): Promise<Itinerary> {
  const now = new Date();
  // Time budget: 8 hours from now OR end of endDate, whichever is later
  const budgetEndFromDate = new Date(endDate + 'T23:59:59');
  const budgetEnd8h = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const budgetEndClamped = budgetEndFromDate > budgetEnd8h ? budgetEndFromDate : budgetEnd8h;

  // Candidates: activities with valid coords (already date-filtered by the app)
  const BCNFALLBACK = '41.3851,2.1734';
  const candidates = activities.filter(act => {
    const coordStr = act.geo_epgs_4326_latlon || BCNFALLBACK;
    const parts = coordStr.split(',').map(Number);
    return parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]);
  });

  // ── Time-window helpers ───────────────────────────────────────────────────
  // Earliest time we can arrive and the event has started.
  // All-day (no start_time) → assumes 10:00.
  function resolveScheduledStart(act: Activity): Date | null {
    if (!act.start_date) return null;
    const datePart = act.start_date.split('T')[0]; // strip timestamp suffix e.g. '2026-05-12T00:00:00' → '2026-05-12'
    const timeStr = act.start_time || '10:00';
    return new Date(`${datePart}T${timeStr}`);
  }

  // Latest time by which we must arrive (the availability window closes).
  // • All-day event (no start_time): window open until 22:00 that day
  // • Timed event with real end_time: use end_time
  // • Timed event without end_time: start_time + categoryDuration
  function resolveWindowEnd(act: Activity, scheduledStart: Date): Date {
    const datePart = act.start_date ? act.start_date.split('T')[0] : '';
    if (act.end_time && datePart) {
      const candidate = new Date(`${datePart}T${act.end_time}`);
      if (candidate > scheduledStart) return candidate;
    }
    if (!act.start_time && datePart) {
      // All-day: available all day until 22:00
      return new Date(`${datePart}T22:00`);
    }
    return new Date(scheduledStart.getTime() + estimateDurationMin(act) * 60000);
  }

  // How long the user actually spends at the activity.
  // Uses real end_time duration when available; falls back to category estimate.
  function resolveVisitDuration(act: Activity, scheduledStart: Date): number {
    if (act.end_time && act.start_time && act.start_date) {
      const datePart = act.start_date.split('T')[0];
      const start = new Date(`${datePart}T${act.start_time}`);
      const end = new Date(`${datePart}T${act.end_time}`);
      const real = Math.round((end.getTime() - start.getTime()) / 60000);
      if (real > 0) return real;
    }
    return estimateDurationMin(act);
  }

  const stops: ItineraryStop[] = [];
  let currentCoords: [number, number] = userCoords;
  let currentTime = now;
  const used = new Set<string>();

  // Score-based greedy: each step picks the activity with the lowest cost.
  // score = travelMin + waitMin + lateMin * 1.5
  //   travelMin : minutes to reach the activity
  //   waitMin   : minutes waiting for it to open (arrived early)
  //   lateMin   : minutes past the activity end at arrival (×1.5 penalty — discourages impossible visits)
  // Activities already over or beyond time budget are skipped.
  while (true) {
    let bestAct: Activity | null = null;
    let bestTravel: { minutes: number; distanceKm: number; geometry: [number, number][] } | null = null;
    let bestEffectiveStart: Date | null = null;
    let bestScheduledEnd: Date | null = null;
    let bestScore = Infinity;

    for (const act of candidates) {
      if (used.has(act.id)) continue;
      const coordStr = act.geo_epgs_4326_latlon || BCNFALLBACK;
      const parts = coordStr.split(',').map(Number);
      const actCoords: [number, number] = [parts[0], parts[1]];

      // Rough travel estimate (haversine, no OSRM — scoring pass only)
      const distKm = haversineKm(currentCoords[0], currentCoords[1], actCoords[0], actCoords[1]);
      const modeSpeedKmh = mode === 'cycling' ? 14 : mode === 'metro' ? 28 : 4.5;
      const roughTravelMin = mode === 'metro' ? metroMinutes(distKm) : Math.ceil((distKm / modeSpeedKmh) * 60);
      const arrivalTime = new Date(currentTime.getTime() + roughTravelMin * 60000);

      // Resolve time window
      const scheduledStart = resolveScheduledStart(act) ?? arrivalTime;
      const windowEnd = resolveWindowEnd(act, scheduledStart);

      // Skip: availability window already closed
      if (windowEnd <= now) continue;
      // Skip: we would arrive after the window closes
      if (arrivalTime >= windowEnd) continue;

      // Effective visit start: max(arrival, scheduledStart)
      const effectiveStart = scheduledStart > arrivalTime ? scheduledStart : arrivalTime;
      const visitMin = resolveVisitDuration(act, scheduledStart);
      const effectiveEnd = new Date(effectiveStart.getTime() + visitMin * 60000);

      // Skip: visit would exceed time budget
      if (effectiveEnd > budgetEndClamped) continue;

      const waitMin = Math.max(0, (scheduledStart.getTime() - arrivalTime.getTime()) / 60000);
      const lateMin = Math.max(0, (arrivalTime.getTime() - windowEnd.getTime()) / 60000);
      const score = roughTravelMin + waitMin + lateMin * 1.5;

      if (score < bestScore) {
        bestScore = score;
        bestAct = act;
        bestEffectiveStart = effectiveStart;
        bestScheduledEnd = windowEnd;
        bestTravel = { minutes: roughTravelMin, distanceKm: distKm, geometry: [currentCoords, actCoords] };
      }
    }

    if (!bestAct || !bestTravel || !bestEffectiveStart || !bestScheduledEnd) break;

    // Fetch real OSRM route for the chosen activity
    const coordStr = bestAct.geo_epgs_4326_latlon || BCNFALLBACK;
    const parts = coordStr.split(',').map(Number);
    const actCoords: [number, number] = [parts[0], parts[1]];
    const realTravel = await getTravelTime(currentCoords, actCoords, mode);

    // Recalculate effective start with real OSRM travel time
    const realArrival = new Date(currentTime.getTime() + realTravel.minutes * 60000);
    const realScheduledStart = resolveScheduledStart(bestAct) ?? realArrival;
    const realEffectiveStart = realScheduledStart > realArrival ? realScheduledStart : realArrival;
    const visitDuration = resolveVisitDuration(bestAct, realEffectiveStart);
    const departure = new Date(realEffectiveStart.getTime() + visitDuration * 60000);

    stops.push({
      activity: bestAct,
      arrivalTime: realEffectiveStart,
      departureTime: departure,
      travelMinutes: realTravel.minutes,
      travelMode: mode,
      distanceKm: realTravel.distanceKm,
      routeGeometry: realTravel.geometry,
    });

    used.add(bestAct.id);
    currentCoords = actCoords;
    currentTime = departure;
  }

  const totalMinutes = stops.reduce((acc, s) => acc + estimateDurationMin(s.activity) + s.travelMinutes, 0);
  const totalDistanceKm = stops.reduce((acc, s) => acc + s.distanceKm, 0);

  return { stops, totalMinutes, totalDistanceKm, startCoords: userCoords };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function modeIcon(mode: TravelMode): string {
  return mode === 'metro' ? '🚇' : mode === 'cycling' ? '🚲' : '🚶';
}

function modeLabel(mode: TravelMode): string {
  return mode === 'metro' ? 'metro' : mode === 'cycling' ? 'bici' : 'a pie';
}

// ── Export helpers ────────────────────────────────────────────────────────────

function toICSDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z');
}

function exportICS(itinerary: Itinerary) {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GoOnMap Barcelona//ES',
    'CALSCALE:GREGORIAN',
  ];
  itinerary.stops.forEach((stop, i) => {
    const cat = CATEGORIES.find(c => c.id === (stop.activity.category || inferCategory(stop.activity.name || '', stop.activity.body || ''))) || CATEGORIES.find(c => c.id === 'other')!;
    const loc = [stop.activity.venue_name, stop.activity.direccion, 'Barcelona'].filter(Boolean).join(', ');
    lines.push(
      'BEGIN:VEVENT',
      `SUMMARY:${cat.emoji} ${stop.activity.name}`,
      `DTSTART:${toICSDate(stop.arrivalTime)}`,
      `DTEND:${toICSDate(stop.departureTime)}`,
      `LOCATION:${loc}`,
      `DESCRIPTION:Parada ${i + 1} de tu itinerario GoOnMap Barcelona`,
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'itinerario-goonmap.ics'; a.click();
  URL.revokeObjectURL(url);
}

function shareWhatsApp(itinerary: Itinerary) {
  const lines = ['https://GoOnMap.es', '', '📍 Mi ruta de eventos en Barcelona:', ''];
  itinerary.stops.forEach((stop, i) => {
    const cat = CATEGORIES.find(c => c.id === (stop.activity.category || inferCategory(stop.activity.name || '', stop.activity.body || ''))) || CATEGORIES.find(c => c.id === 'other')!;
    lines.push(`${i + 1}️⃣ ${cat.emoji} ${stop.activity.name} · ${fmtTime(stop.arrivalTime)}`);
    if (stop.activity.venue_name || stop.activity.direccion) {
      lines.push(`   📍 ${[stop.activity.venue_name, stop.activity.direccion].filter(Boolean).join(', ')}`);
    }
    if (stop.activity.geo_epgs_4326_latlon) {
      lines.push(`   🗺️ https://maps.google.com/?q=${stop.activity.geo_epgs_4326_latlon}`);
    }
    if (i < itinerary.stops.length - 1) {
      lines.push(`   ${modeIcon(stop.travelMode)} ${itinerary.stops[i + 1].travelMinutes}min ${modeLabel(stop.travelMode)}`);
    }
  });
  lines.push('', '🏙️ Generado con GoOnMap Barcelona');
  const text = encodeURIComponent(lines.join('\n'));
  window.open(`https://wa.me/?text=${text}`, '_blank');
}

function openGoogleCalendar(stop: ItineraryStop) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z');
  const loc = [stop.activity.venue_name, stop.activity.direccion, 'Barcelona'].filter(Boolean).join(', ');
  const cat = CATEGORIES.find(c => c.id === (stop.activity.category || inferCategory(stop.activity.name || '', stop.activity.body || ''))) || CATEGORIES.find(c => c.id === 'other')!;
  const mapsUrl = stop.activity.geo_epgs_4326_latlon ? `https://maps.google.com/?q=${stop.activity.geo_epgs_4326_latlon}` : null;
  const details = ['Planificado con GoOnMap Barcelona', mapsUrl ? `📍 Ver en Google Maps: ${mapsUrl}` : ''].filter(Boolean).join('\n\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${cat.emoji} ${stop.activity.name}`,
    dates: `${fmt(stop.arrivalTime)}/${fmt(stop.departureTime)}`,
    location: loc,
    details,
  });
  window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank');
}

// ── UI Component ──────────────────────────────────────────────────────────────

interface ItineraryPlannerProps {
  activities: Activity[];
  userCoords: [number, number] | null;
  endDate: string;
  onClose: () => void;
  onItineraryReady: (itinerary: Itinerary | null) => void;
  initialItinerary?: Itinerary | null;
}

const ItineraryPlanner: React.FC<ItineraryPlannerProps> = ({
  activities, userCoords, endDate, onClose, onItineraryReady, initialItinerary
}) => {
  const t = useT();
  const [mode, setMode] = useState<TravelMode>('walking');
  const [itinerary, setItinerary] = useState<Itinerary | null>(initialItinerary ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleGenerate = async () => {
    if (!userCoords) { setError(t('planner.errorNoLocation')); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await buildItinerary(activities, userCoords, mode, endDate);
      if (result.stops.length === 0) {
        setError(t('planner.errorNoActivities'));
        setItinerary(null);
        onItineraryReady(null);
      } else {
        setItinerary(result);
        onItineraryReady(result);
      }
    } catch {
      setError(t('planner.errorRoute'));
    } finally {
      setLoading(false);
    }
  };

  const headerGrad = 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)';

  return ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(34,34,59,0.45)', backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 560,
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 -8px 40px rgba(34,34,59,0.22)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ background: headerGrad, borderRadius: '20px 20px 0 0', padding: '1rem 1.1rem 0.9rem', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.6px', opacity: 0.8 }}>GoOnMap</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{t('planner.title')}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {itinerary && (
              <button
                onClick={() => { setItinerary(null); onItineraryReady(null); }}
                style={{
                  background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.5)',
                  color: '#fff', borderRadius: '20px', padding: '0.3rem 0.85rem',
                  cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'inherit',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                }}
              >
                {t('planner.changeMode')}
              </button>
            )}
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem', flex: 1 }}>

          {/* Mode selector */}
          {!itinerary && (
            <>
              <div>
                <p style={{ margin: '0 0 0.6rem', fontSize: '0.78rem', fontWeight: 600, color: '#6b7280', letterSpacing: '0.4px' }}>{t('planner.transport')}</p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(['walking', 'cycling', 'metro'] as TravelMode[]).map(m => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      style={{
                        flex: 1, padding: '0.6rem', border: `2px solid ${mode === m ? '#667eea' : '#e5e7eb'}`,
                        borderRadius: '10px', background: mode === m ? '#ede9fe' : '#f9fafb',
                        cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600,
                        color: mode === m ? '#4f46e5' : '#374151', transition: 'all 0.15s'
                      }}
                    >
                      {m === 'walking' ? t('planner.walking') : m === 'cycling' ? t('planner.cycling') : t('planner.metro')}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p style={{ margin: 0, color: '#ef4444', fontSize: '0.83rem', fontWeight: 500 }}>{error}</p>}

              <button
                onClick={handleGenerate}
                disabled={loading}
                style={{
                  background: loading ? '#c4b5fd' : headerGrad,
                  color: '#fff', border: 'none', borderRadius: '12px',
                  padding: '0.8rem', cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', fontSize: '0.95rem', fontWeight: 700,
                  boxShadow: loading ? 'none' : '0 4px 14px rgba(102,126,234,0.4)'
                }}
              >
                {loading ? t('planner.calculating') : t('planner.generate')}
              </button>
            </>
          )}

          {/* Itinerary result */}
          {itinerary && (
            <>
              {/* Summary bar */}
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span style={{ background: '#ede9fe', color: '#4f46e5', borderRadius: '20px', padding: '0.2rem 0.7rem', fontSize: '0.75rem', fontWeight: 700 }}>
                  {itinerary.stops.length} {t('planner.stops')}
                </span>
                <span style={{ background: '#d1fae5', color: '#065f46', borderRadius: '20px', padding: '0.2rem 0.7rem', fontSize: '0.75rem', fontWeight: 700 }}>
                  {fmtDuration(itinerary.totalMinutes)} {t('planner.total')}
                </span>
                <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: '20px', padding: '0.2rem 0.7rem', fontSize: '0.75rem', fontWeight: 700 }}>
                  {itinerary.totalDistanceKm.toFixed(1)} km
                </span>

              </div>

              {/* Stops */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {/* Origin */}
                <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start', paddingBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28, flexShrink: 0 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#667eea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#fff', fontWeight: 800 }}>📍</div>
                    <div style={{ width: 2, flex: 1, background: '#e5e7eb', marginTop: 2 }} />
                  </div>
                  <div style={{ paddingTop: '0.3rem' }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: '#22223b' }}>Tu ubicación</p>
                    <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: '#6b7280' }}>{fmtTime(new Date())}</p>
                  </div>
                </div>

                {itinerary.stops.map((stop, i) => {
                  const cat = CATEGORIES.find(c => c.id === (stop.activity.category || inferCategory(stop.activity.name || '', stop.activity.body || ''))) || CATEGORIES.find(c => c.id === 'other')!;
                  const isLast = i === itinerary.stops.length - 1;
                  return (
                    <React.Fragment key={stop.activity.id}>
                      {/* Travel segment */}
                      <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center', padding: '0.2rem 0' }}>
                        <div style={{ width: 28, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                          <div style={{ width: 2, height: 24, background: '#e5e7eb' }} />
                        </div>
                        <p style={{ margin: 0, fontSize: '0.71rem', color: '#9ca3af', fontStyle: 'italic' }}>
                          {modeIcon(stop.travelMode)} {stop.travelMinutes}min {modeLabel(stop.travelMode)} · {stop.distanceKm < 1 ? `${Math.round(stop.distanceKm * 1000)}m` : `${stop.distanceKm.toFixed(1)}km`}
                        </p>
                      </div>

                      {/* Stop card */}
                      <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start', paddingBottom: isLast ? 0 : '0.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28, flexShrink: 0 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#667eea,#764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#fff', fontWeight: 800 }}>{i + 1}</div>
                          {!isLast && <div style={{ width: 2, flex: 1, background: '#e5e7eb', marginTop: 2 }} />}
                        </div>
                        <div style={{ flex: 1, background: '#f7f7fa', borderRadius: '10px', padding: '0.6rem 0.75rem' }}>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: '#22223b' }}>
                            {cat.emoji} {stop.activity.name}
                          </p>
                          <p style={{ margin: '0.2rem 0 0', fontSize: '0.72rem', color: '#667eea', fontWeight: 600 }}>
                            🕐 {fmtTime(stop.arrivalTime)} – {fmtTime(stop.departureTime)} · {fmtDuration(estimateDurationMin(stop.activity))} aprox.
                          </p>
                          {(stop.activity.venue_name || stop.activity.direccion) && (
                            <p style={{ margin: '0.15rem 0 0', fontSize: '0.71rem', color: '#6b7280' }}>
                              📍 {[stop.activity.venue_name, stop.activity.direccion].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Export actions */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.3rem', borderTop: '1px solid #e5e7eb' }}>
                <p style={{ margin: '0 0 0.4rem', width: '100%', fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', letterSpacing: '0.4px' }}>Exportar itinerario</p>
                <button
                  onClick={() => exportICS(itinerary)}
                  style={{ flex: 1, minWidth: 120, padding: '0.55rem 0.5rem', background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600, color: '#3730a3' }}
                >
                  🗓 Apple / Outlook
                </button>
                <button
                  onClick={() => shareWhatsApp(itinerary)}
                  style={{ flex: 1, minWidth: 120, padding: '0.55rem 0.5rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600, color: '#166534' }}
                >
                  💬 WhatsApp
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ItineraryPlanner;
