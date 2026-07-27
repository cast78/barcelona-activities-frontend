import React, { useEffect, useRef, useState } from "react";
import { useT } from '../i18n/useT';
import { geocodeAddress, reverseGeocode, GeoResult } from '../api';
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
  addressLabel: string;
  setAddressLabel: (value: string) => void;
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
  addressLabel,
  setAddressLabel,
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

  // ── Geocoding / autocomplete state ──────────────────────────────────────
  // addressInput es estado elevado (App.tsx) para persistir la búsqueda vigente
  const addressInput = addressLabel;
  const setAddressInput = setAddressLabel;
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationWrapRef = useRef<HTMLDivElement>(null);
  // Evita relanzar geocoding cuando el input cambia por seleccionar una sugerencia
  const justSelectedRef = useRef(false);
  // Evita geocodificar el texto persistido al re-montar el componente (reabrir panel)
  const isFirstRender = useRef(true);

  // Debounce: buscar sugerencias mientras el usuario escribe
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = addressInput.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsGeocoding(false);
      return;
    }
    setIsGeocoding(true);
    debounceRef.current = setTimeout(async () => {
      const results = await geocodeAddress(q);
      setSuggestions(results);
      setShowSuggestions(true);
      setActiveIndex(-1);
      setIsGeocoding(false);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [addressInput]);

  // Cerrar el desplegable al hacer clic fuera
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (locationWrapRef.current && !locationWrapRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const selectSuggestion = (s: GeoResult) => {
    justSelectedRef.current = true;
    setAddressInput(s.label);
    setLocation(`${s.lat},${s.lon}`);
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveIndex(-1);
  };

  const clearAddress = () => {
    justSelectedRef.current = true;
    setAddressInput('');
    setLocation('');
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveIndex(-1);
  };

  const handleAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const toggleCategory = (id: string) => {
    const newCategories = selectedCategories.includes(id) 
      ? selectedCategories.filter((c: string) => c !== id) 
      : [...selectedCategories, id];
    setSelectedCategories(newCategories);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let loc = location;
    // Si el usuario escribió una dirección pero no seleccionó sugerencia,
    // resolvemos la mejor coincidencia antes de buscar.
    const typed = addressInput.trim();
    if (typed.length >= 3 && !loc) {
      setIsGeocoding(true);
      const results = await geocodeAddress(typed);
      setIsGeocoding(false);
      if (results.length > 0) {
        loc = `${results[0].lat},${results[0].lon}`;
        setLocation(loc);
        setAddressInput(results[0].label);
      } else {
        alert(t('search.addressNotFound'));
        return;
      }
    }
    setShowSuggestions(false);
    onSearch({ location: loc, startDate, endDate, radius, categories: selectedCategories });
  };

  const handleClear = () => {
    setLocation("");
    setAddressInput("");
    setSuggestions([]);
    setShowSuggestions(false);
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
        async (position) => {
          const { latitude, longitude } = position.coords;
          setLocation(`${latitude},${longitude}`);
          // Mostrar la dirección legible en vez de coordenadas
          justSelectedRef.current = true;
          const label = await reverseGeocode(latitude, longitude);
          setAddressInput(label ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          setShowSuggestions(false);
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
          <div className="location-input-group" ref={locationWrapRef}>
            <div className="location-autocomplete">
              <input
                id="location"
                type="text"
                value={addressInput}
                onChange={e => {
                  setAddressInput(e.target.value);
                  setLocation("");
                }}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                onKeyDown={handleAddressKeyDown}
                placeholder={t('search.locationPlaceholder')}
                autoComplete="off"
                title={addressInput || undefined}
                role="combobox"
                aria-expanded={showSuggestions}
                aria-controls="location-suggestion-list"
                aria-autocomplete="list"
              />
              {addressInput && !isGeocoding && (
                <button
                  type="button"
                  className="location-clear-btn"
                  onClick={clearAddress}
                  aria-label={t('search.clearLocation')}
                  title={t('search.clearLocation')}
                >
                  ✕
                </button>
              )}
              {isGeocoding && <span className="location-spinner">⟳</span>}
              {showSuggestions && suggestions.length > 0 && (
                <ul className="location-suggestions" role="listbox" id="location-suggestion-list">
                  {suggestions.map((s, i) => (
                    <li
                      key={`${s.lat},${s.lon}`}
                      role="option"
                      aria-selected={i === activeIndex}
                      className={`location-suggestion${i === activeIndex ? ' location-suggestion--active' : ''}`}
                      onMouseDown={e => { e.preventDefault(); selectSuggestion(s); }}
                      onMouseEnter={() => setActiveIndex(i)}
                    >
                      <span className="location-suggestion-pin">📍</span>
                      <span className="location-suggestion-text">{s.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              className="btn-icon"
              onClick={getCurrentLocation}
              disabled={isLoadingLocation}
              title={t('search.useMyLocation')}
            >
              {isLoadingLocation ? <span className="spinner" style={{ fontSize: '1.1em' }}>⏳</span> : '📍'}
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

