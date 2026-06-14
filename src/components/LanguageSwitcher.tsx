import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../i18n/useT';

const LANGUAGES = [
  { code: 'ca', flag: 'es-ct', label: 'CAT' },
  { code: 'es', flag: 'es',    label: 'ESP' },
  { code: 'en', flag: 'gb',    label: 'ENG' },
  { code: 'fr', flag: 'fr',    label: 'FRA' },
];

const LanguageSwitcher: React.FC = () => {
  const i18n = useLanguage();
  const [current, setCurrent] = useState<string>(
    () => (i18n.language?.slice(0, 2) || 'ca')
  );
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (code: string) => {
    i18n.changeLanguage(code);
    setCurrent(code);
    setOpen(false);
  };

  const currentLang = LANGUAGES.find(l => l.code === current) ?? LANGUAGES[0];

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'rgba(102,126,234,0.08)',
          border: '1px solid #667eea',
          color: '#667eea',
          borderRadius: '6px',
          padding: '3px 22px 3px 8px',
          fontSize: '0.72rem',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          position: 'relative',
          minWidth: '82px',
          textAlign: 'left',
        }}
      >
        <span className={`fi fi-${currentLang.flag}`} style={{ marginRight: 6, fontSize: '1rem' }} />
        {currentLang.label}
        <span style={{
          position: 'absolute', right: 8, top: '50%',
          transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
          fontSize: '0.6rem', transition: 'transform 0.15s',
          opacity: 0.7,
        }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0,
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          overflow: 'hidden',
          zIndex: 9999,
          minWidth: '100%',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}>
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => handleSelect(lang.code)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '6px 12px',
                background: lang.code === current ? 'rgba(102,126,234,0.3)' : 'transparent',
                border: 'none',
                color: '#334155',
                fontSize: '0.72rem',
                fontWeight: lang.code === current ? 700 : 400,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <span className={`fi fi-${lang.flag}`} style={{ marginRight: 6, fontSize: '1rem' }} />
              {lang.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;