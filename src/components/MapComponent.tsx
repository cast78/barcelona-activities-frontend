
import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import type { CircleProps } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { Activity } from '../api';
import { CATEGORIES } from './QueryForm';
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
}

// Componente auxiliar para manejar el mapa
const MapContent: React.FC<{
  activities: Activity[];
  userLocation?: string;
  radiusKm?: number;
  centerOn?: CenterOn | null;
  onActivitySelect?: (activity: Activity) => void;
}> = ({ activities, userLocation, radiusKm, centerOn, onActivitySelect }) => {
  const map = useMap();
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

  // Centrar en Barcelona al montar y mover zoom a la derecha
  React.useEffect(() => {
    map.setView([41.3851, 2.1734], 11);
    map.zoomControl.setPosition('topright');
  }, [map]);

  // Re-centrar cuando cambia userLocation (búsqueda)
  React.useEffect(() => {
    if (!userLocation) return;
    const parts = userLocation.split(',').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      map.setView([parts[0], parts[1]], 13, { animate: true });
    }
  }, [userLocation, map]);

  // Re-centrar cuando se pide desde fuera (botones 📍 y 🏠)
  React.useEffect(() => {
    if (!centerOn) return;
    map.setView([centerOn.lat, centerOn.lng], centerOn.zoom, { animate: true });
  }, [centerOn, map]);

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

  const makeActivityIcon = (likes: number = 0) => {
    const color = getLikeColor(likes);
    const html = `
      <div style="position:relative;width:25px;height:41px">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41">
          <path d="M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.5 12.5 28.5S25 21.875 25 12.5C25 5.596 19.404 0 12.5 0z"
            fill="${color}" stroke="#fff" stroke-width="1.5"/>
          <circle cx="12.5" cy="12.5" r="5" fill="#fff" opacity="0.85"/>
        </svg>
      </div>`;
    return (L as any).divIcon({ className: '', html, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] });
  };

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
            pathOptions: { color: '#667eea', fillColor: '#667eea', fillOpacity: 0.15 }
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
            return (
              <Marker key={activity.id} position={[coords[0], coords[1]] as [number, number]} {...{ icon: makeActivityIcon(activity.likes) } as any}>
                <Popup>
                  <div style={{ minWidth: '180px' }}>
                    <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.9rem', fontWeight: 700 }}>
                      {(() => { const cat = activity.category ? CATEGORIES.find(c => c.id === activity.category) : null; return cat ? <>{cat.emoji} </> : null; })()}
                      {activity.name}
                    </h4>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: '#555' }}>{activity.body}</p>
                    {onActivitySelect && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.3rem' }}>
                        <button
                          onClick={() => onActivitySelect(activity)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#667eea', fontSize: '0.75rem', fontWeight: 600, padding: 0, fontFamily: 'inherit' }}
                        >
                          Ver detalle →
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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
                            🏃
                            <span style={{ fontSize: '0.7rem' }}>{attendCounts[activity.id] ?? activity.attendees ?? 0}</span>
                          </button>
                        </div>
                      </div>
                    )}
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
    </>
  );
};

const MapComponent: React.FC<MapComponentProps> = ({ activities, userLocation, radiusKm, centerOn, onActivitySelect }) => {
  return (
    <div style={{ height: '100%', width: '100%' }}>
      <MapContainer style={{ height: '100%', width: '100%', minHeight: '300px' }}>
        <MapContent activities={activities} userLocation={userLocation} radiusKm={radiusKm} centerOn={centerOn} onActivitySelect={onActivitySelect} />
      </MapContainer>
    </div>
  );
};

export default MapComponent;
