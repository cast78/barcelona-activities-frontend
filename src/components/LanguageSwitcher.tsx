import React, { useState } from 'react';
import { useLanguage } from '../i18n/useT';

const LANGUAGES = [
  { code: 'ca', label: 'CAT' },
  { code: 'es', label: 'ESP' },
  { code: 'en', label: 'ENG' },
  { code: 'fr', label: 'FRA' },
];

const LanguageSwitcher: React.FC = () => {
  const i18n = useLanguage();
  const [current, setCurrent] = useState<string>(
    () => (i18n.language?.slice(0, 2) || 'ca')
  );

  const handleChange = (code: string) => {
    i18n.changeLanguage(code);
    setCurrent(code);
  };

  return (
    <div style={{
      display: 'flex',
      gap: '3px',
      alignItems: 'center',
      padding: '3px',
      background: 'rgba(255,255,255,0.10)',
      borderRadius: '8px',
      flexShrink: 0,
    }}>
      {LANGUAGES.map(lang => (
        <button
          key={lang.code}
          onClick={() => handleChange(lang.code)}
          title={lang.label}
          style={{
            background: current === lang.code ? '#667eea' : 'transparent',
            border: 'none',
            color: current === lang.code ? '#fff' : 'rgba(255,255,255,0.65)',
            borderRadius: '6px',
            padding: '4px 8px',
            fontSize: '0.67rem',
            fontWeight: current === lang.code ? 800 : 500,
            cursor: 'pointer',
            transition: 'all 0.15s',
            letterSpacing: '0.3px',
            whiteSpace: 'nowrap',
          }}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
};

export default LanguageSwitcher;
