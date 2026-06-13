import React from 'react';
import { useT } from '../i18n/useT';
import { Activity, getAllAttendingLocal, setAttendingLocal } from '../api';
import { CATEGORIES, inferCategory } from './QueryForm';

interface MyAgendaPanelProps {
  activities: Activity[];
  onClose: () => void;
  onAttendChange: () => void;
}

function formatDate(d: string) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
}

function formatTime(t?: string): string {
  if (!t) return '';
  const match = t.match(/^(\d{2}:\d{2})/);
  return match ? match[1] : '';
}

const MyAgendaPanel: React.FC<MyAgendaPanelProps> = ({ activities, onClose, onAttendChange }) => {
  const t = useT();
  const [attendingIds, setAttendingIds] = React.useState<Record<string, boolean>>(
    () => getAllAttendingLocal()
  );

  const agendaActivities = activities
    .filter(a => !!attendingIds[a.id])
    .sort((a, b) => {
      const dateA = a.start_date + (a.start_time || '00:00');
      const dateB = b.start_date + (b.start_time || '00:00');
      return dateA.localeCompare(dateB);
    });

  const handleRemove = (activity: Activity) => {
    const newIds = { ...attendingIds };
    delete newIds[activity.id];
    setAttendingIds(newIds);
    setAttendingLocal(activity.id, false);
    onAttendChange();
  };

  const handleShareWhatsApp = () => {
    if (agendaActivities.length === 0) return;
    const lines: string[] = [t('agenda.shareHeader'), ''];
    agendaActivities.forEach(a => {
      const catId = a.category || inferCategory(a.name || '', a.body || '');
      const cat = CATEGORIES.find(c => c.id === catId);
      const emoji = cat?.emoji || '📌';
      const date = formatDate(a.start_date);
      const time = a.start_time ? ` · ${formatTime(a.start_time)}h` : '';
      const venue = a.venue_name || a.direccion || '';
      lines.push(`${emoji} *${a.name}*`);
      lines.push(`   📅 ${date}${time}${venue ? `\n   📍 ${venue}` : ''}`);
      lines.push('');
    });
    lines.push(t('agenda.shareFooter'));
    lines.push('👉 https://barcelona-activities-frontend.vercel.app');
    const text = lines.join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0,
      width: 320, maxWidth: '92vw',
      background: '#fff',
      boxShadow: '-4px 0 24px rgba(34,34,59,0.18)',
      zIndex: 1010,
      display: 'flex', flexDirection: 'column',
      borderRadius: '16px 0 0 16px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: '#fff',
        padding: '1.1rem 1.2rem 0.9rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: 0.2 }}>
            {t('agenda.title')}
          </div>
          <div style={{ fontSize: '0.75rem', opacity: 0.85, marginTop: 2 }}>
            {agendaActivities.length === 0
              ? t('agenda.empty')
              : t('agenda.count', { count: agendaActivities.length })}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            width: 32, height: 32, borderRadius: '50%', cursor: 'pointer',
            fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label={t('agenda.close')}
        >✕</button>
      </div>

      {/* Activity list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
        {agendaActivities.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: '0.75rem',
            color: '#6b7280', textAlign: 'center', padding: '2rem 1rem',
          }}>
            <span style={{ fontSize: '2.5rem' }}>🗓️</span>
            <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>
              {t('agenda.emptyHint')}
            </p>
          </div>
        ) : (
          agendaActivities.map((activity, idx) => {
            const catId = activity.category || inferCategory(activity.name || '', activity.body || '');
            const cat = CATEGORIES.find(c => c.id === catId);
            const emoji = cat?.emoji || '📌';
            const time = activity.start_time ? formatTime(activity.start_time) + 'h' : '';
            const venue = activity.venue_name || activity.direccion || '';

            return (
              <div key={activity.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                padding: '0.7rem 0.5rem',
                borderBottom: idx < agendaActivities.length - 1 ? '1px solid #f0f0f4' : 'none',
              }}>
                {/* Index + emoji */}
                <div style={{
                  minWidth: 28, height: 28,
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  borderRadius: '50%', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', fontWeight: 800, flexShrink: 0,
                }}>
                  {idx + 1}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '0.82rem', fontWeight: 700, color: '#1f2937',
                    lineHeight: 1.3, marginBottom: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }} title={activity.name}>
                    {emoji} {activity.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span>📅 {formatDate(activity.start_date)}{time ? ` · ${time}` : ''}</span>
                    {venue && <span>📍 {venue}</span>}
                  </div>
                </div>

                {/* Remove button */}
                <button
                  onClick={() => handleRemove(activity)}
                  title={t('agenda.remove')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#d1d5db', fontSize: '1rem', padding: '0 2px',
                    flexShrink: 0, lineHeight: 1,
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#d1d5db')}
                  aria-label={t('agenda.remove')}
                >✕</button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer: share button */}
      {agendaActivities.length > 0 && (
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>
          <button
            onClick={handleShareWhatsApp}
            style={{
              width: '100%',
              background: '#25D366',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '0.7rem 1rem',
              fontWeight: 800,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: '0 2px 8px rgba(37,211,102,0.35)',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            {t('agenda.share')}
          </button>
          <p style={{ fontSize: '0.68rem', color: '#9ca3af', textAlign: 'center', margin: '0.4rem 0 0', lineHeight: 1.4 }}>
            {t('agenda.shareHint')}
          </p>
        </div>
      )}
    </div>
  );
};

export default MyAgendaPanel;
