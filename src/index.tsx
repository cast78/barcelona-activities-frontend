import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import 'flag-icons/css/flag-icons.min.css';
import './i18n';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <React.Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#0f172a',color:'#fff',fontSize:'1rem'}}>...</div>}>
      <App />
    </React.Suspense>
  </React.StrictMode>
);

// Registrar Service Worker para notificaciones en Android
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
