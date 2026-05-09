import React, { useState } from 'react';
import ReactDOM from 'react-dom';
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
  // Time budget: from now until end of endDate (max 8h)
  const budgetEnd = new Date(endDate + 'T23:59:59');
  const maxMs = Math.min(budgetEnd.getTime() - now.getTime(), 8 * 60 * 60 * 1000);
  const budgetEndClamped = new Date(now.getTime() + maxMs);

  // Filter candidates: have coords, start in future (or ongoing), start_time known
  const BCNFALLBACK = '41.3851,2.1734';
  const candidates = activities.filter(act => {
    const coordStr = act.geo_epgs_4326_latlon || BCNFALLBACK;
    const parts = coordStr.split(',').map(Number);
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return false;
    if (!act.start_date || !act.start_time) return false;
    const startDt = new Date(`${act.start_date}T${act.start_time}`);
    return startDt >= now && startDt <= budgetEndClamped;
  });

  const stops: ItineraryStop[] = [];
  let currentCoords: [number, number] = userCoords;
  let currentTime = now;
  const used = new Set<string>();

  // Greedy: pick the activity that starts soonest and we can reach in time
  while (true) {
    let bestAct: Activity | null = null;
    let bestTravel: { minutes: number; distanceKm: number; geometry: [number, number][] } | null = null;
    let bestStartDt: Date | null = null;

    for (const act of candidates) {
      if (used.has(act.id)) continue;
      const coordStr = act.geo_epgs_4326_latlon || BCNFALLBACK;
      const parts = coordStr.split(',').map(Number);
      const actCoords: [number, number] = [parts[0], parts[1]];
      const startDt = new Date(`${act.start_date}T${act.start_time}`);
      const duration = estimateDurationMin(act);
      const endDt = new Date(startDt.getTime() + duration * 60000);

      // Can we reach it before it starts?
      const distKm = haversineKm(currentCoords[0], currentCoords[1], actCoords[0], actCoords[1]);
      const modeSpeedKmh = mode === 'cycling' ? 14 : mode === 'metro' ? 28 : 4.5;
      const roughTravelMin = mode === 'metro' ? metroMinutes(distKm) : Math.ceil((distKm / modeSpeedKmh) * 60);
      const arrivalIfWeLeaveNow = new Date(currentTime.getTime() + roughTravelMin * 60000);

      if (arrivalIfWeLeaveNow > startDt) continue;  // can't make it in time
      if (endDt > budgetEndClamped) continue;        // activity ends after budget

      if (!bestStartDt || startDt < bestStartDt) {
        bestAct = act;
        bestStartDt = startDt;
        bestTravel = { minutes: roughTravelMin, distanceKm: distKm, geometry: [currentCoords, actCoords] };
      }
    }

    if (!bestAct || !bestTravel || !bestStartDt) break;

    // Fetch real OSRM route for chosen activity
    const coordStr = bestAct.geo_epgs_4326_latlon || BCNFALLBACK;
    const parts = coordStr.split(',').map(Number);
    const actCoords: [number, number] = [parts[0], parts[1]];
    const realTravel = await getTravelTime(currentCoords, actCoords, mode);
    const duration = estimateDurationMin(bestAct);
    const departure = new Date(bestStartDt.getTime() + duration * 60000);

    stops.push({
      activity: bestAct,
      arrivalTime: bestStartDt,
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
    'PRODID:-//CityRadar Barcelona//ES',
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
      `DESCRIPTION:Parada ${i + 1} de tu itinerario CityRadar Barcelona`,
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'itinerario-cityradar.ics'; a.click();
  URL.revokeObjectURL(url);
}

function shareWhatsApp(itinerary: Itinerary) {
  const lines = ['🗺️ Mi plan para hoy en Barcelona:', ''];
  itinerary.stops.forEach((stop, i) => {
    const cat = CATEGORIES.find(c => c.id === (stop.activity.category || inferCategory(stop.activity.name || '', stop.activity.body || ''))) || CATEGORIES.find(c => c.id === 'other')!;
    lines.push(`${i + 1}️⃣ ${cat.emoji} ${stop.activity.name} · ${fmtTime(stop.arrivalTime)}`);
    if (stop.activity.venue_name || stop.activity.direccion) {
      lines.push(`   📍 ${[stop.activity.venue_name, stop.activity.direccion].filter(Boolean).join(', ')}`);
    }
    if (i < itinerary.stops.length - 1) {
      lines.push(`   ${modeIcon(stop.travelMode)} ${itinerary.stops[i + 1].travelMinutes}min ${modeLabel(stop.travelMode)}`);
    }
  });
  lines.push('', '🏙️ Generado con CityRadar Barcelona');
  const text = encodeURIComponent(lines.join('\n'));
  window.open(`https://wa.me/?text=${text}`, '_blank');
}

function openGoogleCalendar(stop: ItineraryStop) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z');
  const loc = [stop.activity.venue_name, stop.activity.direccion, 'Barcelona'].filter(Boolean).join(', ');
  const cat = CATEGORIES.find(c => c.id === (stop.activity.category || inferCategory(stop.activity.name || '', stop.activity.body || ''))) || CATEGORIES.find(c => c.id === 'other')!;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${cat.emoji} ${stop.activity.name}`,
    dates: `${fmt(stop.arrivalTime)}/${fmt(stop.departureTime)}`,
    location: loc,
    details: 'Planificado con CityRadar Barcelona',
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
}

const ItineraryPlanner: React.FC<ItineraryPlannerProps> = ({
  activities, userCoords, endDate, onClose, onItineraryReady
}) => {
  const [mode, setMode] = useState<TravelMode>('walking');
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!userCoords) { setError('Ubicación no disponible'); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await buildItinerary(activities, userCoords, mode, endDate);
      if (result.stops.length === 0) {
        setError('No se encontraron actividades compatibles con el tiempo disponible.');
        setItinerary(null);
        onItineraryReady(null);
      } else {
        setItinerary(result);
        onItineraryReady(result);
      }
    } catch {
      setError('Error al calcular la ruta. Inténtalo de nuevo.');
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
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', opacity: 0.8 }}>CityRadar</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>🗺️ Planificador de ruta</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem', flex: 1 }}>

          {/* Mode selector */}
          {!itinerary && (
            <>
              <div>
                <p style={{ margin: '0 0 0.6rem', fontSize: '0.78rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>¿Cómo te moverás?</p>
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
                      {m === 'walking' ? '🚶 A pie' : m === 'cycling' ? '🚲 Bici' : '🚇 Metro'}
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
                {loading ? '⏳ Calculando ruta...' : '✨ Generar itinerario'}
              </button>
            </>
          )}

          {/* Itinerary result */}
          {itinerary && (
            <>
              {/* Summary bar */}
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span style={{ background: '#ede9fe', color: '#4f46e5', borderRadius: '20px', padding: '0.2rem 0.7rem', fontSize: '0.75rem', fontWeight: 700 }}>
                  {itinerary.stops.length} paradas
                </span>
                <span style={{ background: '#d1fae5', color: '#065f46', borderRadius: '20px', padding: '0.2rem 0.7rem', fontSize: '0.75rem', fontWeight: 700 }}>
                  {fmtDuration(itinerary.totalMinutes)} total
                </span>
                <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: '20px', padding: '0.2rem 0.7rem', fontSize: '0.75rem', fontWeight: 700 }}>
                  {itinerary.totalDistanceKm.toFixed(1)} km
                </span>
                <button
                  onClick={() => { setItinerary(null); onItineraryReady(null); }}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#667eea', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  ↩ Cambiar modo
                </button>
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
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: '#22223b' }}>
                              {cat.emoji} {stop.activity.name}
                            </p>
                            {/* Google Calendar button per stop */}
                            <button
                              onClick={() => openGoogleCalendar(stop)}
                              title="Añadir a Google Calendar"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: 0, lineHeight: 1 }}
                            >📆</button>
                          </div>
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
                <p style={{ margin: '0 0 0.4rem', width: '100%', fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Exportar itinerario</p>
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
