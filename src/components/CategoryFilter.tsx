import React from 'react';
import './CategoryFilter.css';
import { CATEGORIES } from './QueryForm';

export interface CategoryFilterProps {
  categories: string[]; // IDs
  selected: string[];
  onChange: (selected: string[]) => void;
}

const CategoryFilter: React.FC<CategoryFilterProps> = ({ categories, selected, onChange }) => {
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
            <span className="cat-emoji">{cat.emoji}</span> {cat.label}
          </button>
        );
      })}
    </div>
  );
};

export default CategoryFilter;
