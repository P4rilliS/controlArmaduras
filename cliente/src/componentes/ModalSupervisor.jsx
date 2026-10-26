import React, { useState } from 'react';
import { ShieldCheck, Lock, X, Delete, CheckCircle } from 'lucide-react';

/**
 * Modal de seguridad para solicitar el PIN / Clave de acceso al Panel de Supervisión.
 * Optimizado con botones táctiles grandes (min-h-[52px]) para teléfonos y tablets en planta.
 */
const ModalSupervisor = ({ abierto, alCerrar, alAutenticar, cargando }) => {
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');

  if (!abierto) return null;

  const manejarEnvio = async (evento) => {
    evento.preventDefault();
    if (!clave.trim()) {
      setError('Por favor ingrese la clave de supervisor.');
      return;
    }

    setError('');
    const resultado = await alAutenticar(clave.trim());
    if (!resultado.exito) {
      setError(resultado.mensaje || 'Clave de acceso incorrecta.');
    } else {
      setClave('');
      setError('');
    }
  };

  const agregarDigitoTactil = (digito) => {
    setError('');
    setClave((anterior) => `${anterior}${digito}`);
  };

  const borrarUltimoDigito = () => {
    setError('');
    setClave((anterior) => anterior.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden my-auto">
        {/* Cabecera del Modal */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between border-b-4 border-amber-500">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500 text-slate-950 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base">Acceso Supervisor</h3>
              <p className="text-xs text-slate-400">
                Estadísticas, auditoría y exportación
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setClave('');
              setError('');
              alCerrar();
            }}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <form onSubmit={manejarEnvio} className="p-5 sm:p-6 space-y-4">
          {error && (
            <div className="bg-rose-50 border-l-4 border-rose-600 p-3 rounded-xl text-rose-800 text-xs sm:text-sm font-bold">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="campo-clave-supervisor"
              className="block text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-600 mb-2"
            >
              PIN o Contraseña de Supervisor
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                id="campo-clave-supervisor"
                type="password"
                inputMode="numeric"
                autoFocus
                placeholder="••••"
                value={clave}
                onChange={(e) => {
                  setError('');
                  setClave(e.target.value);
                }}
                className="w-full min-h-[52px] pl-12 pr-4 py-3 rounded-xl border-2 border-slate-300 text-center text-2xl font-black tracking-widest text-slate-900 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <p className="text-xs text-slate-400 text-center mt-1.5">
              Clave predeterminada en entorno de desarrollo: <strong>1234</strong>
            </p>
          </div>

          {/* Teclado Numérico Táctil para Teléfonos y Tablets */}
          <div className="grid grid-cols-3 gap-2.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((numero) => (
              <button
                key={numero}
                type="button"
                onClick={() => agregarDigitoTactil(numero)}
                className="min-h-[52px] py-3 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-amber-200 text-slate-900 font-black text-xl transition cursor-pointer"
              >
                {numero}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setClave('')}
              className="min-h-[52px] py-3 rounded-xl bg-slate-100 hover:bg-rose-100 text-rose-700 font-bold text-xs uppercase transition cursor-pointer"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={() => agregarDigitoTactil(0)}
              className="min-h-[52px] py-3 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-amber-200 text-slate-900 font-black text-xl transition cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={borrarUltimoDigito}
              className="min-h-[52px] py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition cursor-pointer"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setClave('');
                setError('');
                alCerrar();
              }}
              className="w-1/3 min-h-[50px] py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm sm:text-base hover:bg-slate-100 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={cargando}
              className="w-2/3 min-h-[50px] py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm sm:text-base shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>{cargando ? 'Verificando...' : 'Ingresar al Panel'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalSupervisor;
