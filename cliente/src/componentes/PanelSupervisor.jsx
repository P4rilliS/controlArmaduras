import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  BarChart3,
  Download,
  Filter,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Users,
  RefreshCw,
  DollarSign
} from 'lucide-react';
import { obtenerDatosSupervisor } from '../servicios/apiTurnos';
import {
  exportarTurnosAExcelCSV,
  formatearFechaLegible,
  obtenerFechaLocalISO,
  calcularDuracionTurno,
  calcularLiquidacionTurnoCliente,
  formatearMonedaUSD,
  obtenerPuestosNormalizadosTurno
} from '../utilidades/exportarExcel';
import { obtenerFechaHoyISO } from './FormularioRegistro';
import ResumenTotalesFiltro from './ResumenTotalesFiltro';

/**
 * Calcula automáticamente el rango de fechas de la Semana de Corte vigente (Viernes a Jueves).
 */
const calcularRangoSemanaCorte = () => {
  const hoy = new Date();
  const diasDesdeViernes = (hoy.getDay() + 2) % 7;

  const viernesInicio = new Date(hoy);
  viernesInicio.setDate(hoy.getDate() - diasDesdeViernes);

  const juevesFin = new Date(viernesInicio);
  juevesFin.setDate(viernesInicio.getDate() + 6);

  return {
    fechaInicio: obtenerFechaLocalISO(viernesInicio),
    fechaFin: obtenerFechaLocalISO(juevesFin),
    etiqueta: 'Semana de Corte (Vie-Jue)'
  };
};

/**
 * Panel completo de Supervisión Mobile-First (Comparativa de Turnos,
 * Sumatoria y Resumen Consolidado Reactivo, Auditoría Hora a Hora y Exportación a Excel/CSV).
 */
const PanelSupervisor = ({ claveSupervisor, turnosRespaldoLocal = [] }) => {
  // Inicialización pura y única al montar el componente: Semana de Corte (Vie-Jue)
  const [rangoInicialCorte] = useState(() => calcularRangoSemanaCorte());

  const [fechaInicio, setFechaInicio] = useState(rangoInicialCorte.fechaInicio);
  const [fechaFin, setFechaFin] = useState(rangoInicialCorte.fechaFin);
  const [tipoTurno, setTipoTurno] = useState('Todos');
  const [estadoTurno, setEstadoTurno] = useState('Todos');
  const [filtroActivo, setFiltroActivo] = useState('semana_corte');
  const [cicloSeleccionado, setCicloSeleccionado] = useState(rangoInicialCorte.etiqueta);

  const [todosLosTurnos, setTodosLosTurnos] = useState([]);
  const [turnoExpandidoId, setTurnoExpandidoId] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [avisoModoLocal, setAvisoModoLocal] = useState(false);

  // Referencia mutable para el respaldo local de modo que el polling de Aplicacion.jsx
  // nunca recree callbacks ni reinicie los filtros activos del supervisor
  const respaldoLocalRef = useRef(turnosRespaldoLocal);
  useEffect(() => {
    respaldoLocalRef.current = turnosRespaldoLocal;
  }, [turnosRespaldoLocal]);

  // Acción explícita de botón: aplicar filtro "Semana de Corte (Vie-Jue)"
  const aplicarFiltroSemanaCorte = useCallback(() => {
    const rango = calcularRangoSemanaCorte();
    setFechaInicio(rango.fechaInicio);
    setFechaFin(rango.fechaFin);
    setFiltroActivo('semana_corte');
    setCicloSeleccionado(rango.etiqueta);
  }, []);

  // Cargar únicamente el arreglo crudo de turnos desde el backend sin tocar jamás los estados de filtro
  const cargarEstadisticas = useCallback(
    async (silencioso = false) => {
      if (!silencioso) {
        setCargando(true);
      }
      try {
        const respuesta = await obtenerDatosSupervisor(claveSupervisor, {});
        setTodosLosTurnos(respuesta.turnos || []);
        setAvisoModoLocal(false);
      } catch {
        setTodosLosTurnos(respaldoLocalRef.current || []);
        setAvisoModoLocal(true);
      } finally {
        if (!silencioso) {
          setCargando(false);
        }
      }
    },
    [claveSupervisor]
  );

  // Efecto de carga inicial y refresco periódico desacoplado (nunca pisa fechaInicio, fechaFin ni filtroActivo)
  useEffect(() => {
    cargarEstadisticas(false);

    const intervaloRefresco = setInterval(() => {
      cargarEstadisticas(true);
    }, 5000);

    return () => clearInterval(intervaloRefresco);
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

  // Cálculo reactivo de la comparativa entre Primer Turno y Segundo Turno sobre los turnos filtrados
  const comparativaTurnos = useMemo(() => {
    const acumulador = {
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

      const grupo =
        t.tipoTurno === 'Primer Turno'
          ? acumulador.primerTurno
          : acumulador.segundoTurno;

      grupo.cantidadTurnos += 1;
      grupo.totalEstabilizadas += est;
      if (estaCerrado) {
        grupo.estabilizadasCerradas += est;
        grupo.totalMaquina += maq;
        grupo.diferencia += dif;
        grupo.totalNomina = Number((grupo.totalNomina + nomina).toFixed(2));
      }
    });

    if (acumulador.primerTurno.totalMaquina > 0) {
      acumulador.primerTurno.rendimiento = Number(
        (
          (acumulador.primerTurno.estabilizadasCerradas /
            acumulador.primerTurno.totalMaquina) *
          100
        ).toFixed(1)
      );
    }

    if (acumulador.segundoTurno.totalMaquina > 0) {
      acumulador.segundoTurno.rendimiento = Number(
        (
          (acumulador.segundoTurno.estabilizadasCerradas /
            acumulador.segundoTurno.totalMaquina) *
          100
        ).toFixed(1)
      );
    }

    return acumulador;
  }, [turnosFiltrados]);

  // Filtros rápidos de fecha y ciclo de pago (Hoy, Semana de Corte Vie-Jue, Ver Todo)
  const aplicarFiltroHoy = () => {
    const hoy = obtenerFechaHoyISO();
    setFechaInicio(hoy);
    setFechaFin(hoy);
    setFiltroActivo('hoy');
    setCicloSeleccionado('Hoy');
  };

  const limpiarFiltros = () => {
    setFechaInicio('');
    setFechaFin('');
    setTipoTurno('Todos');
    setEstadoTurno('Todos');
    setFiltroActivo('todos');
    setCicloSeleccionado('Todos los registros');
  };

  const toggleDetalleTurno = (idTurno) => {
    setTurnoExpandidoId((actual) => (actual === idTurno ? null : idTurno));
  };

  const primerTurnoStats = comparativaTurnos.primerTurno;
  const segundoTurnoStats = comparativaTurnos.segundoTurno;

  return (
    <div className="space-y-5 w-full max-w-7xl mx-auto">
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
            Comparativa entre turnos, liquidación de nómina por ciclo de corte y desglose hora por hora.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => cargarEstadisticas(false)}
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
          1. COMPARATIVA ENTRE PRIMER TURNO Y SEGUNDO TURNO
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
          2. BARRA DE FILTROS DEL HISTORIAL (POR FECHA, SEMANA DE CORTE, TURNO Y ESTADO)
         ===================================================================== */}
      <section className="bg-white rounded-2xl shadow-md border border-slate-200 p-4 sm:p-5 space-y-4 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-800 font-extrabold text-sm uppercase tracking-wider">
            <Filter className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Filtros de Auditoría y Ciclo de Pago</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={aplicarFiltroHoy}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer ${
                filtroActivo === 'hoy'
                  ? 'bg-amber-500 text-slate-950 font-extrabold shadow-xs ring-2 ring-amber-600'
                  : 'bg-amber-100 hover:bg-amber-200 text-amber-900'
              }`}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={aplicarFiltroSemanaCorte}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl font-extrabold text-xs sm:text-sm transition cursor-pointer ${
                filtroActivo === 'semana_corte'
                  ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-700'
                  : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900'
              }`}
            >
              Semana de Corte (Vie-Jue)
            </button>
            <button
              type="button"
              onClick={limpiarFiltros}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer ${
                filtroActivo === 'todos'
                  ? 'bg-slate-900 text-white font-extrabold shadow-xs ring-2 ring-slate-950'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
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
                setFiltroActivo('personalizado');
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
                setFiltroActivo('personalizado');
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
          5. HISTORIAL DE TURNOS (TARJETAS EJECUTIVAS EN MÓVIL/TABLET Y TABLA EN MONITORES XL)
         ===================================================================== */}
      <div className="w-full max-w-7xl mx-auto my-6">
        <section className="bg-white rounded-2xl shadow-md border border-slate-200 w-full overflow-hidden">
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
              {/* VISTA EN TARJETAS PARA TABLETS Y MÓVILES (block xl:hidden) */}
              <div className="block xl:hidden p-3 sm:p-4 bg-slate-50/70 space-y-3.5 w-full">
                {turnosFiltrados.map((turno) => {
                  const expandido = turnoExpandidoId === turno._id;
                  const parciales = turno.registrosParciales || [];
                  const { puestoMaquina, puestoAnillador, puestoEstabilizador } =
                    obtenerPuestosNormalizadosTurno(turno);
                  const maqPresente = Boolean(
                    puestoMaquina.asistio && puestoMaquina.trabajador
                  );
                  const aniPresente = Boolean(
                    puestoAnillador.asistio && puestoAnillador.trabajador
                  );
                  const estPresente = Boolean(
                    puestoEstabilizador.asistio && puestoEstabilizador.trabajador
                  );
                  const liquidacion =
                    turno.estado === 'Cerrado' ? calcularLiquidacionTurnoCliente(turno) : null;

                  return (
                    <div
                      key={turno._id}
                      onClick={() => toggleDetalleTurno(turno._id)}
                      className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all p-4 cursor-pointer select-none w-full"
                      title="Haz clic para ver/ocultar el detalle del turno"
                    >
                      {/* Fila Superior: Fecha con día, Badges de Turno y Estado + Indicador desplegable */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-sm sm:text-base text-slate-900">
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

                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold ${
                              turno.estado === 'Cerrado'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {turno.estado === 'Cerrado' ? (
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                            )}
                            {turno.estado}
                          </span>
                          {expandido ? (
                            <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                        </div>
                      </div>

                      {/* Fila de Horario y Puestos de Trabajo (Badges sutiles de asistencia/inasistencia) */}
                      <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg border ${
                              maqPresente
                                ? 'bg-amber-50 text-amber-950 border-amber-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}
                          >
                            <span className="text-[10px] uppercase font-extrabold opacity-75">
                              Máquina:
                            </span>
                            <strong className={maqPresente ? 'text-slate-900' : 'text-rose-600'}>
                              {maqPresente ? puestoMaquina.trabajador : 'Falta'}
                            </strong>
                          </span>

                          <span
                            className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg border ${
                              aniPresente
                                ? 'bg-sky-50 text-sky-950 border-sky-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}
                          >
                            <span className="text-[10px] uppercase font-extrabold opacity-75">
                              Anillador:
                            </span>
                            <strong className={aniPresente ? 'text-slate-900' : 'text-slate-500'}>
                              {aniPresente ? puestoAnillador.trabajador : 'Falta'}
                            </strong>
                          </span>

                          <span
                            className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg border ${
                              estPresente
                                ? 'bg-emerald-50 text-emerald-950 border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}
                          >
                            <span className="text-[10px] uppercase font-extrabold opacity-75">
                              Estabilizador:
                            </span>
                            <strong className={estPresente ? 'text-slate-900' : 'text-slate-500'}>
                              {estPresente ? puestoEstabilizador.trabajador : 'Falta'}
                            </strong>
                          </span>
                        </div>

                        <div className="bg-slate-900 text-white px-3 py-2 rounded-xl flex flex-wrap items-center gap-3 text-xs shrink-0">
                          <div>
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">
                              Apertura
                            </span>
                            <span className="font-black text-emerald-400">
                              {turno.horaApertura || '--:--'}
                            </span>
                          </div>
                          <div className="h-6 w-px bg-slate-700 hidden sm:block" />
                          <div>
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">
                              Cierre
                            </span>
                            <span className="font-black text-amber-400">
                              {turno.estado === 'Cerrado'
                                ? turno.horaCierre || '--:--'
                                : 'En curso'}
                            </span>
                          </div>
                          <div className="h-6 w-px bg-slate-700 hidden sm:block" />
                          <div>
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">
                              Duración
                            </span>
                            <span className="font-black text-sky-300">
                              {calcularDuracionTurno(turno)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Grid de Métricas Clave (4 columnas compactas con fondo suave) */}
                      <div className="bg-slate-50 rounded-xl p-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center border border-slate-100 my-2.5">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">
                            Lotes
                          </span>
                          <span className="text-sm font-black text-slate-800">
                            {parciales.length}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">
                            Estabilizadas
                          </span>
                          <span className="text-emerald-600 font-black text-sm">
                            {Number(turno.totalEstabilizadas || 0).toLocaleString('es-ES')}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">
                            Máquina
                          </span>
                          <span className="text-sm font-black text-slate-800">
                            {turno.estado === 'Cerrado'
                              ? Number(turno.contadorMaquina || 0).toLocaleString('es-ES')
                              : 'En curso'}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">
                            Diferencia
                          </span>
                          {turno.estado === 'Cerrado' ? (
                            <span
                              className={`text-sm font-black ${
                                turno.diferencia > 0
                                  ? 'text-amber-600'
                                  : turno.diferencia < 0
                                  ? 'text-rose-600'
                                  : 'text-slate-600'
                              }`}
                            >
                              {turno.diferencia > 0
                                ? `+${turno.diferencia}`
                                : turno.diferencia}
                            </span>
                          ) : (
                            <span className="text-sm font-black text-slate-400">--</span>
                          )}
                        </div>
                      </div>

                      {/* Monto de Liquidación (si está cerrado) e Indicador desplegable */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        {turno.estado === 'Cerrado' && liquidacion ? (
                          <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-black">
                            <DollarSign className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>
                              Total Turno: {formatearMonedaUSD(liquidacion.totalNominaTurno)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs font-semibold text-slate-400">
                            Liquidación disponible al cerrar el turno
                          </span>
                        )}

                        <div className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 ml-auto">
                          <span>{expandido ? 'Ocultar detalle' : 'Ver detalle'}</span>
                          {expandido ? (
                            <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                          )}
                        </div>
                      </div>

                      {/* Detalle Expandido (dentro de la misma tarjeta al hacer clic) */}
                      {expandido && (
                        <div className="mt-3.5 pt-3.5 border-t border-slate-200 space-y-3.5 w-full">
                          {/* 1. Desglose Individual de Liquidación por Trabajador */}
                          {turno.estado === 'Cerrado' && liquidacion && (
                            <div className="rounded-xl border border-emerald-400/80 w-full overflow-hidden">
                              <div className="bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 text-xs w-full">
                                <div className="flex items-center gap-2 min-w-0">
                                  <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
                                  <h4 className="font-extrabold text-xs sm:text-sm break-words">
                                    Desglose Individual de Liquidación por Trabajador ({turno.tipoTurno} -{' '}
                                    {formatearFechaLegible(turno.fecha)})
                                  </h4>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                                  <span className="text-slate-300">
                                    Tarifas: Máquina $0.35 | Estabilizado $0.30
                                  </span>
                                  <span className="bg-emerald-500 text-slate-950 font-black px-2.5 py-1 rounded-full">
                                    Total Mano de Obra: {formatearMonedaUSD(liquidacion.totalNominaTurno)}
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 w-full p-3 bg-emerald-50/30">
                                {liquidacion.pagosPersonal.map((pago, idx) => (
                                  <div
                                    key={`${pago.nombre}-${idx}`}
                                    className="w-full min-w-0 flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white shadow-xs gap-2"
                                  >
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="font-black text-slate-900 text-sm break-words">
                                          {pago.nombre}
                                        </span>
                                        <span
                                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${
                                            pago.rol === 'Encargado'
                                              ? 'bg-amber-100 text-amber-900'
                                              : 'bg-sky-100 text-sky-900'
                                          }`}
                                        >
                                          {pago.rol}
                                        </span>
                                      </div>
                                      <span className="text-xs font-semibold text-slate-600 block mt-0.5">
                                        Concepto: {pago.concepto}
                                      </span>
                                      <span className="text-[11px] text-slate-500 block">
                                        {pago.detalleBase}
                                      </span>
                                    </div>
                                    <span className="text-base font-black text-emerald-700 shrink-0">
                                      {formatearMonedaUSD(pago.montoPagar)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 2. Desglose Hora a Hora de Reportes Parciales */}
                          <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 w-full">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5 w-full">
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                                <h4 className="font-extrabold text-xs sm:text-sm text-slate-900">
                                  Desglose Hora a Hora de Reportes Parciales ({parciales.length}{' '}
                                  entregas)
                                </h4>
                              </div>
                              <span className="text-xs text-slate-500 font-semibold">
                                Apertura: <strong>{turno.horaApertura || '--:--'}</strong> · Cierre:{' '}
                                <strong>
                                  {turno.estado === 'Cerrado'
                                    ? turno.horaCierre || '--:--'
                                    : 'En curso'}
                                </strong>
                              </span>
                            </div>

                            {parciales.length === 0 ? (
                              <p className="text-xs text-slate-500 italic text-center py-2">
                                No se registraron lotes parciales en este turno.
                              </p>
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 w-full pt-3">
                                {parciales.map((lote, idx) => (
                                  <div
                                    key={lote._id || idx}
                                    className="p-2 rounded-xl text-center bg-white border border-slate-200 flex flex-col items-center justify-between gap-1.5 min-w-0"
                                  >
                                    <div className="flex flex-wrap items-center justify-center gap-1 w-full">
                                      <span className="text-[11px] font-black text-slate-500">
                                        Lote #{idx + 1}
                                      </span>
                                      <span className="text-[11px] font-extrabold bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded">
                                        {lote.hora}
                                      </span>
                                    </div>
                                    <span className="text-sm font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg">
                                      +{lote.cantidad}
                                    </span>
                                    <p className="text-[11px] text-slate-600 break-words w-full">
                                      {lote.observacion || 'Sin observaciones'}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* VISTA EN TABLA LIMPIA PARA PANTALLAS GRANDES (hidden xl:block) */}
              <div className="hidden xl:block w-full overflow-hidden">
                <table className="w-full table-auto text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-600 text-[11px] font-extrabold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="w-[15%] min-w-[145px] py-3.5 px-3 whitespace-nowrap">
                        Fecha y Turno
                      </th>
                      <th className="w-[17%] min-w-[165px] py-3.5 px-3 whitespace-nowrap">
                        Horario
                      </th>
                      <th className="w-[26%] min-w-[230px] py-3.5 px-3">
                        Puestos y Asistencia
                      </th>
                      <th className="w-[6%] py-3.5 px-1.5 text-center whitespace-nowrap">
                        Lotes
                      </th>
                      <th className="w-[8%] py-3.5 px-1.5 text-center whitespace-nowrap">
                        Estabilizadas
                      </th>
                      <th className="w-[7%] py-3.5 px-1.5 text-center whitespace-nowrap">
                        Máquina
                      </th>
                      <th className="w-[7%] py-3.5 px-1.5 text-center whitespace-nowrap">
                        Diferencia
                      </th>
                      <th className="w-[14%] min-w-[145px] py-3.5 px-3 text-right whitespace-nowrap">
                        Liquidación y Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {turnosFiltrados.map((turno) => {
                      const expandido = turnoExpandidoId === turno._id;
                      const parciales = turno.registrosParciales || [];
                      const { puestoMaquina, puestoAnillador, puestoEstabilizador } =
                        obtenerPuestosNormalizadosTurno(turno);
                      const maqPresente = Boolean(
                        puestoMaquina.asistio && puestoMaquina.trabajador
                      );
                      const aniPresente = Boolean(
                        puestoAnillador.asistio && puestoAnillador.trabajador
                      );
                      const estPresente = Boolean(
                        puestoEstabilizador.asistio && puestoEstabilizador.trabajador
                      );
                      const liquidacion =
                        turno.estado === 'Cerrado' ? calcularLiquidacionTurnoCliente(turno) : null;

                      return (
                        <React.Fragment key={turno._id}>
                          <tr
                            onClick={() => toggleDetalleTurno(turno._id)}
                            className={`cursor-pointer hover:bg-slate-50/90 transition-colors select-none ${
                              expandido ? 'bg-slate-50/90' : ''
                            }`}
                            title="Haz clic para ver/ocultar el detalle del turno"
                          >
                            {/* Columna 1: Fecha y Turno */}
                            <td className="w-[15%] min-w-[145px] py-3.5 px-3 align-middle whitespace-nowrap">
                              <div className="font-bold text-slate-900 whitespace-nowrap">
                                {formatearFechaLegible(turno.fecha)}
                              </div>
                              <span
                                className={`mt-1 inline-block px-2.5 py-0.5 rounded-lg text-xs font-extrabold whitespace-nowrap ${
                                  turno.tipoTurno === 'Primer Turno'
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-sky-100 text-sky-900'
                                }`}
                              >
                                {turno.tipoTurno}
                              </span>
                            </td>

                            {/* Columna 2: Horario (Inicio, Cierre y Duración en una sola línea cada uno) */}
                            <td className="w-[17%] min-w-[165px] py-3.5 px-3 align-middle text-xs font-semibold whitespace-nowrap">
                              <div className="text-slate-800 whitespace-nowrap">
                                <span className="text-emerald-700 font-bold">Inicio:</span>{' '}
                                {turno.horaApertura || '--:--'}
                              </div>
                              <div className="text-slate-800 mt-0.5 whitespace-nowrap">
                                <span className="text-amber-700 font-bold">Cierre:</span>{' '}
                                {turno.estado === 'Cerrado'
                                  ? turno.horaCierre || '--:--'
                                  : 'En curso'}
                              </div>
                              <div className="text-[11px] font-extrabold text-sky-700 mt-0.5 whitespace-nowrap">
                                Duración: {calcularDuracionTurno(turno)}
                              </div>
                            </td>

                            {/* Columna 3: Puestos y Asistencia (Alineación vertical estricta en 3 filas) */}
                            <td className="w-[26%] min-w-[230px] py-3.5 px-3 align-middle">
                              <div className="flex flex-col items-start gap-1.5">
                                <span
                                  className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-md border whitespace-nowrap ${
                                    maqPresente
                                      ? 'bg-amber-50 text-amber-950 border-amber-200'
                                      : 'bg-slate-100 text-slate-500 border-slate-200'
                                  }`}
                                >
                                  <span className="text-[10px] uppercase font-extrabold opacity-75">
                                    Máquina:
                                  </span>
                                  <strong
                                    className={maqPresente ? 'text-slate-900' : 'text-rose-600'}
                                  >
                                    {maqPresente ? puestoMaquina.trabajador : 'Falta'}
                                  </strong>
                                </span>

                                <span
                                  className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-md border whitespace-nowrap ${
                                    aniPresente
                                      ? 'bg-sky-50 text-sky-950 border-sky-200'
                                      : 'bg-slate-100 text-slate-500 border-slate-200'
                                  }`}
                                >
                                  <span className="text-[10px] uppercase font-extrabold opacity-75">
                                    Anillador:
                                  </span>
                                  <strong
                                    className={aniPresente ? 'text-slate-900' : 'text-slate-500'}
                                  >
                                    {aniPresente ? puestoAnillador.trabajador : 'Falta'}
                                  </strong>
                                </span>

                                <span
                                  className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-md border whitespace-nowrap ${
                                    estPresente
                                      ? 'bg-emerald-50 text-emerald-950 border-emerald-200'
                                      : 'bg-slate-100 text-slate-500 border-slate-200'
                                  }`}
                                >
                                  <span className="text-[10px] uppercase font-extrabold opacity-75">
                                    Estabilizador:
                                  </span>
                                  <strong
                                    className={estPresente ? 'text-slate-900' : 'text-slate-500'}
                                  >
                                    {estPresente ? puestoEstabilizador.trabajador : 'Falta'}
                                  </strong>
                                </span>
                              </div>
                            </td>

                            {/* Columnas Numéricas Compactas (Lotes, Estabilizadas, Máquina, Diferencia) */}
                            <td className="w-[6%] py-3.5 px-1.5 align-middle text-center font-bold text-slate-700 whitespace-nowrap">
                              {parciales.length}
                            </td>
                            <td className="w-[8%] py-3.5 px-1.5 align-middle text-center font-black text-emerald-600 text-base whitespace-nowrap">
                              {Number(turno.totalEstabilizadas || 0).toLocaleString('es-ES')}
                            </td>
                            <td className="w-[7%] py-3.5 px-1.5 align-middle text-center font-black text-slate-800 whitespace-nowrap">
                              {turno.estado === 'Cerrado'
                                ? Number(turno.contadorMaquina || 0).toLocaleString('es-ES')
                                : 'En curso'}
                            </td>
                            <td className="w-[7%] py-3.5 px-1.5 align-middle text-center font-black whitespace-nowrap">
                              {turno.estado === 'Cerrado' ? (
                                <span
                                  className={
                                    turno.diferencia > 0
                                      ? 'text-amber-600'
                                      : turno.diferencia < 0
                                      ? 'text-rose-600'
                                      : 'text-slate-600'
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

                            {/* Columna 8: Liquidación y Estado */}
                            <td className="w-[14%] min-w-[145px] py-3.5 px-3 align-middle text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                                {turno.estado === 'Cerrado' && liquidacion && (
                                  <span className="inline-block font-black text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl whitespace-nowrap">
                                    {formatearMonedaUSD(liquidacion.totalNominaTurno)}
                                  </span>
                                )}
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold whitespace-nowrap ${
                                    turno.estado === 'Cerrado'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {turno.estado === 'Cerrado' ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  ) : (
                                    <Clock className="w-3.5 h-3.5 shrink-0" />
                                  )}
                                  {turno.estado}
                                </span>
                                {expandido ? (
                                  <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Fila expandible con desglose individual de pago y reportes hora por hora */}
                          {expandido && (
                            <tr className="bg-slate-50/90">
                              <td colSpan="8" className="p-4 border-b-2 border-slate-300 w-full">
                                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-inner space-y-4 w-full">
                                  {/* 1. Desglose Individual de Liquidación por Trabajador */}
                                  {turno.estado === 'Cerrado' && liquidacion && (
                                    <div className="rounded-xl border-2 border-emerald-500/80 w-full overflow-hidden">
                                      <div className="bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 text-xs w-full">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
                                          <h4 className="font-extrabold text-sm break-words">
                                            Desglose Individual de Liquidación por Trabajador ({turno.tipoTurno} -{' '}
                                            {formatearFechaLegible(turno.fecha)})
                                          </h4>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
                                          <span className="text-slate-300">
                                            Tarifas: Máquina $0.35 | Estabilizado $0.30
                                          </span>
                                          <span className="bg-emerald-500 text-slate-950 font-black px-3 py-1 rounded-full">
                                            Total Mano de Obra: {formatearMonedaUSD(liquidacion.totalNominaTurno)}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 w-full p-3 bg-emerald-50/30">
                                        {liquidacion.pagosPersonal.map((pago, idx) => (
                                          <div
                                            key={`${pago.nombre}-${idx}`}
                                            className="w-full min-w-0 flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white shadow-xs gap-2"
                                          >
                                            <div className="min-w-0">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-black text-slate-900 text-base break-words">
                                                  {pago.nombre}
                                                </span>
                                                <span
                                                  className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${
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
                                            <span className="text-lg font-black text-emerald-700 shrink-0">
                                              {formatearMonedaUSD(pago.montoPagar)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* 2. Desglose Hora a Hora de Entregas Parciales */}
                                  <div className="w-full">
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 w-full">
                                      <div className="flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-amber-600 shrink-0" />
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
                                          <Users className="w-4 h-4 text-slate-400 shrink-0" />
                                          <span>
                                            Máquina:{' '}
                                            <strong>
                                              {maqPresente ? puestoMaquina.trabajador : 'Falta'}
                                            </strong>{' '}
                                            | Anillador:{' '}
                                            <strong>
                                              {aniPresente ? puestoAnillador.trabajador : 'Falta'}
                                            </strong>{' '}
                                            | Estabilizador:{' '}
                                            <strong>
                                              {estPresente
                                                ? puestoEstabilizador.trabajador
                                                : 'Falta'}
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
                                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 w-full pt-3">
                                        {parciales.map((lote, idx) => (
                                          <div
                                            key={lote._id || idx}
                                            className="p-2 rounded-xl text-center bg-slate-50 border border-slate-200 flex flex-col items-center justify-between gap-1.5 min-w-0"
                                          >
                                            <div className="flex flex-wrap items-center justify-center gap-1 w-full">
                                              <span className="text-[11px] font-black text-slate-400">
                                                Lote #{idx + 1}
                                              </span>
                                              <span className="text-[11px] font-extrabold bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded">
                                                {lote.hora}
                                              </span>
                                            </div>
                                            <span className="text-base font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg">
                                              +{lote.cantidad}
                                            </span>
                                            <p className="text-[11px] text-slate-600 break-words w-full">
                                              {lote.observacion || 'Sin observaciones'}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
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
    </div>
  );
};

export default PanelSupervisor;
