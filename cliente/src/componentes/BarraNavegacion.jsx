import React from 'react';
import {
  ShieldCheck,
  Factory,
  Clock,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Smartphone
} from 'lucide-react';
import { formatearFechaConDia } from '../utilidades/exportarExcel';

/**
 * Barra superior de navegación móvil-primero (Mobile-First) con estado operativo,
 * Hora de Inicio del turno activo, botón "Instalar App en el Teléfono" (PWA) y "Acceso Supervisor".
 */
const BarraNavegacion = ({
  turnoActual,
  modoSupervisor,
  alAbrirModalSupervisor,
  alSalirModoSupervisor,
  conexionServidor,
  mostrarBotonInstalarPWA,
  alInstalarPWA
}) => {
  const estaEnProgreso = turnoActual && turnoActual.estado === 'En Progreso';

  return (
    <header className="bg-slate-900 text-white shadow-lg border-b-4 border-blue-600 sticky top-0 z-30 w-full">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Identidad de la Planta */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-blue-600 text-white p-2.5 rounded-xl shadow-md shrink-0">
            <Factory className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.2]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
                Planta Industrial
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  conexionServidor
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
              >
                {conexionServidor ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 shrink-0" /> En línea
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3 shrink-0" /> Respaldo local
                  </>
                )}
              </span>
            </div>
            <h1 className="text-base sm:text-xl font-extrabold tracking-tight text-white leading-snug truncate">
              Control de Producción de Armaduras
            </h1>
          </div>
        </div>

        {/* Indicador de Turno con Hora de Inicio + Botones PWA y Supervisor */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
          {!modoSupervisor && (
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs sm:text-sm font-medium w-full sm:w-auto ${
                estaEnProgreso
                  ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              <Clock
                className={`w-4 h-4 shrink-0 ${
                  estaEnProgreso ? 'text-emerald-400 animate-pulse' : 'text-slate-400'
                }`}
              />
              {estaEnProgreso ? (
                <span className="truncate">
                  <strong className="text-white">{turnoActual.tipoTurno}</strong> ·{' '}
                  <span className="text-slate-200 font-semibold">
                    {formatearFechaConDia(turnoActual.fecha)}
                  </span>{' '}
                  · <span className="text-amber-300 font-semibold">{turnoActual.encargado}</span>
                  {turnoActual.horaApertura && (
                    <span className="text-emerald-300 font-bold">
                      {' '}
                      · Inicio: {turnoActual.horaApertura}
                    </span>
                  )}
                </span>
              ) : (
                <span>Sin turno activo en curso</span>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {mostrarBotonInstalarPWA && (
              <button
                type="button"
                onClick={alInstalarPWA}
                className="flex-1 sm:flex-initial min-h-[48px] inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-sm shadow-md transition-all cursor-pointer"
              >
                <Smartphone className="w-4 h-4 shrink-0" />
                <span>Instalar App en el Teléfono</span>
              </button>
            )}

            {modoSupervisor ? (
              <button
                type="button"
                onClick={alSalirModoSupervisor}
                className="flex-1 sm:flex-initial min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-bold text-sm sm:text-base shadow-md transition-all cursor-pointer"
              >
                <LogOut className="w-5 h-5 shrink-0" />
                <span>Salir de Supervisión</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={alAbrirModalSupervisor}
                className="flex-1 sm:flex-initial min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-extrabold text-sm sm:text-base shadow-md transition-all cursor-pointer"
              >
                <ShieldCheck className="w-5 h-5 shrink-0" />
                <span>Acceso Supervisor</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default BarraNavegacion;
