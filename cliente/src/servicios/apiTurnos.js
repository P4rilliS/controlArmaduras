/**
 * Servicio de comunicación con el backend REST API para la gestión
 * de turnos, control por sesión de dispositivo, registros parciales y panel de supervisión.
 */
const URL_BASE_API = import.meta.env.VITE_API_URL || '/api/turnos';

/**
 * Clave oficial en localStorage donde se almacena el token maestro del dispositivo activo.
 */
export const CLAVE_TOKEN_TURNO_ACTIVO = 'token_turno_activo';

/**
 * Genera un identificador único aleatorio para vincular el turno al dispositivo actual.
 */
export const generarTokenDispositivo = () => {
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `disp-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

/**
 * Obtiene el token de dispositivo almacenado en el localStorage de este navegador.
 */
export const obtenerTokenLocalDispositivo = () => {
  try {
    return localStorage.getItem(CLAVE_TOKEN_TURNO_ACTIVO) || '';
  } catch {
    return '';
  }
};

/**
 * Construye las cabeceras HTTP incluyendo el token de dispositivo local.
 */
const obtenerCabecerasConToken = (cabecerasExtra = {}) => {
  const tokenLocal = obtenerTokenLocalDispositivo();
  return {
    'Content-Type': 'application/json',
    ...(tokenLocal ? { 'x-token-dispositivo': tokenLocal } : {}),
    ...cabecerasExtra
  };
};

/**
 * Función auxiliar para procesar las respuestas HTTP en formato JSON.
 */
const procesarRespuesta = async (respuesta) => {
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(datos.mensaje || 'Error de comunicación con el servidor.');
    if (datos.turno) {
      error.turnoActivo = datos.turno;
    }
    throw error;
  }
  return datos;
};

/**
 * Consulta si existe un turno en estado "En Progreso" en la base de datos.
 */
export const consultarTurnoActivo = async () => {
  const respuesta = await fetch(`${URL_BASE_API}/activo`);
  return procesarRespuesta(respuesta);
};

/**
 * Inicia un nuevo turno de producción en estado "En Progreso" enviando el tokenDispositivo.
 */
export const crearNuevoTurno = async (datosTurno) => {
  const respuesta = await fetch(URL_BASE_API, {
    method: 'POST',
    headers: obtenerCabecerasConToken(),
    body: JSON.stringify(datosTurno)
  });
  return procesarRespuesta(respuesta);
};

/**
 * Transfiere el control del turno en progreso a este dispositivo (Mecanismo de Relevo / Emergencia).
 */
export const reclamarControlDispositivo = async (idTurno, tokenDispositivo) => {
  const respuesta = await fetch(`${URL_BASE_API}/${idTurno}/reclamar-control`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenDispositivo })
  });
  return procesarRespuesta(respuesta);
};

/**
 * Actualiza los metadatos del turno (tipoTurno, encargado, operadores)
 * mientras el turno permanece "En Progreso".
 */
export const actualizarMetadatosTurno = async (idTurno, datosTurno) => {
  const respuesta = await fetch(`${URL_BASE_API}/${idTurno}/datos`, {
    method: 'PUT',
    headers: obtenerCabecerasConToken(),
    body: JSON.stringify(datosTurno)
  });
  return procesarRespuesta(respuesta);
};

/**
 * Registra un nuevo lote parcial de armaduras estabilizadas en el turno activo.
 */
export const registrarLoteParcial = async (idTurno, loteParcial) => {
  const respuesta = await fetch(`${URL_BASE_API}/${idTurno}/parciales`, {
    method: 'POST',
    headers: obtenerCabecerasConToken(),
    body: JSON.stringify(loteParcial)
  });
  return procesarRespuesta(respuesta);
};

/**
 * Elimina un lote parcial registrado por error (únicamente si el turno sigue "En Progreso").
 */
export const borrarLoteParcial = async (idTurno, idParcial) => {
  const respuesta = await fetch(`${URL_BASE_API}/${idTurno}/parciales/${idParcial}`, {
    method: 'DELETE',
    headers: obtenerCabecerasConToken()
  });
  return procesarRespuesta(respuesta);
};

/**
 * Cierra el turno activo enviando el contador de máquina y calculando totales y diferencia.
 */
export const finalizarTurnoActivo = async (idTurno, contadorMaquina) => {
  const respuesta = await fetch(`${URL_BASE_API}/${idTurno}/cerrar`, {
    method: 'PUT',
    headers: obtenerCabecerasConToken(),
    body: JSON.stringify({ contadorMaquina })
  });
  return procesarRespuesta(respuesta);
};

/**
 * Guarda y cierra directamente un turno completo en una sola petición.
 */
export const guardarYCerrarTurnoCompleto = async (datosCompletos) => {
  const respuesta = await fetch(`${URL_BASE_API}/cerrar-completo`, {
    method: 'POST',
    headers: obtenerCabecerasConToken(),
    body: JSON.stringify(datosCompletos)
  });
  return procesarRespuesta(respuesta);
};

/**
 * Verifica el PIN o contraseña de acceso al Panel Exclusivo del Supervisor.
 */
export const verificarPinSupervisor = async (clave) => {
  const respuesta = await fetch(`${URL_BASE_API}/supervisor/autenticar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clave })
  });
  return procesarRespuesta(respuesta);
};

/**
 * Obtiene las métricas clave y el historial filtrable de turnos para el Panel de Supervisor.
 */
export const obtenerDatosSupervisor = async (claveSupervisor = '', filtros = {}) => {
  const parametros = new URLSearchParams();
  if (filtros.fechaInicio) parametros.append('fechaInicio', filtros.fechaInicio);
  if (filtros.fechaFin) parametros.append('fechaFin', filtros.fechaFin);
  if (filtros.tipoTurno && filtros.tipoTurno !== 'Todos') {
    parametros.append('tipoTurno', filtros.tipoTurno);
  }
  if (filtros.estado && filtros.estado !== 'Todos') {
    parametros.append('estado', filtros.estado);
  }

  const cadenaConsulta = parametros.toString() ? `?${parametros.toString()}` : '';

  const respuesta = await fetch(`${URL_BASE_API}/supervisor/estadisticas${cadenaConsulta}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(claveSupervisor ? { 'x-clave-supervisor': claveSupervisor } : {})
    }
  });
  return procesarRespuesta(respuesta);
};
