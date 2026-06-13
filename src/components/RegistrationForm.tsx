import React, { useState } from "react";
import { useT } from '../i18n/useT';
import { addActivity } from "../api";
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
    setCategory("");
    setMessage(null);
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert(t('search.locationUnsupported'));
      return;
    }
    setIsLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation(`${pos.coords.latitude},${pos.coords.longitude}`);
        setIsLoadingLocation(false);
      },
      () => {
        alert(t('search.locationError'));
        setIsLoadingLocation(false);
      }
    );
  };

  const handleVenYa = () => {
    const now = new Date();
    setStartDate(now.toISOString().split('T')[0]);
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
        (pos) => setLocation(`${pos.coords.latitude},${pos.coords.longitude}`),
        () => {}
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!location.includes(",")) {
      setMessage({ type: "error", text: t('register.errorCoords') });
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
        <div className="reg-date-row">
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
          <div className="location-input-group">
            <input
              id="reg-location"
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="latitude,longitude"
              required
            />
            <button
              type="button"
              className="btn-icon"
              onClick={getCurrentLocation}
              title={t('register.useMyLocation')}
              disabled={isLoadingLocation}
              style={isLoadingLocation ? { opacity: 0.6, pointerEvents: 'none' } : {}}
            >
              {isLoadingLocation ? (
                <span className="spinner" style={{ fontSize: '1.1em' }}>⏳</span>
              ) : (
                '📍'
              )}
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


