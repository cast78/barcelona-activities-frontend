import React from 'react';
import './CategoryFilter.css';

export interface CategoryFilterProps {
  categories: string[];
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
      {categories.map(cat => (
        <button
          key={cat}
          className={selected.includes(cat) ? 'cat-btn selected' : 'cat-btn'}
          onClick={() => toggle(cat)}
          type="button"
        >
          {cat}
        </button>
      ))}
    </div>
  );
};

export default CategoryFilter;
