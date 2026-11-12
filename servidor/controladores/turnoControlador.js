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

const NOMINA_TRABAJADORES = Turno.NOMINA_TRABAJADORES || [
  'William',
  'Leonardo',
  'Antoni',
  'Yervin',
  'Antonio',
  'Wilkerman'
];

// Tarifas oficiales de pago por producción en planta (USD)
const TARIFA_MAQUINA = Turno.TARIFA_MAQUINA || 0.35;
const TARIFA_ESTABILIZADA = Turno.TARIFA_ESTABILIZADA || 0.30;

/**
 * Obtiene una descripción legible de los trabajadores presentes en el turno
 * (útil cuando el operador de máquina no asistió y el turno lo abrió el anillador o estabilizador).
 */
const obtenerDescripcionEquipoTurno = (turno) => {
  if (!turno) return 'Equipo en planta';
  const presentes = [];
  if (turno.puestoMaquina?.asistio && turno.puestoMaquina?.trabajador) {
    presentes.push(`${turno.puestoMaquina.trabajador} (Máquina)`);
  } else if (turno.encargado) {
    presentes.push(`${turno.encargado} (Máquina)`);
  }

  if (turno.puestoAnillador?.asistio && turno.puestoAnillador?.trabajador) {
    presentes.push(`${turno.puestoAnillador.trabajador} (Anillador)`);
  }
  if (turno.puestoEstabilizador?.asistio && turno.puestoEstabilizador?.trabajador) {
    presentes.push(`${turno.puestoEstabilizador.trabajador} (Estabilizador)`);
  }

  if (presentes.length === 0 && Array.isArray(turno.operadores)) {
    turno.operadores.filter(Boolean).forEach((op) => presentes.push(op));
  }

  return presentes.length > 0 ? presentes.join(', ') : 'Equipo de planta';
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
    const responsable = obtenerDescripcionEquipoTurno(turno);
    return {
      autorizado: false,
      mensaje: `Modo Consulta: Turno activo a cargo de ${responsable}. Los controles de registro están bloqueados en este dispositivo.`
    };
  }

  return { autorizado: true };
};

/**
 * Calcula automáticamente la liquidación y nómina individual y total del turno
 * delegando en la regla estricta de puestos (`Turno.calcularLiquidacionDesdePuestos`).
 */
const calcularLiquidacionTurno = (datosTurno) => {
  return Turno.calcularLiquidacionDesdePuestos(datosTurno);
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
 * Normaliza y valida los 3 puestos operativos (`puestoMaquina`, `puestoAnillador`, `puestoEstabilizador`)
 * manteniendo compatibilidad total con llamadas que envíen `encargado` y `operadores`.
 * Reglas:
 * 1. Cada puesto con trabajador asignado debe pertenecer a `NOMINA_TRABAJADORES`.
 * 2. Debe existir AL MENOS UN trabajador presente (`asistio: true`) para abrir o actualizar el turno.
 * 3. Unicidad: una misma persona presente no puede ocupar dos puestos simultáneamente.
 */
const normalizarYValidarPersonal = (entradaPrincipal, operadoresLegados) => {
  let payload = {};
  if (
    entradaPrincipal &&
    typeof entradaPrincipal === 'object' &&
    !Array.isArray(entradaPrincipal)
  ) {
    payload = entradaPrincipal;
  } else {
    payload = {
      encargado: entradaPrincipal,
      operadores: operadoresLegados
    };
  }

  const tienePuestosExplicitos =
    payload.puestoMaquina !== undefined ||
    payload.puestoAnillador !== undefined ||
    payload.puestoEstabilizador !== undefined;

  const listaOps = Array.isArray(payload.operadores)
    ? payload.operadores.map((op) => (op ? String(op).trim() : '')).filter(Boolean)
    : [];

  const puestoMaquina = Turno.normalizarObjetoPuesto(
    tienePuestosExplicitos ? payload.puestoMaquina : payload.encargado,
    TARIFA_MAQUINA
  );
  const puestoAnillador = Turno.normalizarObjetoPuesto(
    tienePuestosExplicitos ? payload.puestoAnillador : listaOps[0] || null,
    TARIFA_ESTABILIZADA
  );
  const puestoEstabilizador = Turno.normalizarObjetoPuesto(
    tienePuestosExplicitos ? payload.puestoEstabilizador : listaOps[1] || null,
    TARIFA_ESTABILIZADA
  );

  const definicionPuestos = [
    { etiqueta: 'Máquina (Encargado)', datos: puestoMaquina },
    { etiqueta: 'Anillador', datos: puestoAnillador },
    { etiqueta: 'Estabilizador', datos: puestoEstabilizador }
  ];

  for (const item of definicionPuestos) {
    if (item.datos.trabajador && !NOMINA_TRABAJADORES.includes(item.datos.trabajador)) {
      return {
        valido: false,
        mensaje: `El trabajador "${item.datos.trabajador}" en el puesto de ${item.etiqueta} no pertenece a la nómina autorizada (${NOMINA_TRABAJADORES.join(', ')}).`
      };
    }
    if (item.datos.asistio && !item.datos.trabajador) {
      return {
        valido: false,
        mensaje: `El puesto de ${item.etiqueta} marca asistencia pero no tiene un trabajador asignado.`
      };
    }
  }

  const presentes = definicionPuestos
    .filter((item) => item.datos.asistio && item.datos.trabajador)
    .map((item) => item.datos.trabajador);

  if (presentes.length === 0) {
    return {
      valido: false,
      mensaje:
        'Debe seleccionar al menos un trabajador presente en alguno de los 3 puestos (Máquina, Anillador o Estabilizador) para abrir el turno.'
    };
  }

  if (new Set(presentes).size !== presentes.length) {
    return {
      valido: false,
      mensaje:
        'Una misma persona no puede ocupar más de un puesto simultáneamente en el mismo turno.'
    };
  }

  const encargadoSincronizado =
    puestoMaquina.asistio && puestoMaquina.trabajador ? puestoMaquina.trabajador : null;
  const operadoresSincronizados = [
    puestoAnillador.asistio && puestoAnillador.trabajador ? puestoAnillador.trabajador : null,
    puestoEstabilizador.asistio && puestoEstabilizador.trabajador
      ? puestoEstabilizador.trabajador
      : null
  ].filter(Boolean);

  return {
    valido: true,
    puestoMaquina,
    puestoAnillador,
    puestoEstabilizador,
    encargado: encargadoSincronizado,
    operadores: operadoresSincronizados
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
 * Asegura que un objeto de turno contenga siempre los 3 puestos normalizados
 * incluso si proviene de un registro histórico legado en MongoDB.
 */
const asegurarPuestosEnObjetoTurno = (objetoTurno) => {
  if (!objetoTurno) return objetoTurno;
  const opsLegados = Array.isArray(objetoTurno.operadores) ? objetoTurno.operadores : [];

  const tienePuestos =
    (objetoTurno.puestoMaquina &&
      (objetoTurno.puestoMaquina.trabajador || objetoTurno.puestoMaquina.asistio)) ||
    (objetoTurno.puestoAnillador &&
      (objetoTurno.puestoAnillador.trabajador || objetoTurno.puestoAnillador.asistio)) ||
    (objetoTurno.puestoEstabilizador &&
      (objetoTurno.puestoEstabilizador.trabajador || objetoTurno.puestoEstabilizador.asistio));

  if (!tienePuestos && (objetoTurno.encargado || opsLegados.length > 0)) {
    objetoTurno.puestoMaquina = Turno.normalizarObjetoPuesto(
      objetoTurno.encargado,
      TARIFA_MAQUINA
    );
    objetoTurno.puestoAnillador = Turno.normalizarObjetoPuesto(
      opsLegados[0] || null,
      TARIFA_ESTABILIZADA
    );
    objetoTurno.puestoEstabilizador = Turno.normalizarObjetoPuesto(
      opsLegados[1] || null,
      TARIFA_ESTABILIZADA
    );
  } else {
    objetoTurno.puestoMaquina = Turno.normalizarObjetoPuesto(
      objetoTurno.puestoMaquina,
      TARIFA_MAQUINA
    );
    objetoTurno.puestoAnillador = Turno.normalizarObjetoPuesto(
      objetoTurno.puestoAnillador,
      TARIFA_ESTABILIZADA
    );
    objetoTurno.puestoEstabilizador = Turno.normalizarObjetoPuesto(
      objetoTurno.puestoEstabilizador,
      TARIFA_ESTABILIZADA
    );
  }

  return objetoTurno;
};

/**
 * Oculta estrictamente el objeto de liquidación financiera en todas las respuestas
 * públicas dirigidas a los operadores de planta por confidencialidad.
 */
const ocultarLiquidacionParaOperador = (docTurno) => {
  if (!docTurno) return null;
  const objeto = docTurno.toObject ? docTurno.toObject() : { ...docTurno };
  delete objeto.liquidacion;
  return asegurarPuestosEnObjetoTurno(objeto);
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
    const {
      tipoTurno,
      puestoMaquina,
      puestoAnillador,
      puestoEstabilizador,
      encargado,
      operadores,
      tokenDispositivo
    } = req.body;

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

    const validacionPersonal = normalizarYValidarPersonal({
      puestoMaquina,
      puestoAnillador,
      puestoEstabilizador,
      encargado,
      operadores
    });
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
      puestoMaquina: validacionPersonal.puestoMaquina,
      puestoAnillador: validacionPersonal.puestoAnillador,
      puestoEstabilizador: validacionPersonal.puestoEstabilizador,
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

    const responsableEquipo = obtenerDescripcionEquipoTurno(nuevoTurno);

    return res.status(201).json({
      exito: true,
      mensaje: `${tipoTurno} iniciado a las ${horaApertura} (${responsableEquipo}).`,
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
    const {
      tipoTurno,
      puestoMaquina,
      puestoAnillador,
      puestoEstabilizador,
      encargado,
      operadores
    } = req.body;

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

    const validacionPersonal = normalizarYValidarPersonal({
      puestoMaquina: puestoMaquina !== undefined ? puestoMaquina : turno.puestoMaquina,
      puestoAnillador: puestoAnillador !== undefined ? puestoAnillador : turno.puestoAnillador,
      puestoEstabilizador:
        puestoEstabilizador !== undefined ? puestoEstabilizador : turno.puestoEstabilizador,
      encargado: encargado !== undefined ? encargado : turno.encargado,
      operadores: operadores !== undefined ? operadores : turno.operadores
    });
    if (!validacionPersonal.valido) {
      return res.status(400).json({
        exito: false,
        mensaje: validacionPersonal.mensaje
      });
    }

    turno.puestoMaquina = validacionPersonal.puestoMaquina;
    turno.puestoAnillador = validacionPersonal.puestoAnillador;
    turno.puestoEstabilizador = validacionPersonal.puestoEstabilizador;
    turno.encargado = validacionPersonal.encargado;
    turno.operadores = validacionPersonal.operadores;

    await turno.save();

    return res.status(200).json({
      exito: true,
      mensaje: 'Datos de los puestos y del turno actualizados correctamente.',
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

    turno.contadorMaquina = contadorFinal;
    turno.totalEstabilizadas = sumaEstabilizadas;
    turno.diferencia = contadorFinal - sumaEstabilizadas;
    turno.fechaCierre = ahora;
    turno.horaCierre = horaCierre;
    turno.estado = 'Cerrado';
    turno.liquidacion = calcularLiquidacionTurno(turno);

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
      puestoMaquina,
      puestoAnillador,
      puestoEstabilizador,
      encargado,
      operadores,
      registrosParciales,
      contadorMaquina
    } = req.body;

    const validacionPersonal = normalizarYValidarPersonal({
      puestoMaquina,
      puestoAnillador,
      puestoEstabilizador,
      encargado,
      operadores
    });
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
      puestoMaquina: validacionPersonal.puestoMaquina,
      puestoAnillador: validacionPersonal.puestoAnillador,
      puestoEstabilizador: validacionPersonal.puestoEstabilizador,
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
      puestoMaquina: validacionPersonal.puestoMaquina,
      puestoAnillador: validacionPersonal.puestoAnillador,
      puestoEstabilizador: validacionPersonal.puestoEstabilizador,
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
      return calcularLiquidacionTurno(t);
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
      const turnoBase = docTurno.toObject ? docTurno.toObject() : docTurno;
      const turno = asegurarPuestosEnObjetoTurno(turnoBase);
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
