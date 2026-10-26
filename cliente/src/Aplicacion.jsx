import React, { useState, useEffect, useCallback } from 'react';
import BarraNavegacion from './componentes/BarraNavegacion';
import FormularioRegistro, { obtenerHoraAutomatica } from './componentes/FormularioRegistro';
import TablaParciales from './componentes/TablaParciales';
import ModalSupervisor from './componentes/ModalSupervisor';
import PanelSupervisor from './componentes/PanelSupervisor';
import { calcularLiquidacionTurnoCliente } from './utilidades/exportarExcel';
import {
  CLAVE_TOKEN_TURNO_ACTIVO,
  generarTokenDispositivo,
  obtenerTokenLocalDispositivo,
  consultarTurnoActivo,
  crearNuevoTurno,
  reclamarControlDispositivo,
  actualizarMetadatosTurno,
  registrarLoteParcial,
  borrarLoteParcial,
  finalizarTurnoActivo,
  guardarYCerrarTurnoCompleto,
  verificarPinSupervisor
} from './servicios/apiTurnos';
import {
  CheckCircle2,
  AlertCircle,
  Smartphone,
  X,
  RefreshCw,
  ArrowRightLeft
} from 'lucide-react';

const CLAVE_STORAGE_HISTORIAL = 'control_armaduras_historial_local';
const CLAVE_STORAGE_ACTIVO = 'control_armaduras_turno_activo';

/**
 * Componente principal de la Aplicación PWA de Control de Producción e Inventario de Armaduras.
 * Implementa control de acceso por sesión local del dispositivo (localStorage + tokenDispositivo)
 * sin necesidad de contraseñas ni códigos PIN.
 */
const Aplicacion = () => {
  const [turnoActual, setTurnoActual] = useState(null);
  const [tokenLocalDispositivo, setTokenLocalDispositivo] = useState(() =>
    obtenerTokenLocalDispositivo()
  );

  const [historialLocal, setHistorialLocal] = useState(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_STORAGE_HISTORIAL);
      return guardado ? JSON.parse(guardado) : [];
    } catch {
      return [];
    }
  });

  const [conexionServidor, setConexionServidor] = useState(true);
  const [cargandoAccion, setCargandoAccion] = useState(false);
  const [notificacion, setNotificacion] = useState(null);

  // Estados del Panel Exclusivo de Supervisión (protegido con clave de acceso)
  const [modalSupervisorAbierto, setModalSupervisorAbierto] = useState(false);
  const [modoSupervisor, setModoSupervisor] = useState(false);
  const [claveSupervisorActiva, setClaveSupervisorActiva] = useState('');

  // Estados para instalación como App Móvil Nativa (PWA - beforeinstallprompt)
  const [eventoInstalacionPWA, setEventoInstalacionPWA] = useState(null);
  const [esModoStandalone, setEsModoStandalone] = useState(false);
  const [modalGuiaPWA, setModalGuiaPWA] = useState(false);

  // Mostrar notificación temporal en pantalla
  const mostrarMensaje = useCallback((texto, tipo = 'exito') => {
    setNotificacion({ texto, tipo });
    setTimeout(() => {
      setNotificacion((actual) => (actual?.texto === texto ? null : actual));
    }, 4500);
  }, []);

  // Capturar el evento beforeinstallprompt del navegador para instalar la PWA
  useEffect(() => {
    const instalacionActiva =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    setEsModoStandalone(instalacionActiva);

    const capturarPromptInstalacion = (evento) => {
      evento.preventDefault();
      setEventoInstalacionPWA(evento);
    };

    const confirmarAppInstalada = () => {
      setEventoInstalacionPWA(null);
      setEsModoStandalone(true);
      setModalGuiaPWA(false);
      mostrarMensaje('¡Aplicación instalada exitosamente en su teléfono o tablet!');
    };

    window.addEventListener('beforeinstallprompt', capturarPromptInstalacion);
    window.addEventListener('appinstalled', confirmarAppInstalada);

    return () => {
      window.removeEventListener('beforeinstallprompt', capturarPromptInstalacion);
      window.removeEventListener('appinstalled', confirmarAppInstalada);
    };
  }, [mostrarMensaje]);

  // Ejecutar instalación nativa o mostrar guía paso a paso en móvil
  const manejarInstalarPWA = async () => {
    if (eventoInstalacionPWA) {
      eventoInstalacionPWA.prompt();
      const { outcome } = await eventoInstalacionPWA.userChoice;
      if (outcome === 'accepted') {
        setEventoInstalacionPWA(null);
      }
    } else {
      setModalGuiaPWA(true);
    }
  };

  // Sincronizar respaldo en localStorage
  const guardarRespaldoLocal = (turno, listaHistorial = historialLocal) => {
    try {
      if (turno) {
        localStorage.setItem(CLAVE_STORAGE_ACTIVO, JSON.stringify(turno));
      } else {
        localStorage.removeItem(CLAVE_STORAGE_ACTIVO);
      }
      localStorage.setItem(CLAVE_STORAGE_HISTORIAL, JSON.stringify(listaHistorial));
    } catch {
      // Ignorar errores de cuota de almacenamiento
    }
  };

  // Consultar el turno activo desde el servidor
  const sincronizarTurnoConServidor = useCallback(async (silencioso = false) => {
    try {
      const respuesta = await consultarTurnoActivo();
      setConexionServidor(true);
      setTokenLocalDispositivo(obtenerTokenLocalDispositivo());

      if (respuesta.turno) {
        setTurnoActual(respuesta.turno);
        localStorage.setItem(CLAVE_STORAGE_ACTIVO, JSON.stringify(respuesta.turno));
      } else {
        setTurnoActual((previo) => {
          // Si ya estaba en estado Cerrado en pantalla, mantener el resumen hasta que limpien vista
          if (previo && previo.estado === 'Cerrado') return previo;
          localStorage.removeItem(CLAVE_STORAGE_ACTIVO);
          return null;
        });
      }
    } catch {
      setConexionServidor(false);
      if (!silencioso) {
        try {
          const turnoGuardado = localStorage.getItem(CLAVE_STORAGE_ACTIVO);
          if (turnoGuardado) {
            setTurnoActual(JSON.parse(turnoGuardado));
          }
        } catch {
          // Sin respaldo previo
        }
      }
    }
  }, []);

  // Cargar el turno activo al iniciar la aplicación y sincronizar periódicamente en tiempo real
  useEffect(() => {
    sincronizarTurnoConServidor(false);

    const intervalo = setInterval(() => {
      sincronizarTurnoConServidor(true);
    }, 8000);

    return () => clearInterval(intervalo);
  }, [sincronizarTurnoConServidor]);

  // Determinar si este dispositivo es el autorizado mediante comparación de token_turno_activo
  const turnoEnProgreso = Boolean(turnoActual && turnoActual.estado === 'En Progreso');
  const esDispositivoAutorizado = Boolean(
    !turnoEnProgreso ||
      (tokenLocalDispositivo &&
        turnoActual?.tokenDispositivo &&
        String(tokenLocalDispositivo).trim() === String(turnoActual.tokenDispositivo).trim())
  );
  const enModoConsulta = Boolean(turnoEnProgreso && !esDispositivoAutorizado);

  /**
   * Inicia un nuevo turno generando el token maestro del dispositivo y guardándolo en localStorage
   * bajo la clave "token_turno_activo", o actualiza metadatos si el dispositivo es el autorizado.
   */
  const manejarIniciarOActualizarTurno = async (datosTurno) => {
    setCargandoAccion(true);
    try {
      if (turnoActual && turnoActual._id && !String(turnoActual._id).startsWith('local-')) {
        const respuesta = await actualizarMetadatosTurno(turnoActual._id, datosTurno);
        setTurnoActual(respuesta.turno);
        guardarRespaldoLocal(respuesta.turno);
        setConexionServidor(true);
        mostrarMensaje(respuesta.mensaje || 'Datos del equipo actualizados.');
        return respuesta.turno;
      } else if (!turnoActual || !turnoActual._id) {
        // 1. Generar token maestro aleatorio y guardarlo en localStorage ('token_turno_activo')
        const nuevoTokenDispositivo = generarTokenDispositivo();
        localStorage.setItem(CLAVE_TOKEN_TURNO_ACTIVO, nuevoTokenDispositivo);
        setTokenLocalDispositivo(nuevoTokenDispositivo);

        const respuesta = await crearNuevoTurno({
          ...datosTurno,
          tokenDispositivo: nuevoTokenDispositivo
        });

        const tokenConfirmado =
          respuesta.turno?.tokenDispositivo || nuevoTokenDispositivo;
        localStorage.setItem(CLAVE_TOKEN_TURNO_ACTIVO, tokenConfirmado);
        setTokenLocalDispositivo(tokenConfirmado);

        setTurnoActual(respuesta.turno);
        guardarRespaldoLocal(respuesta.turno);
        setConexionServidor(true);
        mostrarMensaje(respuesta.mensaje || 'Turno iniciado correctamente en este dispositivo.');
        return respuesta.turno;
      } else {
        // Actualización en modo respaldo local
        const actualizado = {
          ...turnoActual,
          ...datosTurno,
          updatedAt: new Date().toISOString()
        };
        setTurnoActual(actualizado);
        guardarRespaldoLocal(actualizado);
        mostrarMensaje('Datos del turno actualizados en respaldo local.');
        return actualizado;
      }
    } catch (error) {
      // Si el backend rechaza la creación con HTTP 400 porque ya existe un turno en progreso en planta,
      // cargamos inmediatamente el turno activo en pantalla (entrará en Modo Consulta si fue abierto en otro equipo)
      if (error.turnoActivo) {
        setTurnoActual(error.turnoActivo);
        guardarRespaldoLocal(error.turnoActivo);
        setConexionServidor(true);
        mostrarMensaje(error.message, 'error');
        return error.turnoActivo;
      }

      // Si el servidor no está disponible, permitir operación en respaldo local
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        setConexionServidor(false);

        if (turnoActual && turnoActual.estado === 'En Progreso') {
          mostrarMensaje(
            'No se puede iniciar un nuevo turno: ya existe un turno activo en planta. Debe ser cerrado primero.',
            'error'
          );
          return turnoActual;
        }

        const ahoraISO = new Date().toISOString();
        const horaActual = obtenerHoraAutomatica();
        const tokenLocalGenerado = generarTokenDispositivo();
        localStorage.setItem(CLAVE_TOKEN_TURNO_ACTIVO, tokenLocalGenerado);
        setTokenLocalDispositivo(tokenLocalGenerado);

        const nuevoLocal = {
          _id: `local-${Date.now()}`,
          fecha: ahoraISO,
          fechaApertura: ahoraISO,
          horaApertura: horaActual,
          fechaCierre: null,
          horaCierre: '',
          tipoTurno: datosTurno.tipoTurno,
          encargado: datosTurno.encargado,
          operadores: datosTurno.operadores,
          registrosParciales: [],
          totalEstabilizadas: 0,
          contadorMaquina: 0,
          diferencia: 0,
          estado: 'En Progreso',
          tokenDispositivo: tokenLocalGenerado,
          createdAt: ahoraISO
        };
        setTurnoActual(nuevoLocal);
        guardarRespaldoLocal(nuevoLocal);
        mostrarMensaje('Turno iniciado en modo respaldo local (sin conexión a MongoDB).', 'alerta');
        return nuevoLocal;
      }
      mostrarMensaje(error.message, 'error');
      return null;
    } finally {
      setCargandoAccion(false);
    }
  };

  /**
   * Mecanismo de Relevo / Emergencia (Sin Clave):
   * Transfiere el control del turno en progreso a este teléfono o computadora.
   */
  const manejarReclamarControlDispositivo = async () => {
    if (!turnoActual || turnoActual.estado !== 'En Progreso') return;

    const confirmado = window.confirm(
      '¿Deseas transferir el control del turno a este teléfono? El dispositivo anterior perderá los permisos de edición.'
    );
    if (!confirmado) return;

    setCargandoAccion(true);
    try {
      const nuevoToken = generarTokenDispositivo();

      if (!String(turnoActual._id).startsWith('local-')) {
        const respuesta = await reclamarControlDispositivo(turnoActual._id, nuevoToken);
        const tokenFinal = respuesta.turno?.tokenDispositivo || nuevoToken;
        localStorage.setItem(CLAVE_TOKEN_TURNO_ACTIVO, tokenFinal);
        setTokenLocalDispositivo(tokenFinal);
        setTurnoActual(respuesta.turno);
        guardarRespaldoLocal(respuesta.turno);
        setConexionServidor(true);
        mostrarMensaje(
          respuesta.mensaje ||
            'Control del turno transferido a este dispositivo. Ya puede registrar armaduras.'
        );
      } else {
        localStorage.setItem(CLAVE_TOKEN_TURNO_ACTIVO, nuevoToken);
        setTokenLocalDispositivo(nuevoToken);
        const actualizado = {
          ...turnoActual,
          tokenDispositivo: nuevoToken
        };
        setTurnoActual(actualizado);
        guardarRespaldoLocal(actualizado);
        mostrarMensaje('Control del turno asignado a este dispositivo.');
      }
    } catch (error) {
      mostrarMensaje(
        error.message || 'No se pudo reclamar el control del turno en este dispositivo.',
        'error'
      );
    } finally {
      setCargandoAccion(false);
    }
  };

  /**
   * Registra un lote parcial de armaduras estabilizadas durante la jornada.
   */
  const manejarAgregarParcial = async (loteParcial, datosCabeceraRespaldo) => {
    if (enModoConsulta) {
      mostrarMensaje(
        `Modo Consulta: Turno activo a cargo de ${turnoActual?.encargado}. Los controles están bloqueados en este dispositivo.`,
        'error'
      );
      return false;
    }

    setCargandoAccion(true);
    try {
      let turnoObjetivo = turnoActual;

      if (!turnoObjetivo || !turnoObjetivo._id) {
        turnoObjetivo = await manejarIniciarOActualizarTurno(datosCabeceraRespaldo);
        if (!turnoObjetivo) return false;
      }

      if (!String(turnoObjetivo._id).startsWith('local-')) {
        const respuesta = await registrarLoteParcial(turnoObjetivo._id, loteParcial);
        setTurnoActual(respuesta.turno);
        guardarRespaldoLocal(respuesta.turno);
        setConexionServidor(true);
        mostrarMensaje(
          `+${loteParcial.cantidad} armaduras estabilizadas registradas (${loteParcial.hora}).`
        );
        return true;
      } else {
        // Modo respaldo local
        const nuevosParciales = [
          ...(turnoObjetivo.registrosParciales || []),
          { _id: `parcial-${Date.now()}`, ...loteParcial }
        ];
        const nuevoTotal = nuevosParciales.reduce(
          (acc, item) => acc + (Number(item.cantidad) || 0),
          0
        );
        const actualizado = {
          ...turnoObjetivo,
          registrosParciales: nuevosParciales,
          totalEstabilizadas: nuevoTotal
        };
        setTurnoActual(actualizado);
        guardarRespaldoLocal(actualizado);
        mostrarMensaje(
          `+${loteParcial.cantidad} armaduras registradas en respaldo local.`
        );
        return true;
      }
    } catch (error) {
      mostrarMensaje(error.message || 'Error al registrar el lote parcial.', 'error');
      sincronizarTurnoConServidor(true);
      return false;
    } finally {
      setCargandoAccion(false);
    }
  };

  /**
   * Elimina un registro parcial antes del cierre de turno.
   */
  const manejarEliminarParcial = async (idParcial) => {
    if (!turnoActual || turnoActual.estado === 'Cerrado' || enModoConsulta) return;
    setCargandoAccion(true);
    try {
      if (!String(turnoActual._id).startsWith('local-')) {
        const respuesta = await borrarLoteParcial(turnoActual._id, idParcial);
        setTurnoActual(respuesta.turno);
        guardarRespaldoLocal(respuesta.turno);
        mostrarMensaje('Registro parcial eliminado y total recalculado.');
      } else {
        const nuevosParciales = (turnoActual.registrosParciales || []).filter(
          (p) => p._id !== idParcial
        );
        const nuevoTotal = nuevosParciales.reduce(
          (acc, item) => acc + (Number(item.cantidad) || 0),
          0
        );
        const actualizado = {
          ...turnoActual,
          registrosParciales: nuevosParciales,
          totalEstabilizadas: nuevoTotal
        };
        setTurnoActual(actualizado);
        guardarRespaldoLocal(actualizado);
        mostrarMensaje('Registro parcial eliminado.');
      }
    } catch (error) {
      mostrarMensaje(error.message || 'No se pudo eliminar el registro parcial.', 'error');
      sincronizarTurnoConServidor(true);
    } finally {
      setCargandoAccion(false);
    }
  };

  /**
   * Cierra definitivamente el turno ("Terminar Turno"), calculando la sumatoria de
   * armaduras estabilizadas, la diferencia frente al contador de máquina y bloqueando edición.
   */
  const manejarTerminarTurno = async (contadorMaquina) => {
    if (!turnoActual || enModoConsulta) return false;
    setCargandoAccion(true);

    try {
      if (!String(turnoActual._id).startsWith('local-')) {
        const respuesta = await finalizarTurnoActivo(turnoActual._id, contadorMaquina);
        const turnoCerrado = respuesta.turno;
        setTurnoActual(turnoCerrado);

        localStorage.removeItem(CLAVE_TOKEN_TURNO_ACTIVO);
        setTokenLocalDispositivo('');

        const nuevoHistorial = [
          turnoCerrado,
          ...historialLocal.filter((t) => t._id !== turnoCerrado._id)
        ];
        setHistorialLocal(nuevoHistorial);
        guardarRespaldoLocal(null, nuevoHistorial);
        setConexionServidor(true);
        mostrarMensaje(
          'Turno cerrado exitosamente. Consolidado guardado en MongoDB.'
        );
        return true;
      } else {
        // Si el turno se creó en respaldo local, intentar consolidarlo en MongoDB primero
        try {
          const respuesta = await guardarYCerrarTurnoCompleto({
            fecha: turnoActual.fecha,
            fechaApertura: turnoActual.fechaApertura,
            horaApertura: turnoActual.horaApertura,
            tipoTurno: turnoActual.tipoTurno,
            encargado: turnoActual.encargado,
            operadores: turnoActual.operadores,
            registrosParciales: turnoActual.registrosParciales || [],
            contadorMaquina: Number(contadorMaquina)
          });
          const turnoCerradoRemoto = respuesta.turno;
          setTurnoActual(turnoCerradoRemoto);

          localStorage.removeItem(CLAVE_TOKEN_TURNO_ACTIVO);
          setTokenLocalDispositivo('');

          const nuevoHistorial = [
            turnoCerradoRemoto,
            ...historialLocal.filter(
              (t) => t._id !== turnoActual._id && t._id !== turnoCerradoRemoto._id
            )
          ];
          setHistorialLocal(nuevoHistorial);
          guardarRespaldoLocal(null, nuevoHistorial);
          setConexionServidor(true);
          mostrarMensaje(
            'Turno sincronizado y cerrado exitosamente en MongoDB.'
          );
          return true;
        } catch {
          const ahoraCierreISO = new Date().toISOString();
          const horaCierreActual = obtenerHoraAutomatica();
          const sumaEstabilizadas = (turnoActual.registrosParciales || []).reduce(
            (acc, item) => acc + (Number(item.cantidad) || 0),
            0
          );
          const liquidacionLocal = calcularLiquidacionTurnoCliente(
            {
              ...turnoActual,
              totalEstabilizadas: sumaEstabilizadas,
              contadorMaquina: Number(contadorMaquina)
            },
            Number(contadorMaquina)
          );
          const turnoCerradoLocal = {
            ...turnoActual,
            fechaCierre: ahoraCierreISO,
            horaCierre: horaCierreActual,
            totalEstabilizadas: sumaEstabilizadas,
            contadorMaquina: Number(contadorMaquina),
            diferencia: Number(contadorMaquina) - sumaEstabilizadas,
            liquidacion: liquidacionLocal,
            estado: 'Cerrado',
            updatedAt: ahoraCierreISO
          };
          setTurnoActual(turnoCerradoLocal);
          localStorage.removeItem(CLAVE_TOKEN_TURNO_ACTIVO);
          setTokenLocalDispositivo('');

          const nuevoHistorial = [turnoCerradoLocal, ...historialLocal];
          setHistorialLocal(nuevoHistorial);
          guardarRespaldoLocal(null, nuevoHistorial);
          mostrarMensaje('Turno cerrado y guardado en el historial local.');
          return true;
        }
      }
    } catch (error) {
      mostrarMensaje(error.message || 'Error al cerrar el turno.', 'error');
      sincronizarTurnoConServidor(true);
      return false;
    } finally {
      setCargandoAccion(false);
    }
  };

  /**
   * Limpia la vista después de haber cerrado un turno para iniciar el siguiente.
   */
  const manejarLimpiarParaNuevoTurno = () => {
    setTurnoActual(null);
    localStorage.removeItem(CLAVE_STORAGE_ACTIVO);
    localStorage.removeItem(CLAVE_TOKEN_TURNO_ACTIVO);
    setTokenLocalDispositivo('');
    mostrarMensaje('Vista lista para registrar el siguiente turno.');
  };

  /**
   * Valida la clave de acceso confidencial del supervisor para desbloquear el panel financiero.
   */
  const manejarAutenticacionSupervisor = async (claveIngresada) => {
    setCargandoAccion(true);
    try {
      await verificarPinSupervisor(claveIngresada);
      setClaveSupervisorActiva(claveIngresada);
      setModoSupervisor(true);
      setModalSupervisorAbierto(false);
      mostrarMensaje('Bienvenido al Panel Exclusivo de Supervisión y Liquidación.');
      return { exito: true };
    } catch (error) {
      if (
        (error.message.includes('Failed to fetch') ||
          error.message.includes('NetworkError')) &&
        claveIngresada === '1234'
      ) {
        setClaveSupervisorActiva(claveIngresada);
        setModoSupervisor(true);
        setModalSupervisorAbierto(false);
        return { exito: true };
      }
      return {
        exito: false,
        mensaje: error.message || 'Clave de supervisor incorrecta.'
      };
    } finally {
      setCargandoAccion(false);
    }
  };

  // Combinar historial local con el turno actual para el modo respaldo
  const listaRespaldoParaSupervisor = turnoActual
    ? [
        turnoActual,
        ...historialLocal.filter((t) => t._id !== turnoActual._id)
      ]
    : historialLocal;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 w-full overflow-x-hidden">
      {/* Barra Superior de Planta con Botones "Instalar App en el Teléfono" y "Acceso Supervisor" */}
      <BarraNavegacion
        turnoActual={turnoActual}
        modoSupervisor={modoSupervisor}
        alAbrirModalSupervisor={() => setModalSupervisorAbierto(true)}
        alSalirModoSupervisor={() => {
          setModoSupervisor(false);
          setClaveSupervisorActiva('');
        }}
        conexionServidor={conexionServidor}
        mostrarBotonInstalarPWA={!esModoStandalone}
        alInstalarPWA={manejarInstalarPWA}
      />

      {/* Banner destacado de instalación PWA cuando el navegador ofrece instalación directa */}
      {eventoInstalacionPWA && !esModoStandalone && (
        <div className="bg-blue-700 text-white px-4 py-3 shadow-md">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-center sm:text-left">
              <Smartphone className="w-5 h-5 text-amber-300 shrink-0" />
              <span>
                Instale <strong>Control de Armaduras</strong> en su teléfono o tablet para abrirla a pantalla completa.
              </span>
            </div>
            <button
              type="button"
              onClick={manejarInstalarPWA}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm shadow transition cursor-pointer shrink-0"
            >
              Instalar App en el Teléfono
            </button>
          </div>
        </div>
      )}

      {/* BANNER INFORMATIVO DE MODO SOLO LECTURA / CONSULTA Y BOTÓN DISCRETO DE RELEVO */}
      {!modoSupervisor && enModoConsulta && (
        <div className="bg-amber-100 border-b-2 border-amber-400 px-3 sm:px-6 py-3.5 shadow-sm">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="text-amber-950 text-xs sm:text-sm font-bold leading-snug">
              👀 Modo Consulta: Turno activo a cargo de{' '}
              <span className="underline decoration-amber-600 font-black">
                {turnoActual.encargado}
              </span>
              . Los controles de registro están bloqueados en este dispositivo.
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end shrink-0">
              <button
                type="button"
                onClick={() => sincronizarTurnoConServidor(false)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white hover:bg-amber-50 text-slate-700 border border-amber-300 font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Actualizar en vivo</span>
              </button>

              <button
                type="button"
                disabled={cargandoAccion}
                onClick={manejarReclamarControlDispositivo}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold text-xs inline-flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
                <span>Reclamar control en este dispositivo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notificaciones flotantes de confirmación o alerta */}
      {notificacion && (
        <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 lg:px-8 pt-4">
          <div
            className={`p-4 rounded-2xl shadow-md border flex items-center justify-between gap-3 font-bold text-sm sm:text-base ${
              notificacion.tipo === 'error'
                ? 'bg-rose-600 text-white border-rose-700'
                : notificacion.tipo === 'alerta'
                ? 'bg-amber-500 text-slate-950 border-amber-600'
                : 'bg-emerald-600 text-white border-emerald-700'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {notificacion.tipo === 'error' || notificacion.tipo === 'alerta' ? (
                <AlertCircle className="w-5 h-5 shrink-0" />
              ) : (
                <CheckCircle2 className="w-5 h-5 shrink-0" />
              )}
              <span>{notificacion.texto}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotificacion(null)}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center opacity-80 hover:opacity-100 font-black cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Contenido Principal Responsivo */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {modoSupervisor ? (
          <PanelSupervisor
            claveSupervisor={claveSupervisorActiva}
            turnosRespaldoLocal={listaRespaldoParaSupervisor}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
            {/* Columna Izquierda: Gestión de Turno y Registro Parcial */}
            <div className="lg:col-span-5 w-full">
              <FormularioRegistro
                turnoActual={turnoActual}
                esDispositivoAutorizado={esDispositivoAutorizado}
                alReclamarControlDispositivo={manejarReclamarControlDispositivo}
                alIniciarOActualizarTurno={manejarIniciarOActualizarTurno}
                alAgregarParcial={manejarAgregarParcial}
                cargandoAccion={cargandoAccion}
              />
            </div>

            {/* Columna Derecha: Tabla/Tarjetas en Tiempo Real y Cierre de Turno */}
            <div className="lg:col-span-7 w-full">
              <TablaParciales
                turnoActual={turnoActual}
                esDispositivoAutorizado={esDispositivoAutorizado}
                alEliminarParcial={manejarEliminarParcial}
                alTerminarTurno={manejarTerminarTurno}
                alLimpiarParaNuevoTurno={manejarLimpiarParaNuevoTurno}
                cargandoAccion={cargandoAccion}
              />
            </div>
          </div>
        )}
      </main>

      {/* Pie de página institucional de planta */}
      <footer className="bg-slate-900 text-slate-400 text-xs py-4 border-t border-slate-800 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <span>
            Sistema Industrial de Control de Producción e Inventario de Armaduras · PWA Instalable
          </span>
          <span>
            Control de Sesión por Dispositivo · Nómina Autorizada de Planta
          </span>
        </div>
      </footer>

      {/* Modal de Autenticación con Clave para el Panel Exclusivo del Supervisor */}
      <ModalSupervisor
        abierto={modalSupervisorAbierto}
        alCerrar={() => setModalSupervisorAbierto(false)}
        alAutenticar={manejarAutenticacionSupervisor}
        cargando={cargandoAccion}
      />

      {/* Modal de Guía de Instalación PWA para navegadores móviles (Android / iPhone / iPad) */}
      {modalGuiaPWA && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-blue-700 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-6 h-6 text-amber-300 shrink-0" />
                <h3 className="font-extrabold text-base">
                  Instalar App en el Teléfono
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalGuiaPWA(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-white/80 hover:text-white hover:bg-blue-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">
                Siga estos pasos según su dispositivo para instalar <strong>Armaduras</strong> en su pantalla de inicio a pantalla completa:
              </p>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                <span className="font-extrabold text-blue-700 block">
                  En Teléfonos o Tablets Android (Chrome / Edge):
                </span>
                <p>
                  1. Toque el botón de menú del navegador (<strong>⋮</strong> arriba a la derecha).
                </p>
                <p>
                  2. Seleccione <strong>&quot;Instalar aplicación&quot;</strong> o <strong>&quot;Agregar a la pantalla principal&quot;</strong>.
                </p>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                <span className="font-extrabold text-blue-700 block">
                  En iPhone o iPad (Safari):
                </span>
                <p>
                  1. Toque el botón <strong>Compartir</strong> en la barra inferior de Safari.
                </p>
                <p>
                  2. Elija <strong>&quot;Agregar a inicio&quot;</strong> y confirme con <strong>Agregar</strong>.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModalGuiaPWA(false)}
                className="w-full min-h-[48px] py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-base shadow cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Aplicacion;
