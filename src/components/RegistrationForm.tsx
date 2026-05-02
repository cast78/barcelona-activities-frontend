import React, { useState } from "react";
import { addActivity } from "../api";
import { CATEGORIES } from "./QueryForm";
import "./RegistrationForm.css";

type MessageState = { type: "success" | "error"; text: string } | null;

const RegistrationForm: React.FC = () => {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [venueName, setVenueName] = useState("");
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState<MessageState>(null);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("");
  const [showToast, setShowToast] = useState(false);

  const handleReset = () => {
    setName("");
    setBody("");
    setStartDate("");
    setStartTime("");
    setVenueName("");
    setLocation("");
    setCategory("");
    setMessage(null);
  };

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation(`${pos.coords.latitude},${pos.coords.longitude}`),
        () => alert("Unable to get location")
      );
    } else {
      alert("Geolocation not supported");
    }
  };

  const handleVenYa = () => {
    const now = new Date();
    setStartDate(now.toISOString().split('T')[0]);
    setStartTime(now.toTimeString().slice(0, 5));
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
      setMessage({ type: "error", text: "Location must be in latitude,longitude format." });
      return;
    }

    setLoading(true);
    try {
      await addActivity({
        name, body,
        start_date: startDate,
        end_date: startDate,
        start_time: startTime || undefined,
        venue_name: venueName || undefined,
        geo_epgs_4326_latlon: location,
        category
      });
      setMessage({ type: "success", text: "Activity registered successfully." });
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      handleReset();
    } catch (error) {
      console.error("Failed to add activity", error);
      setMessage({ type: "error", text: "Error registering activity. Try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="registration-card">
      {showToast && (
        <div className="reg-toast-success">
          ✅ Tu evento creado con éxito
        </div>
      )}
      <div className="registration-card-header">
        <span style={{ fontSize: "1.1rem" }}>📝</span>
        <h2 className="registration-card-title">New Activity</h2>
        <button type="button" className="btn-ven-ya" onClick={handleVenYa} title="Rellenar con fecha, hora y ubicación actuales">
          ⚡ ¡Ven ya!
        </button>
      </div>
      <form onSubmit={handleSubmit} className="registration-card-body">
        {message && (
          <div className={`reg-message ${message.type}`}>
            {message.type === "success" ? "✅" : "⚠️"} {message.text}
          </div>
        )}
        <div className="reg-field">
          <label htmlFor="reg-name">Activity Name</label>
          <input
            id="reg-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="E.g.: Hiking in Montjuïc"
            required
          />
        </div>
        <div className="reg-field">
          <label htmlFor="reg-body">Description</label>
          <textarea
            id="reg-body"
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Describe the activity..."
            required
          />
        </div>
        <div className="reg-venue-row">
          <div className="reg-field">
            <label htmlFor="reg-category">Category</label>
            <select
              id="reg-category"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              <option value="">— No Category —</option>
              {CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.emoji} {cat.label}
                </option>
              ))}
            </select>
          </div>
          <div className="reg-field">
            <label htmlFor="reg-venue">Venue</label>
            <input
              id="reg-venue"
              type="text"
              value={venueName}
              onChange={e => setVenueName(e.target.value)}
              placeholder="Palau de la Música..."
            />
          </div>
        </div>
        <div className="reg-date-row">
          <div className="reg-field">
            <label htmlFor="reg-start">Date</label>
            <input
              id="reg-start"
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              required
            />
          </div>
          <div className="reg-field">
            <label htmlFor="reg-time">Time</label>
            <input
              id="reg-time"
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
            />
          </div>
        </div>
        <div className="reg-field">
          <label htmlFor="reg-location">Location (coordinates)</label>
          <div className="location-input-group">
            <input
              id="reg-location"
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="latitude,longitude"
              required
            />
            <button type="button" className="btn-icon" onClick={getCurrentLocation} title="Use my location">
              📍
            </button>
          </div>
          <span className="reg-location-hint">Ejemplo: 41.3851,2.1734</span>
        </div>
        <div className="reg-actions">
          <button type="submit" className="reg-btn-submit" disabled={loading}>
            {loading ? "Registering..." : "Register Activity"}
          </button>
          <button type="button" className="reg-btn-reset" onClick={handleReset}>
            Clear
          </button>
        </div>
      </form>
    </div>
  );
};

export default RegistrationForm;


