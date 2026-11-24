import React, { useState } from 'react';
import { Building2, Compass, Lock, Mail, WifiOff } from 'lucide-react';
import type { CuentaDemoInfo } from '../data/RepositorioOperacion';
import type { Empresa, RolEmpresa, SesionActiva } from '../types/domain';
import { DemoBanner } from './OfflineSyncBanner';

interface AuthGateProps {
  isOnline: boolean;
  isDemoActivo: boolean;
  cuentasDemo: CuentaDemoInfo[];
  sesionGuardada: SesionActiva | null;
  empresasDisponibles: Array<{ empresa: Empresa; rol: RolEmpresa }>;
  onLogin: (email: string, password: string) => Promise<void>;
  onEntrarConCacheOffline: () => Promise<void>;
  onSeleccionarEmpresa: (empresaId: string) => Promise<void>;
  onCerrarSesion: () => Promise<void>;
}

const HERO_IMAGE_PATH = '/src/assets/images/auth_topography_hero_1795434660064.jpg';

export const AuthGate: React.FC<AuthGateProps> = ({
  isOnline,
  isDemoActivo,
  cuentasDemo,
  sesionGuardada,
  empresasDisponibles,
  onLogin,
  onEntrarConCacheOffline,
  onSeleccionarEmpresa,
  onCerrarSesion,
}) => {
  const [email, setEmail] = useState(isDemoActivo ? 'admin@aiaservices.do' : '');
  const [password, setPassword] = useState(isDemoActivo ? 'demo123' : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onLogin(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  // Paso 2 de F1: Selección de empresa
  if (sesionGuardada && empresasDisponibles.length > 0) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
        <DemoBanner visible={isDemoActivo} />
        <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 space-y-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#0F2942] text-white">
                  <Compass className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-base font-bold text-slate-900">SIRIUS</h1>
                  <p className="text-xs text-slate-500 truncate">
                    Sesión de {sesionGuardada.usuario.nombre} · Selecciona empresa
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCerrarSesion}
                className="min-h-[40px] rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                Cambiar cuenta
              </button>
            </div>

            {!isOnline && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
                <WifiOff className="h-4 w-4 shrink-0 mt-0.5 text-[#B45309]" />
                <span>Sin conexión: puedes ingresar con los datos guardados en caché local.</span>
              </div>
            )}

            <div className="space-y-2.5">
              {empresasDisponibles.map(({ empresa, rol }) => (
                <button
                  key={empresa.id}
                  type="button"
                  onClick={() => onSeleccionarEmpresa(empresa.id)}
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-[#0284C7] hover:bg-slate-50 transition-colors min-h-[64px]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-sky-50 text-[#0F2942]">
                      <Building2 className="h-4 w-4 text-[#0284C7]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">
                        {empresa.nombre}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        RNC {empresa.rnc} · {empresa.direccionBase}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-xs font-bold text-[#0284C7] uppercase">{rol}</div>
                    <div className="text-xs text-slate-500">Entrar →</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <DemoBanner visible={isDemoActivo} />
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 items-stretch rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          {/* Panel marca con fotografía topográfica y scrim de contraste AA/AAA */}
          <div className="relative md:col-span-5 bg-[#0F2942] text-white p-6 flex flex-col justify-between space-y-6 overflow-hidden">
            {!heroImgFailed && (
              <img
                src={HERO_IMAGE_PATH}
                alt="Terreno topográfico y linderos catastrales al amanecer"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-b from-[#091A2C]/90 via-[#0F2942]/85 to-[#091A2C]/95"
            />

            <div className="relative z-10">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#0284C7] text-white shadow-sm">
                  <Compass className="h-5 w-5" />
                </div>
                <span className="text-xl font-bold tracking-tight text-white">SIRIUS</span>
              </div>
              <p className="mt-3 text-xs font-semibold text-sky-200 leading-snug text-balance">
                Sistema Integral de Recursos, Información, Operaciones y Análisis
              </p>
              <p className="mt-2 text-xs text-slate-200 leading-relaxed">
                Operaciones topográficas, rutas KMZ/GeoJSON, control de brigadas y viáticos en RD$.
              </p>
            </div>

            {isDemoActivo && cuentasDemo.length > 0 && (
              <div className="relative z-10 space-y-2.5">
                <div className="text-xs font-semibold text-sky-200">
                  Cuentas piloto de demostración (AIA Services)
                </div>
                <div className="space-y-2">
                  {cuentasDemo.map((c) => (
                    <button
                      key={c.email}
                      type="button"
                      onClick={() => {
                        setEmail(c.email);
                        setPassword(c.passwordDemo);
                        setError(null);
                      }}
                      className="w-full rounded-lg border border-white/15 bg-[#091A2C]/85 backdrop-blur-sm p-3 text-left hover:border-[#0284C7] hover:bg-[#091A2C] transition-colors"
                    >
                      <div className="text-xs font-bold text-white">{c.nombre}</div>
                      <div className="text-[11px] text-sky-300 font-mono mt-0.5">{c.email}</div>
                      <div className="text-[11px] text-slate-300 mt-0.5">{c.descripcion}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Formulario acceso */}
          <div className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-center space-y-5 bg-white">
            <div className="space-y-1">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 text-balance">
                Iniciar Sesión Operativa
              </h1>
              <p className="text-xs text-slate-600 leading-relaxed">
                Accede con tu usuario corporativo para gestionar proyectos, rutas KMZ y viáticos.
              </p>
            </div>

            {!isOnline && sesionGuardada && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3.5 space-y-2 text-xs text-amber-900">
                <div className="flex items-center gap-2 font-semibold">
                  <WifiOff className="h-4 w-4 shrink-0 text-[#B45309]" />
                  Modo sin conexión detectado
                </div>
                <p>
                  Existe una sesión guardada para <strong>{sesionGuardada.usuario.nombre}</strong>.
                </p>
                <button
                  type="button"
                  onClick={onEntrarConCacheOffline}
                  className="rounded-md bg-[#0F2942] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] min-h-[40px]"
                >
                  Entrar con caché offline
                </button>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-2.5 text-xs text-slate-900 focus:border-[#0284C7] focus:outline-none min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-2.5 text-xs text-slate-900 focus:border-[#0284C7] focus:outline-none min-h-[44px]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-[#0F2942] py-2.5 px-4 text-xs font-semibold text-white hover:bg-[#0284C7] disabled:opacity-60 transition-colors min-h-[44px]"
              >
                {loading ? 'Verificando acceso...' : 'Iniciar sesión'}
              </button>
            </form>

            {isDemoActivo && (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Contraseña demo para cuentas piloto:{' '}
                <span className="font-mono font-semibold text-slate-700">demo123</span>. Los datos locales se guardan automáticamente para trabajo sin señal.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
