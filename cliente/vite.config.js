import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

/**
 * Configuración de Vite para el cliente PWA de Control de Producción de Armaduras.
 * Incluye @vitejs/plugin-basic-ssl para habilitar HTTPS en la red local (LAN)
 * y permitir el registro del Service Worker y la instalación de la PWA en móviles.
 */
export default defineConfig({
  plugins: [
    react(),
    basicSsl()
  ],
  server: {
    https: true,
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  preview: {
    https: true,
    host: true,
    port: 4173
  }
});
