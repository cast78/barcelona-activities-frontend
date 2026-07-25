
import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, Polyline } from 'react-leaflet';
import type { CircleProps } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { Activity } from '../api';
import { CATEGORIES, inferCategory } from './QueryForm';
import { getTimeBadge, getDistanceBadge } from './ActivityList';
import type { Itinerary } from './ItineraryPlanner';
import { getAllLikedLocal, getLikeCountsLocal, setLikedLocal, setLikeCountLocal, toggleLike,
  getAllAttendingLocal, getAttendCountsLocal, setAttendingLocal, setAttendCountLocal, toggleAttend } from '../api';

// Fix Leaflet marker icons for React-Leaflet
// @ts-ignore
((L as any).Icon.Default).mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export interface CenterOn {
  lat: number;
  lng: number;
  zoom: number;
}

interface MapComponentProps {
  activities: Activity[];
  userLocation?: string;
  radiusKm?: number;
  centerOn?: CenterOn | null;
  onActivitySelect?: (activity: Activity) => void;
  openPopupForId?: string | null;
  openPopupSeq?: number;
  fitBoundsTrigger?: number;
  itinerary?: Itinerary | null;
  showRoute?: boolean;
}

// Componente auxiliar para manejar el mapa
const MapContent: React.FC<{
  activities: Activity[];
  userLocation?: string;
  radiusKm?: number;
  centerOn?: CenterOn | null;
  onActivitySelect?: (activity: Activity) => void;
  openPopupForId?: string | null;
  openPopupSeq?: number;
  fitBoundsTrigger?: number;
  itinerary?: Itinerary | null;
  showRoute?: boolean;
}> = ({ activities, userLocation, radiusKm, centerOn, onActivitySelect, openPopupForId, openPopupSeq, fitBoundsTrigger, itinerary, showRoute }) => {
  const map = useMap();
  const markerRefs = React.useRef<Map<string, any>>(new Map());
  const [likedIds, setLikedIds] = React.useState<Record<string, boolean>>(() => getAllLikedLocal());
  const [likeCounts, setLikeCounts] = React.useState<Record<string, number>>(() => getLikeCountsLocal());
  const [attendingIds, setAttendingIds] = React.useState<Record<string, boolean>>(() => getAllAttendingLocal());
  const [attendCounts, setAttendCounts] = React.useState<Record<string, number>>(() => getAttendCountsLocal());

  const handleMapLike = async (activity: Activity, e: React.MouseEvent) => {
    e.stopPropagation();
    const id = activity.id;
    const currentlyLiked = !!likedIds[id];
    const action = currentlyLiked ? 'unlike' : 'like';
    const currentCount = likeCounts[id] ?? activity.likes ?? 0;
    const newCount = Math.max(0, action === 'like' ? currentCount + 1 : currentCount - 1);
    const newLikedIds = { ...likedIds };
    if (action === 'like') newLikedIds[id] = true; else delete newLikedIds[id];
    setLikedIds(newLikedIds);
    setLikeCounts(prev => ({ ...prev, [id]: newCount }));
    setLikedLocal(id, action === 'like');
    setLikeCountLocal(id, newCount);
    try {
      const serverCount = await toggleLike(id, action);
      setLikeCounts(prev => ({ ...prev, [id]: serverCount }));
      setLikeCountLocal(id, serverCount);
    } catch {}
  };

  const handleMapAttend = async (activity: Activity, e: React.MouseEvent) => {
    e.stopPropagation();
    const id = activity.id;
    const currentlyAttending = !!attendingIds[id];
    const action = currentlyAttending ? 'unattend' : 'attend';
    const currentCount = attendCounts[id] ?? activity.attendees ?? 0;
    const newCount = Math.max(0, action === 'attend' ? currentCount + 1 : currentCount - 1);
    const newAttendingIds = { ...attendingIds };
    if (action === 'attend') newAttendingIds[id] = true; else delete newAttendingIds[id];
    setAttendingIds(newAttendingIds);
    setAttendCounts(prev => ({ ...prev, [id]: newCount }));
    setAttendingLocal(id, action === 'attend');
    setAttendCountLocal(id, newCount);
    try {
      const serverCount = await toggleAttend(id, action);
      setAttendCounts(prev => ({ ...prev, [id]: serverCount }));
      setAttendCountLocal(id, serverCount);
    } catch {}
  };

  // Centrar en Barcelona al montar y ocultar zoom nativo (se usa rueda/pinch)
  React.useEffect(() => {
    map.setView([41.3851, 2.1734], 11);
    map.zoomControl.remove();
  }, [map]);

  // Re-centrar cuando cambia userLocation (búsqueda)
  React.useEffect(() => {
    if (!userLocation) return;
    const parts = userLocation.split(',').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const zoom = radiusKm === 10 ? 11 : radiusKm === 5 ? 12 : 13;
      map.setView([parts[0], parts[1]], zoom, { animate: true });
    }
  }, [userLocation, map]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bajar zoom cuando el radio cambia a 5 km o 10 km (para ver el círculo completo)
  React.useEffect(() => {
    if (radiusKm !== 5 && radiusKm !== 10) return;
    if (!userLocation) return;
    const parts = userLocation.split(',').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const zoom = radiusKm === 10 ? 11 : 12;
      map.setView([parts[0], parts[1]], zoom, { animate: true });
    }
  }, [radiusKm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-centrar cuando se pide desde fuera (botones 📍 y 🏠)
  React.useEffect(() => {
    if (!centerOn) return;
    map.setView([centerOn.lat, centerOn.lng], centerOn.zoom, { animate: true });
  }, [centerOn, map]);

  // Abrir popup del marker tras el pan/zoom (moveend)
  React.useEffect(() => {
    if (!openPopupForId) return;
    const openIt = () => {
      const marker = markerRefs.current.get(openPopupForId);
      if (marker) marker.openPopup();
    };
    // Si el mapa ya está quieto (mismo pin clicado de nuevo), abrir directamente
    const marker = markerRefs.current.get(openPopupForId);
    if (marker) {
      marker.openPopup();
    } else {
      map.once('moveend', openIt);
    }
    return () => { map.off('moveend', openIt); };
  }, [openPopupForId, openPopupSeq, map]);

  // fitBounds: ajustar zoom para ver todos los markers de las actividades filtradas
  React.useEffect(() => {
    if (!fitBoundsTrigger) return;
    const coords = activities
      .map(a => a.geo_epgs_4326_latlon)
      .filter(Boolean)
      .map(s => s!.split(',').map(Number))
      .filter(p => p.length === 2 && !isNaN(p[0]) && !isNaN(p[1]));
    if (coords.length === 0) return;
    const bounds = (L as any).latLngBounds(coords.map(([lat, lng]) => [lat, lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
  }, [fitBoundsTrigger, activities, map]);

  let userCoords: [number, number] | null = null;
  if (userLocation) {
    const parts = userLocation.split(',').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      userCoords = [parts[0], parts[1]];
    }
  }

  const userIcon = (L as any).divIcon({
    className: '',
    html: '<div style="width:14px;height:14px;background:#1a73e8;border:2.5px solid #fff;border-radius:50%;box-shadow:0 0 0 2px #1a73e8"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

  const getLikeColor = (likes: number = 0): string => {
    if (likes === 0) return '#3b82f6';  // azul — sin datos
    if (likes <= 3)  return '#eab308';  // amarillo — poco interés
    if (likes <= 6)  return '#f97316';  // naranja — interés moderado
    return '#22c55e';                   // verde — muy popular
  };

  const makeActivityIcon = (likes: number = 0, badgeLabel?: string, borderColor?: string) => {
    const color = getLikeColor(likes);
    const hasBadge = !!badgeLabel;
    const strokeColor = borderColor || '#fff';
    const pulseStyle = badgeLabel === 'Ahora' ? 'animation:markerPulse 1.2s ease-in-out infinite;' : '';
    const badgeEmoji = badgeLabel === 'Ahora' ? '⚡' : badgeLabel === '30min' ? '⏰' : badgeLabel === '1h' ? '🕐' : badgeLabel === '2h' ? '🕑' : badgeLabel === '1día' ? '📅' : '';
    const html = `
      <div style="position:relative;width:25px;height:41px;${pulseStyle}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41">
          <path d="M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.5 12.5 28.5S25 21.875 25 12.5C25 5.596 19.404 0 12.5 0z"
            fill="${color}" stroke="${hasBadge ? strokeColor : '#fff'}" stroke-width="${hasBadge ? '2.5' : '1.5'}"/>
          <circle cx="12.5" cy="12.5" r="5" fill="#fff" opacity="0.85"/>
        </svg>
        ${hasBadge ? `<div style="position:absolute;top:-6px;right:-6px;background:${borderColor || '#f59e0b'};color:#fff;font-size:8px;font-weight:800;padding:1px 4px;border-radius:8px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${badgeEmoji}</div>` : ''}
      </div>`;
    return (L as any).divIcon({ className: '', html, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] });
  };

  const makeNumberedIcon = (num: number) => {
    return (L as any).divIcon({
      className: '',
      html: `<div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:2px solid #fff;z-index:9999">${num}</div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 30],
    });
  };

  const MODE_COLORS: Record<string, { color: string; dashArray?: string }> = {
    walking: { color: '#10b981', dashArray: '6 4' },   // verde
    cycling: { color: '#f59e0b', dashArray: '10 4' },  // naranja
    metro:   { color: '#ef4444', dashArray: undefined }, // rojo sólido
  };

  const itinerarySegments = itinerary
    ? itinerary.stops.map(s => ({ geometry: s.routeGeometry || [], mode: s.travelMode }))
    : [];
  const itineraryStopIds = new Set(itinerary?.stops.map(s => s.activity.id) ?? []);

  return (
    <>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {userCoords && (
        <Marker position={userCoords} {...{ icon: userIcon } as any}>
          <Popup><strong>Tu ubicación</strong></Popup>
        </Marker>
      )}
      {userCoords && radiusKm !== undefined && (
        <Circle
          {...{
            center: userCoords as [number, number],
            radius: Number(radiusKm) * 1000,
            pathOptions: { color: '#667eea', weight: 1.5, fillColor: '#667eea', fillOpacity: 0.07 }
          } as CircleProps}
        />
      )}
      {activities.map(activity => {
        try {
          if (!activity.geo_epgs_4326_latlon || typeof activity.geo_epgs_4326_latlon !== 'string') {
            return null;
          }
          const coords = activity.geo_epgs_4326_latlon.split(',').map(Number);
          if (coords && coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
            const timeBadge = getTimeBadge(activity);
            const distBadge = getDistanceBadge(activity, userCoords);
            const inItinerary = showRoute && itineraryStopIds.has(activity.id);
            const markerBadge = inItinerary ? undefined : (timeBadge ?? distBadge);
            return (
              <Marker
                key={activity.id}
                position={[coords[0], coords[1]] as [number, number]}
                ref={(m: any) => {
                  if (m) markerRefs.current.set(activity.id, m);
                  else markerRefs.current.delete(activity.id);
                }}
                {...{ icon: makeActivityIcon(activity.likes, markerBadge?.label, markerBadge?.borderColor) } as any}
              >
                <Popup {...{ maxWidth: 240 } as any}>
                  <div style={{ fontFamily: 'inherit', minWidth: 210 }}>
                    {/* Nombre + emoji categoría */}
                    {(() => {
                      const catId = activity.category || inferCategory(activity.name || '', activity.body || '');
                      const cat = CATEGORIES.find(c => c.id === catId) || CATEGORIES.find(c => c.id === 'other')!;
                      return (
                        <p style={{ margin: '0 0 0.35rem', fontWeight: 700, fontSize: '0.87rem', color: '#111827', lineHeight: 1.3 }}>
                          {cat.emoji} {activity.name}
                        </p>
                      );
                    })()}

                    {/* Badges: tiempo + distancia */}
                    {(timeBadge || distBadge) && (
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                        {timeBadge && (
                          <span style={{
                            background: timeBadge.gradient, color: '#fff',
                            fontSize: '0.6rem', fontWeight: 800,
                            padding: '0.1rem 0.4rem', borderRadius: '10px',
                            letterSpacing: '0.3px', textTransform: 'uppercase',
                            animation: timeBadge.label === 'Ahora' ? 'pulse 1.5s infinite' : 'none'
                          }}>{timeBadge.emoji} {timeBadge.label}</span>
                        )}
                        {distBadge && (
                          <span style={{
                            background: distBadge.gradient, color: '#fff',
                            fontSize: '0.6rem', fontWeight: 800,
                            padding: '0.1rem 0.4rem', borderRadius: '10px',
                            letterSpacing: '0.3px', textTransform: 'uppercase'
                          }}>{distBadge.emoji} {distBadge.label}</span>
                        )}
                      </div>
                    )}

                    {/* Fecha y horario */}
                    {(() => {
                      const hasDate = !!activity.start_date;
                      const hasTime = !!activity.start_time;
                      if (!hasDate) return null;
                      const datePart = activity.start_date.split('T')[0];
                      const dateObj = new Date(datePart);
                      const dateStr = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
                      if (!hasTime) {
                        return (
                          <p style={{ margin: '0 0 0.3rem', fontSize: '0.74rem', color: '#667eea', fontWeight: 600 }}>
                            📅 {dateStr} · Todo el día
                          </p>
                        );
                      }
                      const startT = activity.start_time!;
                      const endT = activity.end_time && activity.end_time !== startT ? activity.end_time : null;
                      return (
                        <p style={{ margin: '0 0 0.3rem', fontSize: '0.74rem', color: '#667eea', fontWeight: 600 }}>
                          📅 {dateStr} · 🕐 {startT}{endT ? ` - ${endT}` : ''}
                        </p>
                      );
                    })()}

                    {/* Venue / dirección */}
                    {(activity.venue_name || activity.direccion) && (
                      <p style={{ margin: '0 0 0.4rem', fontSize: '0.71rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        📍 {[activity.venue_name, activity.direccion].filter(Boolean).join(' · ')}
                      </p>
                    )}

                    {/* Separador */}
                    <div style={{ borderTop: '1px solid #f3f4f6', margin: '0.4rem 0' }} />

                    {/* Google Calendar */}
                    {activity.start_date && (() => {
                      const datePart = activity.start_date.split('T')[0].replace(/-/g, '');
                      const startT = activity.start_time ? activity.start_time.replace(':', '') + '00' : null;
                      const endT = activity.end_time ? activity.end_time.replace(':', '') + '00'
                        : activity.start_time ? (() => {
                            const [h, m] = activity.start_time.split(':').map(Number);
                            const durMin = 90;
                            const endH = Math.floor((h * 60 + m + durMin) / 60) % 24;
                            const endM = (h * 60 + m + durMin) % 60;
                            return String(endH).padStart(2, '0') + String(endM).padStart(2, '0') + '00';
                          })() : null;
                      const dates = startT
                        ? `${datePart}T${startT}/${datePart}T${endT}`
                        : `${datePart}/${datePart}`;
                      const loc = [activity.venue_name, activity.direccion].filter(Boolean).join(', ');
                      const mapsUrl = activity.geo_epgs_4326_latlon ? `https://maps.google.com/?q=${activity.geo_epgs_4326_latlon}` : null;
                      const calDetails = [activity.body || '', mapsUrl ? `📍 Ver en Google Maps: ${mapsUrl}` : ''].filter(Boolean).join('\n\n');
                      const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(activity.name || '')}&dates=${dates}&details=${encodeURIComponent(calDetails)}&location=${encodeURIComponent(loc)}`;
                      return (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'block', marginTop: '0.4rem',
                            textAlign: 'center', textDecoration: 'none',
                            background: '#f0f4ff', border: '1px solid #c7d2fe',
                            borderRadius: '6px', padding: '0.3rem 0.5rem',
                            fontSize: '0.72rem', fontWeight: 600, color: '#4338ca'
                          }}
                        >
                          ⏰ Añadir a Google Calendar
                        </a>
                      );
                    })()}

                    {/* WhatsApp */}
                    {(() => {
                      const datePart = activity.start_date ? activity.start_date.split('T')[0] : null;
                      const dateObj = datePart ? new Date(datePart) : null;
                      const dateStr = dateObj ? dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
                      const startT = activity.start_time || null;
                      const endT = activity.end_time && activity.end_time !== startT ? activity.end_time : null;
                      const timeStr = startT ? `🕐 ${startT}${endT ? ` - ${endT}` : ''}` : null;
                      const loc = [activity.venue_name, activity.direccion].filter(Boolean).join(', ');
                      const mapsLink = activity.geo_epgs_4326_latlon ? `https://maps.google.com/?q=${activity.geo_epgs_4326_latlon}` : null;
                      const lines = [
                        `🎭 ${activity.name || ''}`,
                        dateStr ? `📅 ${dateStr}${timeStr ? ` · ${timeStr}` : ''}` : '',
                        loc ? `📍 ${loc}` : '',
                        mapsLink ? `🗺️ ${mapsLink}` : '',
                        '',
                        '🏙️ Compartido desde GoOnMap Barcelona',
                      ].filter(Boolean);
                      const url = `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
                      return (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'block', marginTop: '0.3rem',
                            textAlign: 'center', textDecoration: 'none',
                            background: '#f0fdf4', border: '1px solid #86efac',
                            borderRadius: '6px', padding: '0.3rem 0.5rem',
                            fontSize: '0.72rem', fontWeight: 600, color: '#166534'
                          }}
                        >
                          💬 Compartir por WhatsApp
                        </a>
                      );
                    })()}

                    {/* Acciones */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.35rem' }}>
                      {onActivitySelect && (
                        <button
                          onClick={() => onActivitySelect(activity)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#667eea', fontSize: '0.75rem', fontWeight: 600, padding: 0, fontFamily: 'inherit' }}
                        >
                          Ver detalle →
                        </button>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                          onClick={(e) => handleMapLike(activity, e)}
                          title={likedIds[activity.id] ? 'Quitar me gusta' : 'Me gusta'}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.2rem',
                            fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600,
                            color: likedIds[activity.id] ? '#ef4444' : '#9ca3af', padding: 0
                          }}
                        >
                          {likedIds[activity.id] ? '❤️' : '🤍'}
                          <span style={{ fontSize: '0.7rem' }}>{likeCounts[activity.id] ?? activity.likes ?? 0}</span>
                        </button>
                        <button
                          onClick={(e) => handleMapAttend(activity, e)}
                          title={attendingIds[activity.id] ? 'Cancelar asistencia' : '¡Asistiré!'}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.2rem',
                            fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600,
                            color: attendingIds[activity.id] ? '#22c55e' : '#9ca3af', padding: 0
                          }}
                        >
                          <span style={{ fontSize: '1rem' }}>🙋‍♂️</span>
                          <span style={{ fontSize: '0.72rem' }}>{attendCounts[activity.id] ?? activity.attendees ?? 0}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          }
        } catch (error) {
          console.warn('Error processing activity:', activity, error);
        }
        return null;
      })}

      {/* Itinerary polylines — color by mode */}
      {showRoute && itinerarySegments.map((seg, i) => {
        if (seg.geometry.length < 2) return null;
        const style = MODE_COLORS[seg.mode] ?? MODE_COLORS.walking;
        return (
          <Polyline
            key={`seg-${i}`}
            positions={seg.geometry as any}
            pathOptions={{ color: style.color, weight: 5, opacity: 0.9, dashArray: style.dashArray }}
          />
        );
      })}

      {/* Numbered overlays for itinerary stops */}
      {showRoute && itinerary && itinerary.stops.map((stop, i) => {
        const coordStr = stop.activity.geo_epgs_4326_latlon;
        if (!coordStr) return null;
        const parts = coordStr.split(',').map(Number);
        if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
        const total = itinerary.stops.length;
        const catId = stop.activity.category || inferCategory(stop.activity.name || '', stop.activity.body || '');
        const cat = CATEGORIES.find(c => c.id === catId) || CATEGORIES.find(c => c.id === 'other')!;
        const modeEmoji = stop.travelMode === 'metro' ? '🚇' : stop.travelMode === 'cycling' ? '🚲' : '🚶';
        const modeLabel = stop.travelMode === 'metro' ? 'metro' : stop.travelMode === 'cycling' ? 'bici' : 'a pie';
        const modeColor = stop.travelMode === 'metro' ? '#ef4444' : stop.travelMode === 'cycling' ? '#f59e0b' : '#10b981';
        const fmtT = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const fmtMin = (m: number) => m < 60 ? `${m}min` : `${Math.floor(m/60)}h ${m%60 > 0 ? m%60+'min' : ''}`.trim();
        const loc = [stop.activity.venue_name, stop.activity.direccion].filter(Boolean).join(', ');
        const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc || 'Barcelona')}`;
        return (
          <Marker
            key={`num-${stop.activity.id}`}
            position={[parts[0], parts[1]] as [number, number]}
            {...{ icon: makeNumberedIcon(i + 1), zIndexOffset: 1000 } as any}
          >
            <Popup {...{ maxWidth: 240 } as any}>
              <div style={{ fontFamily: 'inherit', minWidth: 200 }}>
                {/* Header: parada N de M */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                  <div style={{ background: 'linear-gradient(135deg,#667eea,#764ba2)', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                  <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 600 }}>PARADA {i + 1} DE {total}</span>
                </div>

                {/* Nombre */}
                <p style={{ margin: '0 0 0.25rem', fontWeight: 700, fontSize: '0.85rem', color: '#111827', lineHeight: 1.3 }}>
                  {cat.emoji} {stop.activity.name}
                </p>

                {/* Fecha del evento */}
                {(() => {
                  if (!stop.activity.start_date) return null;
                  const dateObj = new Date(stop.activity.start_date);
                  const dateStr = dateObj.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
                  if (!stop.activity.start_time) {
                    return <p style={{ margin: '0 0 0.25rem', fontSize: '0.72rem', color: '#667eea', fontWeight: 600 }}>📅 {dateStr} · Todo el día</p>;
                  }
                  const sT = stop.activity.start_time;
                  const eT = stop.activity.end_time && stop.activity.end_time !== sT ? stop.activity.end_time : null;
                  return <p style={{ margin: '0 0 0.25rem', fontSize: '0.72rem', color: '#667eea', fontWeight: 600 }}>� {dateStr} · 🕐 {sT}{eT ? ` - ${eT}` : ''}</p>;
                })()}

                {/* Horario */}
                <p style={{ margin: '0 0 0.3rem', fontSize: '0.75rem', color: '#667eea', fontWeight: 600 }}>
                  🕐 {fmtT(stop.arrivalTime)} → {fmtT(stop.departureTime)}
                </p>

                {/* Ubicación */}
                {loc && (
                  <p style={{ margin: '0 0 0.35rem', fontSize: '0.72rem', color: '#6b7280' }}>
                    📍 {loc}
                  </p>
                )}

                {/* Cómo llegar */}
                <div style={{ background: `${modeColor}18`, border: `1px solid ${modeColor}55`, borderRadius: '6px', padding: '0.3rem 0.5rem', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: modeColor }}>
                    {modeEmoji} {fmtMin(stop.travelMinutes)} {modeLabel}
                    {stop.distanceKm < 1
                      ? ` · ${Math.round(stop.distanceKm * 1000)}m`
                      : ` · ${stop.distanceKm.toFixed(1)}km`}
                    {i === 0 ? ' desde tu ubicación' : ` desde parada ${i}`}
                  </span>
                </div>

                {/* Acciones */}
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <a
                    href={gmapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ flex: 1, textAlign: 'center', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '0.3rem 0.4rem', fontSize: '0.7rem', fontWeight: 600, color: '#166534', textDecoration: 'none' }}
                  >
                    🗺️ Google Maps
                  </a>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
};

const MapComponent: React.FC<MapComponentProps> = ({ activities, userLocation, radiusKm, centerOn, onActivitySelect, openPopupForId, openPopupSeq, fitBoundsTrigger, itinerary, showRoute }) => {
  const mapProps = {
    center: [41.3851, 2.1734] as [number, number],
    zoom: 11,
    scrollWheelZoom: true,
  } as any;

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <MapContainer
        style={{ height: '100%', width: '100%', minHeight: '300px' }}
        {...mapProps}
      >
        <MapContent activities={activities} userLocation={userLocation} radiusKm={radiusKm} centerOn={centerOn} onActivitySelect={onActivitySelect} openPopupForId={openPopupForId} openPopupSeq={openPopupSeq} fitBoundsTrigger={fitBoundsTrigger} itinerary={itinerary} showRoute={showRoute} />
      </MapContainer>
    </div>
  );
};

export default MapComponent;
