import React, { useState } from 'react';
import { Building2, Compass, Lock, Mail, WifiOff } from 'lucide-react';
import type { CuentaDemoInfo } from '../data/RepositorioOperacion';
import type { Empresa, RolEmpresa, SesionActiva } from '../types/domain';

interface AuthGateProps {
  isOnline: boolean;
  cuentasDemo: CuentaDemoInfo[];
  sesionGuardada: SesionActiva | null;
  empresasDisponibles: Array<{ empresa: Empresa; rol: RolEmpresa }>;
  onLogin: (email: string, password: string) => Promise<void>;
  onEntrarConCacheOffline: () => Promise<void>;
  onSeleccionarEmpresa: (empresaId: string) => Promise<void>;
  onCerrarSesion: () => Promise<void>;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  isOnline,
  cuentasDemo,
  sesionGuardada,
  empresasDisponibles,
  onLogin,
  onEntrarConCacheOffline,
  onSeleccionarEmpresa,
  onCerrarSesion,
}) => {
  const [email, setEmail] = useState('admin@aiaservices.do');
  const [password, setPassword] = useState('demo123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Paso 2 de F1: Si ya inició sesión y tiene varias empresas para elegir (o confirmar entrada)
  if (sesionGuardada && empresasDisponibles.length > 0) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-md border border-[#CBD5E1] bg-white p-6 space-y-5">
          <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-[#0F2942] text-white">
                <Compass className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-bold text-[#0D1C2F]">GeoMatrix RD</h1>
                <p className="text-xs text-[#43474D]">
                  Sesión de {sesionGuardada.usuario.nombre} · Selecciona empresa
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCerrarSesion}
              className="rounded-sm border border-[#CBD5E1] px-3 py-1.5 text-xs font-semibold text-[#334155] hover:bg-[#F1F5F9]"
            >
              Cambiar cuenta
            </button>
          </div>

          {!isOnline && (
            <div className="flex items-start gap-2 rounded-sm border border-[#FDE047] bg-[#FEF9C3]/60 px-3 py-2 text-xs text-[#A16207]">
              <WifiOff className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Sin conexión: puedes ingresar con los datos guardados en caché local.</span>
            </div>
          )}

          <div className="space-y-2.5">
            {empresasDisponibles.map(({ empresa, rol }) => (
              <button
                key={empresa.id}
                type="button"
                onClick={() => onSeleccionarEmpresa(empresa.id)}
                className="w-full flex items-center justify-between gap-3 rounded-sm border border-[#CBD5E1] bg-white p-4 text-left hover:border-[#0284C7] hover:bg-[#F8FAFC] transition-colors min-h-[56px]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-[#EFF6FF] text-[#0F2942]">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#0D1C2F] truncate">
                      {empresa.nombre}
                    </div>
                    <div className="text-xs text-[#43474D] truncate">
                      RNC {empresa.rnc} · {empresa.direccionBase}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-xs font-bold text-[#0284C7] uppercase">{rol}</div>
                  <div className="text-[11px] text-[#43474D]">Entrar →</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-12 rounded-md border border-[#CBD5E1] bg-white overflow-hidden">
        {/* Panel marca y cuentas piloto */}
        <div className="md:col-span-5 bg-[#0F2942] text-white p-6 flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-[#0284C7]">
                <Compass className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight">GeoMatrix RD</span>
            </div>
            <p className="mt-3 text-xs text-[#CBD5E1] leading-relaxed">
              Plataforma de operaciones topográficas, rutas KMZ/GeoJSON, control de brigadas y viáticos en RD$.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-[#93CCFF]">
              Cuentas piloto (Empresa: AIA Services)
            </div>
            <div className="space-y-1.5">
              {cuentasDemo.map((c) => (
                <button
                  key={c.email}
                  type="button"
                  onClick={() => {
                    setEmail(c.email);
                    setPassword(c.passwordDemo);
                    setError(null);
                  }}
                  className="w-full rounded-sm border border-[#1E3A5F] bg-[#091A2C]/60 p-2.5 text-left hover:border-[#0284C7] transition-colors"
                >
                  <div className="text-xs font-semibold text-white">{c.nombre}</div>
                  <div className="text-[11px] text-[#93CCFF] font-mono">{c.email}</div>
                  <div className="text-[11px] text-[#94A3B8] mt-0.5">{c.descripcion}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Formulario acceso */}
        <div className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-center space-y-5">
          <div>
            <h1 className="text-lg font-bold text-[#0D1C2F]">Iniciar Sesión Operativa</h1>
            <p className="mt-1 text-xs text-[#43474D]">
              Accede con tu usuario corporativo para cargar proyectos, rutas y viáticos.
            </p>
          </div>

          {!isOnline && sesionGuardada && (
            <div className="rounded-sm border border-[#FDE047] bg-[#FEF9C3]/60 p-3 space-y-2 text-xs text-[#A16207]">
              <div className="flex items-center gap-2 font-semibold">
                <WifiOff className="h-4 w-4 shrink-0" />
                Modo sin conexión detectado
              </div>
              <p>
                Existe una sesión guardada para <strong>{sesionGuardada.usuario.nombre}</strong>.
              </p>
              <button
                type="button"
                onClick={onEntrarConCacheOffline}
                className="rounded-sm bg-[#0F2942] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0284C7]"
              >
                Entrar con caché offline
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-sm border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs font-medium text-[#93000A]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-[#334155] mb-1">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#74777E]" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-sm border border-[#CBD5E1] pl-9 pr-3 py-2.5 text-xs text-[#0D1C2F] focus:border-[#0284C7] focus:outline-none min-h-[42px]"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-[#334155] mb-1">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#74777E]" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-sm border border-[#CBD5E1] pl-9 pr-3 py-2.5 text-xs text-[#0D1C2F] focus:border-[#0284C7] focus:outline-none min-h-[42px]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-sm bg-[#0F2942] py-2.5 text-xs font-semibold text-white hover:bg-[#0284C7] disabled:opacity-60 transition-colors min-h-[44px]"
            >
              {loading ? 'Verificando acceso...' : 'Continuar'}
            </button>
          </form>

          <p className="text-[11px] text-[#74777E]">
            Contraseña demo para todas las cuentas piloto: <span className="font-mono font-semibold text-[#334155]">demo123</span>. Los datos locales se guardan automáticamente para trabajo sin señal.
          </p>
        </div>
      </div>
    </div>
  );
};
