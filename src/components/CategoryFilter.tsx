import React from 'react';
import './CategoryFilter.css';
import { CATEGORIES } from './QueryForm';

export interface CategoryFilterProps {
  categories: string[]; // IDs
  selected: string[];
  counts: Record<string, number>;
  onChange: (selected: string[]) => void;
  goonmapActive?: boolean;
  onToggleGoonmap?: () => void;
  goonmapLabel?: string;
  goonmapTitle?: string;
}

const CategoryFilter: React.FC<CategoryFilterProps> = ({ categories, selected, counts, onChange, goonmapActive, onToggleGoonmap, goonmapLabel, goonmapTitle }) => {
  const toggle = (cat: string) => {
    if (selected.includes(cat)) {
      onChange(selected.filter(c => c !== cat));
    } else {
      onChange([...selected, cat]);
    }
  };
  return (
    <div className="category-filter-floating">
      {onToggleGoonmap && (
        <button
          className="cat-btn"
          onClick={onToggleGoonmap}
          title={goonmapTitle}
          type="button"
          style={{
            background: goonmapActive ? 'linear-gradient(135deg, #f5a623, #764ba2)' : '#fff',
            color: goonmapActive ? '#fff' : '#764ba2',
            border: goonmapActive ? 'none' : '1.5px solid #f5a623',
            fontWeight: 800,
          }}
        >
          <span className="cat-emoji">⭐</span>
          <span className="cat-label">{goonmapLabel || 'GoOnMap'}</span>
        </button>
      )}
      {categories.map(catId => {
        const cat = CATEGORIES.find(c => c.id === catId);
        if (!cat) return null;
        return (
          <button
            key={cat.id}
            className={selected.includes(cat.id) ? 'cat-btn selected' : 'cat-btn'}
            onClick={() => toggle(cat.id)}
            type="button"
          >
            <span className="cat-emoji">{cat.emoji}</span>
            <span className="cat-label">{cat.label}</span>
            {(counts[cat.id] ?? 0) > 0 && (
              <span className="cat-count">{counts[cat.id]}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default CategoryFilter;
