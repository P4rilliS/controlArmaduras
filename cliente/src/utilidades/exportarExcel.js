/**
 * Utilidad para el manejo seguro de fechas locales, cálculo de horas trabajadas,
 * liquidación de nómina por producción ($0.45 máquina / $0.30 estabilizado)
 * y exportación del resumen y detalle de turnos a un archivo CSV compatible con Excel.
 */

export const TARIFA_MAQUINA_USD = 0.45;
export const TARIFA_ESTABILIZADA_USD = 0.30;

const escaparValorCSV = (valor) => {
  if (valor === null || valor === undefined) return '""';
  const texto = String(valor).replace(/"/g, '""');
  return `"${texto}"`;
};

/**
 * Formatea un valor numérico a moneda en dólares estadounidenses con formato $0.00.
 */
export const formatearMonedaUSD = (monto) => {
  const numero = Number(monto) || 0;
  return `$${numero.toFixed(2)}`;
};

/**
 * Calcula o normaliza la liquidación de pago por producción del turno según la dotación:
 * - Escenario A (0 acompañantes): Encargado cobra (contadorMaquina * 0.45) + (totalEstabilizadas * 0.30)
 * - Escenario B (1 acompañante): Encargado cobra (contadorMaquina * 0.45) y Acompañante 1 cobra (totalEstabilizadas * 0.30)
 * - Escenario C (2 acompañantes): Encargado cobra (contadorMaquina * 0.45), Acompañante 1 cobra (totalEstabilizadas * 0.30) y Acompañante 2 cobra (totalEstabilizadas * 0.30)
 */
export const calcularLiquidacionTurnoCliente = (turno, contadorMaquinaOverride = null) => {
  if (!turno) {
    return {
      tarifaMaquina: TARIFA_MAQUINA_USD,
      tarifaEstabilizada: TARIFA_ESTABILIZADA_USD,
      pagosPersonal: [],
      totalNominaTurno: 0
    };
  }

  const sumaParciales = (turno.registrosParciales || []).reduce(
    (acc, item) => acc + (Number(item.cantidad) || 0),
    0
  );
  const cantidadEstabilizadas =
    turno.totalEstabilizadas !== undefined && turno.totalEstabilizadas !== null
      ? Number(turno.totalEstabilizadas)
      : sumaParciales;

  const cantidadMaquina =
    contadorMaquinaOverride !== null && contadorMaquinaOverride !== undefined
      ? Number(contadorMaquinaOverride) || 0
      : Number(turno.contadorMaquina) || 0;

  const tarifaMaq = Number(turno.liquidacion?.tarifaMaquina) || TARIFA_MAQUINA_USD;
  const tarifaEst = Number(turno.liquidacion?.tarifaEstabilizada) || TARIFA_ESTABILIZADA_USD;

  // Si ya viene calculada desde la base de datos y no estamos previsualizando otro valor de máquina
  if (
    contadorMaquinaOverride === null &&
    turno.liquidacion &&
    Array.isArray(turno.liquidacion.pagosPersonal) &&
    turno.liquidacion.pagosPersonal.length > 0
  ) {
    const pagosEnriquecidos = turno.liquidacion.pagosPersonal.map((pago) => {
      let detalleBase = '';
      if (pago.concepto === 'Máquina + Estabilizado') {
        const subMaq = (cantidadMaquina * tarifaMaq).toFixed(2);
        const subEst = (cantidadEstabilizadas * tarifaEst).toFixed(2);
        detalleBase = `${cantidadMaquina} máq. ($${subMaq}) + ${cantidadEstabilizadas} est. ($${subEst})`;
      } else if (pago.concepto === 'Máquina') {
        detalleBase = `${cantidadMaquina} armaduras × $${tarifaMaq.toFixed(2)}`;
      } else {
        detalleBase = `${cantidadEstabilizadas} armaduras × $${tarifaEst.toFixed(2)}`;
      }
      return {
        ...pago,
        montoPagar: Number(Number(pago.montoPagar || 0).toFixed(2)),
        detalleBase
      };
    });

    const totalGuardado =
      turno.liquidacion.totalNominaTurno !== undefined
        ? Number(Number(turno.liquidacion.totalNominaTurno).toFixed(2))
        : Number(
            pagosEnriquecidos
              .reduce((acc, p) => acc + (Number(p.montoPagar) || 0), 0)
              .toFixed(2)
          );

    return {
      tarifaMaquina: tarifaMaq,
      tarifaEstabilizada: tarifaEst,
      pagosPersonal: pagosEnriquecidos,
      totalNominaTurno: totalGuardado
    };
  }

  const encargado = turno.encargado || 'Encargado';
  const listaAcompanantes = Array.isArray(turno.operadores)
    ? turno.operadores.map((op) => (op ? String(op).trim() : '')).filter(Boolean)
    : [];

  const pagosPersonal = [];

  if (listaAcompanantes.length === 0) {
    // Escenario A: El Encargado trabajó completamente SOLO (0 acompañantes)
    const pagoMaquina = cantidadMaquina * tarifaMaq;
    const pagoEstabilizado = cantidadEstabilizadas * tarifaEst;
    const montoEncargado = Number((pagoMaquina + pagoEstabilizado).toFixed(2));

    pagosPersonal.push({
      nombre: encargado,
      rol: 'Encargado',
      concepto: 'Máquina + Estabilizado',
      detalleBase: `${cantidadMaquina} máq. ($${pagoMaquina.toFixed(2)}) + ${cantidadEstabilizadas} est. ($${pagoEstabilizado.toFixed(2)})`,
      montoPagar: montoEncargado
    });
  } else {
    // Escenario B (1 acompañante) y Escenario C (2 acompañantes)
    const montoEncargado = Number((cantidadMaquina * tarifaMaq).toFixed(2));
    const montoAcompanante = Number((cantidadEstabilizadas * tarifaEst).toFixed(2));

    pagosPersonal.push({
      nombre: encargado,
      rol: 'Encargado',
      concepto: 'Máquina',
      detalleBase: `${cantidadMaquina} armaduras × $${tarifaMaq.toFixed(2)}`,
      montoPagar: montoEncargado
    });

    listaAcompanantes.forEach((nombreAcompanante) => {
      pagosPersonal.push({
        nombre: nombreAcompanante,
        rol: 'Acompañante',
        concepto: 'Estabilizado',
        detalleBase: `${cantidadEstabilizadas} armaduras × $${tarifaEst.toFixed(2)}`,
        montoPagar: montoAcompanante
      });
    });
  }

  const totalNominaTurno = Number(
    pagosPersonal.reduce((acc, p) => acc + (Number(p.montoPagar) || 0), 0).toFixed(2)
  );

  return {
    tarifaMaquina: tarifaMaq,
    tarifaEstabilizada: tarifaEst,
    pagosPersonal,
    totalNominaTurno
  };
};

/**
 * Convierte cualquier valor de fecha (Date, ISO o YYYY-MM-DD) a formato local YYYY-MM-DD
 * evitando desfases de un día por conversión a UTC.
 */
export const obtenerFechaLocalISO = (fechaEntrada = new Date()) => {
  if (!fechaEntrada) return '';
  if (typeof fechaEntrada === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaEntrada.trim())) {
    return fechaEntrada.trim();
  }
  const fecha = new Date(fechaEntrada);
  if (Number.isNaN(fecha.getTime())) return '';
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
};

/**
 * Formatea una fecha incluyendo el día de la semana en español con la primera letra en mayúscula
 * (ej. "Sábado, 24/10/2026") preservando el día local sin desfase UTC.
 */
export const formatearFechaConDia = (fechaStr) => {
  if (!fechaStr) return '-';
  const cadenaNormalizada =
    typeof fechaStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaStr.trim())
      ? `${fechaStr.trim()}T12:00:00`
      : fechaStr;

  const fecha = new Date(cadenaNormalizada);
  if (Number.isNaN(fecha.getTime())) return '-';
  const opciones = {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  };
  const texto = new Intl.DateTimeFormat('es-VE', opciones).format(fecha);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

/**
 * Alias de compatibilidad que devuelve siempre la fecha con el día de la semana capitalizado.
 */
export const formatearFechaLegible = formatearFechaConDia;

/**
 * Calcula el tiempo total trabajado entre la apertura y el cierre del turno.
 */
export const calcularDuracionTurno = (turno) => {
  if (!turno) return '-';
  const inicioRaw = turno.fechaApertura || turno.createdAt;
  const finRaw = turno.estado === 'Cerrado' ? turno.fechaCierre || turno.updatedAt : new Date();

  if (!inicioRaw || !finRaw) return '-';

  const inicio = new Date(inicioRaw);
  const fin = new Date(finRaw);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return '-';

  const diferenciaMs = Math.max(0, fin.getTime() - inicio.getTime());
  const totalMinutos = Math.floor(diferenciaMs / 60000);
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;

  if (horas === 0) {
    return `${minutos} min`;
  }
  return `${horas}h ${String(minutos).padStart(2, '0')}m`;
};

/**
 * Genera y descarga un archivo CSV compatible con Excel con el consolidado de los turnos
 * (incluyendo Hora Apertura, Hora Cierre, Tiempo Trabajado y Liquidación de Nómina en USD)
 * y el desglose hora por hora.
 */
export const exportarTurnosAExcelCSV = (turnos = [], etiquetaFiltro = 'resumen_dia') => {
  if (!Array.isArray(turnos) || turnos.length === 0) {
    alert('No hay registros de turnos disponibles para exportar.');
    return;
  }

  // Usamos punto y coma (;) para que Excel en español separe las columnas automáticamente
  const SEPARADOR = ';';

  const encabezadosResumen = [
    'Fecha',
    'Tipo de Turno',
    'Estado',
    'Hora Apertura',
    'Hora Cierre',
    'Tiempo Trabajado',
    'Encargado del Turno',
    'Acompañante 1',
    'Acompañante 2',
    'Cant. Entregas Parciales',
    'Total Armaduras Estabilizadas',
    'Contador de Máquina',
    'Diferencia / Merma (Máquina - Estabilizadas)',
    'Rendimiento (%)',
    'Costo Mano de Obra ($ USD)',
    'Desglose de Pagos por Trabajador'
  ];

  const filasResumen = turnos.map((turno) => {
    const fechaFormateada = formatearFechaLegible(turno.fecha);
    const estaCerrado = turno.estado === 'Cerrado';
    const horaApertura = turno.horaApertura || '-';
    const horaCierre = estaCerrado ? turno.horaCierre || '-' : 'En curso';
    const duracion = calcularDuracionTurno(turno);
    const operador2 = turno.operadores?.[0] || 'Ninguno (Trabaja solo)';
    const operador3 = turno.operadores?.[1] || '-';
    const cantParciales = turno.registrosParciales?.length || 0;
    const estabilizadas = Number(turno.totalEstabilizadas) || 0;
    const maquina = estaCerrado ? Number(turno.contadorMaquina) || 0 : 'En curso';
    const diferencia = estaCerrado ? Number(turno.diferencia) || 0 : 'Pendiente';
    const rendimiento =
      estaCerrado && Number(turno.contadorMaquina) > 0
        ? `${((estabilizadas / Number(turno.contadorMaquina)) * 100).toFixed(1)}%`
        : estaCerrado
        ? '0.0%'
        : 'En curso';

    const liquidacion = estaCerrado ? calcularLiquidacionTurnoCliente(turno) : null;
    const costoNomina = estaCerrado
      ? formatearMonedaUSD(liquidacion.totalNominaTurno)
      : 'En curso';
    const desglosePagos = estaCerrado
      ? liquidacion.pagosPersonal
          .map(
            (p) => `${p.nombre} (${p.rol} - ${p.concepto}): ${formatearMonedaUSD(p.montoPagar)}`
          )
          .join(' | ')
      : 'Pendiente de cierre';

    return [
      fechaFormateada,
      turno.tipoTurno,
      turno.estado,
      horaApertura,
      horaCierre,
      duracion,
      turno.encargado,
      operador2,
      operador3,
      cantParciales,
      estabilizadas,
      maquina,
      diferencia,
      rendimiento,
      costoNomina,
      desglosePagos
    ]
      .map(escaparValorCSV)
      .join(SEPARADOR);
  });

  // Segunda sección en el mismo archivo: Desglose hora a hora de los registros parciales
  const encabezadosDetalle = [
    'Fecha del Turno',
    'Tipo de Turno',
    'Encargado',
    'Hora Apertura Turno',
    'Hora Cierre Turno',
    'N° Entrega',
    'Hora del Reporte',
    'Armaduras Estabilizadas (Lote)',
    'Observaciones'
  ];

  const filasDetalle = [];
  turnos.forEach((turno) => {
    const fechaFormateada = formatearFechaLegible(turno.fecha);
    const parciales = turno.registrosParciales || [];
    const horaApertura = turno.horaApertura || '-';
    const horaCierre = turno.estado === 'Cerrado' ? turno.horaCierre || '-' : 'En curso';

    if (parciales.length === 0) {
      filasDetalle.push(
        [
          fechaFormateada,
          turno.tipoTurno,
          turno.encargado,
          horaApertura,
          horaCierre,
          0,
          '-',
          0,
          'Sin entregas parciales registradas'
        ]
          .map(escaparValorCSV)
          .join(SEPARADOR)
      );
    } else {
      parciales.forEach((parcial, indice) => {
        filasDetalle.push(
          [
            fechaFormateada,
            turno.tipoTurno,
            turno.encargado,
            horaApertura,
            horaCierre,
            indice + 1,
            parcial.hora,
            parcial.cantidad,
            parcial.observacion || 'Sin observaciones'
          ]
            .map(escaparValorCSV)
            .join(SEPARADOR)
        );
      });
    }
  });

  const contenidoCSV = [
    '"REPORTE CONSOLIDADO DE PRODUCCIÓN, INVENTARIO Y LIQUIDACIÓN DE ARMADURAS"',
    `"Fecha de generación:";"${new Date().toLocaleString('es-ES')}"`,
    '',
    '"1. RESUMEN CONSOLIDADO Y LIQUIDACIÓN DE NÓMINA POR TURNO"',
    encabezadosResumen.map(escaparValorCSV).join(SEPARADOR),
    ...filasResumen,
    '',
    '"2. DETALLE HORA A HORA DE ENTREGAS PARCIALES"',
    encabezadosDetalle.map(escaparValorCSV).join(SEPARADOR),
    ...filasDetalle
  ].join('\r\n');

  // Agregar BOM (\uFEFF) para que Excel reconozca tildes y eñes correctamente
  const blob = new Blob(['\uFEFF' + contenidoCSV], {
    type: 'text/csv;charset=utf-8;'
  });

  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  const fechaArchivo = obtenerFechaLocalISO(new Date());

  enlace.href = url;
  enlace.setAttribute('download', `reporte_armaduras_${etiquetaFiltro}_${fechaArchivo}.csv`);
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
};
