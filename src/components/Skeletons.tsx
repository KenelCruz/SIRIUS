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
    className="min-h-screen flex bg-[#F8FAFC] text-[#0D1C2F]"
    role="status"
    aria-live="polite"
    aria-label="Cargando espacio de trabajo de SIRIUS"
  >
    <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-[#0F2942] p-5 space-y-6 shrink-0">
      <div className="flex items-center gap-3 pb-4 border-b border-white/10">
        <SkeletonBlock dark className="h-9 w-9 rounded-md shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock dark className="h-4 w-24" />
          <SkeletonBlock dark className="h-3 w-36" />
        </div>
      </div>
      <div className="space-y-2.5 flex-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonBlock key={i} dark className="h-9 w-full rounded-md" />
        ))}
      </div>
      <div className="pt-4 border-t border-white/10 space-y-2.5">
        <SkeletonBlock dark className="h-12 w-full rounded-md" />
        <SkeletonBlock dark className="h-10 w-full rounded-md" />
      </div>
    </aside>

    <div className="flex-1 flex flex-col min-w-0">
      <header className="h-14 border-b border-slate-200 bg-white px-4 sm:px-6 flex items-center justify-between gap-4">
        <SkeletonBlock className="h-5 w-52" />
        <div className="flex items-center gap-2.5">
          <SkeletonBlock className="h-9 w-24 rounded-md" />
          <SkeletonBlock className="h-9 w-32 rounded-md" />
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
    <div className="rounded-lg border border-slate-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="space-y-2 flex-1">
        <SkeletonBlock className="h-6 w-64" />
        <SkeletonBlock className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-10 w-28 rounded-md" />
        <SkeletonBlock className="h-10 w-32 rounded-md" />
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div key={idx} className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between">
            <SkeletonBlock className="h-3.5 w-28" />
            <SkeletonBlock className="h-4 w-4" />
          </div>
          <SkeletonBlock className="h-8 w-20" />
          <SkeletonBlock className="h-3 w-36" />
        </div>
      ))}
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {Array.from({ length: 2 }).map((_, col) => (
        <div key={col} className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <SkeletonBlock className="h-4 w-44" />
            <SkeletonBlock className="h-3.5 w-20" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, row) => (
              <div key={row} className="flex items-center justify-between gap-3 py-1">
                <div className="space-y-1.5 flex-1">
                  <SkeletonBlock className="h-4 w-3/5" />
                  <SkeletonBlock className="h-3 w-2/5" />
                </div>
                <SkeletonBlock className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const ProyectosViewSkeleton: React.FC = () => (
  <div className="space-y-6" role="status" aria-label="Cargando proyectos y rutas">
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
      <div className="xl:col-span-5 grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
            <SkeletonBlock className="h-3.5 w-28" />
            <SkeletonBlock className="h-7 w-24" />
          </div>
        ))}
      </div>
      <div className="xl:col-span-7 rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <SkeletonBlock className="h-4 w-56" />
          <SkeletonBlock className="h-4 w-24" />
        </div>
        <SkeletonBlock className="h-44 w-full rounded-lg" />
      </div>
    </div>

    <div className="rounded-lg border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
      <SkeletonBlock className="h-10 flex-1 min-w-[220px] rounded-md" />
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-10 w-36 rounded-md" />
        <SkeletonBlock className="h-10 w-32 rounded-md" />
      </div>
    </div>

    {Array.from({ length: 2 }).map((_, i) => (
      <div key={i} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="space-y-2 flex-1">
            <SkeletonBlock className="h-3.5 w-48" />
            <SkeletonBlock className="h-5 w-72 max-w-full" />
          </div>
          <SkeletonBlock className="h-10 w-32 rounded-md" />
        </div>
        <div className="p-5 space-y-3">
          <SkeletonBlock className="h-16 w-full rounded-lg" />
          <SkeletonBlock className="h-16 w-full rounded-lg" />
        </div>
      </div>
    ))}
  </div>
);

export const AgendaViewSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 xl:grid-cols-12 gap-6" role="status" aria-label="Cargando agenda">
    <div className="xl:col-span-5 rounded-lg border border-slate-200 bg-white p-5 space-y-4">
      <SkeletonBlock className="h-5 w-48" />
      <SkeletonBlock className="h-10 w-full rounded-md" />
      <SkeletonBlock className="h-10 w-full rounded-md" />
      <div className="grid grid-cols-2 gap-3">
        <SkeletonBlock className="h-10 w-full rounded-md" />
        <SkeletonBlock className="h-10 w-full rounded-md" />
      </div>
      <SkeletonBlock className="h-24 w-full rounded-md" />
      <SkeletonBlock className="h-11 w-full rounded-md" />
    </div>
    <div className="xl:col-span-7 space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 flex items-center justify-between gap-3">
        <SkeletonBlock className="h-9 w-40 rounded-md" />
        <SkeletonBlock className="h-9 w-52 rounded-md" />
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </div>
  </div>
);

export const RouteAlternativesSkeleton: React.FC = () => (
  <div className="space-y-3" role="status" aria-label="Calculando rutas en red vial">
    {Array.from({ length: 2 }).map((_, i) => (
      <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2.5">
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
    <div className="rounded-lg border border-slate-200 bg-white p-5 flex items-center justify-between gap-4">
      <SkeletonBlock className="h-6 w-72" />
      <SkeletonBlock className="h-10 w-44 rounded-md" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <SkeletonBlock className="h-5 w-44" />
        <SkeletonBlock className="h-10 w-full rounded-md" />
        <RouteAlternativesSkeleton />
        <SkeletonBlock className="h-32 w-full rounded-lg" />
      </div>
      <div className="lg:col-span-7 rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <SkeletonBlock className="h-5 w-52" />
        <SkeletonBlock className="h-64 w-full rounded-lg" />
      </div>
    </div>
  </div>
);

export const ViaticosViewSkeleton: React.FC = () => (
  <div className="space-y-6" role="status" aria-label="Cargando libro de viáticos">
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-slate-200 bg-white p-5 space-y-2.5">
          <SkeletonBlock className="h-3.5 w-28" />
          <SkeletonBlock className="h-7 w-32" />
        </div>
      ))}
    </div>
    <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
      <SkeletonBlock className="h-5 w-64" />
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-12 w-full rounded-md" />
      ))}
    </div>
  </div>
);

export const CatalogosViewSkeleton: React.FC = () => (
  <div className="space-y-6" role="status" aria-label="Cargando catálogos y flota">
    <div className="rounded-lg border border-slate-200 bg-white p-3 flex flex-wrap gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-9 w-28 rounded-md" />
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 rounded-lg border border-slate-200 bg-white p-5 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
      <div className="lg:col-span-4 rounded-lg border border-slate-200 bg-white p-5 space-y-3">
        <SkeletonBlock className="h-5 w-36" />
        <SkeletonBlock className="h-10 w-full rounded-md" />
        <SkeletonBlock className="h-10 w-full rounded-md" />
        <SkeletonBlock className="h-10 w-full rounded-md" />
      </div>
    </div>
  </div>
);

export const AuditoriaViewSkeleton: React.FC = () => (
  <div className="space-y-4" role="status" aria-label="Cargando auditoría">
    <div className="rounded-lg border border-slate-200 bg-white p-5 flex items-center justify-between gap-4">
      <SkeletonBlock className="h-5 w-60" />
      <SkeletonBlock className="h-10 w-56 rounded-md" />
    </div>
    <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-16 w-full rounded-md" />
      ))}
    </div>
  </div>
);

export const ConfiguracionViewSkeleton: React.FC = () => (
  <div className="space-y-6" role="status" aria-label="Cargando configuración">
    <div className="rounded-lg border border-slate-200 bg-white p-5 flex items-center justify-between gap-4">
      <div className="space-y-2">
        <SkeletonBlock className="h-6 w-64" />
        <SkeletonBlock className="h-4 w-96 max-w-full" />
      </div>
      <SkeletonBlock className="h-10 w-32 rounded-md" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-3 rounded-lg border border-slate-200 bg-white p-3 space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
      <div className="lg:col-span-9 rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <SkeletonBlock className="h-5 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  </div>
);

/* Skeletons dedicados para módulo Técnico en campo */
export const TecnicoHoySkeleton: React.FC = () => (
  <div className="space-y-5" role="status" aria-label="Cargando jornada de hoy en campo">
    <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
      <SkeletonBlock className="h-6 w-56" />
      <SkeletonBlock className="h-4 w-72 max-w-full" />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
        <SkeletonBlock className="h-3.5 w-24" />
        <SkeletonBlock className="h-7 w-14" />
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
        <SkeletonBlock className="h-3.5 w-28" />
        <SkeletonBlock className="h-7 w-24" />
      </div>
    </div>
    {Array.from({ length: 2 }).map((_, i) => (
      <div key={i} className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 flex-1">
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="h-5 w-52" />
            <SkeletonBlock className="h-3.5 w-44" />
          </div>
          <SkeletonBlock className="h-6 w-20 rounded-md" />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <SkeletonBlock className="h-11 w-full rounded-md" />
          <SkeletonBlock className="h-11 w-full rounded-md" />
        </div>
      </div>
    ))}
  </div>
);

export const TecnicoRutasSkeleton: React.FC = () => (
  <div className="space-y-4" role="status" aria-label="Cargando rutas asignadas">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 flex-1">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-5 w-60 max-w-full" />
            <SkeletonBlock className="h-3.5 w-48" />
          </div>
          <SkeletonBlock className="h-10 w-24 rounded-md" />
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
    <div className="rounded-lg border border-slate-200 bg-white p-4 flex items-center justify-between">
      <SkeletonBlock className="h-5 w-44" />
      <div className="flex gap-2">
        <SkeletonBlock className="h-10 w-10 rounded-md" />
        <SkeletonBlock className="h-10 w-10 rounded-md" />
      </div>
    </div>
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
        <SkeletonBlock className="h-4 w-36" />
        <SkeletonBlock className="h-14 w-full rounded-md" />
      </div>
    ))}
  </div>
);

export const TecnicoViaticosSkeleton: React.FC = () => (
  <div className="space-y-4" role="status" aria-label="Cargando viáticos del técnico">
    <div className="grid grid-cols-3 gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-6 w-24" />
        </div>
      ))}
    </div>
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="rounded-lg border border-slate-200 bg-white p-4 flex items-center justify-between gap-3">
        <div className="space-y-2 flex-1">
          <SkeletonBlock className="h-4 w-44" />
          <SkeletonBlock className="h-3.5 w-56 max-w-full" />
        </div>
        <SkeletonBlock className="h-16 w-16 rounded-lg shrink-0" />
      </div>
    ))}
  </div>
);
