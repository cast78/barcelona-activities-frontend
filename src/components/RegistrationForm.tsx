import React, { useState } from "react";
import { addActivity } from "../api";
import { CATEGORIES } from "./QueryForm";
import "./RegistrationForm.css";

type MessageState = { type: "success" | "error"; text: string } | null;

const RegistrationForm: React.FC = () => {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState<MessageState>(null);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("");

  const handleReset = () => {
    setName("");
    setBody("");
    setStartDate("");
    setEndDate("");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (new Date(endDate) < new Date(startDate)) {
      setMessage({ type: "error", text: "La fecha de fin debe ser posterior a la de inicio." });
      return;
    }
    if (!location.includes(",")) {
      setMessage({ type: "error", text: "La ubicacion debe tener el formato latitud,longitud." });
      return;
    }

    setLoading(true);
    try {
      await addActivity({ name, body, start_date: startDate, end_date: endDate, geo_epgs_4326_latlon: location, category });
      setMessage({ type: "success", text: "Actividad registrada correctamente." });
      handleReset();
    } catch (error) {
      console.error("Failed to add activity", error);
      setMessage({ type: "error", text: "Error al registrar la actividad. Intenta de nuevo." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="registration-card">
      <div className="registration-card-header">
        <span style={{ fontSize: "1.1rem" }}>📝</span>
        <h2 className="registration-card-title">Nueva Actividad</h2>
      </div>
      <form onSubmit={handleSubmit} className="registration-card-body">
        {message && (
          <div className={`reg-message ${message.type}`}>
            {message.type === "success" ? "✅" : "⚠️"} {message.text}
          </div>
        )}
        <div className="reg-field">
          <label htmlFor="reg-name">Nombre de la actividad</label>
          <input
            id="reg-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej: Senderismo por Montjuïc"
            required
          />
        </div>
        <div className="reg-field">
          <label htmlFor="reg-body">Descripción</label>
          <textarea
            id="reg-body"
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Describe la actividad..."
            required
          />
        </div>
        <div className="reg-field">
          <label htmlFor="reg-category">Categoría</label>
          <select
            id="reg-category"
            value={category}
            onChange={e => setCategory(e.target.value)}
          >
            <option value="">— Sin categoría —</option>
            {CATEGORIES.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.emoji} {cat.label}
              </option>
            ))}
          </select>
        </div>
        <div className="reg-date-row">
          <div className="reg-field">
            <label htmlFor="reg-start">Fecha inicio</label>
            <input
              id="reg-start"
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              required
            />
          </div>
          <div className="reg-field">
            <label htmlFor="reg-end">Fecha fin</label>
            <input
              id="reg-end"
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="reg-field">
          <label htmlFor="reg-location">Ubicación</label>
          <div className="location-input-group">
            <input
              id="reg-location"
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="latitud,longitud"
              required
            />
            <button type="button" className="btn-icon" onClick={getCurrentLocation} title="Usar mi ubicación">
              📍
            </button>
          </div>
          <span className="reg-location-hint">Ejemplo: 41.3851,2.1734</span>
        </div>
        <div className="reg-actions">
          <button type="submit" className="reg-btn-submit" disabled={loading}>
            {loading ? "Registrando..." : "Registrar Actividad"}
          </button>
          <button type="button" className="reg-btn-reset" onClick={handleReset}>
            Limpiar
          </button>
        </div>
      </form>
    </div>
  );
};

export default RegistrationForm;


