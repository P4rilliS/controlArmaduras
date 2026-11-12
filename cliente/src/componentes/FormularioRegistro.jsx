import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  PlusCircle,
  UserCheck,
  UserX,
  PackagePlus,
  Check,
  Lock,
  Sparkles,
  RotateCcw,
  Clock,
  Eye,
  Smartphone
} from 'lucide-react';
import {
  obtenerFechaLocalISO,
  formatearFechaLegible,
  calcularDuracionTurno,
  obtenerPuestosNormalizadosTurno,
  obtenerResumenEquipoTurno
} from '../utilidades/exportarExcel';

/**
 * Nómina cerrada fija de los 6 trabajadores autorizados en planta.
 */
export const NOMINA_TRABAJADORES = [
  'William',
  'Leonardo',
  'Antoni',
  'Yervin',
  'Antonio',
  'Wilkerman'
];

/**
 * Genera automáticamente la hora exacta del momento del envío en formato legible de 12 horas.
 */
export const obtenerHoraAutomatica = () => {
  const ahora = new Date();
  return ahora.toLocaleTimeString('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

/**
 * Obtiene la fecha local actual en formato YYYY-MM-DD.
 */
export const obtenerFechaHoyISO = () => obtenerFechaLocalISO(new Date());

/**
 * Componente modular Mobile-First que gestiona:
 * 1. Apertura flexible de turno por puestos independientes:
 *    - 1. Máquina (Encargado)
 *    - 2. Anillador
 *    - 3. Estabilizador
 *    Cualquiera de los tres puestos puede marcarse como "[-- No vino / Sin asignar --]"
 *    y el turno se abre con al menos 1 trabajador presente.
 * 2. Registro Parcial / Continuo de lotes de armaduras estabilizadas con hora automática.
 */
const FormularioRegistro = ({
  turnoActual,
  esDispositivoAutorizado = true,
  alReclamarControlDispositivo,
  alIniciarOActualizarTurno,
  alAgregarParcial,
  cargandoAccion
}) => {
  const turnoCerrado = turnoActual?.estado === 'Cerrado';
  const turnoIniciado = Boolean(turnoActual && turnoActual._id);
  const enModoConsulta = turnoIniciado && !turnoCerrado && !esDispositivoAutorizado;

  // Estados para el tipo de turno y los 3 puestos esenciales de la línea operativa
  const [tipoTurno, setTipoTurno] = useState('Primer Turno');
  const [trabajadorMaquina, setTrabajadorMaquina] = useState('');
  const [trabajadorAnillador, setTrabajadorAnillador] = useState('');
  const [trabajadorEstabilizador, setTrabajadorEstabilizador] = useState('');

  // Estado para el formulario de entrega parcial de armaduras estabilizadas
  const [cantidadParcial, setCantidadParcial] = useState('');
  const [observacionParcial, setObservacionParcial] = useState('');
  const [errorFormulario, setErrorFormulario] = useState('');

  // Función auxiliar para restaurar los campos desde el turno activo
  const sincronizarCamposConTurno = useCallback((turno) => {
    if (turno) {
      const { puestoMaquina, puestoAnillador, puestoEstabilizador } =
        obtenerPuestosNormalizadosTurno(turno);
      setTipoTurno(turno.tipoTurno || 'Primer Turno');
      setTrabajadorMaquina(
        puestoMaquina.asistio && puestoMaquina.trabajador ? puestoMaquina.trabajador : ''
      );
      setTrabajadorAnillador(
        puestoAnillador.asistio && puestoAnillador.trabajador ? puestoAnillador.trabajador : ''
      );
      setTrabajadorEstabilizador(
        puestoEstabilizador.asistio && puestoEstabilizador.trabajador
          ? puestoEstabilizador.trabajador
          : ''
      );
    } else {
      setTipoTurno('Primer Turno');
      setTrabajadorMaquina('');
      setTrabajadorAnillador('');
      setTrabajadorEstabilizador('');
    }
  }, []);

  // Sincronizar campos cuando cambia el turno activo cargado
  useEffect(() => {
    sincronizarCamposConTurno(turnoActual);
    setErrorFormulario('');
  }, [
    turnoActual?._id,
    turnoActual?.tipoTurno,
    turnoActual?.encargado,
    turnoActual?.estado,
    sincronizarCamposConTurno,
    turnoActual
  ]);

  // Verifica si al menos un puesto tiene un trabajador seleccionado
  const trabajadoresPresentesLista = [
    trabajadorMaquina,
    trabajadorAnillador,
    trabajadorEstabilizador
  ]
    .map((t) => t.trim())
    .filter(Boolean);

  const hayAlMenosUnPresente = trabajadoresPresentesLista.length > 0;

  // Construye el payload estructurado de los 3 puestos manteniendo compatibilidad hacia atrás
  const construirPayloadTurno = () => {
    const maqLimpio = trabajadorMaquina.trim() || null;
    const aniLimpio = trabajadorAnillador.trim() || null;
    const estLimpio = trabajadorEstabilizador.trim() || null;

    return {
      tipoTurno,
      puestoMaquina: {
        trabajador: maqLimpio,
        asistio: Boolean(maqLimpio),
        tarifa: 0.35
      },
      puestoAnillador: {
        trabajador: aniLimpio,
        asistio: Boolean(aniLimpio),
        tarifa: 0.30
      },
      puestoEstabilizador: {
        trabajador: estLimpio,
        asistio: Boolean(estLimpio),
        tarifa: 0.30
      },
      encargado: maqLimpio,
      operadores: [aniLimpio, estLimpio].filter(Boolean)
    };
  };

  // Validar los campos del turno y las reglas de negocio del personal
  const validarDatosTurno = () => {
    if (!tipoTurno || !['Primer Turno', 'Segundo Turno'].includes(tipoTurno)) {
      setErrorFormulario('Seleccione obligatoriamente Primer Turno o Segundo Turno.');
      return false;
    }

    if (trabajadoresPresentesLista.length === 0) {
      setErrorFormulario(
        'Debe haber al menos un trabajador presente seleccionado en alguno de los 3 puestos para iniciar el turno.'
      );
      return false;
    }

    for (const nombre of trabajadoresPresentesLista) {
      if (!NOMINA_TRABAJADORES.includes(nombre)) {
        setErrorFormulario(
          `El trabajador "${nombre}" no pertenece a la nómina autorizada de planta.`
        );
        return false;
      }
    }

    if (new Set(trabajadoresPresentesLista).size !== trabajadoresPresentesLista.length) {
      setErrorFormulario(
        'Una misma persona presente no puede ocupar dos puestos distintos simultáneamente.'
      );
      return false;
    }

    setErrorFormulario('');
    return true;
  };

  // Opciones disponibles para cada selector evitando duplicar personas ya elegidas en otro puesto
  const opcionesParaMaquina = NOMINA_TRABAJADORES.filter(
    (persona) => persona !== trabajadorAnillador && persona !== trabajadorEstabilizador
  );

  const opcionesParaAnillador = NOMINA_TRABAJADORES.filter(
    (persona) => persona !== trabajadorMaquina && persona !== trabajadorEstabilizador
  );

  const opcionesParaEstabilizador = NOMINA_TRABAJADORES.filter(
    (persona) => persona !== trabajadorMaquina && persona !== trabajadorAnillador
  );

  // Manejar inicio de turno (la fecha y hora de apertura se registran automáticamente)
  const manejarGuardarTurno = async (evento) => {
    evento.preventDefault();
    if (turnoIniciado) {
      setErrorFormulario(
        'No se puede iniciar un nuevo turno: ya existe un turno activo en planta. Debe ser cerrado primero.'
      );
      return;
    }
    if (!validarDatosTurno()) return;

    await alIniciarOActualizarTurno(construirPayloadTurno());
  };

  // Manejar envío de un lote parcial capturando la hora exacta de forma automática y transparente
  const manejarEnvioParcial = async (evento) => {
    evento.preventDefault();
    if (turnoCerrado || enModoConsulta) return;

    const numeroCantidad = Number(cantidadParcial);
    if (!Number.isFinite(numeroCantidad) || numeroCantidad <= 0) {
      setErrorFormulario(
        'Ingrese una cantidad válida de armaduras estabilizadas (mayor a 0).'
      );
      return;
    }

    // Si aún no había iniciado el turno, validamos los datos del personal para iniciarlo
    if (!turnoIniciado) {
      if (!validarDatosTurno()) return;
    }

    setErrorFormulario('');

    const horaAutomatica = obtenerHoraAutomatica();
    const datosCabecera = construirPayloadTurno();

    const registrado = await alAgregarParcial(
      {
        cantidad: Math.round(numeroCantidad),
        hora: horaAutomatica,
        observacion: observacionParcial.trim()
      },
      datosCabecera
    );

    if (registrado) {
      setCantidadParcial('');
      setObservacionParcial('');
    }
  };

  // Sumar cantidades rápidas con botones táctiles
  const sumarCantidadRapida = (incremento) => {
    if (turnoCerrado) return;
    const actual = Number(cantidadParcial) || 0;
    setCantidadParcial(String(actual + incremento));
  };

  const notasRapidas = [
    'Lote estándar verificado',
    'Paso directo a siguiente proceso',
    'Ajuste menor en línea',
    'Revisión de calidad aprobada'
  ];

  const puestosTurnoActual = obtenerPuestosNormalizadosTurno(turnoActual);
  const resumenEquipoActivo = obtenerResumenEquipoTurno(turnoActual);

  return (
    <div className="space-y-5 w-full">
      {/* Mensaje de error de validación si existe */}
      {errorFormulario && (
        <div className="bg-rose-50 border-l-4 border-rose-600 p-4 rounded-xl shadow-sm text-rose-800 text-sm sm:text-base font-semibold flex items-center justify-between gap-2">
          <span>{errorFormulario}</span>
          <button
            type="button"
            onClick={() => setErrorFormulario('')}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-rose-600 hover:text-rose-900 font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* =====================================================================
          SECCIÓN 1: CABECERA DEL TURNO ACTIVO (BLOQUEA APERTURA SI YA HAY UNO)
          O FORMULARIO DE APERTURA (SOLO SI NO HAY TURNO ACTIVO EN PLANTA)
         ===================================================================== */}
      <section className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden w-full">
        <div className="bg-slate-900 text-white px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-amber-400 shrink-0" />
            <h2 className="font-bold text-base sm:text-lg tracking-tight">
              {turnoIniciado
                ? '1. Turno Activo en Planta'
                : '1. Apertura de Turno y Puestos de Línea'}
            </h2>
          </div>

          {turnoIniciado && !turnoCerrado && (
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold bg-emerald-500/20 text-emerald-300 px-3 py-1.5 rounded-full border border-emerald-500/30">
              <Clock className="w-3.5 h-3.5 animate-pulse" />
              En Progreso
            </span>
          )}

          {turnoCerrado && (
            <span className="inline-flex items-center gap-1 text-xs font-bold bg-rose-500/20 text-rose-300 px-3 py-1.5 rounded-full border border-rose-500/30">
              <Lock className="w-3.5 h-3.5" /> Turno Cerrado
            </span>
          )}
        </div>

        {/* Si ya hay un turno activo en planta, se bloquea el formulario de apertura
            y se muestra directamente la información de los 3 puestos y la Hora de Inicio */}
        {turnoIniciado ? (
          <div className="p-4 sm:p-5 bg-slate-50/70 space-y-4">
            {/* Banner de Hora de Inicio y Fecha del Turno Activo */}
            <div className="bg-slate-900 text-white p-4 rounded-xl border-l-4 border-emerald-400 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 block">
                  Hora de Inicio del Turno
                </span>
                <p className="text-xl sm:text-2xl font-black text-white mt-0.5 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>{turnoActual.horaApertura || 'Registrada'}</span>
                </p>
              </div>
              <div className="text-left sm:text-right">
                <span className="text-xs font-bold text-amber-300 block">
                  {turnoActual.tipoTurno}
                </span>
                <span className="text-xs text-slate-300">
                  Fecha: {formatearFechaLegible(turnoActual.fecha)} · Duración:{' '}
                  <strong>{calcularDuracionTurno(turnoActual)}</strong>
                </span>
              </div>
            </div>

            {/* Estado de Asistencia de los 3 Puestos Esenciales */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Puesto 1: Máquina (Encargado) */}
              <div
                className={`p-3 rounded-xl border ${
                  puestosTurnoActual.puestoMaquina.asistio &&
                  puestosTurnoActual.puestoMaquina.trabajador
                    ? 'bg-amber-50/80 border-amber-200'
                    : 'bg-slate-100 border-slate-200'
                }`}
              >
                <span className="text-[11px] font-extrabold uppercase text-slate-500 block">
                  1. Máquina
                </span>
                {puestosTurnoActual.puestoMaquina.asistio &&
                puestosTurnoActual.puestoMaquina.trabajador ? (
                  <p className="text-sm sm:text-base font-black text-slate-900 mt-1 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{puestosTurnoActual.puestoMaquina.trabajador}</span>
                  </p>
                ) : (
                  <p className="text-xs font-bold text-rose-700 mt-1 flex items-center gap-1">
                    <UserX className="w-3.5 h-3.5 shrink-0" />
                    <span>Falta / No asistió</span>
                  </p>
                )}
              </div>

              {/* Puesto 2: Anillador */}
              <div
                className={`p-3 rounded-xl border ${
                  puestosTurnoActual.puestoAnillador.asistio &&
                  puestosTurnoActual.puestoAnillador.trabajador
                    ? 'bg-sky-50/80 border-sky-200'
                    : 'bg-slate-100 border-slate-200'
                }`}
              >
                <span className="text-[11px] font-extrabold uppercase text-slate-500 block">
                  2. Anillador
                </span>
                {puestosTurnoActual.puestoAnillador.asistio &&
                puestosTurnoActual.puestoAnillador.trabajador ? (
                  <p className="text-sm sm:text-base font-black text-slate-900 mt-1 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-sky-600 shrink-0" />
                    <span>{puestosTurnoActual.puestoAnillador.trabajador}</span>
                  </p>
                ) : (
                  <p className="text-xs font-bold text-slate-500 mt-1 flex items-center gap-1">
                    <UserX className="w-3.5 h-3.5 shrink-0" />
                    <span>Falta / Sin asignar</span>
                  </p>
                )}
              </div>

              {/* Puesto 3: Estabilizador */}
              <div
                className={`p-3 rounded-xl border ${
                  puestosTurnoActual.puestoEstabilizador.asistio &&
                  puestosTurnoActual.puestoEstabilizador.trabajador
                    ? 'bg-emerald-50/80 border-emerald-200'
                    : 'bg-slate-100 border-slate-200'
                }`}
              >
                <span className="text-[11px] font-extrabold uppercase text-slate-500 block">
                  3. Estabilizador
                </span>
                {puestosTurnoActual.puestoEstabilizador.asistio &&
                puestosTurnoActual.puestoEstabilizador.trabajador ? (
                  <p className="text-sm sm:text-base font-black text-slate-900 mt-1 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{puestosTurnoActual.puestoEstabilizador.trabajador}</span>
                  </p>
                ) : (
                  <p className="text-xs font-bold text-slate-500 mt-1 flex items-center gap-1">
                    <UserX className="w-3.5 h-3.5 shrink-0" />
                    <span>Falta / Sin asignar</span>
                  </p>
                )}
              </div>
            </div>

            {!turnoCerrado && (
              <div
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs font-semibold px-3.5 py-3 rounded-xl border ${
                  esDispositivoAutorizado
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    : 'bg-amber-50 text-amber-950 border-amber-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {esDispositivoAutorizado ? (
                    <>
                      <Smartphone className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        Dispositivo autorizado con control activo de este turno.
                      </span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>
                        Modo Consulta (Solo Lectura): Este dispositivo no tiene permisos de edición.
                      </span>
                    </>
                  )}
                </div>

                {!esDispositivoAutorizado && alReclamarControlDispositivo && (
                  <button
                    type="button"
                    disabled={cargandoAccion}
                    onClick={alReclamarControlDispositivo}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold text-xs transition cursor-pointer shrink-0"
                  >
                    Reclamar control en este dispositivo
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Formulario de Apertura de Turno con los 3 Puestos Esenciales */
          <form onSubmit={manejarGuardarTurno} className="p-4 sm:p-5 space-y-5">
            {/* Selector Obligatorio de Turno */}
            <div>
              <label className="block text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-600 mb-2">
                Selector Obligatorio de Turno *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {['Primer Turno', 'Segundo Turno'].map((opcion) => {
                  const activo = tipoTurno === opcion;
                  return (
                    <button
                      key={opcion}
                      type="button"
                      onClick={() => setTipoTurno(opcion)}
                      className={`min-h-[52px] py-3 px-4 rounded-xl font-extrabold text-base border-2 transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        activo
                          ? 'bg-amber-500 border-amber-600 text-slate-950 shadow-md'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span>{opcion}</span>
                      {activo && <Check className="w-5 h-5 stroke-[2.5]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 1. Puesto Máquina (Encargado) */}
            <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="campo-puesto-maquina"
                  className="block text-xs sm:text-sm font-extrabold uppercase tracking-wider text-amber-900"
                >
                  1. Máquina (Encargado)
                </label>
                <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                  {trabajadorMaquina ? 'Asistió' : 'Sin asignar / Falta'}
                </span>
              </div>
              <select
                id="campo-puesto-maquina"
                value={trabajadorMaquina}
                onChange={(e) => setTrabajadorMaquina(e.target.value)}
                className="w-full min-h-[50px] rounded-xl border-2 border-amber-300 bg-white px-4 py-3 text-base font-bold text-slate-900 focus:border-amber-600 focus:outline-none cursor-pointer"
              >
                <option value="">[-- No vino / Sin asignar --]</option>
                {opcionesParaMaquina.map((nombre) => (
                  <option key={nombre} value={nombre}>
                    {nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Puesto Anillador y 3. Puesto Estabilizador */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="campo-puesto-anillador"
                    className="block text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-700"
                  >
                    2. Anillador
                  </label>
                  <span className="text-[10px] font-bold text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded">
                    {trabajadorAnillador ? 'Asistió' : 'Falta'}
                  </span>
                </div>
                <select
                  id="campo-puesto-anillador"
                  value={trabajadorAnillador}
                  onChange={(e) => setTrabajadorAnillador(e.target.value)}
                  className="w-full min-h-[48px] rounded-xl border-2 border-slate-300 bg-white px-3.5 py-2.5 text-base font-semibold text-slate-800 focus:border-amber-500 focus:outline-none cursor-pointer"
                >
                  <option value="">[-- No vino / Sin asignar --]</option>
                  {opcionesParaAnillador.map((nombre) => (
                    <option key={nombre} value={nombre}>
                      {nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="campo-puesto-estabilizador"
                    className="block text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-700"
                  >
                    3. Estabilizador
                  </label>
                  <span className="text-[10px] font-bold text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded">
                    {trabajadorEstabilizador ? 'Asistió' : 'Falta'}
                  </span>
                </div>
                <select
                  id="campo-puesto-estabilizador"
                  value={trabajadorEstabilizador}
                  onChange={(e) => setTrabajadorEstabilizador(e.target.value)}
                  className="w-full min-h-[48px] rounded-xl border-2 border-slate-300 bg-white px-3.5 py-2.5 text-base font-semibold text-slate-800 focus:border-amber-500 focus:outline-none cursor-pointer"
                >
                  <option value="">[-- No vino / Sin asignar --]</option>
                  {opcionesParaEstabilizador.map((nombre) => (
                    <option key={nombre} value={nombre}>
                      {nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-xs text-slate-500 font-medium">
              * Seleccione al menos un trabajador presente (1, 2 o los 3 puestos). Quien abra el turno registrará el control activo en este dispositivo.
            </p>

            <button
              type="submit"
              disabled={cargandoAccion || !hayAlMenosUnPresente}
              className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-base shadow-md transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <UserCheck className="w-5 h-5 text-amber-400 shrink-0" />
              <span>Iniciar Turno de Producción</span>
            </button>
          </form>
        )}
      </section>

      {/* =====================================================================
          SECCIÓN 2: REGISTRO PARCIAL / CONTINUO DE ARMADURAS ESTABILIZADAS
          (OCULTO / BLOQUEADO EN DISPOSITIVOS EN MODO CONSULTA)
         ===================================================================== */}
      {enModoConsulta ? (
        <section className="bg-white rounded-2xl shadow-md border-2 border-amber-300 overflow-hidden w-full">
          <div className="bg-slate-900 text-white px-4 sm:px-5 py-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Lock className="w-5 h-5 text-amber-400 shrink-0" />
              <h2 className="font-bold text-base sm:text-lg tracking-tight">
                2. Controles de Registro Bloqueados
              </h2>
            </div>
            <span className="text-xs font-extrabold bg-amber-500/20 text-amber-300 px-3 py-1 rounded-full border border-amber-500/30">
              Solo Lectura
            </span>
          </div>

          <div className="p-5 sm:p-6 bg-amber-50/40 space-y-4">
            <p className="text-sm sm:text-base font-semibold text-slate-800 leading-relaxed">
              👀 <strong>Modo Consulta:</strong> Turno activo con el equipo{' '}
              <strong className="text-amber-800">{resumenEquipoActivo}</strong>. Los controles de
              registro están bloqueados en este dispositivo para evitar modificaciones accidentales
              desde otros teléfonos o computadoras en planta.
            </p>
            <p className="text-xs sm:text-sm text-slate-600">
              Puede supervisar en tiempo real todas las entregas parciales y métricas acumuladas en
              el panel derecho. Si cambió de teléfono o necesita hacer un relevo de emergencia, puede
              transferir el control a este dispositivo:
            </p>

            {alReclamarControlDispositivo && (
              <div className="pt-1">
                <button
                  type="button"
                  disabled={cargandoAccion}
                  onClick={alReclamarControlDispositivo}
                  className="w-full sm:w-auto min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs sm:text-sm border border-slate-700 shadow-sm transition cursor-pointer"
                >
                  Reclamar control en este dispositivo
                </button>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden w-full">
          <div className="bg-slate-900 text-white px-4 sm:px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <PackagePlus className="w-5 h-5 text-emerald-400 shrink-0" />
              <h2 className="font-bold text-base sm:text-lg tracking-tight">
                2. Registro Parcial de Armaduras Estabilizadas
              </h2>
            </div>
          </div>

          <form onSubmit={manejarEnvioParcial} className="p-4 sm:p-5 space-y-5">
            {/* Cantidad de Armaduras Estabilizadas + Botones Táctiles Rápidos */}
            <div>
              <label
                htmlFor="campo-cantidad-parcial"
                className="block text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-600 mb-1.5"
              >
                Cantidad de Armaduras Estabilizadas Pasadas *
              </label>
              <input
                id="campo-cantidad-parcial"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                placeholder="Ingrese cantidad del lote (ej. 45)"
                value={cantidadParcial}
                disabled={turnoCerrado}
                onChange={(e) => setCantidadParcial(e.target.value)}
                required
                className="w-full min-h-[52px] rounded-xl border-2 border-slate-300 px-4 py-3 text-xl font-extrabold text-slate-900 placeholder:text-slate-400 placeholder:text-base placeholder:font-normal focus:border-emerald-600 focus:outline-none"
              />

              {/* Botonera táctil para incremento rápido en pantalla industrial */}
              <div className="mt-3">
                <span className="text-xs font-bold text-slate-500 block mb-2">
                  Suma rápida táctil (para uso con guantes):
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[5, 10, 25, 50, 100].map((valor) => (
                    <button
                      key={valor}
                      type="button"
                      disabled={turnoCerrado}
                      onClick={() => sumarCantidadRapida(valor)}
                      className="min-h-[48px] py-2.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-800 border border-emerald-300 font-extrabold text-base transition cursor-pointer disabled:opacity-40"
                    >
                      +{valor}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={turnoCerrado || !cantidadParcial}
                    onClick={() => setCantidadParcial('')}
                    className="min-h-[48px] py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <RotateCcw className="w-4 h-4 shrink-0" />
                    <span>Limpiar</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Notas / Observaciones Opcionales */}
            <div>
              <label
                htmlFor="campo-observacion-parcial"
                className="block text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-600 mb-1.5"
              >
                Notas u Observaciones de la Entrega (Opcional)
              </label>
              <textarea
                id="campo-observacion-parcial"
                rows="2"
                placeholder="Ej. Lote estabilizado completo sin contratiempos..."
                value={observacionParcial}
                disabled={turnoCerrado}
                onChange={(e) => setObservacionParcial(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-base font-medium text-slate-800 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
              />

              {/* Etiquetas rápidas de observación */}
              <div className="mt-2.5 flex flex-wrap gap-2">
                {notasRapidas.map((nota) => (
                  <button
                    key={nota}
                    type="button"
                    disabled={turnoCerrado}
                    onClick={() => setObservacionParcial(nota)}
                    className="min-h-[40px] text-xs sm:text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl font-semibold transition cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>{nota}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Botón de Registro de Entrega Parcial (registra hora automáticamente al enviar) */}
            <button
              type="submit"
              disabled={turnoCerrado || cargandoAccion}
              className="w-full min-h-[54px] py-4 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold text-base sm:text-lg shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
            >
              <PlusCircle className="w-6 h-6 shrink-0" />
              <span>Registrar Armaduras</span>
            </button>
          </form>
        </section>
      )}
    </div>
  );
};

export default FormularioRegistro;
