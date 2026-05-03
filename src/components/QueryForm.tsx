import React from "react";
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
  { id: "music",    label: "Music",      emoji: "🎵", keywords: ["music","concert","festival","jazz","rock","orquestr","dansa","ball","flamenco"] },
  { id: "food",     label: "Gastronomy",      emoji: "🍽️", keywords: ["gastronom","restaurant","mercat","food","cuina","tast","vi","vermut","fira aliment"] },
  { id: "family",   label: "Family",    emoji: "👨‍👩‍👧", keywords: ["famili","familiar","nens","kids","infantil","infants","jovent","escola"] },
  { id: "nature",   label: "Nature",      emoji: "🌿", keywords: ["natura","parc","senderis","jardi","medi ambient","ecolog","bosc","platj","mar"] },
  { id: "night",    label: "Night Life", emoji: "🌙", keywords: ["nocturno","noche","nit","bar","discoteca","club","cocktail","pub","after","festa","party","nightclub","boite","copa","karaoke","flaming","brunch nocturn"] },
  { id: "show",     label: "Show",       emoji: "🎪", keywords: ["show","espectacle","espectaculo","actuaci","performance","magic","circus","circ","cabaret","comedy"] },
  { id: "other",    label: "Other",      emoji: "📌", keywords: [] },
  { id: "ahora",    label: "Ahora",      emoji: "⚡", keywords: [] },
];

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
  setSelectedCategories
}) => {

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
          alert("Unable to get location");
          setIsLoadingLocation?.(false);
        }
      );
    } else {
      alert("Geolocation not supported");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="query-form">
      <div className="query-form-body">
        <div className="form-row">
          <label htmlFor="location">Location</label>
          <div className="location-input-group">
            <input
              id="location"
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="latitude,longitude"
              autoComplete="off"
            />
            <button
              type="button"
              className="btn-icon"
              onClick={getCurrentLocation}
              disabled={isLoadingLocation}
              title="Use my current location"
            >
              {isLoadingLocation ? <span className="spinner">⟳</span> : '📍'}
            </button>
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="startDate">Start Date</label>
          <input
            id="startDate"
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label htmlFor="endDate">End Date</label>
          <input
            id="endDate"
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label htmlFor="radius">Search Radius</label>
          <select
            id="radius"
            value={radius}
            onChange={e => setRadius(Number(e.target.value))}
          >
            <option value={1}>1 km</option>
            <option value={2}>2 km</option>
            <option value={5}>5 km</option>
            <option value={10}>10 km</option>
            <option value={20}>20 km</option>
          </select>
        </div>
        <div className="form-row">
          <label>Activity Type</label>
          <div className="chip-group">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                className={`chip${selectedCategories.includes(cat.id) ? " chip--active" : ""}${cat.id === 'ahora' ? ' chip--ahora' : ''}`}
                onClick={() => toggleCategory(cat.id)}
                aria-pressed={selectedCategories.includes(cat.id)}
              >
                <span className="chip-emoji">{cat.emoji}</span>
                {cat.label}
              </button>
            ))}
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn-primary">
            Search
          </button>
          {onClear && (
            <button type="button" className="btn-secondary" onClick={handleClear}>
              Clear
            </button>
          )}
        </div>
      </div>
    </form>
  );
};

export default QueryForm;

