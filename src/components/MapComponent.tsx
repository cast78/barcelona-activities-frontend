
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

interface MapComponentProps {
  activities: Activity[];
  userLocation?: string;
  radiusKm?: number;
  mapHeight?: string;
}

// Componente auxiliar para manejar el mapa
const MapContent: React.FC<{ activities: Activity[]; userLocation?: string; radiusKm?: number }> = ({ activities, userLocation, radiusKm }) => {
  const map = useMap();

  // Centrar en Barcelona al montar
  React.useEffect(() => {
    map.setView([41.3851, 2.1734], 11);
  }, [map]);

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

const MapComponent: React.FC<MapComponentProps> = ({ activities, userLocation, radiusKm, mapHeight }) => {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', margin: 0 }}>
      <h2>📍 Mapa de Actividades</h2>
      <MapContainer style={{ flex: '1 1 0', minHeight: '400px', width: '100%', borderRadius: '8px' }}>
        <MapContent activities={activities} userLocation={userLocation} radiusKm={radiusKm} />
      </MapContainer>
      <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
        {activities.length} actividades mostradas en el mapa
      </p>
    </div>
  );
};

export default MapComponent;
