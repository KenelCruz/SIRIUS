import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Compass,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  UserCheck,
  WifiOff,
} from 'lucide-react';
import type { CuentaDemoInfo } from '../data/RepositorioOperacion';
import type { Empresa, RolEmpresa, SesionActiva } from '../types/domain';

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

const ROLE_SLIDES: Array<{
  rol: RolEmpresa;
  titulo: string;
  subtitulo: string;
  etiquetaCorta: string;
}> = [
  {
    rol: 'admin',
    titulo: 'Administrador SIRIUS',
    subtitulo: 'Control integral de proyectos, presupuestos, viáticos y configuración.',
    etiquetaCorta: 'Admin',
  },
  {
    rol: 'coordinador',
    titulo: 'Coordinador Operativo',
    subtitulo: 'Planificación de rutas KMZ, brigadas, aprobaciones y cobros.',
    etiquetaCorta: 'Coord.',
  },
  {
    rol: 'tecnico',
    titulo: 'Técnico de Campo',
    subtitulo: 'Rutas asignadas, bitácora GPS, entregables y registro de viáticos.',
    etiquetaCorta: 'Técnico',
  },
];

function formatRolLabel(rol: RolEmpresa): string {
  switch (rol) {
    case 'admin':
      return 'Administrador';
    case 'coordinador':
      return 'Coordinador';
    case 'tecnico':
      return 'Técnico';
  }
}

function getDemoRoleMeta(cuenta: CuentaDemoInfo, index: number): {
  shortLabel: string;
  roleBadge: string;
  initials: string;
} {
  const lower = `${cuenta.email} ${cuenta.nombre}`.toLowerCase();
  if (lower.includes('admin')) {
    return { shortLabel: 'Admin', roleBadge: 'Administrador', initials: 'RA' };
  }
  if (lower.includes('coordinador')) {
    return { shortLabel: 'Coord.', roleBadge: 'Coordinador', initials: 'PV' };
  }
  if (lower.includes('carlos')) {
    return { shortLabel: 'Técnico 1', roleBadge: 'Técnico', initials: 'CM' };
  }
  if (lower.includes('laura')) {
    return { shortLabel: 'Técnico 2', roleBadge: 'Técnico', initials: 'LR' };
  }
  return {
    shortLabel: `Perfil ${index + 1}`,
    roleBadge: 'Operativo',
    initials: cuenta.nombre.slice(0, 2).toUpperCase(),
  };
}

function getUserInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

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
  const [email, setEmail] = useState(
    isDemoActivo ? (cuentasDemo[0]?.email ?? 'admin@aiaservices.do') : ''
  );
  const [password, setPassword] = useState(
    isDemoActivo ? (cuentasDemo[0]?.passwordDemo ?? 'demo123') : ''
  );
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

  const hasDemoAccounts = isDemoActivo && cuentasDemo.length > 0;
  const totalSlides = hasDemoAccounts ? cuentasDemo.length : ROLE_SLIDES.length;
  const safeSlideIndex = ((activeSlideIndex % totalSlides) + totalSlides) % totalSlides;

  const selectSlide = (nextIndex: number) => {
    const normalized = ((nextIndex % totalSlides) + totalSlides) % totalSlides;
    setActiveSlideIndex(normalized);
    if (hasDemoAccounts) {
      const target = cuentasDemo[normalized];
      if (target) {
        setEmail(target.email);
        setPassword(target.passwordDemo);
        setError(null);
      }
    }
  };

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

  const renderSplitBackdrop = () => (
    <div
      aria-hidden="true"
      className="hidden md:block pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <div
        className="absolute inset-y-0 left-0 w-[58%] bg-[#091A2C]"
        style={{ clipPath: 'polygon(0 0, 100% 0, 82% 100%, 0 100%)' }}
      >
        {!heroImgFailed && (
          <img
            src={HERO_IMAGE_PATH}
            alt=""
            decoding="async"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setHeroImgFailed(true)}
            className="h-full w-full object-cover opacity-35 scale-105 blur-[2px]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-br from-[#091A2C]/90 via-[#0F2942]/80 to-[#091A2C]/95" />
      </div>
    </div>
  );

  // Paso 2 de F1: Selección de empresa manteniendo exactamente el mismo marco visual del login
  if (sesionGuardada && empresasDisponibles.length > 0) {
    return (
      <div className="min-h-screen bg-[#F1F5F9] flex flex-col relative overflow-hidden">
        {renderSplitBackdrop()}

        <div className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="w-full max-w-5xl rounded-[28px] border border-slate-200/80 bg-white p-3 sm:p-4 shadow-[0_24px_64px_-20px_rgba(15,41,66,0.22)]">
            <div className="grid grid-cols-1 md:grid-cols-12 md:min-h-[560px]">
              {/* Columna izquierda visual oscura */}
              <div className="relative md:col-span-6 rounded-[22px] bg-[#0F2942] text-white p-6 sm:p-8 flex flex-col justify-between overflow-hidden min-h-[260px]">
                {!heroImgFailed && (
                  <img
                    src={HERO_IMAGE_PATH}
                    alt="Terreno topográfico y linderos catastrales al amanecer"
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-b from-[#091A2C]/80 via-[#0F2942]/55 to-[#091A2C]/95"
                />

                <div className="relative z-10 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold tracking-tight text-white/95">
                    Sesión Verificada
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 backdrop-blur-sm px-3 py-1 text-[11px] font-semibold text-white">
                    <UserCheck className="h-3.5 w-3.5 text-sky-300" />
                    {empresasDisponibles.length}{' '}
                    {empresasDisponibles.length === 1 ? 'empresa' : 'empresas'}
                  </span>
                </div>

                <div className="relative z-10 mt-8 flex items-center gap-3.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0284C7] to-[#0F2942] border border-white/30 text-sm font-bold text-white shadow-md">
                    {getUserInitials(sesionGuardada.usuario.nombre)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-base font-bold text-white truncate">
                      {sesionGuardada.usuario.nombre}
                    </div>
                    <div className="text-xs text-sky-200 truncate">
                      {sesionGuardada.usuario.email}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-200/90 leading-snug">
                      Elige tu empresa operativa para cargar el panel correspondiente a tu rol.
                    </p>
                  </div>
                </div>
              </div>

              {/* Columna derecha selección de empresa */}
              <div className="md:col-span-6 px-5 py-6 sm:px-9 sm:py-8 flex flex-col justify-between bg-white">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0F2942] to-[#0284C7] text-white shadow-sm">
                      <Compass className="h-4 w-4" />
                    </div>
                    <span className="text-base font-bold tracking-tight text-[#0F2942]">SIRIUS</span>
                  </div>
                  <button
                    type="button"
                    onClick={onCerrarSesion}
                    className="min-h-[40px] rounded-xl border border-slate-200 bg-[#F8FAFC] px-3.5 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                  >
                    Cambiar cuenta
                  </button>
                </div>

                <div className="my-auto py-6 w-full max-w-md mx-auto space-y-5">
                  <div className="text-center space-y-1.5">
                    <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-[#0F2942]">
                      Selecciona tu empresa
                    </h1>
                    <p className="text-xs text-[#475569] leading-relaxed">
                      Tu rol define las herramientas, vistas y permisos disponibles.
                    </p>
                  </div>

                  {!isOnline && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
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
                        className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white p-4 text-left hover:border-[#0284C7] hover:bg-[#F8FAFC] transition-colors min-h-[68px]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#0284C7]">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-[#0F2942] truncate">
                              {empresa.nombre}
                            </div>
                            <div className="text-xs text-[#475569] truncate">
                              RNC {empresa.rnc} · {empresa.direccionBase}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-bold text-[#0284C7]">
                            {formatRolLabel(rol)}
                          </div>
                          <div className="text-[11px] font-medium text-[#475569]">Entrar →</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 text-center">
                  Consola unificada · Administrador · Coordinador · Técnico
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeDemoAccount = hasDemoAccounts ? cuentasDemo[safeSlideIndex] : null;
  const activeDemoMeta = activeDemoAccount
    ? getDemoRoleMeta(activeDemoAccount, safeSlideIndex)
    : null;
  const activeRoleSlide = ROLE_SLIDES[safeSlideIndex] ?? ROLE_SLIDES[0];

  return (
    <div className="min-h-screen bg-[#F1F5F9] flex flex-col relative overflow-hidden">
      {renderSplitBackdrop()}

      <div className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-5xl rounded-[28px] border border-slate-200/80 bg-white p-3 sm:p-4 shadow-[0_24px_64px_-20px_rgba(15,41,66,0.22)]">
          <div className="grid grid-cols-1 md:grid-cols-12 md:min-h-[580px]">
            {/* Columna izquierda: tarjeta oscura enmarcada siguiendo el diseño de referencia en paleta SIRIUS */}
            <div className="relative md:col-span-6 rounded-[22px] bg-[#0F2942] text-white p-6 sm:p-8 flex flex-col justify-between overflow-hidden min-h-[290px] md:min-h-[548px]">
              {!heroImgFailed && (
                <img
                  src={HERO_IMAGE_PATH}
                  alt="Terreno topográfico y linderos catastrales al amanecer"
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-b from-[#091A2C]/80 via-[#0F2942]/45 to-[#091A2C]/95"
              />

              {/* Barra superior de la tarjeta visual */}
              <div className="relative z-10 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold tracking-tight text-white/95">
                  Operación Topográfica
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 backdrop-blur-sm px-3 py-1 text-[11px] font-semibold text-white">
                  <ShieldCheck className="h-3.5 w-3.5 text-sky-300" />
                  {activeDemoMeta ? activeDemoMeta.roleBadge : formatRolLabel(activeRoleSlide.rol)}
                </span>
              </div>

              {/* Carrusel inferior de roles / perfiles piloto */}
              <div className="relative z-10 mt-10 flex items-end justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0284C7] to-[#0F2942] border border-white/30 text-xs font-bold text-white shadow-md">
                    {activeDemoMeta
                      ? activeDemoMeta.initials
                      : activeRoleSlide.etiquetaCorta.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                      {activeDemoAccount ? activeDemoAccount.nombre : activeRoleSlide.titulo}
                    </div>
                    <p className="text-xs text-sky-100/90 leading-snug line-clamp-2">
                      {activeDemoAccount ? activeDemoAccount.descripcion : activeRoleSlide.subtitulo}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => selectSlide(safeSlideIndex - 1)}
                    aria-label="Perfil anterior"
                    title="Perfil anterior"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/10 backdrop-blur-sm text-white hover:bg-[#0284C7] hover:border-[#0284C7] transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => selectSlide(safeSlideIndex + 1)}
                    aria-label="Siguiente perfil"
                    title="Siguiente perfil"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/10 backdrop-blur-sm text-white hover:bg-[#0284C7] hover:border-[#0284C7] transition-colors"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Columna derecha: panel limpio blanco de inicio de sesión */}
            <div className="md:col-span-6 px-5 py-7 sm:px-9 sm:py-8 flex flex-col justify-between bg-white">
              {/* Encabezado superior del panel blanco */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0F2942] to-[#0284C7] text-white shadow-sm">
                    <Compass className="h-4 w-4" />
                  </div>
                  <span className="text-base font-bold tracking-tight text-[#0F2942]">SIRIUS</span>
                </div>

                <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-[#F8FAFC] px-3 py-1.5 text-[11px] font-semibold text-[#0F2942]">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isOnline ? 'bg-[#15803D]' : 'bg-[#B45309]'
                    }`}
                  />
                  {isOnline ? 'En línea' : 'Sin conexión'}
                </div>
              </div>

              {/* Bloque central del formulario */}
              <div className="my-auto py-6 w-full max-w-sm mx-auto space-y-5">
                <div className="text-center space-y-1.5">
                  <h1 className="text-2xl sm:text-[30px] font-bold tracking-tight text-[#0F2942]">
                    Bienvenido a SIRIUS
                  </h1>
                  <p className="text-xs text-[#475569] leading-relaxed">
                    Accede con tu cuenta operativa para gestionar proyectos, rutas KMZ y viáticos.
                  </p>
                </div>

                {hasDemoAccounts && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-[#475569] text-center">
                      Acceso rápido por rol (Modo piloto)
                    </div>
                    <div
                      role="tablist"
                      aria-label="Seleccionar cuenta demo por rol"
                      className="grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-1"
                    >
                      {cuentasDemo.map((cuenta, idx) => {
                        const meta = getDemoRoleMeta(cuenta, idx);
                        const isSelected = email.trim().toLowerCase() === cuenta.email.toLowerCase();
                        return (
                          <button
                            key={cuenta.email}
                            type="button"
                            role="tab"
                            aria-selected={isSelected}
                            onClick={() => selectSlide(idx)}
                            className={`min-h-[34px] rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors truncate ${
                              isSelected
                                ? 'bg-[#0F2942] text-white shadow-sm'
                                : 'text-[#475569] hover:text-[#0F2942] hover:bg-white'
                            }`}
                          >
                            {meta.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!isOnline && sesionGuardada && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 space-y-2 text-xs text-amber-900">
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
                      className="w-full rounded-xl bg-[#0F2942] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] transition-colors min-h-[40px]"
                    >
                      Entrar con caché offline
                    </button>
                  </div>
                )}

                {error && (
                  <div className="rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-[#DC2626]">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
                  <div>
                    <label htmlFor="auth-email" className="block font-semibold text-[#0F2942] mb-1.5">
                      Correo electrónico
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        id="auth-email"
                        type="email"
                        required
                        placeholder="usuario@empresa.do"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-[#F8FAFC]/70 pl-10 pr-3.5 py-2.5 text-xs text-[#0F2942] placeholder:text-slate-400 focus:bg-white focus:border-[#0284C7] focus:outline-none transition-colors min-h-[46px]"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="auth-password"
                      className="block font-semibold text-[#0F2942] mb-1.5"
                    >
                      Contraseña
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        id="auth-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="Ingresa tu contraseña"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-[#F8FAFC]/70 pl-10 pr-10 py-2.5 text-xs text-[#0F2942] placeholder:text-slate-400 focus:bg-white focus:border-[#0284C7] focus:outline-none transition-colors min-h-[46px]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-[#0F2942] hover:bg-slate-100 transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-[#0F2942] py-2.5 px-4 text-xs font-semibold text-white hover:bg-[#0284C7] disabled:opacity-60 transition-colors shadow-sm min-h-[46px]"
                  >
                    {loading ? 'Verificando acceso...' : 'Iniciar sesión'}
                  </button>
                </form>

                {isDemoActivo && (
                  <p className="text-[11px] text-[#475569] text-center leading-relaxed">
                    Clave piloto:{' '}
                    <span className="font-mono font-semibold text-[#0F2942]">demo123</span> · Los
                    datos locales se sincronizan automáticamente.
                  </p>
                )}
              </div>

              {/* Pie discreto */}
              <p className="text-[11px] text-slate-400 text-center">
                Consola unificada · Administrador · Coordinador · Técnico
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
