/**
 * Service Worker para la Aplicación Web Progresiva (PWA) de Control de Armaduras.
 * Permite la instalación nativa en teléfonos móviles y tablets de planta.
 */
const NOMBRE_CACHE = 'control-armaduras-pwa-v1';
const ARCHIVOS_ESTATICOS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/iconos/icono-192x192.png',
  '/iconos/icono-512x512.png',
  '/iconos/icono.svg'
];

// Evento de instalación: almacena en caché la estructura base de la aplicación
self.addEventListener('install', (evento) => {
  self.skipWaiting();
  evento.waitUntil(
    caches.open(NOMBRE_CACHE).then((cache) => {
      return cache.addAll(ARCHIVOS_ESTATICOS).catch(() => {
        // Ignorar si algún archivo aún no está disponible durante desarrollo
      });
    })
  );
});

// Evento de activación: limpia cachés antiguas
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves.map((clave) => {
            if (clave !== NOMBRE_CACHE) {
              return caches.delete(clave);
            }
            return null;
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Evento de intercepción de peticiones (estrategia Red primero con respaldo de caché para activos estáticos)
self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;

  // No interceptar peticiones a la API del backend ni métodos distintos de GET
  if (peticion.method !== 'GET' || peticion.url.includes('/api/')) {
    return;
  }

  evento.respondWith(
    fetch(peticion)
      .then((respuestaRed) => {
        if (respuestaRed && respuestaRed.status === 200 && respuestaRed.type === 'basic') {
          const copiaRespuesta = respuestaRed.clone();
          caches.open(NOMBRE_CACHE).then((cache) => {
            cache.put(peticion, copiaRespuesta);
          });
        }
        return respuestaRed;
      })
      .catch(() => {
        return caches.match(peticion).then((respuestaCache) => {
          return respuestaCache || caches.match('/index.html');
        });
      })
  );
});

