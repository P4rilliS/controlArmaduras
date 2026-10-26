import React, { useMemo } from 'react';
import {
  Gauge,
  Layers,
  AlertTriangle,
  DollarSign,
  Users,
  Calculator,
  CheckCircle2
} from 'lucide-react';
import {
  calcularLiquidacionTurnoCliente,
  formatearMonedaUSD,
  formatearFechaConDia,
  TARIFA_MAQUINA_USD,
  TARIFA_ESTABILIZADA_USD
} from '../utilidades/exportarExcel';

/**
 * Sección destacada de "Sumatoria y Resumen Consolidado" para el Panel del Supervisor.
 * Se recalcula automáticamente en tiempo real mediante useMemo sobre el arreglo de
 * turnos filtrados (`turnosFiltrados`), mostrando:
 * 1. Tarjetas de Totales Generales (Total Máquina, Total Estabilizadas, Diferencia/Merma Neta y Total a Pagar Nómina).
 * 2. Tabla de Resumen por Trabajador (Nómina Acumulada del Filtro con armaduras liquidadas y monto total a transferir en $ USD).
 */
const ResumenTotalesFiltro = ({
  turnosFiltrados = [],
  fechaInicio = '',
  fechaFin = '',
  cicloSeleccionado = ''
}) => {
  const resumenConsolidado = useMemo(() => {
    let totalMaquina = 0;
    let totalEstabilizadas = 0;
    let totalNominaUSD = 0;
    let turnosCerradosCount = 0;
    let turnosEnProgresoCount = 0;

    const mapaTrabajadores = {};

    const asegurarTrabajador = (nombre) => {
      const clave = String(nombre || '').trim();
      if (!clave) return null;
      if (!mapaTrabajadores[clave]) {
        mapaTrabajadores[clave] = {
          nombre: clave,
          turnosParticipados: 0,
          turnosEncargado: 0,
          turnosAcompanante: 0,
          armadurasMaquina: 0,
          armadurasEstabilizadas: 0,
          totalArmadurasLiquidadas: 0,
          montoMaquinaUSD: 0,
          montoEstabilizadoUSD: 0,
          montoTotalUSD: 0
        };
      }
      return mapaTrabajadores[clave];
    };

    turnosFiltrados.forEach((turno) => {
      const sumaParciales = (turno.registrosParciales || []).reduce(
        (acc, item) => acc + (Number(item.cantidad) || 0),
        0
      );
      const cantEstabilizadas =
        turno.totalEstabilizadas !== undefined && turno.totalEstabilizadas !== null
          ? Number(turno.totalEstabilizadas) || 0
          : sumaParciales;

      const estaCerrado = !turno.estado || turno.estado === 'Cerrado';
      const cantMaquina = estaCerrado ? Number(turno.contadorMaquina) || 0 : 0;

      totalEstabilizadas += cantEstabilizadas;
      totalMaquina += cantMaquina;

      if (estaCerrado) {
        turnosCerradosCount += 1;
        const liquidacion = calcularLiquidacionTurnoCliente(turno);
        const costoTurno = Number(liquidacion.totalNominaTurno) || 0;
        totalNominaUSD = Number((totalNominaUSD + costoTurno).toFixed(2));

        const tarifaMaq = Number(liquidacion.tarifaMaquina) || TARIFA_MAQUINA_USD;
        const tarifaEst = Number(liquidacion.tarifaEstabilizada) || TARIFA_ESTABILIZADA_USD;

        (liquidacion.pagosPersonal || []).forEach((pago) => {
          const reg = asegurarTrabajador(pago.nombre);
          if (!reg) return;

          reg.turnosParticipados += 1;
          if (pago.rol === 'Encargado') {
            reg.turnosEncargado += 1;
          } else {
            reg.turnosAcompanante += 1;
          }

          if (pago.concepto === 'Máquina + Estabilizado') {
            reg.armadurasMaquina += cantMaquina;
            reg.armadurasEstabilizadas += cantEstabilizadas;
            reg.totalArmadurasLiquidadas += cantMaquina + cantEstabilizadas;
            reg.montoMaquinaUSD = Number(
              (reg.montoMaquinaUSD + cantMaquina * tarifaMaq).toFixed(2)
            );
            reg.montoEstabilizadoUSD = Number(
              (reg.montoEstabilizadoUSD + cantEstabilizadas * tarifaEst).toFixed(2)
            );
          } else if (pago.concepto === 'Máquina') {
            reg.armadurasMaquina += cantMaquina;
            reg.totalArmadurasLiquidadas += cantMaquina;
            reg.montoMaquinaUSD = Number(
              (reg.montoMaquinaUSD + cantMaquina * tarifaMaq).toFixed(2)
            );
          } else {
            reg.armadurasEstabilizadas += cantEstabilizadas;
            reg.totalArmadurasLiquidadas += cantEstabilizadas;
            reg.montoEstabilizadoUSD = Number(
              (reg.montoEstabilizadoUSD + cantEstabilizadas * tarifaEst).toFixed(2)
            );
          }

          reg.montoTotalUSD = Number(
            (reg.montoTotalUSD + (Number(pago.montoPagar) || 0)).toFixed(2)
          );
        });
      } else {
        turnosEnProgresoCount += 1;
      }
    });

    const diferenciaNeta = totalMaquina - totalEstabilizadas;

    const listaTrabajadores = Object.values(mapaTrabajadores).sort(
      (a, b) => b.montoTotalUSD - a.montoTotalUSD || a.nombre.localeCompare(b.nombre)
    );

    const totalArmadurasLiquidadasGlobal = listaTrabajadores.reduce(
      (acc, item) => acc + item.totalArmadurasLiquidadas,
      0
    );

    return {
      totalMaquina,
      totalEstabilizadas,
      diferenciaNeta,
      totalNominaUSD,
      turnosCerradosCount,
      turnosEnProgresoCount,
      listaTrabajadores,
      totalArmadurasLiquidadasGlobal
    };
  }, [turnosFiltrados]);

  const {
    totalMaquina,
    totalEstabilizadas,
    diferenciaNeta,
    totalNominaUSD,
    turnosCerradosCount,
    turnosEnProgresoCount,
    listaTrabajadores,
    totalArmadurasLiquidadasGlobal
  } = resumenConsolidado;

  const descripcionPeriodo = () => {
    if (fechaInicio && fechaFin) {
      if (fechaInicio === fechaFin) {
        return formatearFechaConDia(fechaInicio);
      }
      return `${formatearFechaConDia(fechaInicio)} al ${formatearFechaConDia(fechaFin)}`;
    }
    if (fechaInicio) {
      return `Desde ${formatearFechaConDia(fechaInicio)}`;
    }
    if (fechaFin) {
      return `Hasta ${formatearFechaConDia(fechaFin)}`;
    }
    return 'Todos los periodos registrados';
  };

  return (
    <section className="bg-white rounded-2xl shadow-lg border-2 border-emerald-600/80 overflow-hidden w-full">
      {/* Cabecera de la sección de Sumatoria y Resumen Consolidado */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-700">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-black text-base sm:text-lg tracking-tight text-white">
                Sumatoria y Resumen Consolidado del Filtro
              </h3>
              {cicloSeleccionado && (
                <span className="text-[11px] font-extrabold uppercase bg-amber-500 text-slate-950 px-2.5 py-0.5 rounded-full">
                  {cicloSeleccionado}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
              Periodo activo: <strong className="text-amber-300">{descripcionPeriodo()}</strong>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold">
          <span className="bg-slate-800 text-emerald-300 border border-slate-700 px-3 py-1.5 rounded-xl">
            {turnosCerradosCount} {turnosCerradosCount === 1 ? 'turno cerrado' : 'turnos cerrados'}
          </span>
          {turnosEnProgresoCount > 0 && (
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-xl">
              {turnosEnProgresoCount} en progreso
            </span>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-6 bg-slate-50/60">
        {/* ===================================================================
            1. TARJETAS DE TOTALES GENERALES (KPIs DEL FILTRO ACTUAL)
           =================================================================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Total Máquina */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between text-xs font-extrabold uppercase text-slate-500">
              <span>Total Máquina</span>
              <Gauge className="w-4 h-4 text-sky-600 shrink-0" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
              {totalMaquina.toLocaleString('es-ES')}{' '}
              <span className="text-sm font-bold text-slate-500">uds.</span>
            </p>
            <span className="text-xs font-semibold text-slate-500 mt-1 block">
              Suma de máquina en turnos filtrados ($0.45/ud.)
            </span>
          </div>

          {/* Total Estabilizadas */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between text-xs font-extrabold uppercase text-slate-500">
              <span>Total Estabilizadas</span>
              <Layers className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-emerald-700 mt-2">
              {totalEstabilizadas.toLocaleString('es-ES')}{' '}
              <span className="text-sm font-bold text-emerald-600">uds.</span>
            </p>
            <span className="text-xs font-semibold text-slate-500 mt-1 block">
              Suma estabilizada en turnos filtrados ($0.30/ud.)
            </span>
          </div>

          {/* Diferencia / Merma Neta */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between text-xs font-extrabold uppercase text-slate-500">
              <span>Diferencia / Merma Neta</span>
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            </div>
            <p
              className={`text-2xl sm:text-3xl font-black mt-2 ${
                diferenciaNeta > 0
                  ? 'text-amber-600'
                  : diferenciaNeta < 0
                  ? 'text-rose-600'
                  : 'text-emerald-600'
              }`}
            >
              {diferenciaNeta > 0 ? `+${diferenciaNeta.toLocaleString('es-ES')}` : diferenciaNeta.toLocaleString('es-ES')}{' '}
              <span className="text-sm font-bold">uds.</span>
            </p>
            <span className="text-xs font-semibold text-slate-500 mt-1 block">
              Total Máquina − Total Estabilizadas
            </span>
          </div>

          {/* Total a Pagar Nómina ($ USD) */}
          <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-2xl shadow-md border-b-4 border-emerald-500">
            <div className="flex items-center justify-between text-xs font-extrabold uppercase text-emerald-400">
              <span>Total a Pagar Nómina ($ USD)</span>
              <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-emerald-400 mt-2">
              {formatearMonedaUSD(totalNominaUSD)}
            </p>
            <span className="text-xs font-semibold text-slate-300 mt-1 block">
              Suma total de mano de obra del filtro
            </span>
          </div>
        </div>

        {/* ===================================================================
            2. TABLA DE RESUMEN POR TRABAJADOR (NÓMINA ACUMULADA DEL FILTRO)
           =================================================================== */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-800 text-white px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400 shrink-0" />
              <h4 className="font-extrabold text-sm sm:text-base">
                Resumen por Trabajador (Nómina Acumulada a Transferir)
              </h4>
            </div>
            <span className="text-xs font-bold text-emerald-300">
              {listaTrabajadores.length}{' '}
              {listaTrabajadores.length === 1 ? 'operador activo' : 'operadores activos'} en el filtro
            </span>
          </div>

          {listaTrabajadores.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-sm">
              No hay turnos cerrados con liquidación de nómina en el rango de filtro seleccionado.
            </div>
          ) : (
            <>
              {/* Vista Móvil: Tarjetas compactas por trabajador */}
              <div className="block md:hidden divide-y divide-slate-200">
                {listaTrabajadores.map((trabajador) => (
                  <div key={trabajador.nombre} className="p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-black text-base text-slate-900 block">
                          {trabajador.nombre}
                        </span>
                        <span className="text-xs font-semibold text-slate-500">
                          {trabajador.turnosParticipados}{' '}
                          {trabajador.turnosParticipados === 1 ? 'turno' : 'turnos'} (
                          {trabajador.turnosEncargado} Enc. / {trabajador.turnosAcompanante} Acomp.)
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-extrabold uppercase text-emerald-700 block">
                          Monto a Transferir
                        </span>
                        <span className="text-xl font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl inline-block">
                          {formatearMonedaUSD(trabajador.montoTotalUSD)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-center">
                      <div>
                        <span className="text-slate-500 font-bold block">Máquina ($0.45)</span>
                        <span className="font-black text-slate-800">
                          {trabajador.armadurasMaquina.toLocaleString('es-ES')} uds.
                        </span>
                        <span className="block text-[11px] text-slate-500">
                          {formatearMonedaUSD(trabajador.montoMaquinaUSD)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-bold block">Estabiliz. ($0.30)</span>
                        <span className="font-black text-emerald-700">
                          {trabajador.armadurasEstabilizadas.toLocaleString('es-ES')} uds.
                        </span>
                        <span className="block text-[11px] text-slate-500">
                          {formatearMonedaUSD(trabajador.montoEstabilizadoUSD)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-bold block">Total Liquidadas</span>
                        <span className="font-black text-slate-900">
                          {trabajador.totalArmadurasLiquidadas.toLocaleString('es-ES')} uds.
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                    Total Nómina Acumulada
                  </span>
                  <span className="text-lg font-black text-emerald-400">
                    {formatearMonedaUSD(totalNominaUSD)}
                  </span>
                </div>
              </div>

              {/* Vista Tablet / Escritorio: Tabla compacta */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-slate-100 text-slate-600 text-xs font-extrabold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Nombre del Trabajador</th>
                      <th className="py-3 px-4 text-center">Turnos Trabajados</th>
                      <th className="py-3 px-4 text-right">Armaduras Máquina ($0.45)</th>
                      <th className="py-3 px-4 text-right">Armaduras Estabilizadas ($0.30)</th>
                      <th className="py-3 px-4 text-right">Total Armaduras Liquidadas</th>
                      <th className="py-3 px-4 text-right">Monto Total a Transferir ($ USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {listaTrabajadores.map((trabajador) => (
                      <tr key={trabajador.nombre} className="hover:bg-slate-50 transition">
                        <td className="py-3.5 px-4 font-black text-slate-900">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>{trabajador.nombre}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center text-xs font-bold text-slate-600">
                          <span className="bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                            {trabajador.turnosParticipados}{' '}
                            {trabajador.turnosParticipados === 1 ? 'turno' : 'turnos'} (
                            {trabajador.turnosEncargado} Enc. / {trabajador.turnosAcompanante}{' '}
                            Acomp.)
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-slate-800">
                          {trabajador.armadurasMaquina.toLocaleString('es-ES')} uds.{' '}
                          <span className="text-xs text-slate-500 font-semibold block">
                            {formatearMonedaUSD(trabajador.montoMaquinaUSD)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-emerald-700">
                          {trabajador.armadurasEstabilizadas.toLocaleString('es-ES')} uds.{' '}
                          <span className="text-xs text-slate-500 font-semibold block">
                            {formatearMonedaUSD(trabajador.montoEstabilizadoUSD)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-black text-slate-900">
                          {trabajador.totalArmadurasLiquidadas.toLocaleString('es-ES')} uds.
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className="inline-block font-black text-base text-emerald-800 bg-emerald-50 border border-emerald-300 px-3.5 py-1 rounded-xl">
                            {formatearMonedaUSD(trabajador.montoTotalUSD)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-900 text-white font-extrabold text-sm">
                    <tr>
                      <td colSpan="2" className="py-3.5 px-4 uppercase tracking-wider">
                        Total Consolidado de Nómina del Filtro
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-300">
                        {listaTrabajadores
                          .reduce((acc, t) => acc + t.armadurasMaquina, 0)
                          .toLocaleString('es-ES')}{' '}
                        uds.
                      </td>
                      <td className="py-3.5 px-4 text-right text-emerald-300">
                        {listaTrabajadores
                          .reduce((acc, t) => acc + t.armadurasEstabilizadas, 0)
                          .toLocaleString('es-ES')}{' '}
                        uds.
                      </td>
                      <td className="py-3.5 px-4 text-right text-white">
                        {totalArmadurasLiquidadasGlobal.toLocaleString('es-ES')} uds.
                      </td>
                      <td className="py-3.5 px-4 text-right text-lg font-black text-emerald-400">
                        {formatearMonedaUSD(totalNominaUSD)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default ResumenTotalesFiltro;

