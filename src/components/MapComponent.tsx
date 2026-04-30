
import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import type { CircleProps } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { Activity } from '../api';

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
              <Marker key={activity.id} position={[coords[0], coords[1]] as [number, number]}>
                <Popup>
                  <div style={{ minWidth: '180px' }}>
                    <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.9rem', fontWeight: 700 }}>{activity.name}</h4>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: '#555' }}>{activity.body}</p>
                    {onActivitySelect && (
                      <button
                        onClick={() => onActivitySelect(activity)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#667eea', fontSize: '0.75rem', fontWeight: 600, padding: 0, fontFamily: 'inherit' }}
                      >
                        Ver detalle →
                      </button>
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
