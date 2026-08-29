import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useT } from '../i18n/useT';
import { CATEGORIES, inferCategory } from './QueryForm';
import { toggleLike, setLikedLocal, getAllLikedLocal, getLikeCountsLocal, setLikeCountLocal, isLiked,
  toggleAttend, setAttendingLocal, getAllAttendingLocal, getAttendCountsLocal, setAttendCountLocal, isAttending, Activity, Plan } from '../api';

interface ActivityListProps {
  activities: Activity[];
  recommended?: Activity[];
  userCoords?: [number, number] | null;
  onSelectOnMap?: (activity: Activity) => void;
  pinnedActivityId?: string | null;
  onAttendChange?: () => void;
  isSheetOpen?: boolean;
  plans?: Plan[];
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

export function renderBodyWithLinks(body: string): React.ReactNode {
  const urlRegex = /(https?:\/\/[^\s·]+)/g;
  const parts = body.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: '#667eea', wordBreak: 'break-all' }}>{part}</a>
      : part
  );
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

export type TimeBadge = {
  label: string;
  emoji: string;
  gradient: string;
  borderColor: string;
} | null;

export function getTimeBadge(activity: Activity): TimeBadge {
  const today = new Date();
  const BCN_TZ = 'Europe/Madrid';
  const todayStr    = today.toLocaleDateString('en-CA', { timeZone: BCN_TZ });
  const tomorrowDate = new Date(today);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toLocaleDateString('en-CA', { timeZone: BCN_TZ });

  const isToday    = activity.start_date === todayStr;
  const isTomorrow = activity.start_date === tomorrowStr;
  if (!isToday && !isTomorrow) return null;

  const bcnNow = new Date(today.toLocaleString('en-US', { timeZone: BCN_TZ }));
  const nowMinutes = bcnNow.getHours() * 60 + bcnNow.getMinutes();

  if (!activity.start_time) {
    if (isTomorrow) return { label: '1día', emoji: '📅', gradient: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', borderColor: '#8b5cf6' };
    return null;
  }
  const matchStart = activity.start_time.match(/^(\d{2}):(\d{2})/);
  if (!matchStart) {
    if (isTomorrow) return { label: '1día', emoji: '📅', gradient: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', borderColor: '#8b5cf6' };
    return null;
  }
  const startMinutes = parseInt(matchStart[1]) * 60 + parseInt(matchStart[2]);
  const diffMinutes = isToday
    ? startMinutes - nowMinutes
    : (1440 - nowMinutes) + startMinutes;

  // Calcular end_time (para todos los badges)
  let endMinutes: number;
  if (activity.end_time) {
    const matchEnd = activity.end_time.match(/^(\d{2}):(\d{2})/);
    endMinutes = matchEnd ? parseInt(matchEnd[1]) * 60 + parseInt(matchEnd[2]) : startMinutes + 180;
  } else {
    endMinutes = startMinutes + 180;
  }
  
  // Manejar eventos que cruzan medianoche
  if (endMinutes < startMinutes) {
    endMinutes += 1440; // suma 24 horas
  }

  // Ya empezó (o empieza en ≤15 min) → "Ahora" si no ha terminado
  if (diffMinutes <= 25) {
    if (!isToday) return null;
    if (nowMinutes < endMinutes) {
      return { label: 'Ahora', emoji: '⚡', gradient: 'linear-gradient(135deg,#f59e0b,#ef4444)', borderColor: '#f59e0b' };
    }
    return null;
  }
  if (diffMinutes <= 45)  return { label: '30min', emoji: '⏰', gradient: 'linear-gradient(135deg,#ef4444,#dc2626)', borderColor: '#ef4444' };
  if (diffMinutes <= 105) return { label: '1h',    emoji: '🕐', gradient: 'linear-gradient(135deg,#f97316,#ea580c)', borderColor: '#f97316' };
  if (diffMinutes <= 135) return { label: '2h',    emoji: '🕑', gradient: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', borderColor: '#3b82f6' };
  return { label: '1día', emoji: '📅', gradient: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', borderColor: '#8b5cf6' };
}

export function isHappeningNow(activity: Activity): boolean {
  return getTimeBadge(activity)?.label === 'Ahora';
}

// ── Distance badge ─────────────────────────────────────────────────────────
export type DistanceBadge = {
  label: string;
  emoji: string;
  gradient: string;
  borderColor: string;
} | null;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getDistanceBadge(activity: Activity, userCoords: [number, number] | null): DistanceBadge {
  if (!userCoords || !activity.geo_epgs_4326_latlon) return null;
  const parts = activity.geo_epgs_4326_latlon.split(',').map(Number);
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  const m = haversineKm(userCoords[0], userCoords[1], parts[0], parts[1]) * 1000;
  if (m <= 150)  return { label: 'Aquí', emoji: '', gradient: 'linear-gradient(135deg,#ef4444,#dc2626)', borderColor: '#ef4444' };
  if (m <= 400)  return { label: '200m', emoji: '', gradient: 'linear-gradient(135deg,#f97316,#ea580c)', borderColor: '#f97316' };
  if (m <= 750)  return { label: '500m', emoji: '', gradient: 'linear-gradient(135deg,#eab308,#ca8a04)', borderColor: '#eab308' };
  if (m <= 1500) return { label: '1km',  emoji: '', gradient: 'linear-gradient(135deg,#84cc16,#65a30d)', borderColor: '#84cc16' };
  if (m <= 2500) return { label: '2km',  emoji: '', gradient: 'linear-gradient(135deg,#22c55e,#16a34a)', borderColor: '#22c55e' };
  return null;
}

const TIME_ORDER: Record<string, number> = { 'Ahora': 0, '30min': 1, '1h': 2, '2h': 3, '1día': 4 };
const DIST_ORDER: Record<string, number> = { 'Aquí': 0, '200m': 1, '500m': 2, '1km': 3, '2km': 4 };

export function sortByTimeAndDistance(activities: Activity[], userCoords: [number, number] | null): Activity[] {
  return [...activities].sort((a, b) => {
    const ta = getTimeBadge(a);
    const tb = getTimeBadge(b);
    const tPrioA = ta ? (TIME_ORDER[ta.label] ?? 5) : 5;
    const tPrioB = tb ? (TIME_ORDER[tb.label] ?? 5) : 5;
    if (tPrioA !== tPrioB) return tPrioA - tPrioB;

    const da = getDistanceBadge(a, userCoords);
    const db = getDistanceBadge(b, userCoords);
    const dPrioA = da ? (DIST_ORDER[da.label] ?? 5) : 5;
    const dPrioB = db ? (DIST_ORDER[db.label] ?? 5) : 5;
    if (dPrioA !== dPrioB) return dPrioA - dPrioB;

    const dateA = a.start_date + (a.start_time || '00:00');
    const dateB = b.start_date + (b.start_time || '00:00');
    return dateA.localeCompare(dateB);
  });
}

export const ActivityModal: React.FC<{ activity: Activity; onClose: () => void; userCoords?: [number, number] | null; plans?: Plan[] }> = ({ activity, onClose, userCoords, plans }) => {
  const t = useT();
  const catId = activity.category || inferCategory(activity.name || '', activity.body || '');
  const cat = CATEGORIES.find(c => c.id === catId) || CATEGORIES.find(c => c.id === 'other') || null;
  const [liked, setLiked] = useState(() => isLiked(activity.id));
  const [likeCount, setLikeCount] = useState(() => getLikeCountsLocal()[activity.id] ?? activity.likes ?? 0);
  const [attending, setAttending] = useState(() => isAttending(activity.id));
  const [attendCount, setAttendCount] = useState(() => getAttendCountsLocal()[activity.id] ?? activity.attendees ?? 0);

  const handleModalLike = async () => {
    const action = liked ? 'unlike' : 'like';
    const newCount = Math.max(0, action === 'like' ? likeCount + 1 : likeCount - 1);
    setLiked(!liked); setLikeCount(newCount);
    setLikedLocal(activity.id, !liked); setLikeCountLocal(activity.id, newCount);
    try { const s = await toggleLike(activity.id, action); setLikeCount(s); setLikeCountLocal(activity.id, s); } catch {}
  };

  const handleModalAttend = async () => {
    const action = attending ? 'unattend' : 'attend';
    const newCount = Math.max(0, action === 'attend' ? attendCount + 1 : attendCount - 1);
    setAttending(!attending); setAttendCount(newCount);
    setAttendingLocal(activity.id, !attending); setAttendCountLocal(activity.id, newCount);
    try { const s = await toggleAttend(activity.id, action); setAttendCount(s); setAttendCountLocal(activity.id, s); } catch {}
  };

  return ReactDOM.createPortal(
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
              {cat.emoji} {t(`categories.${cat.id}`)}
            </span>
          )}
          {(() => {
            const timeBadge = getTimeBadge(activity);
            const distBadge = getDistanceBadge(activity, userCoords ?? null);
            return (
              <>
                {timeBadge && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    marginLeft: cat ? '0.5rem' : '0',
                    background: timeBadge.gradient,
                    color: '#fff', fontSize: '0.62rem', fontWeight: 800,
                    padding: '0.15rem 0.5rem', borderRadius: '20px',
                    letterSpacing: '0.3px', textTransform: 'uppercase',
                    animation: timeBadge.label === 'Ahora' ? 'pulse 1.5s infinite' : 'none',
                    marginBottom: '0.5rem'
                  }}>
                    {timeBadge.emoji} {timeBadge.label}
                  </span>
                )}
                {distBadge && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    marginLeft: '0.4rem',
                    background: distBadge.gradient,
                    color: '#fff', fontSize: '0.62rem', fontWeight: 800,
                    padding: '0.15rem 0.5rem', borderRadius: '20px',
                    letterSpacing: '0.3px', textTransform: 'uppercase',
                    marginBottom: '0.5rem'
                  }}>
                    {distBadge.emoji} {distBadge.label}
                  </span>
                )}
              </>
            );
          })()}
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
                {t('activity.description')}
              </p>
              <p style={{ margin: 0, color: '#22223b', lineHeight: '1.55', fontSize: '0.85rem', whiteSpace: 'pre-line' }}>
                {activity.body ? renderBodyWithLinks(activity.body) : '—'}
              </p>
            </div>

            {/* Consejo GoOnMap - debajo de descripción */}
            {activity.origen === 'GoOnMap' && (() => {
              let note: string | undefined = activity.note;
              if (!note && plans) {
                for (const plan of plans) {
                  const stop = plan.activities.find(a => a.id === activity.id);
                  if (stop && stop.note) {
                    note = stop.note;
                    break;
                  }
                }
              }
              return note ? (
                <div style={{ background: '#fef3c7', borderRadius: '7px', padding: '0.6rem 0.75rem', borderLeft: '3px solid #fbbf24' }}>
                  <p style={{ margin: '0 0 0.1rem', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#92400e' }}>💡 {t('activity.goonmapRecommendation')}</p>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#78350f', lineHeight: '1.4' }}>{note}</p>
                </div>
              ) : null;
            })()}

            {/* Fecha + Hora en fila */}
            <div style={{ display: 'grid', gridTemplateColumns: formatTime(activity.start_time) ? '1fr 1fr' : '1fr', gap: '0.5rem' }}>
              <div style={{ background: '#f7f7fa', borderRadius: '7px', padding: '0.5rem 0.75rem' }}>
                <p style={{ margin: '0 0 0.15rem', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>{t('activity.date')}</p>
                <p style={{ margin: 0, fontWeight: 600, color: '#22223b', fontSize: '0.85rem' }}>📅 {formatDate(activity.start_date)}</p>
              </div>
              {formatTime(activity.start_time) && (
                <div style={{ background: '#f7f7fa', borderRadius: '7px', padding: '0.5rem 0.75rem' }}>
                  <p style={{ margin: '0 0 0.15rem', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>{t('activity.time')}</p>
                  <p style={{ margin: 0, fontWeight: 600, color: '#667eea', fontSize: '0.85rem' }}>🕐 {formatTime(activity.start_time)}</p>
                </div>
              )}
            </div>

            {/* Lugar / Venue */}
            {(activity.venue_name || activity.direccion) && (
              <div style={{ background: '#f7f7fa', borderRadius: '7px', padding: '0.5rem 0.75rem' }}>
                <p style={{ margin: '0 0 0.15rem', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>{t('activity.place')}</p>
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
                    {t('activity.viewOnMaps')}
                  </a>
                )}
              </div>
            )}

            {/* Fuente */}
            {activity.origen && (
              <div style={{ background: '#f7f7fa', borderRadius: '7px', padding: '0.5rem 0.75rem' }}>
                <p style={{ margin: '0 0 0.15rem', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>{t('activity.source')}</p>
                <p style={{ margin: 0, fontWeight: 500, color: activity.origen === 'mock' ? '#d97706' : '#059669', fontSize: '0.82rem' }}>
                  {activity.origen === 'mock' ? t('activity.sampleData') : `🌐 ${activity.origen}`}
                </p>
              </div>
            )}

            {/* Pie: botones like + asistir */}
            <div style={{ marginTop: '0.2rem', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              {activity.origen === 'GoOnMap' ? (
                // Actividades GoOnMap: solo badge visual
                <div title={t('activity.goonmapRecommendation')} style={{ 
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                  color: 'white',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '10px',
                  fontSize: '0.75rem',
                  fontWeight: 800
                }}>
                  ⭐
                </div>
              ) : (
                // Actividades de búsqueda: botones like + attend
                <>
                  <button
                    onClick={handleModalLike}
                    title={liked ? t('activity.unlike') : t('activity.like')}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '0.25rem',
                      fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600,
                      color: liked ? '#ef4444' : '#9ca3af',
                      transition: 'color 0.15s, transform 0.1s',
                      transform: liked ? 'scale(1.15)' : 'scale(1)',
                      padding: '0.2rem 0.3rem'
                    }}
                  >
                    {liked ? '❤️' : '🤍'}
                    <span style={{ fontSize: '0.72rem' }}>{likeCount}</span>
                  </button>
                  <button
                    onClick={handleModalAttend}
                    title={attending ? t('activity.unattend') : t('activity.attend')}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '0.25rem',
                      fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600,
                      color: attending ? '#22c55e' : '#9ca3af',
                      transition: 'color 0.15s, transform 0.1s',
                      transform: attending ? 'scale(1.15)' : 'scale(1)',
                      padding: '0.2rem 0.3rem'
                    }}
                  >
                    <span style={{ fontSize: '1rem' }}>🙋‍♂️</span>
                    <span style={{ fontSize: '0.72rem' }}>{attendCount}</span>
                  </button>
                </>
              )}
            </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const ActivityList: React.FC<ActivityListProps> = ({ activities, recommended, userCoords, onSelectOnMap, pinnedActivityId, onAttendChange, isSheetOpen, plans }) => {

  const t = useT();
  const [selected, setSelected] = useState<Activity | null>(null);
  const pinnedRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (pinnedActivityId && pinnedRef.current && isSheetOpen) {
      pinnedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [pinnedActivityId, isSheetOpen]);
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>(() => getAllLikedLocal());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>(() => getLikeCountsLocal());
  const [attendingIds, setAttendingIds] = useState<Record<string, boolean>>(() => getAllAttendingLocal());
  const [attendCounts, setAttendCounts] = useState<Record<string, number>>(() => getAttendCountsLocal());

  const handleLike = async (activity: Activity, e: React.MouseEvent) => {
    e.stopPropagation();
    const id = activity.id;
    const currentlyLiked = !!likedIds[id];
    const action = currentlyLiked ? 'unlike' : 'like';
    const currentCount = likeCounts[id] ?? (activity.likes || 0);
    const newCount = Math.max(0, action === 'like' ? currentCount + 1 : currentCount - 1);
    // Optimistic update
    const newLikedIds = { ...likedIds };
    if (action === 'like') newLikedIds[id] = true; else delete newLikedIds[id];
    setLikedIds(newLikedIds);
    setLikedLocal(id, action === 'like');
    setLikeCounts(prev => ({ ...prev, [id]: newCount }));
    setLikeCountLocal(id, newCount);
    try {
      const serverCount = await toggleLike(id, action);
      setLikeCounts(prev => ({ ...prev, [id]: serverCount }));
      setLikeCountLocal(id, serverCount);
    } catch {
      // El servidor no está disponible (ej: móvil con backend local)
      // Mantenemos el estado local — el like queda guardado en localStorage
    }
  };

  const handleAttend = async (activity: Activity, e: React.MouseEvent) => {
    e.stopPropagation();
    const id = activity.id;
    const currentlyAttending = !!attendingIds[id];
    const action = currentlyAttending ? 'unattend' : 'attend';
    const currentCount = attendCounts[id] ?? (activity.attendees || 0);
    const newCount = Math.max(0, action === 'attend' ? currentCount + 1 : currentCount - 1);
    const newAttendingIds = { ...attendingIds };
    if (action === 'attend') newAttendingIds[id] = true; else delete newAttendingIds[id];
    setAttendingIds(newAttendingIds);
    setAttendingLocal(id, action === 'attend');
    setAttendCounts(prev => ({ ...prev, [id]: newCount }));
    setAttendCountLocal(id, newCount);
    onAttendChange?.();
    try {
      const serverCount = await toggleAttend(id, action);
      setAttendCounts(prev => ({ ...prev, [id]: serverCount }));
      setAttendCountLocal(id, serverCount);
    } catch {}
  };

  const recIds = React.useMemo(() => new Set((recommended ?? []).map(a => a.id)), [recommended]);
  const combined = recIds.size > 0
    ? [...(recommended as Activity[]), ...activities.filter(a => !recIds.has(a.id))]
    : activities;
  const recCount = recIds.size > 0 ? (recommended as Activity[]).length : 0;
  const sectionHeaderStyle: React.CSSProperties = {
    gridColumn: '1 / -1',
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    margin: '0.2rem 0 0', fontWeight: 800, fontSize: '0.98rem'
  };

  return (
    <div style={{ margin: '0.5rem 0' }}>
      {combined.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem 1rem 1rem', textAlign: 'center', gap: '1rem' }}>
          <img src="/City.jpeg" alt="No activities" style={{ width: '230px', height: '230px', objectFit: 'cover', borderRadius: '8px', opacity: 0.8 }} />
          <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: 0, lineHeight: '1.6', maxWidth: '280px' }}>
            {t('activity.noActivities')}
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          {combined.map((activity, idx) => {
            const catId = activity.category || inferCategory(activity.name || '', activity.body || '');
            const cat = CATEGORIES.find(c => c.id === catId) || CATEGORIES.find(c => c.id === 'other') || null;
            const timeBadge = getTimeBadge(activity);
            const distBadge = getDistanceBadge(activity, userCoords ?? null);
            const activeBadge = timeBadge ?? distBadge;
            const isPinned = pinnedActivityId === activity.id;
            return (
              <React.Fragment key={activity.id}>
                {recCount > 0 && idx === 0 && (
                  <div style={{ ...sectionHeaderStyle, color: '#764ba2' }}>⭐ {t('activity.goonmapSection')}</div>
                )}
                {recCount > 0 && idx === recCount && (
                  <div style={{ ...sectionHeaderStyle, color: '#4b5563' }}>📋 {t('activity.allResults')}</div>
                )}
              <div
                ref={isPinned ? pinnedRef : null}
                onClick={() => onSelectOnMap?.(activity)}
                style={{
                  backgroundColor: isPinned ? '#f0f4ff' : '#fff',
                  borderRadius: '12px', overflow: 'hidden',
                  boxShadow: isPinned
                    ? '0 4px 20px rgba(102,126,234,0.35), 0 0 0 2.5px #667eea'
                    : activeBadge
                      ? `0 2px 12px rgba(0,0,0,0.12), 0 0 0 2px ${activeBadge.borderColor}`
                      : '0 2px 12px rgba(34,34,59,0.08)',
                  outline: isPinned ? '2.5px solid #667eea' : undefined,
                  transition: 'transform 0.18s, box-shadow 0.18s',
                  display: 'flex', flexDirection: 'column', cursor: 'pointer',
                  position: 'relative'
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
                {/* Chip "En mapa" para tarjeta seleccionada */}
                {isPinned && (
                  <div style={{
                    position: 'absolute', top: '8px', right: '8px', zIndex: 10,
                    background: '#667eea', color: '#fff',
                    fontSize: '0.62rem', fontWeight: 700,
                    padding: '0.15rem 0.5rem', borderRadius: '10px',
                    letterSpacing: '0.3px', boxShadow: '0 2px 6px rgba(102,126,234,0.4)'
                  }}>
                    {t('activity.onMap')}
                  </div>
                )}
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
                  {timeBadge && (
                    <span style={{
                      flexShrink: 0,
                      background: timeBadge.gradient,
                      color: '#fff', fontSize: '0.62rem', fontWeight: 800,
                      padding: '0.15rem 0.5rem', borderRadius: '20px',
                      letterSpacing: '0.3px', textTransform: 'uppercase',
                      animation: timeBadge.label === 'Ahora' ? 'pulse 1.5s infinite' : 'none'
                    }}>
                      {timeBadge.emoji} {timeBadge.label}
                    </span>
                  )}
                  {distBadge && (
                    <span style={{
                      flexShrink: 0,
                      background: distBadge.gradient,
                      color: '#fff', fontSize: '0.62rem', fontWeight: 800,
                      padding: '0.15rem 0.5rem', borderRadius: '20px',
                      letterSpacing: '0.3px', textTransform: 'uppercase'
                    }}>
                      {distBadge.emoji} {distBadge.label}
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

                  {/* Fechas compactas */}
                  <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: '#6b7280', flexWrap: 'wrap' }}>
                    {(() => {
                      const startT = formatTime(activity.start_time);
                      const endT = activity.end_time && activity.end_time !== activity.start_time ? formatTime(activity.end_time) : null;
                      return (
                        <span>
                          📅 {formatDate(activity.start_date)}
                          {startT ? ` · 🕐 ${startT}${endT ? ` - ${endT}` : ''}` : ''}
                        </span>
                      );
                    })()}
                    {activity.end_date && activity.end_date.split('T')[0] !== activity.start_date.split('T')[0] && (
                      <span>→ {formatDate(activity.end_date)}</span>
                    )}
                  </div>

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

                  {/* Badge de fuente y categoría */}
                  {activity.origen && (
                    <span style={{
                      alignSelf: 'flex-start',
                      fontSize: '0.68rem', fontWeight: 600,
                      padding: '0.15rem 0.5rem', borderRadius: '20px',
                      background: activity.origen === 'mock' ? '#fef3c7' : '#d1fae5',
                      color: activity.origen === 'mock' ? '#92400e' : '#065f46'
                    }}>
                      {activity.origen === 'mock' 
                        ? `⚠️ ${t('activity.sampleData').replace('⚠️ ', '')}` 
                        : `🌐 ${activity.origen}`}
                    </span>
                  )}

                  {/* Footer: botón detalle + like + asistir */}
                  <div style={{ marginTop: 'auto', paddingTop: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelected(activity); }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#667eea', fontSize: '0.78rem', fontWeight: 600,
                        padding: '0.3rem 0 0', display: 'flex',
                        alignItems: 'center', gap: '0.25rem', fontFamily: 'inherit'
                      }}
                    >
                      {t('activity.viewDetail')} →
                    </button>
                    {recIds.has(activity.id) ? (
                      // Actividades GoOnMap: solo badge visual
                      <div title={t('activity.goonmapRecommendation')} style={{ 
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                        color: 'white',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '10px',
                        fontSize: '0.75rem',
                        fontWeight: 800
                      }}>
                        ⭐
                      </div>
                    ) : (
                      // Actividades de búsqueda: botones like + attend
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                          onClick={(e) => handleLike(activity, e)}
                          title={likedIds[activity.id] ? t('activity.unlike') : t('activity.like')}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.25rem',
                            padding: '0.3rem 0.2rem 0', fontFamily: 'inherit',
                            fontSize: '0.78rem', fontWeight: 600,
                            color: likedIds[activity.id] ? '#ef4444' : '#9ca3af',
                            transition: 'color 0.15s, transform 0.1s',
                            transform: likedIds[activity.id] ? 'scale(1.15)' : 'scale(1)'
                          }}
                        >
                          {likedIds[activity.id] ? '❤️' : '🤍'}
                          <span style={{ fontSize: '0.72rem' }}>
                            {likeCounts[activity.id] ?? activity.likes ?? 0}
                          </span>
                        </button>
                        <button
                          onClick={(e) => handleAttend(activity, e)}
                          title={attendingIds[activity.id] ? t('activity.unattend') : t('activity.attend')}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.25rem',
                            padding: '0.3rem 0.2rem 0', fontFamily: 'inherit',
                            fontSize: '0.78rem', fontWeight: 600,
                            color: attendingIds[activity.id] ? '#22c55e' : '#9ca3af',
                            transition: 'color 0.15s, transform 0.1s',
                            transform: attendingIds[activity.id] ? 'scale(1.15)' : 'scale(1)'
                          }}
                        >
                          <span style={{ fontSize: '1rem' }}>🙋‍♂️</span>
                          <span style={{ fontSize: '0.72rem' }}>
                            {attendCounts[activity.id] ?? activity.attendees ?? 0}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Modal de detalle */}
      {selected && <ActivityModal activity={selected} onClose={() => setSelected(null)} userCoords={userCoords} plans={plans} />}
    </div>
  );
};

export default ActivityList;
