const crypto = require('crypto');
const mongoose = require('mongoose');
const Turno = require('../modelos/Turno');

/**
 * Genera un identificador único de dispositivo para la sesión del turno activo.
 */
const generarTokenDispositivoServidor = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `disp-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
};

/**
 * Verifica que el dispositivo que intenta modificar o cerrar el turno
 * posea el tokenDispositivo activo registrado en la base de datos.
 */
const verificarControlDispositivo = (turno, req) => {
  if (!turno.tokenDispositivo) {
    return { autorizado: true };
  }

  const tokenEnviado =
    req.headers['x-token-dispositivo'] ||
    (req.body && req.body.tokenDispositivo) ||
    (req.query && req.query.tokenDispositivo) ||
    '';

  if (String(turno.tokenDispositivo).trim() !== String(tokenEnviado).trim()) {
    return {
      autorizado: false,
      mensaje: `Modo Consulta: Turno activo a cargo de ${turno.encargado}. Los controles de registro están bloqueados en este dispositivo.`
    };
  }

  return { autorizado: true };
};

const NOMINA_TRABAJADORES = Turno.NOMINA_TRABAJADORES || [
  'William',
  'Antoni',
  'Yervin',
  'Antonio',
  'Wilkerman',
  'Leonardo'
];

// Tarifas oficiales de pago por producción en planta (USD)
const TARIFA_MAQUINA = 0.35;
const TARIFA_ESTABILIZADA = 0.30;

/**
 * Calcula automáticamente la liquidación y nómina individual y total del turno
 * según el número de acompañantes presentes en el arreglo de operadores:
 * - Escenario A (0 acompañantes): Encargado cobra (contadorMaquina * 0.45) + (totalEstabilizadas * 0.30).
 * - Escenario B (1 acompañante): Encargado cobra (contadorMaquina * 0.45) y Acompañante 1 cobra (totalEstabilizadas * 0.30).
 * - Escenario C (2 acompañantes): Encargado cobra (contadorMaquina * 0.45), Acompañante 1 cobra (totalEstabilizadas * 0.30) y Acompañante 2 cobra (totalEstabilizadas * 0.30).
 */
const calcularLiquidacionTurno = ({
  encargado,
  operadores = [],
  contadorMaquina = 0,
  totalEstabilizadas = 0
}) => {
  const cantidadMaquina = Number(contadorMaquina) || 0;
  const cantidadEstabilizadas = Number(totalEstabilizadas) || 0;
  const listaAcompanantes = Array.isArray(operadores)
    ? operadores.map((op) => (op ? String(op).trim() : '')).filter(Boolean)
    : [];

  const pagosPersonal = [];

  if (listaAcompanantes.length === 0) {
    // Escenario A: El Encargado trabajó completamente SOLO (0 acompañantes)
    const pagoMaquina = cantidadMaquina * TARIFA_MAQUINA;
    const pagoEstabilizado = cantidadEstabilizadas * TARIFA_ESTABILIZADA;
    const montoEncargado = Number((pagoMaquina + pagoEstabilizado).toFixed(2));

    pagosPersonal.push({
      nombre: encargado,
      rol: 'Encargado',
      concepto: 'Máquina + Estabilizado',
      montoPagar: montoEncargado
    });
  } else {
    // Escenario B (1 acompañante) y Escenario C (2 acompañantes)
    const montoEncargado = Number((cantidadMaquina * TARIFA_MAQUINA).toFixed(2));
    const montoPorAcompanante = Number((cantidadEstabilizadas * TARIFA_ESTABILIZADA).toFixed(2));

    pagosPersonal.push({
      nombre: encargado,
      rol: 'Encargado',
      concepto: 'Máquina',
      montoPagar: montoEncargado
    });

    listaAcompanantes.forEach((nombreAcompanante) => {
      pagosPersonal.push({
        nombre: nombreAcompanante,
        rol: 'Acompañante',
        concepto: 'Estabilizado',
        montoPagar: montoPorAcompanante
      });
    });
  }

  const totalNominaTurno = Number(
    pagosPersonal.reduce((acumulado, pago) => acumulado + (Number(pago.montoPagar) || 0), 0).toFixed(2)
  );

  return {
    tarifaMaquina: TARIFA_MAQUINA,
    tarifaEstabilizada: TARIFA_ESTABILIZADA,
    pagosPersonal,
    totalNominaTurno
  };
};

/**
 * Genera la hora actual formateada en formato legible de 12 horas (ej. "07:05 a. m.").
 */
const formatearHoraServidor = (fecha = new Date()) => {
  return fecha.toLocaleTimeString('es-VE', {
    timeZone: 'America/Caracas',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

/**
 * Normaliza y valida el encargado y la lista opcional de acompañantes (operadores)
 * según las reglas de negocio de nómina cerrada.
 */
const normalizarYValidarPersonal = (encargado, operadores) => {
  const encargadoLimpio = encargado ? String(encargado).trim() : '';

  if (!encargadoLimpio) {
    return {
      valido: false,
      mensaje: 'El Encargado del Turno es obligatorio.'
    };
  }

  if (!NOMINA_TRABAJADORES.includes(encargadoLimpio)) {
    return {
      valido: false,
      mensaje: `El encargado "${encargadoLimpio}" no pertenece a la nómina autorizada (${NOMINA_TRABAJADORES.join(', ')}).`
    };
  }

  // Filtrar cadenas vacías en caso de que el frontend envíe "" para "Ninguno / Trabaja solo"
  const listaOperadoresLimpia = Array.isArray(operadores)
    ? operadores.map((op) => (op ? String(op).trim() : '')).filter(Boolean)
    : [];

  if (listaOperadoresLimpia.length > 2) {
    return {
      valido: false,
      mensaje: 'Solo se permiten como máximo 2 acompañantes además del encargado.'
    };
  }

  for (const nombreOperador of listaOperadoresLimpia) {
    if (!NOMINA_TRABAJADORES.includes(nombreOperador)) {
      return {
        valido: false,
        mensaje: `El acompañante "${nombreOperador}" no pertenece a la nómina autorizada (${NOMINA_TRABAJADORES.join(', ')}).`
      };
    }
  }

  const todosLosSeleccionados = [encargadoLimpio, ...listaOperadoresLimpia];
  if (new Set(todosLosSeleccionados).size !== todosLosSeleccionados.length) {
    return {
      valido: false,
      mensaje:
        'No se puede seleccionar a la misma persona en más de un puesto (Encargado / Acompañantes).'
    };
  }

  return {
    valido: true,
    encargado: encargadoLimpio,
    operadores: listaOperadoresLimpia
  };
};

/**
 * Convierte una fecha (Date o cadena) a clave local YYYY-MM-DD sin desfase UTC.
 */
const obtenerClaveFechaLocal = (fechaEntrada) => {
  if (!fechaEntrada) return '';
  if (typeof fechaEntrada === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaEntrada.trim())) {
    return fechaEntrada.trim();
  }
  const fechaObj = new Date(fechaEntrada);
  if (Number.isNaN(fechaObj.getTime())) return '';
  const anio = fechaObj.getFullYear();
  const mes = String(fechaObj.getMonth() + 1).padStart(2, '0');
  const dia = String(fechaObj.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
};

/**
 * Parsea una cadena de fecha YYYY-MM-DD al mediodía local para evitar cambios de día por zona horaria.
 */
const parsearFechaSegura = (fecha) => {
  if (!fecha) return new Date();
  if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha.trim())) {
    return new Date(`${fecha.trim()}T12:00:00`);
  }
  const fechaParseada = new Date(fecha);
  return Number.isNaN(fechaParseada.getTime()) ? new Date() : fechaParseada;
};

/**
 * Oculta estrictamente el objeto de liquidación financiera en todas las respuestas
 * públicas dirigidas a los operadores de planta por confidencialidad.
 */
const ocultarLiquidacionParaOperador = (docTurno) => {
  if (!docTurno) return null;
  const objeto = docTurno.toObject ? docTurno.toObject() : { ...docTurno };
  delete objeto.liquidacion;
  return objeto;
};

/**
 * Obtiene el turno actualmente "En Progreso" (si existe) para restaurar
 * la sesión de trabajo en la tablet o teléfono de planta (sin exponer liquidacion).
 * GET /api/turnos/activo
 */
const obtenerTurnoActivo = async (req, res) => {
  try {
    const turnoActivo = await Turno.findOne({ estado: 'En Progreso' })
      .select('-liquidacion')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      exito: true,
      turno: turnoActivo ? ocultarLiquidacionParaOperador(turnoActivo) : null
    });
  } catch (error) {
    console.error('[Controlador Turno] Error al obtener turno activo:', error);
    return res.status(500).json({
      exito: false,
      mensaje: 'Error interno al consultar el turno activo en el servidor.',
      error: error.message
    });
  }
};

/**
 * Inicia un nuevo turno en estado "En Progreso" aplicando bloqueo estricto de turno único
 * y registrando automáticamente la fecha y hora exacta de apertura.
 * POST /api/turnos
 */
const iniciarTurno = async (req, res) => {
  try {
    const { tipoTurno, encargado, operadores, tokenDispositivo } = req.body;

    // 1. Regla de Turno Único Activo (Bloqueo Estricto con HTTP 400)
    const turnoAbiertoExistente = await Turno.findOne({ estado: 'En Progreso' }).sort({
      createdAt: -1
    });
    if (turnoAbiertoExistente) {
      return res.status(400).json({
        exito: false,
        mensaje:
          'No se puede iniciar un nuevo turno: ya existe un turno activo en planta. Debe ser cerrado primero.',
        turno: ocultarLiquidacionParaOperador(turnoAbiertoExistente)
      });
    }

    if (!tipoTurno || !['Primer Turno', 'Segundo Turno'].includes(tipoTurno)) {
      return res.status(400).json({
        exito: false,
        mensaje: 'Debe seleccionar obligatoriamente "Primer Turno" o "Segundo Turno".'
      });
    }

    const validacionPersonal = normalizarYValidarPersonal(encargado, operadores);
    if (!validacionPersonal.valido) {
      return res.status(400).json({
        exito: false,
        mensaje: validacionPersonal.mensaje
      });
    }

    // 2. Registro automático de fecha, hora exacta de apertura y token maestro del dispositivo
    const ahora = new Date();
    const horaApertura = formatearHoraServidor(ahora);
    const tokenMaestro =
      tokenDispositivo && String(tokenDispositivo).trim()
        ? String(tokenDispositivo).trim()
        : generarTokenDispositivoServidor();

    const nuevoTurno = new Turno({
      fecha: ahora,
      fechaApertura: ahora,
      horaApertura,
      fechaCierre: null,
      horaCierre: '',
      tipoTurno,
      encargado: validacionPersonal.encargado,
      operadores: validacionPersonal.operadores,
      registrosParciales: [],
      totalEstabilizadas: 0,
      contadorMaquina: 0,
      diferencia: 0,
      estado: 'En Progreso',
      tokenDispositivo: tokenMaestro
    });

    await nuevoTurno.save();

    return res.status(201).json({
      exito: true,
      mensaje: `${tipoTurno} iniciado a las ${horaApertura} a cargo de ${nuevoTurno.encargado}.`,
      turno: ocultarLiquidacionParaOperador(nuevoTurno)
    });
  } catch (error) {
    console.error('[Controlador Turno] Error al iniciar turno:', error);
    return res.status(400).json({
      exito: false,
      mensaje: error.message || 'No se pudo iniciar el turno.',
      error: error.message
    });
  }
};

/**
 * Actualiza los metadatos del personal o tipo de turno
 * únicamente si el turno aún se encuentra "En Progreso".
 * PUT /api/turnos/:id/datos
 */
const actualizarDatosTurno = async (req, res) => {
  try {
    const { id } = req.params;
    const { tipoTurno, encargado, operadores } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        exito: false,
        mensaje: 'El identificador del turno no es válido.'
      });
    }

    const turno = await Turno.findById(id);
    if (!turno) {
      return res.status(404).json({
        exito: false,
        mensaje: 'No se encontró el turno especificado.'
      });
    }

    if (turno.estado === 'Cerrado') {
      return res.status(403).json({
        exito: false,
        mensaje: 'Este turno ya fue cerrado y su edición está bloqueada.'
      });
    }

    const permiso = verificarControlDispositivo(turno, req);
    if (!permiso.autorizado) {
      return res.status(403).json({
        exito: false,
        mensaje: permiso.mensaje
      });
    }

    if (tipoTurno) {
      if (!['Primer Turno', 'Segundo Turno'].includes(tipoTurno)) {
        return res.status(400).json({
          exito: false,
          mensaje: 'El tipo de turno debe ser "Primer Turno" o "Segundo Turno".'
        });
      }
      turno.tipoTurno = tipoTurno;
    }

    const encargadoObjetivo = encargado !== undefined ? encargado : turno.encargado;
    const operadoresObjetivo = operadores !== undefined ? operadores : turno.operadores;

    const validacionPersonal = normalizarYValidarPersonal(encargadoObjetivo, operadoresObjetivo);
    if (!validacionPersonal.valido) {
      return res.status(400).json({
        exito: false,
        mensaje: validacionPersonal.mensaje
      });
    }

    turno.encargado = validacionPersonal.encargado;
    turno.operadores = validacionPersonal.operadores;

    await turno.save();

    return res.status(200).json({
      exito: true,
      mensaje: 'Datos del turno actualizados correctamente.',
      turno: ocultarLiquidacionParaOperador(turno)
    });
  } catch (error) {
    console.error('[Controlador Turno] Error al actualizar datos del turno:', error);
    return res.status(400).json({
      exito: false,
      mensaje: error.message || 'Error al actualizar los datos del turno.'
    });
  }
};

/**
 * Registra un nuevo lote parcial de armaduras estabilizadas durante el turno.
 * POST /api/turnos/:id/parciales
 */
const agregarRegistroParcial = async (req, res) => {
  try {
    const { id } = req.params;
    const { cantidad, hora, observacion } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        exito: false,
        mensaje: 'El identificador del turno no es válido.'
      });
    }

    const turno = await Turno.findById(id);
    if (!turno) {
      return res.status(404).json({
        exito: false,
        mensaje: 'No se encontró el turno activo.'
      });
    }

    if (turno.estado === 'Cerrado') {
      return res.status(403).json({
        exito: false,
        mensaje: 'El turno está cerrado. No se permiten nuevos registros parciales.'
      });
    }

    const permiso = verificarControlDispositivo(turno, req);
    if (!permiso.autorizado) {
      return res.status(403).json({
        exito: false,
        mensaje: permiso.mensaje
      });
    }

    const cantidadNumerica = Number(cantidad);
    if (!Number.isFinite(cantidadNumerica) || cantidadNumerica <= 0) {
      return res.status(400).json({
        exito: false,
        mensaje: 'La cantidad de armaduras estabilizadas debe ser un número mayor a 0.'
      });
    }

    // Asignar automáticamente la hora actual del servidor si no viene en la petición
    const ahora = new Date();
    const horaAutomatica = formatearHoraServidor(ahora);
    const horaFinal = hora && String(hora).trim() ? String(hora).trim() : horaAutomatica;

    turno.registrosParciales.push({
      cantidad: Math.round(cantidadNumerica),
      hora: horaFinal,
      observacion: observacion ? String(observacion).trim() : ''
    });

    await turno.save();

    return res.status(201).json({
      exito: true,
      mensaje: `Se registraron ${Math.round(cantidadNumerica)} armaduras estabilizadas a las ${horaFinal}.`,
      turno: ocultarLiquidacionParaOperador(turno)
    });
  } catch (error) {
    console.error('[Controlador Turno] Error al agregar registro parcial:', error);
    return res.status(400).json({
      exito: false,
      mensaje: error.message || 'Error al registrar el lote parcial de armaduras.'
    });
  }
};

/**
 * Elimina un registro parcial en caso de error de digitación antes de cerrar el turno.
 * DELETE /api/turnos/:id/parciales/:parcialId
 */
const eliminarRegistroParcial = async (req, res) => {
  try {
    const { id, parcialId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        exito: false,
        mensaje: 'El identificador del turno no es válido.'
      });
    }

    const turno = await Turno.findById(id);
    if (!turno) {
      return res.status(404).json({
        exito: false,
        mensaje: 'No se encontró el turno especificado.'
      });
    }

    if (turno.estado === 'Cerrado') {
      return res.status(403).json({
        exito: false,
        mensaje: 'El turno está cerrado y no puede modificarse.'
      });
    }

    const permiso = verificarControlDispositivo(turno, req);
    if (!permiso.autorizado) {
      return res.status(403).json({
        exito: false,
        mensaje: permiso.mensaje
      });
    }

    const cantidadAntes = turno.registrosParciales.length;
    turno.registrosParciales = turno.registrosParciales.filter(
      (registro) => String(registro._id) !== String(parcialId)
    );

    if (turno.registrosParciales.length === cantidadAntes) {
      return res.status(404).json({
        exito: false,
        mensaje: 'No se encontró el registro parcial indicado.'
      });
    }

    await turno.save();

    return res.status(200).json({
      exito: true,
      mensaje: 'Registro parcial eliminado y acumulado actualizado.',
      turno: ocultarLiquidacionParaOperador(turno)
    });
  } catch (error) {
    console.error('[Controlador Turno] Error al eliminar registro parcial:', error);
    return res.status(400).json({
      exito: false,
      mensaje: error.message || 'Error al eliminar el registro parcial.'
    });
  }
};

/**
 * Finaliza y cierra un turno existente ("Terminar Turno"):
 * - Registra automáticamente la fecha y hora exacta de cierre.
 * - Calcula automáticamente la sumatoria total de armaduras estabilizadas.
 * - Calcula la diferencia/merma frente al contador de máquina.
 * - Cambia el estado a "Cerrado" bloqueando futuras ediciones.
 * PUT /api/turnos/:id/cerrar
 */
const cerrarTurno = async (req, res) => {
  try {
    const { id } = req.params;
    const { contadorMaquina } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        exito: false,
        mensaje: 'El identificador del turno no es válido.'
      });
    }

    const turno = await Turno.findById(id);
    if (!turno) {
      return res.status(404).json({
        exito: false,
        mensaje: 'No se encontró el turno que intenta cerrar.'
      });
    }

    if (turno.estado === 'Cerrado') {
      return res.status(400).json({
        exito: false,
        mensaje: 'Este turno ya fue cerrado anteriormente.'
      });
    }

    const permiso = verificarControlDispositivo(turno, req);
    if (!permiso.autorizado) {
      return res.status(403).json({
        exito: false,
        mensaje: permiso.mensaje
      });
    }

    const contadorNumerico = Number(contadorMaquina);
    if (
      contadorMaquina === undefined ||
      contadorMaquina === null ||
      contadorMaquina === '' ||
      !Number.isFinite(contadorNumerico) ||
      contadorNumerico < 0
    ) {
      return res.status(400).json({
        exito: false,
        mensaje: 'Debe ingresar una cantidad válida para el contador de máquina.'
      });
    }

    // Registro automático de la fecha y hora exacta de cierre
    const ahora = new Date();
    const horaCierre = formatearHoraServidor(ahora);
    const contadorFinal = Math.round(contadorNumerico);

    // Calcular total de armaduras estabilizadas acumuladas en el turno
    const sumaEstabilizadas = (turno.registrosParciales || []).reduce(
      (acumulado, item) => acumulado + (Number(item.cantidad) || 0),
      0
    );

    // Calcular liquidación de nómina según dotación del turno (Escenarios A, B o C)
    const liquidacionCalculada = calcularLiquidacionTurno({
      encargado: turno.encargado,
      operadores: turno.operadores,
      contadorMaquina: contadorFinal,
      totalEstabilizadas: sumaEstabilizadas
    });

    turno.contadorMaquina = contadorFinal;
    turno.totalEstabilizadas = sumaEstabilizadas;
    turno.diferencia = contadorFinal - sumaEstabilizadas;
    turno.liquidacion = liquidacionCalculada;
    turno.fechaCierre = ahora;
    turno.horaCierre = horaCierre;
    turno.estado = 'Cerrado';

    // El hook pre('save') valida y guarda el consolidado junto con la liquidación confidencial en MongoDB
    await turno.save();

    return res.status(200).json({
      exito: true,
      mensaje: `Turno cerrado exitosamente a las ${horaCierre}. Consolidado de producción guardado en la base de datos.`,
      turno: ocultarLiquidacionParaOperador(turno)
    });
  } catch (error) {
    console.error('[Controlador Turno] Error al cerrar turno:', error);
    return res.status(400).json({
      exito: false,
      mensaje: error.message || 'Error al cerrar el turno.'
    });
  }
};

// Alias terminarTurno para consistencia semántica
const terminarTurno = cerrarTurno;

/**
 * Mecanismo de Relevo / Emergencia (Sin Clave):
 * Transfiere el control del turno en progreso a un nuevo dispositivo actualizando tokenDispositivo.
 * El dispositivo anterior pasa automáticamente a Modo Consulta (Solo Lectura).
 * PUT /api/turnos/:id/reclamar-control
 */
const reclamarControlTurno = async (req, res) => {
  try {
    const { id } = req.params;
    const { tokenDispositivo } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        exito: false,
        mensaje: 'El identificador del turno no es válido.'
      });
    }

    const turno = await Turno.findById(id);
    if (!turno) {
      return res.status(404).json({
        exito: false,
        mensaje: 'No se encontró el turno activo.'
      });
    }

    if (turno.estado === 'Cerrado') {
      return res.status(400).json({
        exito: false,
        mensaje: 'El turno ya fue cerrado y no puede reclamarse su control.'
      });
    }

    const nuevoToken =
      tokenDispositivo && String(tokenDispositivo).trim()
        ? String(tokenDispositivo).trim()
        : generarTokenDispositivoServidor();

    turno.tokenDispositivo = nuevoToken;
    await turno.save();

    return res.status(200).json({
      exito: true,
      mensaje: 'Control del turno transferido exitosamente a este dispositivo.',
      turno: ocultarLiquidacionParaOperador(turno)
    });
  } catch (error) {
    console.error('[Controlador Turno] Error al reclamar control del turno:', error);
    return res.status(400).json({
      exito: false,
      mensaje: error.message || 'No se pudo transferir el control del turno a este dispositivo.'
    });
  }
};

/**
 * Guarda y cierra en una sola operación un turno completo con sus parciales y contador de máquina.
 * Útil como respaldo cuando el turno se operó en memoria local y se consolida al terminar.
 * POST /api/turnos/cerrar-completo
 */
const guardarYCerrarTurnoDirecto = async (req, res) => {
  try {
    const {
      fecha,
      fechaApertura,
      horaApertura,
      tipoTurno,
      encargado,
      operadores,
      registrosParciales,
      contadorMaquina
    } = req.body;

    const validacionPersonal = normalizarYValidarPersonal(encargado, operadores);
    if (!validacionPersonal.valido) {
      return res.status(400).json({
        exito: false,
        mensaje: validacionPersonal.mensaje
      });
    }

    const contadorNumerico = Number(contadorMaquina);
    if (
      contadorMaquina === undefined ||
      contadorMaquina === null ||
      contadorMaquina === '' ||
      !Number.isFinite(contadorNumerico) ||
      contadorNumerico < 0
    ) {
      return res.status(400).json({
        exito: false,
        mensaje: 'Debe ingresar una cantidad válida para el contador de máquina.'
      });
    }

    const ahora = new Date();
    const horaPorDefecto = formatearHoraServidor(ahora);

    const parcialesLimpios = Array.isArray(registrosParciales)
      ? registrosParciales.map((p) => ({
          cantidad: Math.round(Number(p.cantidad) || 0),
          hora: p.hora && String(p.hora).trim() ? String(p.hora).trim() : horaPorDefecto,
          observacion: p.observacion ? String(p.observacion).trim() : ''
        }))
      : [];

    const fechaAperturaFinal = fechaApertura ? new Date(fechaApertura) : parsearFechaSegura(fecha);
    const contadorFinal = Math.round(contadorNumerico);
    const sumaEstabilizadas = parcialesLimpios.reduce(
      (acc, item) => acc + (Number(item.cantidad) || 0),
      0
    );

    const liquidacionCalculada = calcularLiquidacionTurno({
      encargado: validacionPersonal.encargado,
      operadores: validacionPersonal.operadores,
      contadorMaquina: contadorFinal,
      totalEstabilizadas: sumaEstabilizadas
    });

    const nuevoTurnoCerrado = new Turno({
      fecha: parsearFechaSegura(fecha),
      fechaApertura: fechaAperturaFinal,
      horaApertura:
        horaApertura && String(horaApertura).trim()
          ? String(horaApertura).trim()
          : formatearHoraServidor(fechaAperturaFinal),
      fechaCierre: ahora,
      horaCierre: horaPorDefecto,
      tipoTurno,
      encargado: validacionPersonal.encargado,
      operadores: validacionPersonal.operadores,
      registrosParciales: parcialesLimpios,
      contadorMaquina: contadorFinal,
      liquidacion: liquidacionCalculada,
      estado: 'Cerrado'
    });

    await nuevoTurnoCerrado.save();

    return res.status(201).json({
      exito: true,
      mensaje: `Turno consolidado y cerrado exitosamente a las ${horaPorDefecto}.`,
      turno: ocultarLiquidacionParaOperador(nuevoTurnoCerrado)
    });
  } catch (error) {
    console.error('[Controlador Turno] Error en cierre directo:', error);
    return res.status(400).json({
      exito: false,
      mensaje: error.message || 'Error al consolidar y cerrar el turno.'
    });
  }
};

/**
 * Verifica las credenciales (PIN/Contraseña) para el acceso al Panel de Supervisión.
 * POST /api/turnos/supervisor/autenticar
 */
const autenticarSupervisor = (req, res) => {
  const { clave } = req.body;
  const claveConfigurada = process.env.CLAVE_SUPERVISOR || '1234';

  if (!clave || String(clave).trim() !== String(claveConfigurada).trim()) {
    return res.status(401).json({
      exito: false,
      mensaje: 'Clave de supervisor incorrecta. Verifique e intente nuevamente.'
    });
  }

  return res.status(200).json({
    exito: true,
    mensaje: 'Acceso de supervisor concedido.'
  });
};

/**
 * Obtiene el historial filtrable de turnos y calcula métricas clave de supervisión:
 * - Total estabilizadas hoy y últimos 7 días
 * - Comparativa entre Primer Turno y Segundo Turno
 * - Rendimiento vs Contador de Máquina y mermas/diferencias (sobre turnos cerrados)
 * GET /api/turnos/supervisor/estadisticas
 */
const obtenerEstadisticasEHistorial = async (req, res) => {
  try {
    const { fechaInicio, fechaFin, tipoTurno, estado } = req.query;

    const filtro = {};

    if (tipoTurno && tipoTurno !== 'Todos') {
      filtro.tipoTurno = tipoTurno;
    }

    if (estado && estado !== 'Todos') {
      filtro.estado = estado;
    }

    if (fechaInicio || fechaFin) {
      filtro.fecha = {};
      if (fechaInicio) {
        filtro.fecha.$gte = new Date(`${fechaInicio}T00:00:00.000`);
      }
      if (fechaFin) {
        filtro.fecha.$lte = new Date(`${fechaFin}T23:59:59.999`);
      }
    }

    // Consulta de turnos según los filtros seleccionados
    const turnosFiltrados = await Turno.find(filtro).sort({ fecha: -1, createdAt: -1 });

    // Consulta global para métricas de Hoy y Semana actual (últimos 7 días)
    const ahora = new Date();
    const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0, 0);
    const finHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999);

    const inicioSemana = new Date(inicioHoy);
    inicioSemana.setDate(inicioSemana.getDate() - 6);

    const turnosRecientes = await Turno.find({
      fecha: { $gte: inicioSemana, $lte: finHoy }
    });

    const obtenerLiquidacionSegura = (t) => {
      if (t.estado !== 'Cerrado') {
        return {
          tarifaMaquina: TARIFA_MAQUINA,
          tarifaEstabilizada: TARIFA_ESTABILIZADA,
          pagosPersonal: [],
          totalNominaTurno: 0
        };
      }
      if (
        t.liquidacion &&
        Array.isArray(t.liquidacion.pagosPersonal) &&
        t.liquidacion.pagosPersonal.length > 0
      ) {
        return t.liquidacion;
      }
      return calcularLiquidacionTurno({
        encargado: t.encargado,
        operadores: t.operadores,
        contadorMaquina: t.contadorMaquina,
        totalEstabilizadas: t.totalEstabilizadas
      });
    };

    const turnosRecientesHoy = turnosRecientes.filter(
      (t) => new Date(t.fecha) >= inicioHoy && new Date(t.fecha) <= finHoy
    );

    const totalEstabilizadasHoy = turnosRecientesHoy.reduce(
      (acc, t) => acc + (Number(t.totalEstabilizadas) || 0),
      0
    );

    const totalEstabilizadasSemana = turnosRecientes.reduce(
      (acc, t) => acc + (Number(t.totalEstabilizadas) || 0),
      0
    );

    const totalNominaHoy = Number(
      turnosRecientesHoy
        .reduce((acc, t) => acc + (Number(obtenerLiquidacionSegura(t).totalNominaTurno) || 0), 0)
        .toFixed(2)
    );

    const totalNominaSemana = Number(
      turnosRecientes
        .reduce((acc, t) => acc + (Number(obtenerLiquidacionSegura(t).totalNominaTurno) || 0), 0)
        .toFixed(2)
    );

    // Métricas sobre los turnos filtrados
    let totalEstabilizadasPeriodo = 0;
    let totalEstabilizadasCerradasPeriodo = 0;
    let totalMaquinaPeriodo = 0;
    let diferenciaTotalPeriodo = 0;
    let totalNominaPeriodo = 0;

    const comparativaTurnos = {
      primerTurno: {
        cantidadTurnos: 0,
        totalEstabilizadas: 0,
        estabilizadasCerradas: 0,
        totalMaquina: 0,
        diferencia: 0,
        rendimiento: 0,
        totalNomina: 0
      },
      segundoTurno: {
        cantidadTurnos: 0,
        totalEstabilizadas: 0,
        estabilizadasCerradas: 0,
        totalMaquina: 0,
        diferencia: 0,
        rendimiento: 0,
        totalNomina: 0
      }
    };

    const turnosNormalizados = turnosFiltrados.map((docTurno) => {
      const turno = docTurno.toObject ? docTurno.toObject() : docTurno;
      const estabilizadas = Number(turno.totalEstabilizadas) || 0;
      const estaCerrado = turno.estado === 'Cerrado';
      const maquina = estaCerrado ? Number(turno.contadorMaquina) || 0 : 0;
      const dif = estaCerrado ? Number(turno.diferencia) || 0 : 0;
      const liquidacion = obtenerLiquidacionSegura(turno);
      const nominaTurno = estaCerrado ? Number(liquidacion.totalNominaTurno) || 0 : 0;

      turno.liquidacion = liquidacion;

      totalEstabilizadasPeriodo += estabilizadas;
      if (estaCerrado) {
        totalEstabilizadasCerradasPeriodo += estabilizadas;
        totalMaquinaPeriodo += maquina;
        diferenciaTotalPeriodo += dif;
        totalNominaPeriodo = Number((totalNominaPeriodo + nominaTurno).toFixed(2));
      }

      const grupo =
        turno.tipoTurno === 'Primer Turno'
          ? comparativaTurnos.primerTurno
          : comparativaTurnos.segundoTurno;

      grupo.cantidadTurnos += 1;
      grupo.totalEstabilizadas += estabilizadas;
      if (estaCerrado) {
        grupo.estabilizadasCerradas += estabilizadas;
        grupo.totalMaquina += maquina;
        grupo.diferencia += dif;
        grupo.totalNomina = Number((grupo.totalNomina + nominaTurno).toFixed(2));
      }

      return turno;
    });

    if (comparativaTurnos.primerTurno.totalMaquina > 0) {
      comparativaTurnos.primerTurno.rendimiento = Number(
        (
          (comparativaTurnos.primerTurno.estabilizadasCerradas /
            comparativaTurnos.primerTurno.totalMaquina) *
          100
        ).toFixed(1)
      );
    }

    if (comparativaTurnos.segundoTurno.totalMaquina > 0) {
      comparativaTurnos.segundoTurno.rendimiento = Number(
        (
          (comparativaTurnos.segundoTurno.estabilizadasCerradas /
            comparativaTurnos.segundoTurno.totalMaquina) *
          100
        ).toFixed(1)
      );
    }

    const rendimientoPorcentaje =
      totalMaquinaPeriodo > 0
        ? Number(((totalEstabilizadasCerradasPeriodo / totalMaquinaPeriodo) * 100).toFixed(1))
        : 0;

    return res.status(200).json({
      exito: true,
      metricas: {
        totalEstabilizadasHoy,
        totalEstabilizadasSemana,
        totalEstabilizadasPeriodo,
        totalEstabilizadasCerradasPeriodo,
        totalMaquinaPeriodo,
        diferenciaTotalPeriodo,
        rendimientoPorcentaje,
        totalNominaHoy,
        totalNominaSemana,
        totalNominaPeriodo,
        cantidadTurnosPeriodo: turnosNormalizados.length,
        comparativaTurnos
      },
      turnos: turnosNormalizados
    });
  } catch (error) {
    console.error('[Controlador Turno] Error al obtener estadísticas de supervisor:', error);
    return res.status(500).json({
      exito: false,
      mensaje: 'Error al consultar las estadísticas e historial de supervisión.',
      error: error.message
    });
  }
};

module.exports = {
  obtenerTurnoActivo,
  iniciarTurno,
  actualizarDatosTurno,
  agregarRegistroParcial,
  eliminarRegistroParcial,
  cerrarTurno,
  terminarTurno,
  reclamarControlTurno,
  guardarYCerrarTurnoDirecto,
  autenticarSupervisor,
  obtenerEstadisticasEHistorial
};
