import React from 'react';
import './CategoryFilter.css';
import { CATEGORIES } from './QueryForm';

export interface CategoryFilterProps {
  categories: string[]; // IDs
  selected: string[];
  counts: Record<string, number>;
  onChange: (selected: string[]) => void;
}

const CategoryFilter: React.FC<CategoryFilterProps> = ({ categories, selected, counts, onChange }) => {
  const toggle = (cat: string) => {
    if (selected.includes(cat)) {
      onChange(selected.filter(c => c !== cat));
    } else {
      onChange([...selected, cat]);
    }
  };
  return (
    <div className="category-filter-floating">
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
