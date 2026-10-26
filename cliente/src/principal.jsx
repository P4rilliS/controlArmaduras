import React from 'react';
import ReactDOM from 'react-dom/client';
import Aplicacion from './Aplicacion';
import './estilos.css';

// Registro del Service Worker en contextos seguros (HTTPS o localhost) para habilitar instalación PWA
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registro) => {
        console.log('[PWA] Service Worker registrado correctamente en:', registro.scope);
      })
      .catch((error) => {
        console.warn('[PWA] No se pudo registrar el Service Worker:', error);
      });
  });
} else if (!window.isSecureContext) {
  console.warn(
    '[PWA] Conexión no segura detectada (HTTP). Abra la aplicación mediante https:// para habilitar el Service Worker y la instalación móvil.'
  );
}

ReactDOM.createRoot(document.getElementById('raiz')).render(
  <React.StrictMode>
    <Aplicacion />
  </React.StrictMode>
);
