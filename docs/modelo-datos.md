# Modelo de Datos Propuesto para Supabase (PostgreSQL + RLS)

Este documento describe el esquema relacional y las políticas de Row-Level Security (RLS) propuestas para migrar **GeoMatrix RD** desde la capa local (`LocalRepositorioOperacion`) hacia **Supabase (Auth + Postgres + Storage)** sin alterar las vistas ni la lógica pura de `src/domain/`.

> **Nota:** En esta entrega no se ejecuta ninguna migración ni conexión en vivo a Supabase. Este archivo sirve como especificación de destino.

## 1. Tipos Enumerados

```sql
create type rol_empresa as enum ('admin', 'coordinador', 'tecnico');

-- Nota A1: `cargo_personal` pasa de enum cerrado a texto referenciado a `cargos_empresa(empresa_id, codigo)`
-- para permitir cargos extensibles conservando los cuatro códigos base ('tecnico', 'ingeniero', 'jefe_brigada', 'chofer').

create type estado_recurso as enum ('disponible', 'en_mantenimiento', 'fuera_servicio');

create type estado_servicio as enum (
  'cotizado',
  'aprobado',
  'programado',
  'en_campo',
  'procesando',
  'entregado',
  'cobrado'
);

create type categoria_viatico as enum (
  'Combustible',
  'Dieta',
  'Hospedaje',
  'Peaje',
  'Materiales',
  'Otro'
);

create type metodo_viatico as enum ('OCR Móvil', 'GPS Ruta', 'Dieta Automática', 'Manual');

create type estado_aprobacion_viatico as enum ('pendiente', 'aprobado', 'rechazado');
```

## 2. Tablas Multi-Tenant (aisladas por `empresa_id`)

```sql
create table empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rnc text not null,
  telefono text,
  direccion_base text not null,
  base_lat double precision not null,
  base_lon double precision not null,
  plan_mensual_rd numeric(12,2) not null default 0,
  estado_suscripcion text not null default 'activa' check (estado_suscripcion in ('activa', 'prueba', 'suspendida')),
  zona_horaria text not null default 'America/Santo_Domingo',
  moneda text not null default 'RD$',
  fecha_alta date not null default current_date
);

create table cargos_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  codigo text not null,
  etiqueta text not null,
  es_base boolean not null default false,
  activo boolean not null default true,
  unique (empresa_id, codigo)
);

create table usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  nombre text not null,
  activo boolean not null default true
);

create table personal (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  usuario_id uuid references usuarios(id) on delete set null,
  nombre text not null,
  cargo text not null,
  telefono text,
  activo boolean not null default true,
  foreign key (empresa_id, cargo) references cargos_empresa(empresa_id, codigo) on update cascade on delete restrict
);

create table membresias_empresa (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  rol rol_empresa not null,
  personal_id uuid references personal(id) on delete set null,
  activo boolean not null default true,
  unique (usuario_id, empresa_id)
);

create table vehiculos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  etiqueta text not null,
  placa text not null,
  tipo_combustible_id text,
  tipo_combustible text not null,
  precio_galon_rd numeric(10,2) not null,
  km_por_gal numeric(8,2) not null,
  mantenimiento_por_km_rd numeric(8,2) not null,
  estado estado_recurso not null default 'disponible'
);

create table equipos_gnss (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  serial text not null,
  estado estado_recurso not null default 'disponible'
);

create table cuadrillas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  jefe_id uuid not null references personal(id),
  activa boolean not null default true
);

create table cuadrillas_miembros (
  cuadrilla_id uuid not null references cuadrillas(id) on delete cascade,
  personal_id uuid not null references personal(id) on delete cascade,
  primary key (cuadrilla_id, personal_id)
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  rnc text not null,
  contacto text not null,
  telefono text,
  email text
);

create table proyectos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  cliente_id uuid not null references clientes(id),
  nombre text not null,
  codigo_contrato text not null,
  presupuesto_viaticos_rd numeric(12,2) not null default 0,
  valor_contrato_rd numeric(12,2) not null default 0,
  estado estado_servicio not null default 'cotizado',
  fecha_creacion date not null default current_date,
  notas text,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table rutas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  nombre text not null,
  codigo_parcela text not null,
  ubicacion text not null,
  provincia text not null,
  fecha_prevista date not null,
  kmz_file_name text not null,
  features_json jsonb not null,
  centroid_lat double precision not null,
  centroid_lon double precision not null,
  centroid_utm_easting double precision not null,
  centroid_utm_northing double precision not null,
  total_area_m2 double precision not null,
  total_perimeter_m double precision not null,
  route_summary_json jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table servicios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  ruta_id uuid not null references rutas(id) on delete cascade,
  tipo_servicio_id text not null,
  nombre text not null,
  cotizacion_rd numeric(12,2) not null,
  config_version integer,
  tarifa_base_usada_rd numeric(12,2),
  recargos_usados_rd numeric(12,2),
  estado estado_servicio not null default 'cotizado',
  fecha_real_inicio date,
  fecha_real_fin date,
  monto_cobrado_rd numeric(12,2),
  fecha_pago date,
  notas text,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint chk_cobrado_campos check (
    estado <> 'cobrado' or (monto_cobrado_rd is not null and monto_cobrado_rd > 0 and fecha_pago is not null)
  )
);

create table bitacoras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  servicio_id uuid not null references servicios(id) on delete cascade,
  ruta_id uuid not null references rutas(id) on delete cascade,
  autor_usuario_id uuid not null references usuarios(id),
  fecha_ast text not null,
  nota text not null,
  fotos_paths text[] not null default '{}'
);

create table asignaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  ruta_id uuid not null references rutas(id) on delete cascade,
  fecha_inicio date not null,
  fecha_fin date not null,
  cuadrilla_id uuid not null references cuadrillas(id),
  vehiculo_ids uuid[] not null default '{}',
  equipo_ids uuid[] not null default '{}',
  override_motivo text,
  override_usuario_id uuid references usuarios(id),
  override_fecha date,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint chk_rango_fechas check (fecha_inicio <= fecha_fin)
);

create table viaticos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  creado_por_usuario_id uuid not null references usuarios(id),
  ruta_id uuid references rutas(id) on delete set null,
  fecha_iso date not null,
  timestamp_ast text not null,
  categoria categoria_viatico not null,
  comercio text not null,
  monto_rd numeric(12,2) not null check (monto_rd >= 0),
  itbis_rd numeric(12,2) not null default 0,
  ncf text,
  metodo metodo_viatico not null,
  gps_coords_json jsonb,
  distance_km numeric(8,2),
  config_version integer,
  tarifa_usada_rd numeric(12,2),
  concepto_distancia_usado text check (concepto_distancia_usado in ('ida_vuelta', 'solo_ida')),
  comprobante_storage_path text,
  estado_aprobacion estado_aprobacion_viatico not null default 'pendiente',
  motivo_rechazo text,
  aprobado_por_usuario_id uuid references usuarios(id),
  aprobado_en text,
  notas text,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table viatico_repartos (
  id uuid primary key default gen_random_uuid(),
  viatico_id uuid not null references viaticos(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  proyecto_id uuid references proyectos(id) on delete cascade, -- NULL representa 'sin_asignar'
  monto_rd numeric(12,2) not null check (monto_rd >= 0),
  unique (viatico_id, proyecto_id)
);

create table configuracion_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  clave text not null, -- ej. 'categorias_viatico', 'catalogo_servicios', 'catalogo_combustibles'
  valor jsonb not null,
  vigencia_desde date not null default '2026-01-01',
  updated_at timestamptz not null default now(),
  unique (empresa_id, clave, vigencia_desde)
);

create table tarifas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  concepto text not null, -- ej. 'combustible:diesel_optimo', 'servicio:deslinde', 'factores_terreno', 'reglas_viaticos'
  version integer not null check (version >= 1),
  valor jsonb not null,
  vigencia_desde date not null,
  creado_por_usuario_id uuid references usuarios(id),
  created_at timestamptz not null default now(),
  unique (empresa_id, concepto, version),
  unique (empresa_id, concepto, vigencia_desde) -- Evita solapamiento de vigencias en la misma fecha
);

create table onboarding_empresa (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  paso_actual text not null default 'empresa',
  pasos_json jsonb not null,
  tarjeta_ocultada boolean not null default false,
  completado_en timestamptz,
  updated_at timestamptz not null default now()
);

create table historial_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  entidad_tipo text not null,
  entidad_id text not null,
  accion text not null,
  detalle text not null,
  usuario_id uuid not null references usuarios(id),
  fecha_ast text not null,
  metadata jsonb
);
```

## 3. Índices y Reglas de Integridad

```sql
create index idx_proyectos_empresa on proyectos (empresa_id, estado);
create index idx_rutas_empresa_proyecto on rutas (empresa_id, proyecto_id);
create index idx_servicios_empresa_ruta on servicios (empresa_id, ruta_id, estado);
create index idx_asignaciones_rango on asignaciones (empresa_id, fecha_inicio, fecha_fin);
create index idx_viaticos_empresa_estado on viaticos (empresa_id, estado_aprobacion, fecha_iso);
create index idx_repartos_proyecto on viatico_repartos (empresa_id, proyecto_id);
create index idx_historial_empresa on historial_eventos (empresa_id, fecha_ast desc);
create index idx_tarifas_vigencia on tarifas (empresa_id, concepto, vigencia_desde desc);
create index idx_cargos_empresa on cargos_empresa (empresa_id, activo);
```

## 4. Políticas RLS (Row-Level Security) por `empresa_id` y `rol`

Funciones auxiliares en Postgres para evaluar membresía y rol del usuario autenticado (`auth.uid()`):

```sql
create or replace function app_rol_en_empresa(target_empresa_id uuid)
returns rol_empresa
language sql stable security definer as $$
  select rol from membresias_empresa
  where usuario_id = auth.uid()
    and empresa_id = target_empresa_id
    and activo = true
  limit 1;
$$;

create or replace function app_es_ruta_asignada_a_usuario(target_ruta_id uuid)
returns boolean
language sql stable security definer as $$
  select exists (
    select 1
    from asignaciones a
    join cuadrillas c on c.id = a.cuadrilla_id
    left join cuadrillas_miembros cm on cm.cuadrilla_id = c.id
    join personal p on p.id = c.jefe_id or p.id = cm.personal_id
    where a.ruta_id = target_ruta_id
      and p.usuario_id = auth.uid()
  );
$$;
```

Políticas base:
- **Todas las tablas multi-tenant** habilitan `alter table ... enable row level security;`.
- **`admin`**: lectura/escritura completa en su `empresa_id`, incluidas `empresas`, `membresias_empresa`, `cargos_empresa`, `configuracion_empresa`, `tarifas` y `onboarding_empresa`. Los campos de suscripción (`plan_mensual_rd`, `estado_suscripcion`) se protegen mediante trigger/privilegios de servidor para que no puedan alterarse desde el cliente.
- **`coordinador`**:
  - Lectura/escritura operativa en su `empresa_id` (`clientes`, `proyectos`, `rutas`, `servicios`, `asignaciones`, `personal`, `vehiculos`, `equipos_gnss`, `cuadrillas`, `viaticos`, `viatico_repartos`, `historial_eventos`).
  - Solo lectura (`SELECT`) sobre `cargos_empresa`, `configuracion_empresa` y `tarifas` para servicios, terreno y combustibles; sin escritura en configuración ni onboarding.
- **`tecnico`**:
  - `SELECT` en `rutas`, `servicios`, `bitacoras` filtrado por `app_es_ruta_asignada_a_usuario(ruta_id)`.
  - `UPDATE` en `servicios` restringido a cambios `programado -> en_campo -> procesando` en rutas asignadas.
  - `INSERT` en `bitacoras` únicamente sobre servicios en rutas asignadas.
  - `SELECT` / `INSERT` en `viaticos` donde `creado_por_usuario_id = auth.uid()`; sin permisos de aprobación/rechazo ni eliminación de aprobados.
  - `SELECT` únicamente sobre `cargos_empresa` (etiquetas activas) y proyección segura de reglas no financieras de captura (`gpsRuta` y presets rápidos). Sin acceso a `tarifas` de servicios/combustible ni `onboarding_empresa`.
