const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const conectarBaseDatos = require('./configuracion/baseDatos');
const turnoRutas = require('./rutas/turnoRutas');

// Cargar variables de entorno desde el archivo .env
dotenv.config();

// Inicializar aplicación Express
const aplicacion = express();

// Conectar a la base de datos MongoDB
conectarBaseDatos();

// Configuración flexible de CORS para desarrollo y red local de planta (HTTP y HTTPS)
const patronRedLocal =
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/;

aplicacion.use(
  cors({
    origin: function (origen, callback) {
      // Permitir peticiones sin origen (Apps móviles, Postman, proxy local)
      // o desde cualquier origen local / red privada (HTTP o HTTPS)
      if (
        !origen ||
        origen === process.env.CLIENTE_URL ||
        patronRedLocal.test(origen) ||
        process.env.NODE_ENV !== 'production'
      ) {
        callback(null, true);
      } else {
        callback(new Error('Origen no permitido por CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-clave-supervisor', 'x-token-dispositivo'],
    credentials: true
  })
);

aplicacion.use(express.json());

// Ruta de verificación de estado del servidor
aplicacion.get('/api/estado', (req, res) => {
  res.status(200).json({
    exito: true,
    mensaje: 'Servidor de Control de Armaduras operativo correctamente.',
    fechaServidor: new Date().toISOString()
  });
});

// Montar rutas principales de turnos y producción
aplicacion.use('/api/turnos', turnoRutas);

// Manejo de rutas no encontradas (404)
aplicacion.use((req, res) => {
  res.status(404).json({
    exito: false,
    mensaje: `Ruta no encontrada: ${req.originalUrl}`
  });
});

// Puerto de escucha (0.0.0.0 para aceptar conexiones de toda la red local)
const PUERTO = process.env.PUERTO || 5000;

aplicacion.listen(PUERTO, '0.0.0.0', () => {
  console.log(`=============================================================`);
  console.log(`  SERVIDOR DE CONTROL DE ARMADURAS ACTIVO EN PUERTO ${PUERTO}`);
  console.log(`  URL API: http://localhost:${PUERTO}/api/turnos`);
  console.log(`=============================================================`);
});
