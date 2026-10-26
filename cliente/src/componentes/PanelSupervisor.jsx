import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart3,
  Download,
  Filter,
  Eye,
  ChevronDown,
  ChevronUp,
  Gauge,
  CheckCircle2,
  Clock,
  Users,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  Layers,
  DollarSign
} from 'lucide-react';
import { obtenerDatosSupervisor } from '../servicios/apiTurnos';
import {
  exportarTurnosAExcelCSV,
  formatearFechaLegible,
  obtenerFechaLocalISO,
  calcularDuracionTurno,
  calcularLiquidacionTurnoCliente,
  formatearMonedaUSD
} from '../utilidades/exportarExcel';
import { obtenerFechaHoyISO } from './FormularioRegistro';
import ResumenTotalesFiltro from './ResumenTotalesFiltro';

/**
 * Panel completo de Supervisión Mobile-First (Estadísticas, Comparativa de Turnos,
 * Sumatoria y Resumen Consolidado Reactivo, Auditoría Hora a Hora y Exportación a Excel/CSV).
 */
const PanelSupervisor = ({ claveSupervisor, turnosRespaldoLocal = [] }) => {
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [tipoTurno, setTipoTurno] = useState('Todos');
  const [estadoTurno, setEstadoTurno] = useState('Todos');
  const [cicloSeleccionado, setCicloSeleccionado] = useState('Todos los registros');

  const [todosLosTurnos, setTodosLosTurnos] = useState([]);
  const [turnoExpandidoId, setTurnoExpandidoId] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [avisoModoLocal, setAvisoModoLocal] = useState(false);

  // Cargar historial completo desde la API de MongoDB (el filtrado y sumatoria se hacen reactivamente en cliente con useMemo)
  const cargarEstadisticas = useCallback(async () => {
    setCargando(true);
    try {
      const respuesta = await obtenerDatosSupervisor(claveSupervisor, {});
      setTodosLosTurnos(respuesta.turnos || []);
      setAvisoModoLocal(false);
    } catch {
      setTodosLosTurnos(turnosRespaldoLocal || []);
      setAvisoModoLocal(true);
    } finally {
      setCargando(false);
    }
  }, [claveSupervisor, turnosRespaldoLocal]);

  useEffect(() => {
    cargarEstadisticas();
  }, [cargarEstadisticas]);

  // Arreglo de turnos filtrados reactivamente al instante según fechas, ciclo, tipo de turno y estado
  const turnosFiltrados = useMemo(() => {
    return todosLosTurnos.filter((t) => {
      if (tipoTurno !== 'Todos' && t.tipoTurno !== tipoTurno) return false;
      if (estadoTurno !== 'Todos' && t.estado !== estadoTurno) return false;
      const fechaClave = obtenerFechaLocalISO(t.fecha);
      if (fechaInicio && fechaClave < fechaInicio) return false;
      if (fechaFin && fechaClave > fechaFin) return false;
      return true;
    });
  }, [todosLosTurnos, fechaInicio, fechaFin, tipoTurno, estadoTurno]);

  // Cálculo reactivo de métricas globales y comparativa de turnos a partir de todosLosTurnos y turnosFiltrados
  const metricas = useMemo(() => {
    const hoyClave = obtenerFechaHoyISO();
    const hace7Dias = new Date();
    hace7Dias.setDate(hace7Dias.getDate() - 6);
    const semanaClave = obtenerFechaLocalISO(hace7Dias);

    let totalEstabilizadasHoy = 0;
    let totalEstabilizadasSemana = 0;
    let totalNominaHoy = 0;
    let totalNominaSemana = 0;

    todosLosTurnos.forEach((t) => {
      const f = obtenerFechaLocalISO(t.fecha);
      const cant = Number(t.totalEstabilizadas) || 0;
      const nomina =
        t.estado === 'Cerrado'
          ? Number(calcularLiquidacionTurnoCliente(t).totalNominaTurno) || 0
          : 0;
      if (f === hoyClave) {
        totalEstabilizadasHoy += cant;
        totalNominaHoy = Number((totalNominaHoy + nomina).toFixed(2));
      }
      if (f >= semanaClave && f <= hoyClave) {
        totalEstabilizadasSemana += cant;
        totalNominaSemana = Number((totalNominaSemana + nomina).toFixed(2));
      }
    });

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

    turnosFiltrados.forEach((t) => {
      const est = Number(t.totalEstabilizadas) || 0;
      const estaCerrado = t.estado === 'Cerrado';
      const maq = estaCerrado ? Number(t.contadorMaquina) || 0 : 0;
      const dif = estaCerrado ? Number(t.diferencia) || 0 : 0;
      const liq = estaCerrado ? calcularLiquidacionTurnoCliente(t) : null;
      const nomina = estaCerrado ? Number(liq.totalNominaTurno) || 0 : 0;

      totalEstabilizadasPeriodo += est;
      if (estaCerrado) {
        totalEstabilizadasCerradasPeriodo += est;
        totalMaquinaPeriodo += maq;
        diferenciaTotalPeriodo += dif;
        totalNominaPeriodo = Number((totalNominaPeriodo + nomina).toFixed(2));
      }

      const grupo =
        t.tipoTurno === 'Primer Turno'
          ? comparativaTurnos.primerTurno
          : comparativaTurnos.segundoTurno;

      grupo.cantidadTurnos += 1;
      grupo.totalEstabilizadas += est;
      if (estaCerrado) {
        grupo.estabilizadasCerradas += est;
        grupo.totalMaquina += maq;
        grupo.diferencia += dif;
        grupo.totalNomina = Number((grupo.totalNomina + nomina).toFixed(2));
      }
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

    return {
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
      cantidadTurnosPeriodo: turnosFiltrados.length,
      comparativaTurnos
    };
  }, [todosLosTurnos, turnosFiltrados]);

  // Filtros rápidos de fecha y ciclo de pago (Hoy, Semana de Corte Sáb-Vie, Últimos 7 días, Todos)
  const aplicarFiltroHoy = () => {
    const hoy = obtenerFechaHoyISO();
    setFechaInicio(hoy);
    setFechaFin(hoy);
    setCicloSeleccionado('Hoy');
  };

  const aplicarFiltroSemanaCorte = () => {
    const hoy = new Date();
    // Semana de corte de nómina: desde el sábado hasta el viernes de la semana actual
    const diasDesdeSabado = (hoy.getDay() + 1) % 7;
    const sabadoInicio = new Date(hoy);
    sabadoInicio.setDate(hoy.getDate() - diasDesdeSabado);
    const viernesFin = new Date(sabadoInicio);
    viernesFin.setDate(sabadoInicio.getDate() + 6);

    setFechaInicio(obtenerFechaLocalISO(sabadoInicio));
    setFechaFin(obtenerFechaLocalISO(viernesFin));
    setCicloSeleccionado('Semana de Corte (Sáb - Vie)');
  };

  const aplicarFiltroSemana = () => {
    const hoy = new Date();
    const hace7 = new Date();
    hace7.setDate(hoy.getDate() - 6);
    setFechaInicio(obtenerFechaLocalISO(hace7));
    setFechaFin(obtenerFechaHoyISO());
    setCicloSeleccionado('Últimos 7 días');
  };

  const limpiarFiltros = () => {
    setFechaInicio('');
    setFechaFin('');
    setTipoTurno('Todos');
    setEstadoTurno('Todos');
    setCicloSeleccionado('Todos los registros');
  };

  const alternarDetalleTurno = (idTurno) => {
    setTurnoExpandidoId((actual) => (actual === idTurno ? null : idTurno));
  };

  const primerTurnoStats = metricas?.comparativaTurnos?.primerTurno || {
    cantidadTurnos: 0,
    totalEstabilizadas: 0,
    totalMaquina: 0,
    diferencia: 0,
    rendimiento: 0,
    totalNomina: 0
  };

  const segundoTurnoStats = metricas?.comparativaTurnos?.segundoTurno || {
    cantidadTurnos: 0,
    totalEstabilizadas: 0,
    totalMaquina: 0,
    diferencia: 0,
    rendimiento: 0,
    totalNomina: 0
  };

  return (
    <div className="space-y-5 w-full">
      {/* Encabezado de Supervisión y Exportación a Excel */}
      <div className="bg-slate-900 text-white p-4 sm:p-6 rounded-2xl shadow-lg border-l-8 border-amber-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-extrabold uppercase tracking-widest text-amber-400">
            Auditoría y Control de Planta
          </span>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight mt-0.5">
            Panel de Supervisión de Armaduras
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1">
            Métricas consolidadas por día/semana, comparativa entre turnos y desglose hora por hora.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={cargarEstadisticas}
            disabled={cargando}
            className="min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm sm:text-base border border-slate-700 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 shrink-0 ${cargando ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>

          <button
            type="button"
            onClick={() => exportarTurnosAExcelCSV(turnosFiltrados, fechaInicio || 'consolidado')}
            className="min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm sm:text-base shadow-lg shadow-emerald-600/25 transition cursor-pointer"
          >
            <Download className="w-5 h-5 shrink-0" />
            <span>Exportar a Excel (CSV)</span>
          </button>
        </div>
      </div>

      {avisoModoLocal && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-xl text-amber-900 text-sm font-medium">
          Mostrando registros almacenados en el respaldo local del dispositivo (sin conexión activa a MongoDB).
        </div>
      )}

      {/* =====================================================================
          1. TARJETAS DE MÉTRICAS CLAVE (DÍA, SEMANA, MÁQUINA, MERMA Y NÓMINA EN USD)
         ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-md border border-slate-200">
          <div className="flex items-center justify-between text-xs font-extrabold uppercase text-slate-400">
            <span>Estabilizadas Hoy</span>
            <Layers className="w-4 h-4 text-emerald-500 shrink-0" />
          </div>
          <p className="text-3xl font-black text-slate-900 mt-2">
            {(metricas?.totalEstabilizadasHoy || 0).toLocaleString('es-ES')}
          </p>
          <span className="text-xs font-semibold text-emerald-600 mt-1 block">
            Nómina hoy: {formatearMonedaUSD(metricas?.totalNominaHoy || 0)}
          </span>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-md border border-slate-200">
          <div className="flex items-center justify-between text-xs font-extrabold uppercase text-slate-400">
            <span>Últimos 7 Días (Semana)</span>
            <TrendingUp className="w-4 h-4 text-amber-500 shrink-0" />
          </div>
          <p className="text-3xl font-black text-slate-900 mt-2">
            {(metricas?.totalEstabilizadasSemana || 0).toLocaleString('es-ES')}
          </p>
          <span className="text-xs font-semibold text-slate-500 mt-1 block">
            Nómina 7 días: {formatearMonedaUSD(metricas?.totalNominaSemana || 0)}
          </span>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-md border border-slate-200">
          <div className="flex items-center justify-between text-xs font-extrabold uppercase text-slate-400">
            <span>Rendimiento vs Máquina</span>
            <Gauge className="w-4 h-4 text-sky-500 shrink-0" />
          </div>
          <p className="text-3xl font-black text-sky-600 mt-2">
            {metricas?.rendimientoPorcentaje || 0}%
          </p>
          <span className="text-xs font-semibold text-slate-500 mt-1 block">
            {(
              metricas?.totalEstabilizadasCerradasPeriodo ??
              metricas?.totalEstabilizadasPeriodo ??
              0
            ).toLocaleString('es-ES')}{' '}
            est. / {(metricas?.totalMaquinaPeriodo || 0).toLocaleString('es-ES')} máq.
          </span>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-md border border-slate-200">
          <div className="flex items-center justify-between text-xs font-extrabold uppercase text-slate-400">
            <span>Diferencia / Merma Periodo</span>
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          </div>
          <p
            className={`text-3xl font-black mt-2 ${
              (metricas?.diferenciaTotalPeriodo || 0) > 0
                ? 'text-amber-600'
                : 'text-emerald-600'
            }`}
          >
            {(metricas?.diferenciaTotalPeriodo || 0).toLocaleString('es-ES')} uds.
          </p>
          <span className="text-xs font-semibold text-slate-500 mt-1 block">
            En {metricas?.cantidadTurnosPeriodo || 0} turnos filtrados
          </span>
        </div>

        <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-2xl shadow-md border-b-4 border-emerald-500">
          <div className="flex items-center justify-between text-xs font-extrabold uppercase text-slate-400">
            <span>Total Pagado ($ USD)</span>
            <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>
          <p className="text-3xl font-black text-emerald-400 mt-2">
            {formatearMonedaUSD(metricas?.totalNominaPeriodo || 0)}
          </p>
          <span className="text-xs font-semibold text-slate-300 mt-1 block">
            Mano de obra del periodo filtrado
          </span>
        </div>
      </div>

      {/* =====================================================================
          2. COMPARATIVA ENTRE PRIMER TURNO Y SEGUNDO TURNO
         ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Tarjeta Primer Turno */}
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center font-black shrink-0">
                1°
              </div>
              <div>
                <h3 className="font-extrabold text-base sm:text-lg text-slate-900">
                  Primer Turno
                </h3>
                <p className="text-xs text-slate-500 font-semibold">
                  {primerTurnoStats.cantidadTurnos} turnos registrados en el filtro
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-black">
              Eficiencia: {primerTurnoStats.rendimiento}%
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 text-center">
            <div className="bg-slate-50 p-2.5 sm:p-3 rounded-xl">
              <span className="text-[11px] font-bold uppercase text-slate-400 block">
                Estabilizadas
              </span>
              <span className="text-lg sm:text-xl font-black text-emerald-600">
                {primerTurnoStats.totalEstabilizadas.toLocaleString('es-ES')}
              </span>
            </div>
            <div className="bg-slate-50 p-2.5 sm:p-3 rounded-xl">
              <span className="text-[11px] font-bold uppercase text-slate-400 block">
                Máquina
              </span>
              <span className="text-lg sm:text-xl font-black text-slate-800">
                {primerTurnoStats.totalMaquina.toLocaleString('es-ES')}
              </span>
            </div>
            <div className="bg-slate-50 p-2.5 sm:p-3 rounded-xl">
              <span className="text-[11px] font-bold uppercase text-slate-400 block">
                Diferencia
              </span>
              <span className="text-lg sm:text-xl font-black text-amber-600">
                {primerTurnoStats.diferencia.toLocaleString('es-ES')}
              </span>
            </div>
            <div className="bg-emerald-50 p-2.5 sm:p-3 rounded-xl border border-emerald-200">
              <span className="text-[11px] font-bold uppercase text-emerald-700 block">
                Mano de Obra
              </span>
              <span className="text-lg sm:text-xl font-black text-emerald-700">
                {formatearMonedaUSD(primerTurnoStats.totalNomina)}
              </span>
            </div>
          </div>
        </div>

        {/* Tarjeta Segundo Turno */}
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-600 flex items-center justify-center font-black shrink-0">
                2°
              </div>
              <div>
                <h3 className="font-extrabold text-base sm:text-lg text-slate-900">
                  Segundo Turno
                </h3>
                <p className="text-xs text-slate-500 font-semibold">
                  {segundoTurnoStats.cantidadTurnos} turnos registrados en el filtro
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-sky-100 text-sky-800 text-xs font-black">
              Eficiencia: {segundoTurnoStats.rendimiento}%
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 text-center">
            <div className="bg-slate-50 p-2.5 sm:p-3 rounded-xl">
              <span className="text-[11px] font-bold uppercase text-slate-400 block">
                Estabilizadas
              </span>
              <span className="text-lg sm:text-xl font-black text-emerald-600">
                {segundoTurnoStats.totalEstabilizadas.toLocaleString('es-ES')}
              </span>
            </div>
            <div className="bg-slate-50 p-2.5 sm:p-3 rounded-xl">
              <span className="text-[11px] font-bold uppercase text-slate-400 block">
                Máquina
              </span>
              <span className="text-lg sm:text-xl font-black text-slate-800">
                {segundoTurnoStats.totalMaquina.toLocaleString('es-ES')}
              </span>
            </div>
            <div className="bg-slate-50 p-2.5 sm:p-3 rounded-xl">
              <span className="text-[11px] font-bold uppercase text-slate-400 block">
                Diferencia
              </span>
              <span className="text-lg sm:text-xl font-black text-amber-600">
                {segundoTurnoStats.diferencia.toLocaleString('es-ES')}
              </span>
            </div>
            <div className="bg-emerald-50 p-2.5 sm:p-3 rounded-xl border border-emerald-200">
              <span className="text-[11px] font-bold uppercase text-emerald-700 block">
                Mano de Obra
              </span>
              <span className="text-lg sm:text-xl font-black text-emerald-700">
                {formatearMonedaUSD(segundoTurnoStats.totalNomina)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          3. BARRA DE FILTROS DEL HISTORIAL (POR FECHA, SEMANA DE CORTE, TURNO Y ESTADO)
         ===================================================================== */}
      <section className="bg-white rounded-2xl shadow-md border border-slate-200 p-4 sm:p-5 space-y-4 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-800 font-extrabold text-sm uppercase tracking-wider">
            <Filter className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Filtros de Auditoría y Ciclo de Pago</span>
          </div>

          <div className="grid grid-cols-2 sm:flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={aplicarFiltroHoy}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs sm:text-sm transition cursor-pointer"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={aplicarFiltroSemanaCorte}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-extrabold text-xs sm:text-sm transition cursor-pointer"
            >
              Semana de Corte (Sáb-Vie)
            </button>
            <button
              type="button"
              onClick={aplicarFiltroSemana}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm transition cursor-pointer"
            >
              7 días
            </button>
            <button
              type="button"
              onClick={limpiarFiltros}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs sm:text-sm transition cursor-pointer"
            >
              Ver Todo
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
              Fecha Desde
            </label>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => {
                setFechaInicio(e.target.value);
                setCicloSeleccionado('Rango personalizado');
              }}
              className="w-full min-h-[48px] rounded-xl border border-slate-300 px-3.5 py-2.5 text-base font-semibold text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
              Fecha Hasta
            </label>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => {
                setFechaFin(e.target.value);
                setCicloSeleccionado('Rango personalizado');
              }}
              className="w-full min-h-[48px] rounded-xl border border-slate-300 px-3.5 py-2.5 text-base font-semibold text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
              Tipo de Turno
            </label>
            <select
              value={tipoTurno}
              onChange={(e) => setTipoTurno(e.target.value)}
              className="w-full min-h-[48px] rounded-xl border border-slate-300 px-3.5 py-2.5 text-base font-semibold text-slate-800 bg-white cursor-pointer"
            >
              <option value="Todos">Todos los Turnos</option>
              <option value="Primer Turno">Primer Turno</option>
              <option value="Segundo Turno">Segundo Turno</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
              Estado del Turno
            </label>
            <select
              value={estadoTurno}
              onChange={(e) => setEstadoTurno(e.target.value)}
              className="w-full min-h-[48px] rounded-xl border border-slate-300 px-3.5 py-2.5 text-base font-semibold text-slate-800 bg-white cursor-pointer"
            >
              <option value="Todos">Todos (Cerrados y En Progreso)</option>
              <option value="Cerrado">Solo Cerrados</option>
              <option value="En Progreso">Solo En Progreso</option>
            </select>
          </div>
        </div>
      </section>

      {/* =====================================================================
          4. SUMATORIA Y RESUMEN CONSOLIDADO (RECALCULADO EN TIEMPO REAL CON useMemo)
         ===================================================================== */}
      <ResumenTotalesFiltro
        turnosFiltrados={turnosFiltrados}
        fechaInicio={fechaInicio}
        fechaFin={fechaFin}
        cicloSeleccionado={cicloSeleccionado}
      />

      {/* =====================================================================
          5. HISTORIAL DE TURNOS (TARJETAS EN MÓVIL / TABLA EN ESCRITORIO)
         ===================================================================== */}
      <section className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden w-full">
        <div className="bg-slate-900 text-white px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-amber-400 shrink-0" />
            <h3 className="font-bold text-base sm:text-lg">
              Historial de Turnos y Detalle Hora por Hora
            </h3>
          </div>
          <span className="text-xs font-bold bg-slate-800 text-amber-300 px-3 py-1 rounded-full shrink-0">
            {turnosFiltrados.length} turnos
          </span>
        </div>

        {turnosFiltrados.length === 0 ? (
          <div className="p-10 sm:p-12 text-center text-slate-500">
            <p className="font-bold text-base text-slate-700">
              No se encontraron turnos con los filtros seleccionados.
            </p>
            <p className="text-sm mt-1">
              Ajuste el rango de fechas o presione &quot;Ver Todo&quot;.
            </p>
          </div>
        ) : (
          <>
            {/* VISTA MÓVIL: Tarjetas ("Cards") compactas por turno */}
            <div className="block md:hidden divide-y divide-slate-200">
              {turnosFiltrados.map((turno) => {
                const expandido = turnoExpandidoId === turno._id;
                const parciales = turno.registrosParciales || [];
                const acompanantes = (turno.operadores || []).filter(Boolean);
                const liquidacion =
                  turno.estado === 'Cerrado' ? calcularLiquidacionTurnoCliente(turno) : null;

                return (
                  <div key={turno._id} className="p-4 space-y-3.5">
                    {/* Cabecera de la tarjeta */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-base text-slate-900">
                          {formatearFechaLegible(turno.fecha)}
                        </span>
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-extrabold ${
                            turno.tipoTurno === 'Primer Turno'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-sky-100 text-sky-900'
                          }`}
                        >
                          {turno.tipoTurno}
                        </span>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold ${
                          turno.estado === 'Cerrado'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {turno.estado === 'Cerrado' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" />
                        )}
                        {turno.estado}
                      </span>
                    </div>

                    {/* Personal del turno */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-sm">
                      <div className="font-extrabold text-slate-900">
                        Encargado: <span className="text-amber-700">{turno.encargado}</span>
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5">
                        {acompanantes.length > 0
                          ? `Acompañantes: ${acompanantes.join(' · ')}`
                          : 'Sin acompañantes (Trabaja solo)'}
                      </div>
                    </div>

                    {/* Marcas de tiempo de Apertura, Cierre y Duración del Turno */}
                    <div className="bg-slate-900 text-white p-3 rounded-xl grid grid-cols-3 gap-2 text-center">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Hora Apertura
                        </span>
                        <span className="text-xs font-black text-emerald-400">
                          {turno.horaApertura || '--:--'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Hora Cierre
                        </span>
                        <span className="text-xs font-black text-amber-400">
                          {turno.estado === 'Cerrado'
                            ? turno.horaCierre || '--:--'
                            : 'En curso'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Trabajado
                        </span>
                        <span className="text-xs font-black text-sky-300">
                          {calcularDuracionTurno(turno)}
                        </span>
                      </div>
                    </div>

                    {/* Grilla de métricas del turno incluyendo Costo de Mano de Obra ($) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      <div className="bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200">
                        <span className="text-[10px] font-bold uppercase text-emerald-800 block">
                          Estabilizadas
                        </span>
                        <span className="text-base font-black text-emerald-700">
                          {Number(turno.totalEstabilizadas || 0).toLocaleString('es-ES')}
                        </span>
                      </div>

                      <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-200">
                        <span className="text-[10px] font-bold uppercase text-slate-500 block">
                          Máquina
                        </span>
                        <span className="text-base font-black text-slate-800">
                          {turno.estado === 'Cerrado'
                            ? Number(turno.contadorMaquina || 0).toLocaleString('es-ES')
                            : 'En curso'}
                        </span>
                      </div>

                      <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-200">
                        <span className="text-[10px] font-bold uppercase text-slate-500 block">
                          Diferencia
                        </span>
                        <span className="text-base font-black text-amber-700">
                          {turno.estado === 'Cerrado'
                            ? turno.diferencia > 0
                              ? `+${turno.diferencia}`
                              : turno.diferencia
                            : '--'}
                        </span>
                      </div>

                      <div className="bg-slate-900 text-white p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] font-bold uppercase text-emerald-400 block">
                          Mano de Obra ($)
                        </span>
                        <span className="text-base font-black text-emerald-400">
                          {turno.estado === 'Cerrado' && liquidacion
                            ? formatearMonedaUSD(liquidacion.totalNominaTurno)
                            : 'En curso'}
                        </span>
                      </div>
                    </div>

                    {/* Botón táctil para ver detalle de liquidación y entregas hora a hora */}
                    <button
                      type="button"
                      onClick={() => alternarDetalleTurno(turno._id)}
                      className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Eye className="w-4 h-4 text-amber-400" />
                      <span>
                        {expandido
                          ? 'Ocultar Liquidación y Detalle'
                          : `Ver Liquidación ($) y Horas (${parciales.length} entregas)`}
                      </span>
                      {expandido ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    {/* Desglose de liquidación individual y hora a hora dentro de la tarjeta móvil */}
                    {expandido && (
                      <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-3">
                        {/* Desglose individual por trabajador */}
                        {turno.estado === 'Cerrado' && liquidacion && (
                          <div className="bg-white rounded-xl border border-emerald-300 overflow-hidden">
                            <div className="bg-slate-900 text-white px-3 py-2 flex items-center justify-between text-xs font-extrabold">
                              <span className="flex items-center gap-1.5">
                                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                                Desglose de Pago por Trabajador
                              </span>
                              <span className="text-emerald-400">
                                Total: {formatearMonedaUSD(liquidacion.totalNominaTurno)}
                              </span>
                            </div>
                            <div className="divide-y divide-slate-100">
                              {liquidacion.pagosPersonal.map((pago, idx) => (
                                <div
                                  key={`${pago.nombre}-${idx}`}
                                  className="p-2.5 flex items-center justify-between gap-2 text-xs"
                                >
                                  <div>
                                    <span className="font-extrabold text-slate-900">
                                      {pago.nombre}
                                    </span>{' '}
                                    <span className="font-bold text-slate-500">
                                      ({pago.rol} · {pago.concepto})
                                    </span>
                                    <span className="block text-[11px] text-slate-500">
                                      {pago.detalleBase}
                                    </span>
                                  </div>
                                  <span className="font-black text-sm text-emerald-700 shrink-0">
                                    {formatearMonedaUSD(pago.montoPagar)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="text-xs font-extrabold uppercase text-slate-500 pt-1">
                          Entregas Parciales Hora por Hora ({parciales.length})
                        </div>

                        {parciales.length === 0 ? (
                          <p className="text-xs text-slate-500 italic text-center py-2">
                            No se registraron lotes parciales en este turno.
                          </p>
                        ) : (
                          parciales.map((lote, idx) => (
                            <div
                              key={lote._id || idx}
                              className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-black text-slate-500">
                                    Lote #{idx + 1}
                                  </span>
                                  <span className="text-xs font-extrabold bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                                    {lote.hora}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600 mt-1 break-words">
                                  {lote.observacion || 'Sin observaciones'}
                                </p>
                              </div>
                              <span className="text-sm font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg shrink-0">
                                +{lote.cantidad}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* VISTA TABLET / ESCRITORIO: Tabla tradicional envuelta en overflow-x-auto */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 text-slate-600 text-xs font-extrabold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4">Fecha</th>
                    <th className="py-3.5 px-4">Turno</th>
                    <th className="py-3.5 px-4">Apertura / Cierre</th>
                    <th className="py-3.5 px-4">Encargado y Equipo</th>
                    <th className="py-3.5 px-4 text-center">Entregas</th>
                    <th className="py-3.5 px-4 text-right">Estabilizadas</th>
                    <th className="py-3.5 px-4 text-right">Máquina</th>
                    <th className="py-3.5 px-4 text-right">Diferencia</th>
                    <th className="py-3.5 px-4 text-right">Costo de Mano de Obra ($)</th>
                    <th className="py-3.5 px-4 text-center">Estado</th>
                    <th className="py-3.5 px-4 text-center">Detalle y Pagos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {turnosFiltrados.map((turno) => {
                    const expandido = turnoExpandidoId === turno._id;
                    const parciales = turno.registrosParciales || [];
                    const liquidacion =
                      turno.estado === 'Cerrado' ? calcularLiquidacionTurnoCliente(turno) : null;

                    return (
                      <React.Fragment key={turno._id}>
                        <tr className="hover:bg-slate-50 transition">
                          <td className="py-4 px-4 font-bold text-slate-800 whitespace-nowrap">
                            {formatearFechaLegible(turno.fecha)}
                          </td>
                          <td className="py-4 px-4 whitespace-nowrap">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-lg text-xs font-extrabold ${
                                turno.tipoTurno === 'Primer Turno'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-sky-100 text-sky-900'
                              }`}
                            >
                              {turno.tipoTurno}
                            </span>
                          </td>
                          <td className="py-4 px-4 whitespace-nowrap">
                            <div className="text-xs font-bold text-slate-800">
                              <span className="text-emerald-700">Inicio:</span>{' '}
                              {turno.horaApertura || '--:--'}
                            </div>
                            <div className="text-xs font-bold text-slate-800 mt-0.5">
                              <span className="text-amber-700">Cierre:</span>{' '}
                              {turno.estado === 'Cerrado'
                                ? turno.horaCierre || '--:--'
                                : 'En curso'}
                            </div>
                            <div className="text-[11px] font-extrabold text-sky-700 mt-0.5">
                              Duración: {calcularDuracionTurno(turno)}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="font-extrabold text-slate-900">
                              {turno.encargado}{' '}
                              <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                                Encargado
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {turno.operadores && turno.operadores.filter(Boolean).length > 0
                                ? `Acompañantes: ${turno.operadores.filter(Boolean).join(' · ')}`
                                : 'Sin acompañantes (Trabaja solo)'}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center font-bold text-slate-700">
                            {parciales.length} lotes
                          </td>
                          <td className="py-4 px-4 text-right font-black text-emerald-700 text-base">
                            {Number(turno.totalEstabilizadas || 0).toLocaleString('es-ES')}
                          </td>
                          <td className="py-4 px-4 text-right font-black text-slate-800">
                            {turno.estado === 'Cerrado'
                              ? Number(turno.contadorMaquina || 0).toLocaleString('es-ES')
                              : 'En curso'}
                          </td>
                          <td className="py-4 px-4 text-right font-black">
                            {turno.estado === 'Cerrado' ? (
                              <span
                                className={
                                  turno.diferencia > 0
                                    ? 'text-amber-600'
                                    : turno.diferencia < 0
                                    ? 'text-rose-600'
                                    : 'text-emerald-600'
                                }
                              >
                                {turno.diferencia > 0
                                  ? `+${turno.diferencia}`
                                  : turno.diferencia}
                              </span>
                            ) : (
                              <span className="text-slate-400">--</span>
                            )}
                          </td>
                          <td className="py-4 px-4 text-right whitespace-nowrap">
                            {turno.estado === 'Cerrado' && liquidacion ? (
                              <span className="inline-block font-black text-base text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl">
                                {formatearMonedaUSD(liquidacion.totalNominaTurno)}
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-slate-400">
                                En curso
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-4 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold ${
                                turno.estado === 'Cerrado'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {turno.estado === 'Cerrado' ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                <Clock className="w-3.5 h-3.5" />
                              )}
                              {turno.estado}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => alternarDetalleTurno(turno._id)}
                              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-amber-400" />
                              <span>{expandido ? 'Ocultar' : 'Ver detalle'}</span>
                              {expandido ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </td>
                        </tr>

                        {/* Fila expandible con desglose individual de pago y reportes hora por hora */}
                        {expandido && (
                          <tr className="bg-slate-50/90">
                            <td colSpan="11" className="p-5 border-b-2 border-slate-300">
                              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-inner space-y-4">
                                {/* 1. Desglose Individual de Liquidación por Trabajador */}
                                {turno.estado === 'Cerrado' && liquidacion && (
                                  <div className="rounded-xl border-2 border-emerald-500/80 overflow-hidden">
                                    <div className="bg-slate-900 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <DollarSign className="w-4 h-4 text-emerald-400" />
                                        <h4 className="font-extrabold text-sm">
                                          Desglose Individual de Liquidación por Trabajador ({turno.tipoTurno} -{' '}
                                          {formatearFechaLegible(turno.fecha)})
                                        </h4>
                                      </div>
                                      <div className="flex items-center gap-3 text-xs font-bold">
                                        <span className="text-slate-300">
                                          Tarifas: Máquina $0.45 | Estabilizado $0.30
                                        </span>
                                        <span className="bg-emerald-500 text-slate-950 font-black px-3 py-1 rounded-full">
                                          Total Mano de Obra: {formatearMonedaUSD(liquidacion.totalNominaTurno)}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3.5 bg-emerald-50/30">
                                      {liquidacion.pagosPersonal.map((pago, idx) => (
                                        <div
                                          key={`${pago.nombre}-${idx}`}
                                          className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between gap-2"
                                        >
                                          <div>
                                            <div className="flex items-center gap-2">
                                              <span className="font-black text-slate-900 text-base">
                                                {pago.nombre}
                                              </span>
                                              <span
                                                className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${
                                                  pago.rol === 'Encargado'
                                                    ? 'bg-amber-100 text-amber-900'
                                                    : 'bg-sky-100 text-sky-900'
                                                }`}
                                              >
                                                {pago.rol}
                                              </span>
                                            </div>
                                            <span className="text-xs font-bold text-slate-600 block mt-0.5">
                                              Concepto: {pago.concepto}
                                            </span>
                                            <span className="text-[11px] text-slate-500 block">
                                              {pago.detalleBase}
                                            </span>
                                          </div>
                                          <span className="text-xl font-black text-emerald-700 shrink-0">
                                            {formatearMonedaUSD(pago.montoPagar)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* 2. Desglose Hora a Hora de Entregas Parciales */}
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-amber-600" />
                                    <h4 className="font-extrabold text-sm text-slate-900">
                                      Desglose Hora a Hora de Reportes Parciales ({parciales.length}{' '}
                                      entregas)
                                    </h4>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 font-semibold">
                                    <span className="bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                                      Apertura: <strong>{turno.horaApertura || '--:--'}</strong> | Cierre:{' '}
                                      <strong>
                                        {turno.estado === 'Cerrado'
                                          ? turno.horaCierre || '--:--'
                                          : 'En curso'}
                                      </strong>{' '}
                                      ({calcularDuracionTurno(turno)})
                                    </span>
                                    <span className="inline-flex items-center gap-1.5">
                                      <Users className="w-4 h-4 text-slate-400" />
                                      <span>
                                        Encargado: <strong>{turno.encargado}</strong> | Acompañantes:{' '}
                                        <strong>
                                          {turno.operadores && turno.operadores.filter(Boolean).length > 0
                                            ? turno.operadores.filter(Boolean).join(', ')
                                            : 'Ninguno (Trabaja solo)'}
                                        </strong>
                                      </span>
                                    </span>
                                  </div>
                                </div>

                                {parciales.length === 0 ? (
                                  <p className="text-xs text-slate-500 italic py-2">
                                    No se registraron lotes parciales en este turno.
                                  </p>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                                    {parciales.map((lote, idx) => (
                                      <div
                                        key={lote._id || idx}
                                        className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-2"
                                      >
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs font-black text-slate-400">
                                              Lote #{idx + 1}
                                            </span>
                                            <span className="text-xs font-extrabold bg-slate-200 text-slate-800 px-2 py-0.5 rounded">
                                              {lote.hora}
                                            </span>
                                          </div>
                                          <p className="text-xs text-slate-600 mt-1">
                                            {lote.observacion || 'Sin observaciones'}
                                          </p>
                                        </div>
                                        <span className="text-base font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg shrink-0">
                                          +{lote.cantidad}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default PanelSupervisor;
