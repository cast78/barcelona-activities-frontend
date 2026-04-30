import React, { useState } from 'react';
import { CATEGORIES } from './QueryForm';

interface Activity {
  id: string;
  name: string;
  start_date: string;
  start_time?: string;
  end_date: string;
  geo_epgs_4326_latlon?: string;
  body: string;
  category?: string;
  origen?: string;
  direccion?: string;
  venue_name?: string;
}

interface ActivityListProps {
  activities: Activity[];
}

function formatDate(d: string) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(t?: string): string {
  if (!t) return '';
  // HH:MM:SS → HH:MM
  const match = t.match(/^(\d{2}:\d{2})/);
  return match ? match[1] : '';
}

function getMapsUrl(activity: Activity): string | null {
  if (activity.geo_epgs_4326_latlon) {
    return `https://www.google.com/maps?q=${encodeURIComponent(activity.geo_epgs_4326_latlon)}`;
  }
  if (activity.venue_name || activity.direccion) {
    const query = [activity.venue_name, activity.direccion, 'Barcelona'].filter(Boolean).join(', ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }
  return null;
}

function isHappeningNow(activity: Activity): boolean {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  if (activity.start_date !== todayStr) return false;
  if (!activity.start_time) return false;
  const match = activity.start_time.match(/^(\d{2}):(\d{2})/);
  if (!match) return false;
  const eventMinutes = parseInt(match[1]) * 60 + parseInt(match[2]);
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  // Considera "ahora" si empezó hace menos de 2h o está a punto de empezar (próximos 15 min)
  return eventMinutes >= nowMinutes - 120 && eventMinutes <= nowMinutes + 15;
}

export const ActivityModal: React.FC<{ activity: Activity; onClose: () => void }> = ({ activity, onClose }) => {
  const cat = activity.category ? CATEGORIES.find(c => c.id === activity.category) : null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(34,34,59,0.55)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem', backdropFilter: 'blur(2px)'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '16px', maxWidth: '420px', width: '100%',
          boxShadow: '0 8px 40px rgba(34,34,59,0.18)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column', maxHeight: '90vh'
        }}
      >
        {/* Modal header */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: '#ffffff', padding: '1.1rem 1.1rem 1rem',
          position: 'relative'
        }}>
          {cat && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.5px', background: 'rgba(255,255,255,0.22)',
              borderRadius: '20px', padding: '0.18rem 0.6rem',
              marginBottom: '0.5rem'
            }}>
              {cat.emoji} {cat.label}
            </span>
          )}
          <h2 style={{ margin: '0', fontSize: '1rem', fontWeight: 700, paddingRight: '1rem' }}>
            {activity.name}
          </h2>
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: '1rem', right: '1rem',
              background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
              borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer',
              fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Modal body */}
        <div style={{ padding: '0.9rem 1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {/* Description */}
          <div>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>
              Description
            </p>
            <p style={{ margin: 0, color: '#22223b', lineHeight: '1.55', fontSize: '0.85rem', whiteSpace: 'pre-line' }}>
              {activity.body || '—'}
            </p>
          </div>

          {/* Fecha + Hora en fila */}
          <div style={{ display: 'grid', gridTemplateColumns: formatTime(activity.start_time) ? '1fr 1fr' : '1fr', gap: '0.5rem' }}>
            <div style={{ background: '#f7f7fa', borderRadius: '7px', padding: '0.5rem 0.75rem' }}>
              <p style={{ margin: '0 0 0.15rem', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>Date</p>
              <p style={{ margin: 0, fontWeight: 600, color: '#22223b', fontSize: '0.85rem' }}>📅 {formatDate(activity.start_date)}</p>
            </div>
            {formatTime(activity.start_time) && (
              <div style={{ background: '#f7f7fa', borderRadius: '7px', padding: '0.5rem 0.75rem' }}>
                <p style={{ margin: '0 0 0.15rem', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>Time</p>
                <p style={{ margin: 0, fontWeight: 600, color: '#667eea', fontSize: '0.85rem' }}>🕐 {formatTime(activity.start_time)}</p>
              </div>
            )}
          </div>

          {/* Lugar / Venue */}
          {(activity.venue_name || activity.direccion) && (
            <div style={{ background: '#f7f7fa', borderRadius: '7px', padding: '0.5rem 0.75rem' }}>
              <p style={{ margin: '0 0 0.15rem', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>Lugar</p>
              {activity.venue_name && (
                <p style={{ margin: activity.direccion ? '0 0 0.1rem' : '0', fontWeight: 600, color: '#22223b', fontSize: '0.85rem' }}>
                  🏛️ {activity.venue_name}
                </p>
              )}
              {activity.direccion && (
                <p style={{ margin: 0, fontWeight: 500, color: '#22223b', fontSize: '0.8rem' }}>
                  📍 {activity.direccion}
                </p>
              )}
              {getMapsUrl(activity) && (
                <a
                  href={getMapsUrl(activity)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-block', marginTop: '0.4rem', color: '#667eea', fontWeight: 600, fontSize: '0.78rem', textDecoration: 'none' }}
                >
                  🗺️ Ver en Google Maps →
                </a>
              )}
            </div>
          )}

          {/* Fuente */}
          {activity.origen && (
            <div style={{ background: '#f7f7fa', borderRadius: '7px', padding: '0.5rem 0.75rem' }}>
              <p style={{ margin: '0 0 0.15rem', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>Fuente</p>
              <p style={{ margin: 0, fontWeight: 500, color: activity.origen === 'mock' ? '#d97706' : '#059669', fontSize: '0.82rem' }}>
                {activity.origen === 'mock' ? '⚠️ Datos de ejemplo' : `🌐 ${activity.origen}`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ActivityList: React.FC<ActivityListProps> = ({ activities }) => {
  const [selected, setSelected] = useState<Activity | null>(null);

  return (
    <div style={{ margin: '0.5rem 0' }}>
      {activities.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem 1rem 2rem', textAlign: 'center', gap: '1rem' }}>
          <img src="/City.jpeg" alt="No activities" style={{ width: '140px', height: '140px', objectFit: 'cover', borderRadius: '8px', opacity: 0.8 }} />
          <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: 0, lineHeight: '1.6', maxWidth: '280px' }}>
            There are no activities nearby, based on the search parameters.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          {activities.map(activity => {
            const cat = activity.category ? CATEGORIES.find(c => c.id === activity.category) : null;
            return (
              <div
                key={activity.id}
                style={{
                  backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden',
                  boxShadow: isHappeningNow(activity)
                    ? '0 2px 12px rgba(245,158,11,0.25), 0 0 0 2px #f59e0b'
                    : '0 2px 12px rgba(34,34,59,0.08)',
                  transition: 'transform 0.18s, box-shadow 0.18s',
                  display: 'flex', flexDirection: 'column', cursor: 'pointer'
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 20px rgba(34,34,59,0.13)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(34,34,59,0.08)';
                }}
              >
                {/* Header */}
                <div style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white', padding: '0.75rem 1rem',
                  display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem'
                }}>
                  {cat && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1rem', lineHeight: 1, flexShrink: 0
                    }}>
                      {cat.emoji}
                    </span>
                  )}
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.2, flex: 1 }}>
                    {activity.name}
                  </h3>
                  {isHappeningNow(activity) && (
                    <span style={{
                      flexShrink: 0,
                      background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                      color: '#fff', fontSize: '0.62rem', fontWeight: 800,
                      padding: '0.15rem 0.5rem', borderRadius: '20px',
                      letterSpacing: '0.3px', textTransform: 'uppercase',
                      animation: 'pulse 1.5s infinite'
                    }}>
                      ⚡ Ahora
                    </span>
                  )}
                </div>

                {/* Body */}
                <div style={{ padding: '0.75rem 1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {/* Descripción truncada */}
                  <p style={{
                    margin: 0, color: '#444', fontSize: '0.84rem', lineHeight: '1.5',
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden'
                  } as React.CSSProperties}>
                    {activity.body}
                  </p>

                  {/* Lugar del evento */}
                  {(activity.venue_name || activity.direccion) && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', display: 'flex', alignItems: 'flex-start', gap: '0.25rem' }}>
                      <span style={{ flexShrink: 0 }}>📍</span>
                      <span style={{ lineHeight: 1.4 }}>
                        {activity.venue_name
                          ? (activity.direccion
                            ? `${activity.venue_name} · ${activity.direccion}`
                            : activity.venue_name)
                          : activity.direccion}
                      </span>
                    </div>
                  )}

                  {/* Fechas compactas */}
                  <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: '#6b7280', flexWrap: 'wrap' }}>
                    <span>📅 {formatDate(activity.start_date)}{formatTime(activity.start_time) ? ` · 🕐 ${formatTime(activity.start_time)}` : ''}</span>
                    {activity.end_date && activity.end_date !== activity.start_date && (
                      <span>→ {formatDate(activity.end_date)}</span>
                    )}
                  </div>

                  {/* Badge de fuente */}
                  {activity.origen && (
                    <span style={{
                      alignSelf: 'flex-start',
                      fontSize: '0.68rem', fontWeight: 600,
                      padding: '0.15rem 0.5rem', borderRadius: '20px',
                      background: activity.origen === 'mock' ? '#fef3c7' : '#d1fae5',
                      color: activity.origen === 'mock' ? '#92400e' : '#065f46'
                    }}>
                      {activity.origen === 'mock' ? '⚠️ ejemplo' : `🌐 ${activity.origen}`}
                    </span>
                  )}

                  {/* Botón detalle */}
                  <button
                    onClick={() => setSelected(activity)}
                    style={{
                      marginTop: 'auto', paddingTop: '0.4rem',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#667eea', fontSize: '0.78rem', fontWeight: 600,
                      textAlign: 'left', padding: '0.3rem 0 0', display: 'flex',
                      alignItems: 'center', gap: '0.25rem', fontFamily: 'inherit'
                    }}
                  >
                    Ver detalle →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de detalle */}
      {selected && <ActivityModal activity={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};

export default ActivityList;
