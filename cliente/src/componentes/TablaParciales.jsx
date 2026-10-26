import React, { useState, useEffect } from 'react';
import {
  ClipboardList,
  Trash2,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Layers,
  Clock,
  ArrowRightCircle,
  RefreshCw
} from 'lucide-react';
import { calcularDuracionTurno, formatearFechaConDia } from '../utilidades/exportarExcel';

/**
 * Componente Mobile-First que muestra en tiempo real los registros parciales acumulados
 * (como tarjetas compactas en móvil y como tabla en pantallas grandes) y gestiona
 * el módulo de cierre ("Terminar Turno").
 */
const TablaParciales = ({
  turnoActual,
  esDispositivoAutorizado = true,
  alEliminarParcial,
  alTerminarTurno,
  alLimpiarParaNuevoTurno,
  cargandoAccion
}) => {
  const [contadorMaquina, setContadorMaquina] = useState('');
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);
  const [errorCierre, setErrorCierre] = useState('');

  // Limpiar estados locales de cierre cuando cambia o se reinicia el turno
  useEffect(() => {
    setContadorMaquina('');
    setConfirmandoCierre(false);
    setErrorCierre('');
  }, [turnoActual?._id, turnoActual?.estado]);

  const registrosParciales = turnoActual?.registrosParciales || [];
  const turnoCerrado = turnoActual?.estado === 'Cerrado';
  const turnoIniciado = Boolean(turnoActual && turnoActual._id);
  const enModoConsulta = turnoIniciado && !turnoCerrado && !esDispositivoAutorizado;
  const puedeEditar = !turnoCerrado && esDispositivoAutorizado;

  // Sumatoria en tiempo real de las armaduras estabilizadas registradas
  const totalEstabilizadas = registrosParciales.reduce(
    (acumulado, item) => acumulado + (Number(item.cantidad) || 0),
    0
  );

  const ultimaEntrega =
    registrosParciales.length > 0
      ? registrosParciales[registrosParciales.length - 1]
      : null;

  // Cálculo dinámico de diferencia frente al contador de máquina ingresado
  const valorMaquinaActual = turnoCerrado
    ? Number(turnoActual.contadorMaquina) || 0
    : contadorMaquina !== ''
    ? Number(contadorMaquina)
    : null;

  const diferenciaCalculada =
    valorMaquinaActual !== null ? valorMaquinaActual - totalEstabilizadas : null;

  const porcentajeRendimiento =
    valorMaquinaActual && valorMaquinaActual > 0
      ? ((totalEstabilizadas / valorMaquinaActual) * 100).toFixed(1)
      : null;

  // Ejecutar el cierre definitivo del turno
  const manejarCierreDeTurno = async (evento) => {
    evento.preventDefault();
    if (turnoCerrado) return;

    if (!turnoIniciado) {
      setErrorCierre(
        'Primero debe iniciar un turno o registrar al menos un lote antes de cerrar el turno.'
      );
      return;
    }

    const numeroMaquina = Number(contadorMaquina);
    if (
      contadorMaquina === '' ||
      !Number.isFinite(numeroMaquina) ||
      numeroMaquina < 0
    ) {
      setErrorCierre(
        'Ingrese la cantidad total de armaduras que marcó el contador de la máquina.'
      );
      return;
    }

    setErrorCierre('');

    if (!confirmandoCierre) {
      setConfirmandoCierre(true);
      return;
    }

    const cerradoConExito = await alTerminarTurno(Math.round(numeroMaquina));
    if (cerradoConExito) {
      setConfirmandoCierre(false);
      setContadorMaquina('');
    }
  };

  return (
    <div className="space-y-5 w-full">
      {/* =====================================================================
          RESUMEN ACUMULADO EN TIEMPO REAL DEL TURNO ACTUAL
         ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-2xl shadow-md border-b-4 border-emerald-500">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Total Estabilizadas</span>
            <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>
          <p className="text-3xl sm:text-4xl font-black text-emerald-400 mt-1">
            {totalEstabilizadas.toLocaleString('es-ES')}
          </p>
          <span className="text-xs text-slate-300 font-medium">
            Armaduras listas en el turno
          </span>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-md border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Entregas Parciales</span>
            <ClipboardList className="w-4 h-4 text-amber-500 shrink-0" />
          </div>
          <p className="text-3xl sm:text-4xl font-black text-slate-900 mt-1">
            {registrosParciales.length}
          </p>
          <span className="text-xs text-slate-500 font-medium">
            Lotes reportados en la jornada
          </span>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-md border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Último Reporte</span>
            <Clock className="w-4 h-4 text-sky-500 shrink-0" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
            {ultimaEntrega ? ultimaEntrega.hora : '--:--'}
          </p>
          <span className="text-xs text-slate-500 font-medium">
            {ultimaEntrega
              ? `Último lote: +${ultimaEntrega.cantidad} uds.`
              : 'Sin entregas aún'}
          </span>
        </div>
      </div>

      {/* =====================================================================
          REGISTROS PARCIALES ACUMULADOS (TARJETAS EN MÓVIL / TABLA EN ESCRITORIO)
         ===================================================================== */}
      <section className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden w-full">
        <div className="bg-slate-900 text-white px-4 sm:px-5 py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <ClipboardList className="w-5 h-5 text-amber-400 shrink-0" />
            <h2 className="font-bold text-base sm:text-lg tracking-tight">
              Entregas Parciales del Turno
            </h2>
          </div>
          <span className="bg-slate-800 text-amber-300 text-xs font-extrabold px-3 py-1 rounded-full border border-slate-700 shrink-0">
            {registrosParciales.length} lotes
          </span>
        </div>

        {registrosParciales.length === 0 ? (
          <div className="p-8 sm:p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
              <ClipboardList className="w-7 h-7" />
            </div>
            <p className="text-slate-700 font-bold text-base">
              Aún no se han registrado entregas parciales en este turno
            </p>
            <p className="text-slate-500 text-sm mt-1 max-w-md mx-auto">
              A medida que los lotes de armaduras estabilizadas pasen al siguiente
              proceso, regístrelos en el formulario para acumular el conteo en tiempo real.
            </p>
          </div>
        ) : (
          <>
            {/* VISTA MÓVIL: Tarjetas ("Cards") compactas sin scroll lateral */}
            <div className="block md:hidden divide-y divide-slate-200 max-h-[420px] overflow-y-auto">
              {registrosParciales.map((registro, indice) => (
                <div
                  key={registro._id || `${registro.hora}-${indice}`}
                  className="p-4 flex items-start justify-between gap-3 hover:bg-slate-50"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black bg-slate-900 text-white px-2.5 py-1 rounded-lg">
                        Lote #{indice + 1}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        {registro.hora}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 break-words">
                      {registro.observacion ? (
                        <span className="font-medium text-slate-700">
                          {registro.observacion}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">
                          Sin observaciones
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-block font-black text-lg text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
                      +{Number(registro.cantidad).toLocaleString('es-ES')}
                    </span>
                    {puedeEditar && (
                      <button
                        type="button"
                        disabled={cargandoAccion}
                        onClick={() => alEliminarParcial(registro._id)}
                        title="Eliminar este lote parcial"
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition cursor-pointer"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Pie de tarjetas en móvil */}
              <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                  Acumulado Total ({registrosParciales.length} entregas)
                </span>
                <span className="text-lg font-black text-emerald-400">
                  {totalEstabilizadas.toLocaleString('es-ES')} uds.
                </span>
              </div>
            </div>

            {/* VISTA TABLET / ESCRITORIO: Tabla envuelta en overflow-x-auto */}
            <div className="hidden md:block overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 text-slate-600 text-xs font-extrabold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4"># Lote</th>
                    <th className="py-3.5 px-4">Hora Reporte</th>
                    <th className="py-3.5 px-4 text-right">Armaduras Estabilizadas</th>
                    <th className="py-3.5 px-4">Notas / Observaciones</th>
                    {puedeEditar && (
                      <th className="py-3.5 px-4 text-center">Acción</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {registrosParciales.map((registro, indice) => (
                    <tr
                      key={registro._id || `${registro.hora}-${indice}`}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-extrabold text-slate-500">
                        #{indice + 1}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-800 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          {registro.hora}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="inline-block font-black text-base text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
                          +{Number(registro.cantidad).toLocaleString('es-ES')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {registro.observacion ? (
                          <span className="font-medium text-slate-700">
                            {registro.observacion}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">
                            Sin observaciones
                          </span>
                        )}
                      </td>
                      {puedeEditar && (
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            disabled={cargandoAccion}
                            onClick={() => alEliminarParcial(registro._id)}
                            title="Eliminar este lote parcial"
                            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-900 text-white font-extrabold text-sm">
                  <tr>
                    <td colSpan="2" className="py-3.5 px-4 uppercase tracking-wider">
                      Acumulado Total del Turno
                    </td>
                    <td className="py-3.5 px-4 text-right text-lg text-emerald-400">
                      {totalEstabilizadas.toLocaleString('es-ES')} uds.
                    </td>
                    <td colSpan={puedeEditar ? 2 : 1} className="py-3.5 px-4 text-xs text-slate-300">
                      {registrosParciales.length} entregas consolidadas
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </section>

      {/* =====================================================================
          SECCIÓN 3: CIERRE DE TURNO ("TERMINAR TURNO") Y CONTADOR DE MÁQUINA
          (OCULTO EN MODO CONSULTA PARA EVITAR CIERRE DESDE OTROS DISPOSITIVOS)
         ===================================================================== */}
      {!enModoConsulta && (
        <section className="bg-white rounded-2xl shadow-lg border-2 border-amber-500 overflow-hidden w-full">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Gauge className="w-5 h-5 text-amber-400 shrink-0" />
              <h2 className="font-bold text-base sm:text-lg tracking-tight">
                3. Cierre de Turno y Comparativa de Máquina
              </h2>
            </div>
            {turnoCerrado ? (
              <span className="inline-flex items-center gap-1.5 bg-emerald-500 text-slate-950 text-xs font-black px-3 py-1 rounded-full">
                <CheckCircle2 className="w-4 h-4" /> CONSOLIDADO GUARDADO
              </span>
            ) : (
              <span className="text-xs text-amber-300 font-semibold">
                Verificación al finalizar jornada
              </span>
            )}
          </div>

          {turnoCerrado ? (
            /* Vista bloqueada cuando el turno ha sido cerrado exitosamente */
            <div className="p-4 sm:p-6 bg-slate-50 space-y-5">
              <div className="bg-emerald-50 border-2 border-emerald-500 rounded-2xl p-4 flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-extrabold text-emerald-950 text-base">
                    Turno Cerrado y Registrado en Base de Datos ({formatearFechaConDia(turnoActual.fecha)})
                  </h3>
                  <p className="text-sm text-emerald-800 mt-0.5">
                    La edición de este turno ha sido bloqueada. Todos los registros parciales,
                    totales, marcas de tiempo y diferencias quedaron almacenados para auditoría de supervisión.
                  </p>
                </div>
              </div>

              {/* Marcas de tiempo de Apertura, Cierre y Tiempo Total Trabajado */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center gap-3">
                  <Clock className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <span className="text-[11px] font-bold uppercase text-slate-400 block">
                      Hora de Apertura
                    </span>
                    <span className="text-base font-black text-slate-800">
                      {turnoActual.horaApertura || '--:--'}
                    </span>
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center gap-3">
                  <Clock className="w-5 h-5 text-amber-600 shrink-0" />
                  <div>
                    <span className="text-[11px] font-bold uppercase text-slate-400 block">
                      Hora de Cierre
                    </span>
                    <span className="text-base font-black text-slate-800">
                      {turnoActual.horaCierre || '--:--'}
                    </span>
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center gap-3">
                  <Clock className="w-5 h-5 text-sky-600 shrink-0" />
                  <div>
                    <span className="text-[11px] font-bold uppercase text-slate-400 block">
                      Tiempo Trabajado
                    </span>
                    <span className="text-base font-black text-sky-700">
                      {calcularDuracionTurno(turnoActual)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold uppercase text-slate-500">
                    Contador de Máquina
                  </span>
                  <p className="text-2xl font-black text-slate-900 mt-1">
                    {Number(turnoActual.contadorMaquina).toLocaleString('es-ES')} uds.
                  </p>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold uppercase text-slate-500">
                    Total Estabilizadas
                  </span>
                  <p className="text-2xl font-black text-emerald-600 mt-1">
                    {Number(turnoActual.totalEstabilizadas).toLocaleString('es-ES')} uds.
                  </p>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold uppercase text-slate-500">
                    Diferencia / Merma
                  </span>
                  <p
                    className={`text-2xl font-black mt-1 ${
                      turnoActual.diferencia > 0
                        ? 'text-amber-600'
                        : turnoActual.diferencia < 0
                        ? 'text-sky-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {turnoActual.diferencia > 0 ? `+${turnoActual.diferencia}` : turnoActual.diferencia}{' '}
                    uds.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={alLimpiarParaNuevoTurno}
                className="w-full min-h-[54px] py-4 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-base sm:text-lg shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-5 h-5 text-amber-400 shrink-0" />
                <span>Limpiar Vista e Iniciar Siguiente Turno</span>
              </button>
            </div>
          ) : (
            /* Formulario de cierre de turno */
            <form onSubmit={manejarCierreDeTurno} className="p-4 sm:p-5 space-y-5">
              {errorCierre && (
                <div className="bg-rose-50 border-l-4 border-rose-600 p-3.5 rounded-xl text-rose-800 text-sm sm:text-base font-semibold">
                  {errorCierre}
                </div>
              )}

              <div>
                <label
                  htmlFor="campo-contador-maquina"
                  className="block text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-700 mb-1.5"
                >
                  Cantidad Total de Armaduras que Marcó / Realizó la Máquina *
                </label>
                <input
                  id="campo-contador-maquina"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  placeholder="Ingrese lectura final de máquina (ej. 320)"
                  value={contadorMaquina}
                  disabled={!turnoIniciado || cargandoAccion}
                  onChange={(e) => {
                    setContadorMaquina(e.target.value);
                    setConfirmandoCierre(false);
                  }}
                  required
                  className="w-full min-h-[52px] rounded-xl border-2 border-slate-300 px-4 py-3 text-xl font-black text-slate-900 placeholder:text-slate-400 placeholder:text-base placeholder:font-normal focus:border-amber-500 focus:outline-none disabled:bg-slate-100"
                />
              </div>

              {/* Previsualización automática de cálculos antes de cerrar */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center sm:text-left">
                <div>
                  <span className="text-xs font-bold uppercase text-slate-400 block">
                    Suma Estabilizadas
                  </span>
                  <span className="text-lg font-black text-emerald-700">
                    {totalEstabilizadas.toLocaleString('es-ES')} uds.
                  </span>
                </div>

                <div>
                  <span className="text-xs font-bold uppercase text-slate-400 block">
                    Diferencia / Merma
                  </span>
                  <span
                    className={`text-lg font-black ${
                      diferenciaCalculada === null
                        ? 'text-slate-400'
                        : diferenciaCalculada > 0
                        ? 'text-amber-600'
                        : diferenciaCalculada < 0
                        ? 'text-rose-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {diferenciaCalculada === null
                      ? 'Pendiente'
                      : `${diferenciaCalculada > 0 ? '+' : ''}${diferenciaCalculada.toLocaleString(
                          'es-ES'
                        )} uds.`}
                  </span>
                </div>

                <div>
                  <span className="text-xs font-bold uppercase text-slate-400 block">
                    Rendimiento Efectivo
                  </span>
                  <span className="text-lg font-black text-slate-800">
                    {porcentajeRendimiento !== null ? `${porcentajeRendimiento}%` : '--%'}
                  </span>
                </div>
              </div>

              {/* Alerta de confirmación previa al cierre definitivo (solo datos operativos de producción) */}
              {confirmandoCierre && (
                <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 text-amber-950 space-y-3">
                  <div className="flex items-center gap-2 font-extrabold text-sm sm:text-base">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <span>¿Confirmar el cierre definitivo del {turnoActual?.tipoTurno}?</span>
                  </div>
                  <p className="text-xs sm:text-sm text-amber-900">
                    Se registrarán <strong>{contadorMaquina}</strong> armaduras producidas por la máquina y{' '}
                    <strong>{totalEstabilizadas}</strong> armaduras estabilizadas (Diferencia / Merma:{' '}
                    <strong>{diferenciaCalculada > 0 ? `+${diferenciaCalculada}` : diferenciaCalculada}</strong> uds., Hora de apertura:{' '}
                    <strong>{turnoActual?.horaApertura || '--:--'}</strong>). Una vez cerrado, el turno no podrá editarse.
                  </p>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setConfirmandoCierre(false)}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-white border border-amber-300 text-sm font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      Revisar datos
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={!turnoIniciado || cargandoAccion}
                className={`w-full min-h-[54px] py-4 px-6 rounded-xl font-black text-base sm:text-lg shadow-lg transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 ${
                  confirmandoCierre
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/25'
                    : 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 shadow-amber-500/25'
                }`}
              >
                {confirmandoCierre ? (
                  <>
                    <Lock className="w-5 h-5 shrink-0" />
                    <span>Confirmar y Bloquear Cierre de Turno</span>
                  </>
                ) : (
                  <>
                    <ArrowRightCircle className="w-6 h-6 shrink-0" />
                    <span>Terminar Turno</span>
                  </>
                )}
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
};

export default TablaParciales;
