import React from 'react';

interface SkeletonBlockProps {
  className?: string;
  dark?: boolean;
}

export const SkeletonBlock: React.FC<SkeletonBlockProps> = ({
  className = 'h-4 w-full',
  dark = false,
}) => (
  <div
    aria-hidden="true"
    className={`rounded-md ${dark ? 'skeleton-shimmer-dark' : 'skeleton-shimmer'} ${className}`}
  />
);

export const AppShellSkeleton: React.FC = () => (
  <div
    className="min-h-screen flex bg-[#F1F5F9] text-[#0D1C2F]"
    role="status"
    aria-live="polite"
    aria-label="Cargando espacio de trabajo de SIRIUS"
  >
    <aside className="hidden lg:flex lg:w-[72px] lg:flex-col items-center border-r border-slate-200/80 bg-white py-4 gap-4 shrink-0">
      <SkeletonBlock className="h-10 w-10 rounded-xl" />
      <div className="rounded-2xl bg-slate-50 p-1.5 space-y-2 flex-1 flex flex-col items-center">
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-10 w-10 rounded-xl" />
        ))}
      </div>
      <SkeletonBlock className="h-10 w-10 rounded-xl" />
    </aside>

    <div className="flex-1 flex flex-col min-w-0">
      <header className="h-16 border-b border-slate-200/80 bg-white px-4 sm:px-6 flex items-center justify-between gap-4">
        <SkeletonBlock className="h-5 w-40" />
        <SkeletonBlock className="hidden lg:block h-10 w-96 rounded-xl" />
        <div className="flex items-center gap-2.5">
          <SkeletonBlock className="h-9 w-28 rounded-xl" />
          <SkeletonBlock className="h-9 w-32 rounded-xl" />
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 space-y-6 max-w-[1440px] w-full mx-auto">
        <AdminHoySkeleton />
      </main>
    </div>
  </div>
);

export const AdminHoySkeleton: React.FC = () => (
  <div className="space-y-6" role="status" aria-label="Cargando resumen operativo">
    <div className="space-y-2">
      <SkeletonBlock className="h-8 w-72" />
      <SkeletonBlock className="h-4 w-96 max-w-full" />
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
      <div className="lg:col-span-4 rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4">
        <SkeletonBlock className="h-4 w-36" />
        <SkeletonBlock className="h-9 w-48" />
        <div className="grid grid-cols-2 gap-2.5">
          <SkeletonBlock className="h-10 rounded-xl" />
          <SkeletonBlock className="h-10 rounded-xl" />
        </div>
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
          <SkeletonBlock className="h-14 rounded-xl" />
          <SkeletonBlock className="h-14 rounded-xl" />
          <SkeletonBlock className="h-14 rounded-xl" />
        </div>
      </div>

      <div className="lg:col-span-4 rounded-2xl border border-slate-200/90 bg-white p-4 grid grid-cols-2 gap-3">
        <SkeletonBlock className="h-28 rounded-xl" />
        <SkeletonBlock className="h-28 rounded-xl" />
        <SkeletonBlock className="h-28 rounded-xl" />
        <SkeletonBlock className="h-28 rounded-xl" />
      </div>

      <div className="lg:col-span-4 rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3">
        <SkeletonBlock className="h-4 w-44" />
        <SkeletonBlock className="h-52 w-full rounded-xl" />
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
      <div className="lg:col-span-4 space-y-5">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3">
          <SkeletonBlock className="h-4 w-44" />
          <SkeletonBlock className="h-3 w-full rounded-full" />
          <SkeletonBlock className="h-4 w-36" />
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3">
          <SkeletonBlock className="h-4 w-36" />
          <div className="grid grid-cols-2 gap-3">
            <SkeletonBlock className="h-24 rounded-xl" />
            <SkeletonBlock className="h-24 rounded-xl" />
          </div>
        </div>
      </div>
      <div className="lg:col-span-8 rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <SkeletonBlock className="h-5 w-52" />
          <SkeletonBlock className="h-9 w-48 rounded-xl" />
        </div>
        <SkeletonBlock className="h-56 w-full rounded-xl" />
      </div>
    </div>
  </div>
);

export const ProyectosViewSkeleton: React.FC = () => (
  <div className="space-y-6" role="status" aria-label="Cargando proyectos y rutas">
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
      <div className="xl:col-span-5 grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3">
            <SkeletonBlock className="h-3.5 w-28" />
            <SkeletonBlock className="h-7 w-24" />
          </div>
        ))}
      </div>
      <div className="xl:col-span-7 rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <SkeletonBlock className="h-4 w-56" />
          <SkeletonBlock className="h-4 w-24" />
        </div>
        <SkeletonBlock className="h-44 w-full rounded-xl" />
      </div>
    </div>

    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
      <SkeletonBlock className="h-10 flex-1 min-w-[220px] rounded-xl" />
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-10 w-36 rounded-xl" />
        <SkeletonBlock className="h-10 w-32 rounded-xl" />
      </div>
    </div>

    {Array.from({ length: 2 }).map((_, i) => (
      <div key={i} className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden">
        <div className="bg-[#F8FAFC] px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="space-y-2 flex-1">
            <SkeletonBlock className="h-3.5 w-48" />
            <SkeletonBlock className="h-5 w-72 max-w-full" />
          </div>
          <SkeletonBlock className="h-10 w-32 rounded-xl" />
        </div>
        <div className="p-5 space-y-3">
          <SkeletonBlock className="h-16 w-full rounded-xl" />
          <SkeletonBlock className="h-16 w-full rounded-xl" />
        </div>
      </div>
    ))}
  </div>
);

export const AgendaViewSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 xl:grid-cols-12 gap-6" role="status" aria-label="Cargando agenda">
    <div className="xl:col-span-5 rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4">
      <SkeletonBlock className="h-5 w-48" />
      <SkeletonBlock className="h-10 w-full rounded-xl" />
      <SkeletonBlock className="h-10 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        <SkeletonBlock className="h-10 w-full rounded-xl" />
        <SkeletonBlock className="h-10 w-full rounded-xl" />
      </div>
      <SkeletonBlock className="h-24 w-full rounded-xl" />
      <SkeletonBlock className="h-11 w-full rounded-xl" />
    </div>
    <div className="xl:col-span-7 space-y-4">
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 flex items-center justify-between gap-3">
        <SkeletonBlock className="h-9 w-40 rounded-xl" />
        <SkeletonBlock className="h-9 w-52 rounded-xl" />
      </div>
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  </div>
);

export const RouteAlternativesSkeleton: React.FC = () => (
  <div className="space-y-3" role="status" aria-label="Calculando rutas en red vial">
    {Array.from({ length: 2 }).map((_, i) => (
      <div key={i} className="rounded-2xl border border-slate-200/80 bg-[#F8FAFC] p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <SkeletonBlock className="h-4 w-44" />
          <SkeletonBlock className="h-4 w-20" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <SkeletonBlock className="h-3.5 w-full" />
          <SkeletonBlock className="h-3.5 w-full" />
          <SkeletonBlock className="h-3.5 w-full" />
        </div>
      </div>
    ))}
  </div>
);

export const RouteCalculatorSkeleton: React.FC = () => (
  <div className="space-y-6" role="status" aria-label="Cargando calculadora de rutas">
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 flex items-center justify-between gap-4">
      <SkeletonBlock className="h-6 w-72" />
      <SkeletonBlock className="h-10 w-44 rounded-xl" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4">
        <SkeletonBlock className="h-5 w-44" />
        <SkeletonBlock className="h-10 w-full rounded-xl" />
        <RouteAlternativesSkeleton />
        <SkeletonBlock className="h-32 w-full rounded-xl" />
      </div>
      <div className="lg:col-span-7 rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4">
        <SkeletonBlock className="h-5 w-52" />
        <SkeletonBlock className="h-64 w-full rounded-xl" />
      </div>
    </div>
  </div>
);

export const ViaticosViewSkeleton: React.FC = () => (
  <div className="space-y-6" role="status" aria-label="Cargando libro de viáticos">
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-2.5">
          <SkeletonBlock className="h-3.5 w-28" />
          <SkeletonBlock className="h-7 w-32" />
        </div>
      ))}
    </div>
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3">
      <SkeletonBlock className="h-5 w-64" />
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  </div>
);

export const PresupuestosViewSkeleton: React.FC = () => (
  <div className="space-y-6" role="status" aria-label="Cargando presupuestos y márgenes">
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
      <SkeletonBlock className="h-10 flex-1 min-w-[220px] rounded-xl" />
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-10 w-36 rounded-xl" />
        <SkeletonBlock className="h-10 w-36 rounded-xl" />
        <SkeletonBlock className="h-10 w-32 rounded-xl" />
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-2.5">
          <SkeletonBlock className="h-3.5 w-28" />
          <SkeletonBlock className="h-7 w-36" />
          <SkeletonBlock className="h-3 w-32" />
        </div>
      ))}
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      <div className="xl:col-span-7 rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <SkeletonBlock className="h-5 w-56" />
          <SkeletonBlock className="h-8 w-44 rounded-xl" />
        </div>
        <SkeletonBlock className="h-64 w-full rounded-xl" />
      </div>
      <div className="xl:col-span-5 rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <SkeletonBlock className="h-5 w-48" />
          <SkeletonBlock className="h-8 w-36 rounded-xl" />
        </div>
        <SkeletonBlock className="h-64 w-full rounded-xl" />
      </div>
    </div>

    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3">
      <SkeletonBlock className="h-5 w-64" />
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  </div>
);

export const CatalogosViewSkeleton: React.FC = () => (
  <div className="space-y-6" role="status" aria-label="Cargando catálogos y flota">
    <div className="rounded-2xl border border-slate-200/90 bg-white p-2.5 flex flex-wrap gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-9 w-28 rounded-xl" />
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
      <div className="lg:col-span-4 rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3">
        <SkeletonBlock className="h-5 w-36" />
        <SkeletonBlock className="h-10 w-full rounded-xl" />
        <SkeletonBlock className="h-10 w-full rounded-xl" />
        <SkeletonBlock className="h-10 w-full rounded-xl" />
      </div>
    </div>
  </div>
);

export const AuditoriaViewSkeleton: React.FC = () => (
  <div className="space-y-4" role="status" aria-label="Cargando auditoría">
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 flex items-center justify-between gap-4">
      <SkeletonBlock className="h-5 w-60" />
      <SkeletonBlock className="h-10 w-56 rounded-xl" />
    </div>
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  </div>
);

export const ConfiguracionViewSkeleton: React.FC = () => (
  <div className="space-y-6" role="status" aria-label="Cargando configuración">
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 flex items-center justify-between gap-4">
      <div className="space-y-2">
        <SkeletonBlock className="h-6 w-64" />
        <SkeletonBlock className="h-4 w-96 max-w-full" />
      </div>
      <SkeletonBlock className="h-10 w-32 rounded-xl" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-3 rounded-2xl border border-slate-200/90 bg-white p-3 space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-10 w-full rounded-xl" />
        ))}
      </div>
      <div className="lg:col-span-9 rounded-2xl border border-slate-200/90 bg-white p-6 space-y-4">
        <SkeletonBlock className="h-5 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  </div>
);

/* Skeletons dedicados para módulo Técnico en campo */
export const TecnicoHoySkeleton: React.FC = () => (
  <div className="space-y-5" role="status" aria-label="Cargando jornada de hoy en campo">
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3">
      <SkeletonBlock className="h-6 w-56" />
      <SkeletonBlock className="h-4 w-72 max-w-full" />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-2">
        <SkeletonBlock className="h-3.5 w-24" />
        <SkeletonBlock className="h-7 w-14" />
      </div>
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-2">
        <SkeletonBlock className="h-3.5 w-28" />
        <SkeletonBlock className="h-7 w-24" />
      </div>
    </div>
    {Array.from({ length: 2 }).map((_, i) => (
      <div key={i} className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 flex-1">
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="h-5 w-52" />
            <SkeletonBlock className="h-3.5 w-44" />
          </div>
          <SkeletonBlock className="h-6 w-20 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <SkeletonBlock className="h-11 w-full rounded-xl" />
          <SkeletonBlock className="h-11 w-full rounded-xl" />
        </div>
      </div>
    ))}
  </div>
);

export const TecnicoRutasSkeleton: React.FC = () => (
  <div className="space-y-4" role="status" aria-label="Cargando rutas asignadas">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 flex-1">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-5 w-60 max-w-full" />
            <SkeletonBlock className="h-3.5 w-48" />
          </div>
          <SkeletonBlock className="h-10 w-24 rounded-xl" />
        </div>
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-full" />
        </div>
      </div>
    ))}
  </div>
);

export const TecnicoAgendaSkeleton: React.FC = () => (
  <div className="space-y-4" role="status" aria-label="Cargando agenda semanal">
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 flex items-center justify-between">
      <SkeletonBlock className="h-5 w-44" />
      <div className="flex gap-2">
        <SkeletonBlock className="h-10 w-10 rounded-xl" />
        <SkeletonBlock className="h-10 w-10 rounded-xl" />
      </div>
    </div>
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3">
        <SkeletonBlock className="h-4 w-36" />
        <SkeletonBlock className="h-14 w-full rounded-xl" />
      </div>
    ))}
  </div>
);

export const TecnicoViaticosSkeleton: React.FC = () => (
  <div className="space-y-4" role="status" aria-label="Cargando viáticos del técnico">
    <div className="grid grid-cols-3 gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-2">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-6 w-24" />
        </div>
      ))}
    </div>
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="rounded-2xl border border-slate-200/90 bg-white p-4 flex items-center justify-between gap-3">
        <div className="space-y-2 flex-1">
          <SkeletonBlock className="h-4 w-44" />
          <SkeletonBlock className="h-3.5 w-56 max-w-full" />
        </div>
        <SkeletonBlock className="h-16 w-16 rounded-xl shrink-0" />
      </div>
    ))}
  </div>
);
