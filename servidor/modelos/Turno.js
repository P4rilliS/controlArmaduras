const mongoose = require('mongoose');

/**
 * Nómina cerrada y oficial de trabajadores autorizados en planta.
 */
const NOMINA_TRABAJADORES = [
  'William',
  'Leonardo',
  'Antoni',
  'Yervin',
  'Antonio',
  'Wilkerman'
];

/**
 * Tarifas oficiales de liquidación de mano de obra ($ USD por unidad).
 */
const TARIFA_MAQUINA = 0.35;
const TARIFA_ESTABILIZADA = 0.30;

/**
 * Valores considerados como marcador de inasistencia o puesto sin asignar.
 */
const VALORES_INASISTENCIA = new Set([
  '',
  'null',
  'undefined',
  'no vino',
  'falta',
  'sin asignar',
  'ninguno',
  '[-- no vino / sin asignar --]'
]);

/**
 * Normaliza la estructura de un puesto operativo ({ trabajador, asistio, tarifa }).
 */
const normalizarObjetoPuesto = (puestoRaw, tarifaPorDefecto) => {
  if (!puestoRaw || typeof puestoRaw !== 'object') {
    const nombreLimpio = typeof puestoRaw === 'string' ? puestoRaw.trim() : '';
    const esAusente = !nombreLimpio || VALORES_INASISTENCIA.has(nombreLimpio.toLowerCase());
    return {
      trabajador: esAusente ? null : nombreLimpio,
      asistio: !esAusente,
      tarifa: tarifaPorDefecto
    };
  }

  const nombreLimpio =
    puestoRaw.trabajador !== null && puestoRaw.trabajador !== undefined
      ? String(puestoRaw.trabajador).trim()
      : '';
  const esNombreAusente = !nombreLimpio || VALORES_INASISTENCIA.has(nombreLimpio.toLowerCase());
  const trabajadorNormalizado = esNombreAusente ? null : nombreLimpio;

  const asistioNormalizado =
    trabajadorNormalizado === null
      ? false
      : puestoRaw.asistio !== undefined
      ? Boolean(puestoRaw.asistio)
      : true;

  return {
    trabajador: trabajadorNormalizado,
    asistio: asistioNormalizado,
    tarifa:
      typeof puestoRaw.tarifa === 'number' && !Number.isNaN(puestoRaw.tarifa)
        ? puestoRaw.tarifa
        : tarifaPorDefecto
  };
};

/**
 * Calcula el desglose de liquidación de mano de obra del turno según la regla estricta:
 * - Si un trabajador NO asistió a su puesto: montoPagar = $0.00 y no se le computa el turno.
 * - Puesto Máquina presente: devenga (contadorMaquina * 0.35). Si trabajó completamente solo
 *   (sin anillador ni estabilizador presentes), se le suma también (totalEstabilizadas * 0.30).
 * - Puesto Anillador presente: devenga (totalEstabilizadas * 0.30).
 * - Puesto Estabilizador presente: devenga (totalEstabilizadas * 0.30).
 * - totalNominaTurno es la suma exacta únicamente de los puestos con asistencia confirmada.
 */
const calcularLiquidacionDesdePuestos = (docTurno) => {
  const cantMaquina = Math.max(0, Number(docTurno.contadorMaquina) || 0);
  const cantEstabilizadas = Math.max(0, Number(docTurno.totalEstabilizadas) || 0);

  const pMaquina = normalizarObjetoPuesto(
    docTurno.puestoMaquina || docTurno.encargado,
    TARIFA_MAQUINA
  );
  const opsLegados = Array.isArray(docTurno.operadores) ? docTurno.operadores : [];
  const pAnillador = normalizarObjetoPuesto(
    docTurno.puestoAnillador &&
      (docTurno.puestoAnillador.trabajador || docTurno.puestoAnillador.asistio !== undefined)
      ? docTurno.puestoAnillador
      : opsLegados[0] || null,
    TARIFA_ESTABILIZADA
  );
  const pEstabilizador = normalizarObjetoPuesto(
    docTurno.puestoEstabilizador &&
      (docTurno.puestoEstabilizador.trabajador ||
        docTurno.puestoEstabilizador.asistio !== undefined)
      ? docTurno.puestoEstabilizador
      : opsLegados[1] || null,
    TARIFA_ESTABILIZADA
  );

  const maquinaPresente = Boolean(pMaquina.asistio && pMaquina.trabajador);
  const anilladorPresente = Boolean(pAnillador.asistio && pAnillador.trabajador);
  const estabilizadorPresente = Boolean(pEstabilizador.asistio && pEstabilizador.trabajador);

  const pagoMaquinaBase = Number((cantMaquina * TARIFA_MAQUINA).toFixed(2));
  const pagoEstabilizadoBase = Number((cantEstabilizadas * TARIFA_ESTABILIZADA).toFixed(2));

  const pagosPersonal = [];

  // 1. Puesto Máquina (Encargado)
  if (maquinaPresente) {
    const trabajaCompletamenteSolo = !anilladorPresente && !estabilizadorPresente;
    if (trabajaCompletamenteSolo) {
      const montoSolo = Number((pagoMaquinaBase + pagoEstabilizadoBase).toFixed(2));
      pagosPersonal.push({
        nombre: pMaquina.trabajador,
        puesto: 'Máquina',
        rol: 'Máquina (Encargado)',
        asistio: true,
        concepto: 'Máquina + Estabilizado',
        montoPagar: montoSolo
      });
    } else {
      pagosPersonal.push({
        nombre: pMaquina.trabajador,
        puesto: 'Máquina',
        rol: 'Máquina (Encargado)',
        asistio: true,
        concepto: 'Máquina',
        montoPagar: pagoMaquinaBase
      });
    }
  } else if (pMaquina.trabajador) {
    // Si se registró nombre con estatus explícito de inasistencia: $0.00
    pagosPersonal.push({
      nombre: pMaquina.trabajador,
      puesto: 'Máquina',
      rol: 'Máquina (Encargado)',
      asistio: false,
      concepto: 'Inasistencia / Falta ($0.00)',
      montoPagar: 0
    });
  }

  // 2. Puesto Anillador
  if (anilladorPresente) {
    pagosPersonal.push({
      nombre: pAnillador.trabajador,
      puesto: 'Anillador',
      rol: 'Anillador',
      asistio: true,
      concepto: 'Estabilizado',
      montoPagar: pagoEstabilizadoBase
    });
  } else if (pAnillador.trabajador) {
    pagosPersonal.push({
      nombre: pAnillador.trabajador,
      puesto: 'Anillador',
      rol: 'Anillador',
      asistio: false,
      concepto: 'Inasistencia / Falta ($0.00)',
      montoPagar: 0
    });
  }

  // 3. Puesto Estabilizador
  if (estabilizadorPresente) {
    pagosPersonal.push({
      nombre: pEstabilizador.trabajador,
      puesto: 'Estabilizador',
      rol: 'Estabilizador',
      asistio: true,
      concepto: 'Estabilizado',
      montoPagar: pagoEstabilizadoBase
    });
  } else if (pEstabilizador.trabajador) {
    pagosPersonal.push({
      nombre: pEstabilizador.trabajador,
      puesto: 'Estabilizador',
      rol: 'Estabilizador',
      asistio: false,
      concepto: 'Inasistencia / Falta ($0.00)',
      montoPagar: 0
    });
  }

  const totalNominaTurno = Number(
    pagosPersonal
      .filter((p) => p.asistio !== false)
      .reduce((acc, p) => acc + (Number(p.montoPagar) || 0), 0)
      .toFixed(2)
  );

  return {
    tarifaMaquina: TARIFA_MAQUINA,
    tarifaEstabilizada: TARIFA_ESTABILIZADA,
    pagosPersonal,
    totalNominaTurno
  };
};

/**
 * Subesquema para cada puesto de la línea operativa (Máquina, Anillador, Estabilizador).
 */
const crearEsquemaPuesto = (tarifaPorDefecto) =>
  new mongoose.Schema(
    {
      trabajador: {
        type: String,
        default: null,
        trim: true,
        validate: {
          validator: function (valor) {
            if (valor === null || valor === undefined || valor === '') return true;
            return NOMINA_TRABAJADORES.includes(valor);
          },
          message:
            'El trabajador asignado al puesto debe pertenecer a la nómina autorizada (William, Leonardo, Antoni, Yervin, Antonio, Wilkerman)'
        }
      },
      asistio: {
        type: Boolean,
        default: false
      },
      tarifa: {
        type: Number,
        default: tarifaPorDefecto,
        min: 0
      }
    },
    { _id: false }
  );

/**
 * Subesquema para cada entrega o lote parcial de armaduras estabilizadas
 * registrado a lo largo de la jornada.
 */
const esquemaRegistroParcial = new mongoose.Schema(
  {
    cantidad: {
      type: Number,
      required: [true, 'La cantidad de armaduras estabilizadas es obligatoria'],
      min: [1, 'La cantidad de armaduras debe ser al menos 1']
    },
    hora: {
      type: String,
      required: [true, 'La hora exacta del reporte es obligatoria'],
      trim: true
    },
    observacion: {
      type: String,
      default: '',
      trim: true,
      maxlength: [300, 'La observación no puede exceder los 300 caracteres']
    }
  },
  {
    _id: true
  }
);

/**
 * Esquema principal de Turno para el control de producción e inventario de armaduras.
 * Soporta los 3 puestos operativos independientes (Máquina, Anillador y Estabilizador)
 * permitiendo la apertura y cierre aun cuando 1 o 2 puestos tengan inasistencia.
 */
const TurnoEsquema = new mongoose.Schema(
  {
    fecha: {
      type: Date,
      required: [true, 'La fecha del turno es obligatoria'],
      default: Date.now
    },
    fechaApertura: {
      type: Date,
      default: Date.now
    },
    horaApertura: {
      type: String,
      default: '',
      trim: true
    },
    fechaCierre: {
      type: Date,
      default: null
    },
    horaCierre: {
      type: String,
      default: '',
      trim: true
    },
    tipoTurno: {
      type: String,
      required: [true, 'El selector de turno es obligatorio'],
      enum: {
        values: ['Primer Turno', 'Segundo Turno'],
        message: 'El tipo de turno debe ser "Primer Turno" o "Segundo Turno"'
      }
    },
    // Asignación explícita de los 3 puestos esenciales de la línea operativa
    puestoMaquina: {
      type: crearEsquemaPuesto(TARIFA_MAQUINA),
      default: () => ({ trabajador: null, asistio: false, tarifa: TARIFA_MAQUINA })
    },
    puestoAnillador: {
      type: crearEsquemaPuesto(TARIFA_ESTABILIZADA),
      default: () => ({ trabajador: null, asistio: false, tarifa: TARIFA_ESTABILIZADA })
    },
    puestoEstabilizador: {
      type: crearEsquemaPuesto(TARIFA_ESTABILIZADA),
      default: () => ({ trabajador: null, asistio: false, tarifa: TARIFA_ESTABILIZADA })
    },
    // Campos legados conservados para compatibilidad hacia atrás con consultas e historial previo
    encargado: {
      type: String,
      default: null,
      trim: true,
      validate: {
        validator: function (valor) {
          if (valor === null || valor === undefined || valor === '') return true;
          return NOMINA_TRABAJADORES.includes(valor);
        },
        message:
          'El encargado debe ser un trabajador válido de la nómina (William, Antoni, Yervin, Antonio, Wilkerman, Leonardo)'
      }
    },
    operadores: {
      type: [
        {
          type: String,
          trim: true,
          enum: {
            values: NOMINA_TRABAJADORES,
            message:
              'Cada acompañante debe pertenecer a la nómina autorizada (William, Antoni, Yervin, Antonio, Wilkerman, Leonardo)'
          }
        }
      ],
      default: [],
      validate: [
        {
          validator: function (listaOperadores) {
            if (!Array.isArray(listaOperadores)) return false;
            return listaOperadores.length <= 2;
          },
          message: 'Solo se permiten hasta un máximo de 2 acompañantes por turno'
        }
      ]
    },
    registrosParciales: {
      type: [esquemaRegistroParcial],
      default: []
    },
    totalEstabilizadas: {
      type: Number,
      default: 0,
      min: 0
    },
    contadorMaquina: {
      type: Number,
      default: 0,
      min: [0, 'El contador de máquina no puede ser un valor negativo']
    },
    diferencia: {
      type: Number,
      default: 0
    },
    estado: {
      type: String,
      enum: {
        values: ['En Progreso', 'Cerrado'],
        message: 'El estado del turno debe ser "En Progreso" o "Cerrado"'
      },
      default: 'En Progreso'
    },
    tokenDispositivo: {
      type: String,
      default: '',
      trim: true
    },
    liquidacion: {
      tarifaMaquina: { type: Number, default: TARIFA_MAQUINA },
      tarifaEstabilizada: { type: Number, default: TARIFA_ESTABILIZADA },
      pagosPersonal: [
        {
          nombre: { type: String, trim: true },
          puesto: { type: String, trim: true }, // 'Máquina', 'Anillador', 'Estabilizador'
          rol: { type: String, trim: true },
          asistio: { type: Boolean, default: true },
          concepto: { type: String, trim: true }, // 'Máquina + Estabilizado', 'Máquina', 'Estabilizado', 'Inasistencia / Falta ($0.00)'
          montoPagar: { type: Number, default: 0 }
        }
      ],
      totalNominaTurno: { type: Number, default: 0 }
    }
  },
  {
    timestamps: true
  }
);

/**
 * Middleware pre-validación:
 * 1. Sincroniza bidireccionalmente los 3 puestos (`puestoMaquina`, `puestoAnillador`, `puestoEstabilizador`)
 *    con los campos legados (`encargado`, `operadores`).
 * 2. Verifica que exista AL MENOS UN trabajador presente (`asistio: true`).
 * 3. Verifica unicidad (una misma persona presente no puede ocupar dos puestos simultáneamente).
 */
TurnoEsquema.pre('validate', function (next) {
  const tienePuestosExplicitos =
    (this.puestoMaquina &&
      (this.puestoMaquina.trabajador !== null || this.puestoMaquina.asistio === true)) ||
    (this.puestoAnillador &&
      (this.puestoAnillador.trabajador !== null || this.puestoAnillador.asistio === true)) ||
    (this.puestoEstabilizador &&
      (this.puestoEstabilizador.trabajador !== null || this.puestoEstabilizador.asistio === true));

  const opsLegados = Array.isArray(this.operadores) ? this.operadores.filter(Boolean) : [];

  if (!tienePuestosExplicitos && (this.encargado || opsLegados.length > 0)) {
    this.puestoMaquina = normalizarObjetoPuesto(this.encargado, TARIFA_MAQUINA);
    this.puestoAnillador = normalizarObjetoPuesto(opsLegados[0] || null, TARIFA_ESTABILIZADA);
    this.puestoEstabilizador = normalizarObjetoPuesto(opsLegados[1] || null, TARIFA_ESTABILIZADA);
  } else {
    this.puestoMaquina = normalizarObjetoPuesto(this.puestoMaquina, TARIFA_MAQUINA);
    this.puestoAnillador = normalizarObjetoPuesto(this.puestoAnillador, TARIFA_ESTABILIZADA);
    this.puestoEstabilizador = normalizarObjetoPuesto(
      this.puestoEstabilizador,
      TARIFA_ESTABILIZADA
    );
  }

  // Sincronizar campos legados para compatibilidad hacia atrás
  this.encargado =
    this.puestoMaquina.asistio && this.puestoMaquina.trabajador
      ? this.puestoMaquina.trabajador
      : null;

  const acompanantesPresentes = [];
  if (this.puestoAnillador.asistio && this.puestoAnillador.trabajador) {
    acompanantesPresentes.push(this.puestoAnillador.trabajador);
  }
  if (this.puestoEstabilizador.asistio && this.puestoEstabilizador.trabajador) {
    acompanantesPresentes.push(this.puestoEstabilizador.trabajador);
  }
  this.operadores = acompanantesPresentes;

  // Validar que si un puesto marca asistio: true tenga trabajador válido
  const listaPuestos = [
    { clave: 'puestoMaquina', etiqueta: 'Máquina (Encargado)', datos: this.puestoMaquina },
    { clave: 'puestoAnillador', etiqueta: 'Anillador', datos: this.puestoAnillador },
    { clave: 'puestoEstabilizador', etiqueta: 'Estabilizador', datos: this.puestoEstabilizador }
  ];

  for (const item of listaPuestos) {
    if (item.datos.asistio && !item.datos.trabajador) {
      this.invalidate(
        item.clave,
        `El puesto de ${item.etiqueta} tiene asistencia marcada pero no tiene trabajador asignado.`
      );
    }
  }

  // Trabajadores con asistencia confirmada
  const trabajadoresPresentes = listaPuestos
    .filter((item) => item.datos.asistio && item.datos.trabajador)
    .map((item) => item.datos.trabajador);

  // Condición de apertura: al menos 1 trabajador presente
  if (trabajadoresPresentes.length === 0) {
    this.invalidate(
      'puestoMaquina',
      'Debe haber al menos un trabajador presente con asistencia confirmada para abrir el turno.'
    );
  }

  // Validación de unicidad: una misma persona presente no puede ocupar dos puestos distintos
  if (new Set(trabajadoresPresentes).size !== trabajadoresPresentes.length) {
    this.invalidate(
      'puestoMaquina',
      'Una misma persona presente no puede ocupar dos puestos distintos simultáneamente en el mismo turno.'
    );
  }

  next();
});

/**
 * Middleware pre-guardado (`pre('save')`):
 * 1. Calcula automáticamente la sumatoria física de `totalEstabilizadas`.
 * 2. Calcula al 100% la `diferencia` (merma) frente al `contadorMaquina`, sin importar inasistencias.
 * 3. Recalcula la `liquidacion` de mano de obra pagando únicamente a los puestos con asistencia confirmada.
 */
TurnoEsquema.pre('save', function (next) {
  const sumaParciales = (this.registrosParciales || []).reduce(
    (acumulado, registro) => acumulado + (Number(registro.cantidad) || 0),
    0
  );

  this.totalEstabilizadas = sumaParciales;

  if (
    this.estado === 'Cerrado' ||
    (this.contadorMaquina !== undefined && Number(this.contadorMaquina) > 0)
  ) {
    this.diferencia = (Number(this.contadorMaquina) || 0) - this.totalEstabilizadas;
  } else {
    this.diferencia = 0;
  }

  if (this.estado === 'Cerrado') {
    this.liquidacion = calcularLiquidacionDesdePuestos(this);
  }

  next();
});

const ModeloTurno = mongoose.model('Turno', TurnoEsquema, 'armaduras');
ModeloTurno.NOMINA_TRABAJADORES = NOMINA_TRABAJADORES;
ModeloTurno.TARIFA_MAQUINA = TARIFA_MAQUINA;
ModeloTurno.TARIFA_ESTABILIZADA = TARIFA_ESTABILIZADA;
ModeloTurno.normalizarObjetoPuesto = normalizarObjetoPuesto;
ModeloTurno.calcularLiquidacionDesdePuestos = calcularLiquidacionDesdePuestos;

module.exports = ModeloTurno;
