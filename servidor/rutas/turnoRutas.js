const express = require('express');
const enrutador = express.Router();

const {
  obtenerTurnoActivo,
  iniciarTurno,
  actualizarDatosTurno,
  agregarRegistroParcial,
  eliminarRegistroParcial,
  cerrarTurno,
  reclamarControlTurno,
  guardarYCerrarTurnoDirecto,
  autenticarSupervisor,
  obtenerEstadisticasEHistorial
} = require('../controladores/turnoControlador');

const { verificarSupervisor } = require('../middlewares/autenticacionSupervisor');

// ============================================================================
// RUTAS DE OPERACIÓN EN PLANTA (SIN EXPOSICIÓN DE DATOS FINANCIEROS)
// ============================================================================

// Consultar si existe un turno actualmente "En Progreso" (oculta liquidacion)
enrutador.get('/activo', obtenerTurnoActivo);

// Iniciar un nuevo turno de trabajo (guarda tokenDispositivo del dispositivo maestro)
enrutador.post('/', iniciarTurno);

// Consolidar y cerrar un turno completo en una sola petición (respaldo)
enrutador.post('/cerrar-completo', guardarYCerrarTurnoDirecto);

// Reclamar o transferir el control del turno activo a este dispositivo (Mecanismo de Relevo)
enrutador.put('/:id/reclamar-control', reclamarControlTurno);

// Actualizar datos del equipo o turno (solo permitido para el dispositivo con control activo)
enrutador.put('/:id/datos', actualizarDatosTurno);

// Agregar un lote parcial de armaduras estabilizadas al turno activo
enrutador.post('/:id/parciales', agregarRegistroParcial);

// Eliminar un lote parcial por corrección antes de cerrar el turno
enrutador.delete('/:id/parciales/:parcialId', eliminarRegistroParcial);

// Cerrar el turno ingresando el contador de máquina ("Terminar Turno")
enrutador.put('/:id/cerrar', cerrarTurno);

// ============================================================================
// RUTAS EXCLUSIVAS DEL PANEL DE SUPERVISIÓN (PROTEGIDAS CON CLAVE DE ACCESO)
// ============================================================================

// Validar clave de acceso del supervisor
enrutador.post('/supervisor/autenticar', autenticarSupervisor);

// Obtener métricas clave, liquidación confidencial e historial filtrable (requiere clave de supervisor)
enrutador.get('/supervisor/estadisticas', verificarSupervisor, obtenerEstadisticasEHistorial);

module.exports = enrutador;
