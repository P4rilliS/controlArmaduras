import React, { useMemo } from 'react';
import {
  DollarSign,
  Users,
  Calculator,
  CheckCircle2
} from 'lucide-react';
import {
  calcularLiquidacionTurnoCliente,
  formatearMonedaUSD,
  formatearFechaConDia
} from '../utilidades/exportarExcel';

/**
 * Sección destacada de "Sumatoria y Resumen Consolidado" para el Panel del Supervisor.
 * Se recalcula automáticamente en tiempo real mediante useMemo sobre el arreglo de
 * turnos filtrados (`turnosFiltrados`), mostrando:
 * 1. Tarjeta ejecutiva principal del valor financiero: Total a Pagar Nómina ($ USD).
 * 2. Tabla simplificada de Resumen por Trabajador (Turnos trabajados, Total Armaduras Realizadas y Monto Total a Transferir en $ USD).
 */
const ResumenTotalesFiltro = ({
  turnosFiltrados = [],
  fechaInicio = '',
  fechaFin = '',
  cicloSeleccionado = ''
}) => {
  const resumenConsolidado = useMemo(() => {
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
          totalArmadurasLiquidadas: 0,
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

      if (estaCerrado) {
        turnosCerradosCount += 1;
        const liquidacion = calcularLiquidacionTurnoCliente(turno);
        const costoTurno = Number(liquidacion.totalNominaTurno) || 0;
        totalNominaUSD = Number((totalNominaUSD + costoTurno).toFixed(2));

        (liquidacion.pagosPersonal || []).forEach((pago) => {
          // Regla estricta: si un trabajador tuvo inasistencia (asistio === false),
          // no se le computa el turno ni se le acreditan piezas ni dinero.
          if (pago.asistio === false || !pago.nombre) return;

          const reg = asegurarTrabajador(pago.nombre);
          if (!reg) return;

          reg.turnosParticipados += 1;

          if (pago.concepto === 'Máquina + Estabilizado') {
            reg.totalArmadurasLiquidadas += cantMaquina + cantEstabilizadas;
          } else if (pago.concepto === 'Máquina') {
            reg.totalArmadurasLiquidadas += cantMaquina;
          } else {
            reg.totalArmadurasLiquidadas += cantEstabilizadas;
          }

          reg.montoTotalUSD = Number(
            (reg.montoTotalUSD + (Number(pago.montoPagar) || 0)).toFixed(2)
          );
        });
      } else {
        turnosEnProgresoCount += 1;
      }
    });

    const listaTrabajadores = Object.values(mapaTrabajadores).sort(
      (a, b) => b.montoTotalUSD - a.montoTotalUSD || a.nombre.localeCompare(b.nombre)
    );

    const totalArmadurasLiquidadasGlobal = listaTrabajadores.reduce(
      (acc, item) => acc + item.totalArmadurasLiquidadas,
      0
    );

    return {
      totalNominaUSD,
      turnosCerradosCount,
      turnosEnProgresoCount,
      listaTrabajadores,
      totalArmadurasLiquidadasGlobal
    };
  }, [turnosFiltrados]);

  const {
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
            1. TARJETA EJECUTIVA PRINCIPAL: TOTAL A PAGAR NÓMINA ($ USD)
           =================================================================== */}
        <div className="bg-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-md border-b-4 border-emerald-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-emerald-400">
              <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Total a Pagar Nómina ($ USD)</span>
            </div>
            <p className="text-xs sm:text-sm font-semibold text-slate-300">
              Suma total de mano de obra liquidada en el filtro seleccionado
            </p>
          </div>

          <div className="sm:text-right">
            <p className="text-3xl sm:text-4xl font-black text-emerald-400 tracking-tight">
              {formatearMonedaUSD(totalNominaUSD)}
            </p>
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
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="font-black text-base text-slate-900 break-words">
                          {trabajador.nombre}
                        </span>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-extrabold uppercase text-emerald-700 block">
                          Monto a Transferir
                        </span>
                        <span className="text-xl font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl inline-block">
                          {formatearMonedaUSD(trabajador.montoTotalUSD)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-center">
                      <div>
                        <span className="text-slate-500 font-bold block">Turnos Trabajados</span>
                        <span className="font-black text-slate-900 text-sm">
                          {trabajador.turnosParticipados}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-bold block">Total Armaduras Realizadas</span>
                        <span className="font-black text-slate-900 text-sm">
                          {trabajador.totalArmadurasLiquidadas.toLocaleString('es-ES')} uds.
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                    Total Consolidado ({totalArmadurasLiquidadasGlobal.toLocaleString('es-ES')} uds.)
                  </span>
                  <span className="text-lg font-black text-emerald-400">
                    {formatearMonedaUSD(totalNominaUSD)}
                  </span>
                </div>
              </div>

              {/* Vista Tablet / Escritorio: Tabla simplificada de 4 columnas */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-slate-100 text-slate-600 text-xs font-extrabold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Nombre del Trabajador</th>
                      <th className="py-3 px-4 text-center">Turnos Trabajados</th>
                      <th className="py-3 px-4 text-right">Total Armaduras Realizadas</th>
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
                        <td className="py-3.5 px-4 text-center font-black text-slate-800">
                          <span className="inline-block bg-slate-100 px-3 py-1 rounded-lg border border-slate-200 text-xs font-extrabold">
                            {trabajador.turnosParticipados}
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

