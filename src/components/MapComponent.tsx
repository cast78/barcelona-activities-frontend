
import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import type { CircleProps } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix Leaflet marker icons for React-Leaflet
// @ts-ignore
((L as any).Icon.Default).mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface Activity {
  id: string;
  name: string;
  geo_epgs_4326_latlon: string;
  body: string;
}

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
}

// Componente auxiliar para manejar el mapa
const MapContent: React.FC<{
  activities: Activity[];
  userLocation?: string;
  radiusKm?: number;
  centerOn?: CenterOn | null;
}> = ({ activities, userLocation, radiusKm, centerOn }) => {
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

  return (
    <>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
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
                  <div>
                    <h4 style={{ margin: '0 0 0.5rem 0' }}>{activity.name}</h4>
                    <p style={{ margin: '0', fontSize: '0.9rem' }}>{activity.body}</p>
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

const MapComponent: React.FC<MapComponentProps> = ({ activities, userLocation, radiusKm, centerOn }) => {
  return (
    <div style={{ height: '100%', width: '100%' }}>
      <MapContainer style={{ height: '100%', width: '100%', minHeight: '300px' }}>
        <MapContent activities={activities} userLocation={userLocation} radiusKm={radiusKm} centerOn={centerOn} />
      </MapContainer>
    </div>
  );
};

export default MapComponent;
