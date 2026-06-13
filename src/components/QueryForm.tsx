import React from "react";
import { useT } from '../i18n/useT';
import "./QueryForm.css";

export interface CategoryChip {
  id: string;
  label: string;
  emoji: string;
  keywords: string[];
}

export const CATEGORIES: CategoryChip[] = [
  { id: "sport",    label: "Sport",     emoji: "🏃", keywords: ["sport","deporte","running","futbol","basket","tennis","nataci","esport","atletis","padel","ciclis"] },
  { id: "culture",  label: "Culture",     emoji: "🎭", keywords: ["cultur","museu","museo","teatr","exposici","exposici","art","cine","cinema","patrimoni","literatu"] },
  { id: "music",    label: "Music",      emoji: "🎵", keywords: ["music","concert","festival","jazz","rock","orquestr","dansa","ball","flamenco","dj set","dj","electronic","techno","house","rave"] },
  { id: "family",   label: "Family",    emoji: "👨‍👩‍👧", keywords: ["famili","familiar","nens","kids","infantil","infants","jovent","escola"] },
  { id: "nature",   label: "Nature",      emoji: "🌿", keywords: ["natura","parc","senderis","jardi","medi ambient","ecolog","bosc","platj","mar"] },
  { id: "night",    label: "Night", emoji: "🌙", keywords: ["nocturno","noche","nit","bar","discoteca","club","cocktail","pub","after","festa","party","nightclub","boite","copa","karaoke","flaming","brunch nocturn"] },
  { id: "food",     label: "Food",      emoji: "🍽️", keywords: ["gastronom","restaurant","mercat","food","cuina","tast","vi","vermut","fira aliment"] },
  { id: "show",     label: "Show",       emoji: "\uD83C\uDFAA", keywords: ["show","espectacle","espectaculo","espect\u00E1cul","actuaci","actuacion","performance","magic","magia","circus","circ","cabaret","comedy","monolog","stand up","standup","ilusionist","humorist","drag","burlesc","varietes","escenari","live","en vivo","en directo"] },
  { id: "other",    label: "Other",      emoji: "📌", keywords: [] },
];

export function inferCategory(name: string, body: string): string {
  const text = (name + ' ' + body).toLowerCase();
  const matchable = CATEGORIES.filter(c => c.keywords.length > 0);
  const matched = matchable.find(c => c.keywords.some(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    return regex.test(text);
  }));
  return matched ? matched.id : 'other';
}

interface QueryFormProps {
  onSearch: (filters: { location: string; startDate: string; endDate: string; radius: number; categories: string[] }) => void;
  onClear?: () => void;
  resultCount?: number;
  isSearching?: boolean;
  isLoadingLocation?: boolean;
  setIsLoadingLocation?: (loading: boolean) => void;
  location: string;
  setLocation: (value: string) => void;
  startDate: string;
  setStartDate: (value: string) => void;
  endDate: string;
  setEndDate: (value: string) => void;
  radius: number;
  setRadius: (value: number) => void;
  selectedCategories: string[];
  setSelectedCategories: (value: string[]) => void;
  timeFilter: string;
  setTimeFilter: (value: string) => void;
}

const QueryForm: React.FC<QueryFormProps> = ({ 
  onSearch, 
  onClear, 
  resultCount,
  isSearching = false,
  isLoadingLocation = false,
  setIsLoadingLocation,
  location,
  setLocation,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  radius,
  setRadius,
  selectedCategories,
  setSelectedCategories,
  timeFilter,
  setTimeFilter
}) => {
  const t = useT();

  const toggleCategory = (id: string) => {
    const newCategories = selectedCategories.includes(id) 
      ? selectedCategories.filter((c: string) => c !== id) 
      : [...selectedCategories, id];
    setSelectedCategories(newCategories);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({ location, startDate, endDate, radius, categories: selectedCategories });
  };

  const handleClear = () => {
    setLocation("");
    setStartDate("");
    setEndDate("");
    setRadius(5);
    setSelectedCategories([]);
    setTimeFilter('any');
    if (onClear) onClear();
  };

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      setIsLoadingLocation?.(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setLocation(`${latitude},${longitude}`);
          setIsLoadingLocation?.(false);
        },
        () => {
          alert(t('search.locationError'));
          setIsLoadingLocation?.(false);
        }
      );
    } else {
      alert(t('search.locationUnsupported'));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="query-form">
      <div className="query-form-body">
        <div className="form-row">
          <label htmlFor="location">{t('search.location')}</label>
          <div className="location-input-group">
            <input
              id="location"
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder={t('search.locationPlaceholder')}
              autoComplete="off"
            />
            <button
              type="button"
              className="btn-icon"
              onClick={getCurrentLocation}
              disabled={isLoadingLocation}
              title={t('search.useMyLocation')}
            >
              {isLoadingLocation ? <span className="spinner">⟳</span> : '📍'}
            </button>
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="startDate">{t('search.startDate')}</label>
          <input
            id="startDate"
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label htmlFor="endDate">{t('search.endDate')}</label>
          <input
            id="endDate"
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label htmlFor="radius">{t('search.radius')}</label>
          <select
            id="radius"
            value={radius}
            onChange={e => setRadius(Number(e.target.value))}
          >
            <option value={1}>1 km</option>
            <option value={2}>2 km</option>
            <option value={5}>5 km</option>
            <option value={10}>10 km</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="timeFilter">{t('search.when')}</label>
          <select
            id="timeFilter"
            value={timeFilter}
            onChange={e => setTimeFilter(e.target.value)}
          >
            <option value="any">{t('search.anytime')}</option>
            <option value="now">{t('search.now')}</option>
            <option value="30min">{t('search.in30min')}</option>
            <option value="1h">{t('search.in1h')}</option>
            <option value="2h">{t('search.in2h')}</option>
            <option value="1dia">{t('search.in1day')}</option>
          </select>
        </div>
        <div className="form-row">
          <label>{t('search.type')}</label>
          <div className="chip-group">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                className={`chip${selectedCategories.includes(cat.id) ? " chip--active" : ""}`}
                onClick={() => toggleCategory(cat.id)}
                aria-pressed={selectedCategories.includes(cat.id)}
              >
                <span className="chip-emoji">{cat.emoji}</span>
                {t(`categories.${cat.id}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn-primary">
            {t('search.button')}
          </button>
          {onClear && (
            <button type="button" className="btn-secondary" onClick={handleClear}>
              {t('search.clear')}
            </button>
          )}
        </div>
      </div>
    </form>
  );
};

export default QueryForm;

