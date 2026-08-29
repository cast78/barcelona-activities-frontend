import React from 'react';
import { useT, useLanguage } from '../i18n/useT';
import { Activity, Plan, PlanActivity, localized, getAllAttendingLocal, setAttendingLocal } from '../api';
import { CATEGORIES, inferCategory } from './QueryForm';

interface MyAgendaPanelProps {
  activities: Activity[];
  plans: Plan[];
  onClose: () => void;
  onAttendChange: () => void;
  onSelectOnMap?: (activity: Activity | PlanActivity) => void;
  onPlanRoute?: (activities: Activity[]) => void;
  selectedActivityId?: string;
  tab: 'mine' | 'goonmap';
  onTabChange: (tab: 'mine' | 'goonmap') => void;
  expandedPlanId: string | null;
  onExpandPlan: (planId: string | null) => void;
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

const MyAgendaPanel: React.FC<MyAgendaPanelProps> = ({ activities, plans, onClose, onAttendChange, onSelectOnMap, onPlanRoute, selectedActivityId, tab, onTabChange, expandedPlanId, onExpandPlan }) => {
  const t = useT();
  const { language } = useLanguage();
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

  // Solo planes vigentes (sin valid_to o con valid_to en el futuro)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  const visiblePlans = plans.filter(p => !p.valid_to || p.valid_to >= today);

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
    lines.push('👉 https://GoOnMap.es');
    const text = lines.join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const handleSharePlan = (plan: Plan) => {
    if (plan.activities.length === 0) return;
    const title = localized(plan.title, language);
    const desc = localized(plan.description, language);
    const lines: string[] = [`🗺️ *${title}*`];
    if (desc) lines.push(desc);
    lines.push('');
    plan.activities.forEach((a: PlanActivity, idx: number) => {
      const catId = a.category || inferCategory(a.name || '', a.body || '');
      const cat = CATEGORIES.find(c => c.id === catId);
      const emoji = cat?.emoji || '📌';
      const time = a.suggestedTime || formatTime(a.start_time);
      const venue = a.venue_name || a.direccion || '';
      lines.push(`${idx + 1}. ${emoji} *${a.name}*`);
      const detail = `${time ? `🕒 ${time}h` : ''}${venue ? `${time ? '\n   ' : ''}📍 ${venue}` : ''}`;
      if (detail) lines.push(`   ${detail}`);
      lines.push('');
    });
    lines.push(t('agenda.shareFooter'));
    lines.push('👉 https://GoOnMap.es');
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
            {tab === 'mine'
              ? (agendaActivities.length === 0
                  ? t('agenda.empty')
                  : t('agenda.count', { count: agendaActivities.length }))
              : (visiblePlans.length === 0
                  ? t('agenda.goonmapEmpty')
                  : t('agenda.plansCount', { count: visiblePlans.length }))}
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

      {/* Tabs: Mi Agenda | GoOnMap */}
      <div style={{
        display: 'flex', flexShrink: 0,
        background: '#f3f4f6', borderBottom: '1px solid #e5e7eb',
      }}>
        {(['mine', 'goonmap'] as const).map(key => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              style={{
                flex: 1, border: 'none', cursor: 'pointer',
                padding: '0.7rem 0.5rem',
                fontSize: '0.82rem', fontWeight: active ? 800 : 600,
                color: active ? '#667eea' : '#6b7280',
                background: active ? '#fff' : 'transparent',
                borderBottom: active ? '2px solid #667eea' : '2px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {key === 'mine' ? t('agenda.tabMine') : t('agenda.tabGoonmap')}
            </button>
          );
        })}
      </div>

      {/* Activity list */}
      {tab === 'mine' && (
      <>
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
            const hasCoords = !!activity.geo_epgs_4326_latlon;
            const isSelected = selectedActivityId === activity.id;
            const clickable = hasCoords && !!onSelectOnMap;

            return (
              <div
                key={activity.id}
                onClick={clickable ? () => onSelectOnMap!(activity) : undefined}
                title={clickable ? t('agenda.showOnMap') : undefined}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                  padding: '0.7rem 0.5rem',
                  borderBottom: idx < agendaActivities.length - 1 ? '1px solid #f0f0f4' : 'none',
                  cursor: clickable ? 'pointer' : 'default',
                  background: isSelected ? 'rgba(102,126,234,0.10)' : 'transparent',
                  borderLeft: isSelected ? '3px solid #667eea' : '3px solid transparent',
                  transition: 'background 0.15s',
                }}
              >
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
                  onClick={(e) => { e.stopPropagation(); handleRemove(activity); }}
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
      </>
      )}

      {/* GoOnMap plans */}
      {tab === 'goonmap' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
          {visiblePlans.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%', gap: '0.75rem',
              color: '#6b7280', textAlign: 'center', padding: '2rem 1rem',
            }}>
              <span style={{ fontSize: '2.5rem' }}>🧭</span>
              <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>
                {t('agenda.goonmapEmptyHint')}
              </p>
            </div>
          ) : (
            visiblePlans.map(plan => {
              const isOpen = expandedPlanId === plan.id;
              const themeCat = CATEGORIES.find(c => c.id === plan.theme);
              const planEmoji = plan.emoji || themeCat?.emoji || '🗺️';
              const title = localized(plan.title, language);
              const desc = localized(plan.description, language);
              return (
                <div key={plan.id} style={{
                  border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: '0.7rem',
                  overflow: 'hidden', background: '#fff',
                }}>
                  {/* Plan header (clickable to expand) */}
                  <div
                    onClick={() => onExpandPlan(isOpen ? null : plan.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.6rem',
                      padding: '0.75rem', cursor: 'pointer',
                      background: isOpen ? 'rgba(102,126,234,0.06)' : 'transparent',
                    }}
                  >
                    <div style={{
                      width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                      background: 'linear-gradient(135deg, #667eea, #764ba2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.2rem',
                    }}>{planEmoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '0.86rem', fontWeight: 800, color: '#1f2937', lineHeight: 1.3,
                      }}>{title}</div>
                      <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>
                        {t('agenda.stopsCount', { count: plan.activities.length })}
                      </div>
                    </div>
                    <span style={{
                      color: '#9ca3af', fontSize: '0.8rem', flexShrink: 0,
                      transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s',
                    }}>▼</span>
                  </div>

                  {/* Plan details */}
                  {isOpen && (
                    <div style={{ padding: '0 0.75rem 0.75rem' }}>
                      {desc && (
                        <p style={{ fontSize: '0.78rem', color: '#4b5563', margin: '0 0 0.6rem', lineHeight: 1.5 }}>
                          {desc}
                        </p>
                      )}
                      {plan.activities.map((act: PlanActivity, idx: number) => {
                        const catId = act.category || inferCategory(act.name || '', act.body || '');
                        const cat = CATEGORIES.find(c => c.id === catId);
                        const emoji = cat?.emoji || '📌';
                        const time = act.suggestedTime || formatTime(act.start_time);
                        const venue = act.venue_name || act.direccion || '';
                        const clickable = !!act.geo_epgs_4326_latlon && !!onSelectOnMap;
                        return (
                          <div
                            key={act.id}
                            onClick={clickable ? () => onSelectOnMap!(act) : undefined}
                            title={clickable ? t('agenda.showOnMap') : undefined}
                            style={{
                              display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                              padding: '0.5rem 0',
                              borderTop: '1px solid #f0f0f4',
                              cursor: clickable ? 'pointer' : 'default',
                            }}
                          >
                            <div style={{
                              minWidth: 26, height: 26,
                              background: '#eef0ff', color: '#667eea',
                              borderRadius: '50%',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.72rem', fontWeight: 800, flexShrink: 0,
                            }}>{idx + 1}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontSize: '0.8rem', fontWeight: 700, color: '#1f2937', lineHeight: 1.3,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }} title={act.name}>
                                {emoji} {act.name}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: '#6b7280', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: 2 }}>
                                {act.start_date && <span>📅 {formatDate(act.start_date)}</span>}
                                {time && <span>🕒 {time}h</span>}
                                {venue && <span>📍 {venue}</span>}
                              </div>
                              {act.note && (
                                <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 2, fontStyle: 'italic' }}>
                                  💡 {act.note}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {onPlanRoute && plan.activities.length > 0 && (
                        <button
                          onClick={() => onPlanRoute(plan.activities)}
                          style={{
                            width: '100%', marginTop: '0.7rem',
                            background: 'linear-gradient(135deg, #667eea, #764ba2)',
                            color: '#fff', border: 'none', borderRadius: 10,
                            padding: '0.6rem 1rem', fontWeight: 800, fontSize: '0.85rem',
                            cursor: 'pointer',
                          }}
                        >
                          {t('agenda.planRoute')}
                        </button>
                      )}

                      {plan.activities.length > 0 && (
                        <button
                          onClick={() => handleSharePlan(plan)}
                          style={{
                            width: '100%', marginTop: '0.5rem',
                            background: '#25D366', color: '#fff', border: 'none', borderRadius: 10,
                            padding: '0.6rem 1rem', fontWeight: 800, fontSize: '0.85rem',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            boxShadow: '0 2px 8px rgba(37,211,102,0.35)',
                            transition: 'opacity 0.15s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
                          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                          {t('agenda.share')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default MyAgendaPanel;
