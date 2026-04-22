import React, { useState } from 'react';
import { CATEGORIES } from './QueryForm';

interface Activity {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  geo_epgs_4326_latlon?: string;
  body: string;
  category?: string;
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

const ActivityModal: React.FC<{ activity: Activity; onClose: () => void }> = ({ activity, onClose }) => {
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
          background: '#fff', borderRadius: '16px', maxWidth: '540px', width: '100%',
          boxShadow: '0 8px 40px rgba(34,34,59,0.18)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column', maxHeight: '90vh'
        }}
      >
        {/* Modal header */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: '#fff', padding: '1.5rem 1.5rem 1.25rem',
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
          <h2 style={{ margin: '0', fontSize: '1.25rem', fontWeight: 700, paddingRight: '2rem' }}>
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
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Modal body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Descripción */}
          <div>
            <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>
              Descripción
            </p>
            <p style={{ margin: 0, color: '#22223b', lineHeight: '1.7', fontSize: '0.95rem', whiteSpace: 'pre-line' }}>
              {activity.body || '—'}
            </p>
          </div>

          {/* Fechas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={{ background: '#f7f7fa', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              <p style={{ margin: '0 0 0.2rem', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>Fecha inicio</p>
              <p style={{ margin: 0, fontWeight: 600, color: '#22223b', fontSize: '0.95rem' }}>📅 {formatDate(activity.start_date)}</p>
            </div>
            <div style={{ background: '#f7f7fa', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              <p style={{ margin: '0 0 0.2rem', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>Fecha fin</p>
              <p style={{ margin: 0, fontWeight: 600, color: '#22223b', fontSize: '0.95rem' }}>📅 {formatDate(activity.end_date)}</p>
            </div>
          </div>

          {/* Ubicación */}
          {activity.geo_epgs_4326_latlon && (
            <div style={{ background: '#f7f7fa', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              <p style={{ margin: '0 0 0.2rem', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>Ubicación</p>
              <p style={{ margin: 0, fontWeight: 500, color: '#22223b', fontSize: '0.9rem', fontFamily: 'monospace' }}>
                📍 {activity.geo_epgs_4326_latlon}
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
    <div style={{ margin: '2rem 0' }}>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>
        📋 Actividades Disponibles {activities.length > 0 && <span style={{color: '#667eea', fontWeight: 800}}>({activities.length})</span>}
      </h2>

      {activities.length === 0 ? (
        <p style={{ color: '#999', textAlign: 'center', padding: '2rem' }}>
          No hay actividades disponibles
        </p>
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
                  boxShadow: '0 2px 12px rgba(34,34,59,0.08)',
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
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.2 }}>
                    {activity.name}
                  </h3>
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

                  {/* Fechas compactas */}
                  <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                    <span>📅 {formatDate(activity.start_date)}</span>
                    {activity.end_date && activity.end_date !== activity.start_date && (
                      <span>→ {formatDate(activity.end_date)}</span>
                    )}
                  </div>

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
