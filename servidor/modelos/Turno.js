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
 * Operado por 1 Encargado obligatorio y de 0 a 2 Acompañantes/Operadores opcionales.
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
    encargado: {
      type: String,
      required: [true, 'El nombre del encargado del turno es obligatorio'],
      trim: true,
      enum: {
        values: NOMINA_TRABAJADORES,
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
        },
        {
          validator: function (listaOperadores) {
            if (!Array.isArray(listaOperadores) || listaOperadores.length === 0) return true;
            const todosLosIntegrantes = [this.encargado, ...listaOperadores].filter(Boolean);
            return new Set(todosLosIntegrantes).size === todosLosIntegrantes.length;
          },
          message:
            'Una misma persona no puede repetirse como encargado y acompañante en el mismo turno'
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
      tarifaMaquina: { type: Number, default: 0.45 },
      tarifaEstabilizada: { type: Number, default: 0.30 },
      pagosPersonal: [
        {
          nombre: { type: String, trim: true },
          rol: { type: String, trim: true }, // 'Encargado' o 'Acompañante'
          concepto: { type: String, trim: true }, // 'Máquina + Estabilizado', 'Máquina', 'Estabilizado'
          montoPagar: { type: Number, default: 0 }
        }
      ],
      totalNominaTurno: { type: Number, default: 0 }
    }
  },
  {
    // marcasDeTiempo: genera automáticamente createdAt y updatedAt
    timestamps: true
  }
);

/**
 * Middleware pre-guardado que calcula automáticamente la sumatoria total de
 * armaduras estabilizadas y la diferencia/merma frente al contador de máquina.
 */
TurnoEsquema.pre('save', function (next) {
  const sumaParciales = (this.registrosParciales || []).reduce(
    (acumulado, registro) => acumulado + (Number(registro.cantidad) || 0),
    0
  );

  this.totalEstabilizadas = sumaParciales;

  if (this.estado === 'Cerrado' || (this.contadorMaquina !== undefined && this.contadorMaquina > 0)) {
    this.diferencia = (Number(this.contadorMaquina) || 0) - this.totalEstabilizadas;
  } else {
    this.diferencia = 0;
  }

  next();
});

module.exports = mongoose.model('Turno', TurnoEsquema, 'armaduras');
module.exports.NOMINA_TRABAJADORES = NOMINA_TRABAJADORES;
