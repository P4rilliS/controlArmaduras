/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        planta: {
          oscuro: '#0f172a',
          panel: '#1e293b',
          acento: '#f59e0b',
          exito: '#10b981',
          alerta: '#ef4444'
        }
      }
    }
  },
  plugins: []
};

