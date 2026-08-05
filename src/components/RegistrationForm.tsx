import React, { useState, useEffect, useRef } from "react";
import { useT } from '../i18n/useT';
import { addActivity, geocodeAddress, reverseGeocode, GeoResult } from "../api";
import { CATEGORIES } from "./QueryForm";
import "./RegistrationForm.css";

type MessageState = { type: "success" | "error"; text: string } | null;

const RegistrationForm: React.FC = () => {
  const t = useT();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [endTimeMin, setEndTimeMin] = useState("");
  const [endTimeMax, setEndTimeMax] = useState("");
  const [isVenYa, setIsVenYa] = useState(false);
  const [venueName, setVenueName] = useState("");
  const [location, setLocation] = useState("");
  const [addressLabel, setAddressLabel] = useState("");
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const locationWrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justSelectedRef = useRef(false);
  const isFirstRender = useRef(true);
  const [message, setMessage] = useState<MessageState>(null);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  const handleReset = () => {
    setName("");
    setBody("");
    setStartDate("");
    setStartTime("");
    setEndTime("");
    setEndTimeMin("");
    setEndTimeMax("");
    setIsVenYa(false);
    setVenueName("");
    setLocation("");
    setAddressLabel("");
    setSuggestions([]);
    setShowSuggestions(false);
    setCategory("");
    setMessage(null);
  };

  // Debounce geocoding while user types
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (justSelectedRef.current) { justSelectedRef.current = false; return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = addressLabel.trim();
    if (q.length < 3) { setSuggestions([]); setShowSuggestions(false); setIsGeocoding(false); return; }

    // Si el usuario pega coordenadas (ej. "41.3801,2.1734"), hacer reverse geocoding directamente
    const coordMatch = q.match(/^(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      setIsGeocoding(true);
      debounceRef.current = setTimeout(async () => {
        const label = await reverseGeocode(lat, lon);
        setLocation(`${lat},${lon}`);
        if (label) { justSelectedRef.current = true; setAddressLabel(label); }
        setSuggestions([]);
        setShowSuggestions(false);
        setIsGeocoding(false);
      }, 400);
      return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }

    setIsGeocoding(true);
    debounceRef.current = setTimeout(async () => {
      const results = await geocodeAddress(q);
      // Exclude purely postal-code results (label starts with 5 digits)
      const filtered = results.filter(r => !/^\d{5}[,\s]/.test(r.label));
      setSuggestions(filtered);
      setShowSuggestions(true);
      setActiveIndex(-1);
      setIsGeocoding(false);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [addressLabel]);

  // Close dropdown on outside click
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (locationWrapRef.current && !locationWrapRef.current.contains(e.target as Node))
        setShowSuggestions(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const selectSuggestion = (s: GeoResult) => {
    justSelectedRef.current = true;
    setAddressLabel(s.label);
    setLocation(`${s.lat},${s.lon}`);
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveIndex(-1);
  };

  const clearAddress = () => {
    justSelectedRef.current = true;
    setAddressLabel('');
    setLocation('');
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveIndex(-1);
  };

  const handleAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); selectSuggestion(suggestions[activeIndex]); }
    else if (e.key === 'Escape') setShowSuggestions(false);
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) { alert(t('search.locationUnsupported')); return; }
    setIsLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocation(`${latitude},${longitude}`);
        justSelectedRef.current = true;
        const label = await reverseGeocode(latitude, longitude);
        setAddressLabel(label ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        setShowSuggestions(false);
        setIsLoadingLocation(false);
      },
      () => { alert(t('search.locationError')); setIsLoadingLocation(false); }
    );
  };

  const handleVenYa = () => {
    const now = new Date();
    setStartDate(now.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }));
    const startHHMM = now.toTimeString().slice(0, 5);
    setStartTime(startHHMM);
    setEndTimeMin(startHHMM);
    const maxDate = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const maxHHMM = maxDate.toTimeString().slice(0, 5);
    setEndTimeMax(maxHHMM);
    setEndTime(maxHHMM);
    setIsVenYa(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          setLocation(`${latitude},${longitude}`);
          justSelectedRef.current = true;
          const label = await reverseGeocode(latitude, longitude);
          setAddressLabel(label ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        },
        () => {}
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    // Require that an address was resolved to coordinates
    if (!location || !location.includes(",")) {
      setMessage({ type: "error", text: t('register.errorAddress') });
      return;
    }

    setLoading(true);
    try {
      await addActivity({
        name, body,
        start_date: startDate,
        end_date: startDate,
        start_time: startTime,
        end_time: endTime || undefined,
        venue_name: venueName,
        geo_epgs_4326_latlon: location,
        category
      });
      setMessage({ type: "success", text: t('register.successMsg') });
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      handleReset();
    } catch (error) {
      console.error("Failed to add activity", error);
      setMessage({ type: "error", text: t('register.errorSubmit') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="registration-card">
      {showToast && (
        <div className="reg-toast-success">
          {t('register.success')}
        </div>
      )}
      <div className="registration-card-header">
        <span style={{ fontSize: "1.1rem" }}>📝</span>
        <h2 className="registration-card-title">{t('register.title')}</h2>
        <button type="button" className="btn-ven-ya" onClick={handleVenYa} title={t('register.fillNow')}>
          {t('register.fillNow')}
        </button>
      </div>
      <form onSubmit={handleSubmit} className="registration-card-body">
        {message && (
          <div className={`reg-message ${message.type}`}>
            {message.type === "success" ? "✅" : "⚠️"} {message.text}
          </div>
        )}
        <div className="reg-field">
          <label htmlFor="reg-name">{t('register.name')}</label>
          <input
            id="reg-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('register.namePlaceholder')}
            required
          />
        </div>
        <div className="reg-field">
          <label htmlFor="reg-body">{t('register.description')}</label>
          <textarea
            id="reg-body"
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={t('register.descriptionPlaceholder')}
            required
          />
        </div>
        <div className="reg-venue-row">
          <div className="reg-field">
            <label htmlFor="reg-category">{t('register.category')}</label>
            <select
              id="reg-category"
              value={category}
              onChange={e => setCategory(e.target.value)}
              required
            >
              <option value="" disabled>{t('register.categorySelect')}</option>
              {CATEGORIES.filter(cat => cat.id !== 'ahora').map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.emoji} {t(`categories.${cat.id}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="reg-field">
            <label htmlFor="reg-venue">{t('register.venue')}</label>
            <input
              id="reg-venue"
              type="text"
              value={venueName}
              onChange={e => setVenueName(e.target.value)}
              placeholder="Palau de la Música..."
              required
            />
          </div>
        </div>
        <div className="reg-datetime-row">
          <div className="reg-field">
            <label htmlFor="reg-start">{t('register.date')}</label>
            <input
              id="reg-start"
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              required
            />
          </div>
          <div className="reg-field">
            <label htmlFor="reg-time">{t('register.startTime')}</label>
            <input
              id="reg-time"
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              required
            />
          </div>
          <div className="reg-field">
            <label htmlFor="reg-end-time">{t('register.endTime')}{isVenYa && <span style={{ color: '#f59e0b', marginLeft: '0.25rem', fontSize: '0.65rem' }}>{t('register.endTimeNote')}</span>}</label>
            <input
              id="reg-end-time"
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              min={isVenYa ? endTimeMin : undefined}
              max={isVenYa ? endTimeMax : undefined}
              required
            />
          </div>
        </div>
        <div className="reg-field">
          <label htmlFor="reg-location">{t('register.coordinates')}</label>
          <div className="location-input-group" ref={locationWrapRef}>
            <div className="location-autocomplete">
              <input
                id="reg-location"
                type="text"
                value={addressLabel}
                onChange={e => { setAddressLabel(e.target.value); setLocation(''); }}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                onKeyDown={handleAddressKeyDown}
                placeholder={t('register.addressPlaceholder')}
                autoComplete="off"
                role="combobox"
                aria-expanded={showSuggestions}
                aria-controls="reg-location-suggestions"
                aria-autocomplete="list"
                required
              />
              {addressLabel && !isGeocoding && (
                <button type="button" className="location-clear-btn" onClick={clearAddress} aria-label={t('search.clearLocation')}>✕</button>
              )}
              {isGeocoding && <span className="location-spinner">⟳</span>}
              {showSuggestions && suggestions.length > 0 && (
                <ul className="location-suggestions" role="listbox" id="reg-location-suggestions">
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
              title={t('register.useMyLocation')}
              disabled={isLoadingLocation}
              style={isLoadingLocation ? { opacity: 0.6, pointerEvents: 'none' } : {}}
            >
              {isLoadingLocation ? <span className="spinner" style={{ fontSize: '1.1em' }}>⏳</span> : '📍'}
            </button>
          </div>
          <span className="reg-location-hint">{t('register.coordinatesHint')}</span>
        </div>
        <div className="reg-actions">
          <button type="submit" className="reg-btn-submit" disabled={loading}>
            {loading ? t('register.submitting') : t('register.submit')}
          </button>
          <button type="button" className="reg-btn-reset" onClick={handleReset}>
            {t('register.clear')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default RegistrationForm;


