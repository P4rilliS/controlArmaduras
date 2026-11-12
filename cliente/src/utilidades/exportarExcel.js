/**
 * Utilidad para el manejo seguro de fechas locales, cálculo de horas trabajadas,
 * normalización de los 3 puestos de línea (Máquina, Anillador, Estabilizador),
 * liquidación de nómina por producción ($0.35 máquina / $0.30 estabilizado)
 * y exportación del resumen y detalle de turnos a un archivo CSV compatible con Excel.
 */

export const TARIFA_MAQUINA_USD = 0.35;
export const TARIFA_ESTABILIZADA_USD = 0.30;

const VALORES_INASISTENCIA_CLIENTE = new Set([
  '',
  'null',
  'undefined',
  'no vino',
  'falta',
  'sin asignar',
  'ninguno',
  '[-- no vino / sin asignar --]'
]);

const normalizarPuestoIndividualCliente = (puestoRaw, tarifaPorDefecto) => {
  if (!puestoRaw || typeof puestoRaw !== 'object') {
    const nombreLimpio = typeof puestoRaw === 'string' ? puestoRaw.trim() : '';
    const esAusente =
      !nombreLimpio || VALORES_INASISTENCIA_CLIENTE.has(nombreLimpio.toLowerCase());
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
  const esNombreAusente =
    !nombreLimpio || VALORES_INASISTENCIA_CLIENTE.has(nombreLimpio.toLowerCase());
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
 * Extrae y normaliza los 3 puestos operativos del turno (`puestoMaquina`, `puestoAnillador`, `puestoEstabilizador`),
 * manteniendo compatibilidad hacia atrás con registros históricos que solo tengan `encargado` y `operadores`.
 */
export const obtenerPuestosNormalizadosTurno = (turno) => {
  if (!turno) {
    return {
      puestoMaquina: { trabajador: null, asistio: false, tarifa: TARIFA_MAQUINA_USD },
      puestoAnillador: { trabajador: null, asistio: false, tarifa: TARIFA_ESTABILIZADA_USD },
      puestoEstabilizador: { trabajador: null, asistio: false, tarifa: TARIFA_ESTABILIZADA_USD }
    };
  }

  const opsLegados = Array.isArray(turno.operadores) ? turno.operadores.filter(Boolean) : [];
  const tienePuestosExplicitos =
    (turno.puestoMaquina &&
      (turno.puestoMaquina.trabajador || turno.puestoMaquina.asistio)) ||
    (turno.puestoAnillador &&
      (turno.puestoAnillador.trabajador || turno.puestoAnillador.asistio)) ||
    (turno.puestoEstabilizador &&
      (turno.puestoEstabilizador.trabajador || turno.puestoEstabilizador.asistio));

  if (!tienePuestosExplicitos && (turno.encargado || opsLegados.length > 0)) {
    return {
      puestoMaquina: normalizarPuestoIndividualCliente(turno.encargado, TARIFA_MAQUINA_USD),
      puestoAnillador: normalizarPuestoIndividualCliente(
        opsLegados[0] || null,
        TARIFA_ESTABILIZADA_USD
      ),
      puestoEstabilizador: normalizarPuestoIndividualCliente(
        opsLegados[1] || null,
        TARIFA_ESTABILIZADA_USD
      )
    };
  }

  return {
    puestoMaquina: normalizarPuestoIndividualCliente(turno.puestoMaquina, TARIFA_MAQUINA_USD),
    puestoAnillador: normalizarPuestoIndividualCliente(
      turno.puestoAnillador,
      TARIFA_ESTABILIZADA_USD
    ),
    puestoEstabilizador: normalizarPuestoIndividualCliente(
      turno.puestoEstabilizador,
      TARIFA_ESTABILIZADA_USD
    )
  };
};

/**
 * Devuelve un resumen legible de los trabajadores presentes en el turno.
 */
export const obtenerResumenEquipoTurno = (turno) => {
  if (!turno) return 'Sin personal asignado';
  const { puestoMaquina, puestoAnillador, puestoEstabilizador } =
    obtenerPuestosNormalizadosTurno(turno);

  const presentes = [];
  if (puestoMaquina.asistio && puestoMaquina.trabajador) {
    presentes.push(`${puestoMaquina.trabajador} (Máquina)`);
  }
  if (puestoAnillador.asistio && puestoAnillador.trabajador) {
    presentes.push(`${puestoAnillador.trabajador} (Anillador)`);
  }
  if (puestoEstabilizador.asistio && puestoEstabilizador.trabajador) {
    presentes.push(`${puestoEstabilizador.trabajador} (Estabilizador)`);
  }

  return presentes.length > 0 ? presentes.join(' · ') : 'Sin personal presente';
};

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
 * Calcula o normaliza la liquidación de pago por producción del turno según la asistencia real:
 * - Si un puesto tuvo inasistencia (`!asistio` o `!trabajador`): devenga estrictamente $0.00 y no se incluye en pagos activos.
 * - Puesto Máquina presente: devenga (contadorMaquina * 0.35). Si trabajó completamente solo
 *   (sin anillador ni estabilizador presentes), suma también (totalEstabilizadas * 0.30).
 * - Puesto Anillador presente: devenga (totalEstabilizadas * 0.30).
 * - Puesto Estabilizador presente: devenga (totalEstabilizadas * 0.30).
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

  const tarifaMaq = TARIFA_MAQUINA_USD;
  const tarifaEst = TARIFA_ESTABILIZADA_USD;

  const { puestoMaquina, puestoAnillador, puestoEstabilizador } =
    obtenerPuestosNormalizadosTurno(turno);

  const maquinaPresente = Boolean(puestoMaquina.asistio && puestoMaquina.trabajador);
  const anilladorPresente = Boolean(puestoAnillador.asistio && puestoAnillador.trabajador);
  const estabilizadorPresente = Boolean(
    puestoEstabilizador.asistio && puestoEstabilizador.trabajador
  );

  const pagoMaquinaBase = Number((cantidadMaquina * tarifaMaq).toFixed(2));
  const pagoEstabilizadoBase = Number((cantidadEstabilizadas * tarifaEst).toFixed(2));

  const pagosPersonal = [];

  // 1. Puesto Máquina (Encargado)
  if (maquinaPresente) {
    const trabajaCompletamenteSolo = !anilladorPresente && !estabilizadorPresente;
    if (trabajaCompletamenteSolo) {
      const montoSolo = Number((pagoMaquinaBase + pagoEstabilizadoBase).toFixed(2));
      pagosPersonal.push({
        nombre: puestoMaquina.trabajador,
        puesto: 'Máquina',
        rol: 'Máquina (Encargado)',
        asistio: true,
        concepto: 'Máquina + Estabilizado',
        detalleBase: `${cantidadMaquina} máq. ($${pagoMaquinaBase.toFixed(2)}) + ${cantidadEstabilizadas} est. ($${pagoEstabilizadoBase.toFixed(2)})`,
        montoPagar: montoSolo
      });
    } else {
      pagosPersonal.push({
        nombre: puestoMaquina.trabajador,
        puesto: 'Máquina',
        rol: 'Máquina (Encargado)',
        asistio: true,
        concepto: 'Máquina',
        detalleBase: `${cantidadMaquina} armaduras × $${tarifaMaq.toFixed(2)}`,
        montoPagar: pagoMaquinaBase
      });
    }
  }

  // 2. Puesto Anillador
  if (anilladorPresente) {
    pagosPersonal.push({
      nombre: puestoAnillador.trabajador,
      puesto: 'Anillador',
      rol: 'Anillador',
      asistio: true,
      concepto: 'Estabilizado',
      detalleBase: `${cantidadEstabilizadas} armaduras × $${tarifaEst.toFixed(2)}`,
      montoPagar: pagoEstabilizadoBase
    });
  }

  // 3. Puesto Estabilizador
  if (estabilizadorPresente) {
    pagosPersonal.push({
      nombre: puestoEstabilizador.trabajador,
      puesto: 'Estabilizador',
      rol: 'Estabilizador',
      asistio: true,
      concepto: 'Estabilizado',
      detalleBase: `${cantidadEstabilizadas} armaduras × $${tarifaEst.toFixed(2)}`,
      montoPagar: pagoEstabilizadoBase
    });
  }

  const totalNominaTurno = Number(
    pagosPersonal
      .filter((p) => p.asistio !== false)
      .reduce((acc, p) => acc + (Number(p.montoPagar) || 0), 0)
      .toFixed(2)
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
    'Puesto Máquina (Encargado)',
    'Puesto Anillador',
    'Puesto Estabilizador',
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
    const { puestoMaquina, puestoAnillador, puestoEstabilizador } =
      obtenerPuestosNormalizadosTurno(turno);

    const textoMaquina =
      puestoMaquina.asistio && puestoMaquina.trabajador
        ? puestoMaquina.trabajador
        : 'Falta / Sin asignar';
    const textoAnillador =
      puestoAnillador.asistio && puestoAnillador.trabajador
        ? puestoAnillador.trabajador
        : 'Falta / Sin asignar';
    const textoEstabilizador =
      puestoEstabilizador.asistio && puestoEstabilizador.trabajador
        ? puestoEstabilizador.trabajador
        : 'Falta / Sin asignar';

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
      textoMaquina,
      textoAnillador,
      textoEstabilizador,
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
    'Equipo Presente',
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
    const resumenEquipo = obtenerResumenEquipoTurno(turno);

    if (parciales.length === 0) {
      filasDetalle.push(
        [
          fechaFormateada,
          turno.tipoTurno,
          resumenEquipo,
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
            resumenEquipo,
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
