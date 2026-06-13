import React from 'react';
import { useLanguage } from '../i18n/useT';

const LANGUAGES = [
  { code: 'ca', label: 'CAT', flag: '🇪🇸' },
  { code: 'es', label: 'ESP', flag: '🇪🇸' },
  { code: 'en', label: 'ENG', flag: '🇬🇧' },
  { code: 'fr', label: 'FRA', flag: '🇫🇷' },
];

const LanguageSwitcher: React.FC = () => {
  const i18n = useLanguage();
  const current = i18n.language?.slice(0, 2) || 'ca';

  return (
    <div style={{
      display: 'flex',
      gap: '2px',
      alignItems: 'center',
      padding: '2px',
      background: 'rgba(255,255,255,0.08)',
      borderRadius: '8px',
    }}>
      {LANGUAGES.map(lang => (
        <button
          key={lang.code}
          onClick={() => i18n.changeLanguage(lang.code)}
          title={lang.label}
          style={{
            background: current === lang.code ? 'var(--color-primary)' : 'transparent',
            border: 'none',
            color: current === lang.code ? '#fff' : 'rgba(255,255,255,0.6)',
            borderRadius: '6px',
            padding: '3px 7px',
            fontSize: '0.68rem',
            fontWeight: current === lang.code ? 800 : 500,
            cursor: 'pointer',
            transition: 'all 0.15s',
            letterSpacing: '0.3px',
          }}
          onMouseEnter={e => { if (current !== lang.code) e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={e => { if (current !== lang.code) e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
};

export default LanguageSwitcher;
