# GeoMatrix RD (SIRIUS) — Arquitectura, Módulos del Sistema y Lógica Aplicada

**Documento Técnico y Funcional para Presentación y Revisión Operativa**  
**Plataforma:** GeoMatrix RD — Levantamientos KMZ, Agenda, Flota y Viáticos (SIRIUS)  
**Ámbito Geográfico y Operativo:** República Dominicana · Moneda base `RD$` · Zona horaria `America/Santo_Domingo (AST)` · Proyección `UTM Zona 19N (EPSG:32619)`  
**Stack Tecnológico:** React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + Leaflet + JSZip + Recharts + LibreDWG (WASM) + PWA Offline + Express (`server.ts`) + OCR Fiscal con Gemini  

---

## Índice de Contenidos

1. [Visión General y Arquitectura por Capas](#1-visión-general-y-arquitectura-por-capas)
2. [Roles, Seguridad RBAC y Proyección de Datos](#2-roles-seguridad-rbac-y-proyección-de-datos)
3. [Módulo 1: Acceso, Multiempresa y Sincronización Offline (LWW)](#3-módulo-1-acceso-multiempresa-y-sincronización-offline-lww)
4. [Módulo 2: Clientes, Proyectos, Rutas KMZ/GeoJSON y Visores Cartográfico/CAD](#4-módulo-2-clientes-proyectos-rutas-kmzgeojson-y-visores-cartográficocad)
5. [Módulo 3: Cotizador de Servicios, Rutas Óptimas y Máquina de Estados](#5-módulo-3-cotizador-de-servicios-rutas-óptimas-y-máquina-de-estados)
6. [Módulo 4: Agenda Operativa, Cuadrillas, Misiones, Conflictos y Rentas](#6-módulo-4-agenda-operativa-cuadrillas-misiones-conflictos-y-rentas)
7. [Módulo 5: Viáticos, OCR Fiscal, Topes por Cargo/Misión, Reparto Exacto e Inmutabilidad](#7-módulo-5-viáticos-ocr-fiscal-topes-por-cargomisión-reparto-exacto-e-inmutabilidad)
8. [Módulo 6: Control de Flota y Rendimiento de Combustible](#8-módulo-6-control-de-flota-y-rendimiento-de-combustible)
9. [Módulo 7: Configuración Versionada con Vigencias y Onboarding Guiado](#9-módulo-7-configuración-versionada-con-vigencias-y-onboarding-guiado)
10. [Módulo 8: Módulo Móvil del Técnico en Campo](#10-módulo-8-módulo-móvil-del-técnico-en-campo)
11. [Módulo 9: Bitácora de Auditoría (F16), Tutoriales y Backend Express](#11-módulo-9-bitácora-de-auditoría-f16-tutoriales-y-backend-express)
12. [Resumen Ejecutivo de Reglas Críticas e Invariantes](#12-resumen-ejecutivo-de-reglas-críticas-e-invariantes)
13. [Guía Rápida para Exportar este Documento a PDF](#13-guía-rápida-para-exportar-este-documento-a-pdf)

---

## 1. Visión General y Arquitectura por Capas

**GeoMatrix RD** es una aplicación web progresiva (PWA) multiempresa diseñada para empresas de agrimensura, catastro y topografía en República Dominicana. Controla el ciclo operativo completo: desde la carga de un archivo `.kmz`/`.kml`/`.geojson` o plano CAD `.dwg`/`.dxf`, la cotización de servicios topográficos y el cálculo de rutas con peajes, hasta la programación sin choques de brigadas, vehículos y equipos GNSS, la gestión de rentas externas, el control de rendimiento de combustible y la aprobación contable de viáticos con captura OCR en campo y soporte offline.

El sistema separa estrictamente la **lógica de negocio pura** (100% determinista y cubierta por pruebas unitarias en Vitest) de la interfaz React y de la capa de persistencia:

```text
+-------------------------------------------------------------------------+
|                    CAPA DE PRESENTACIÓN (src/components/)               |
|  - Vistas Admin / Coordinador (Hoy, Proyectos, Agenda, Rutas, Mapa/CAD, |
|    Viáticos, Catálogos/Flota, Auditoría, Configuración, Onboarding)     |
|  - Vistas Móviles Técnico (Hoy, Mis Rutas, Detalle, Agenda, Viáticos)   |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                HOOKS Y ESTADO REACTIVO (src/hooks/)                     |
|  - useOperacionEmpresa: sesión, snapshot por rol, acciones y auto-sync  |
|  - useOnlineStatus / usePWAInstall: conectividad e instalación PWA      |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|          REPOSITORIO DE DATOS (src/data/LocalRepositorioOperacion.ts)   |
|  - Aislamiento multiempresa (empresa_id) y persistencia localStorage    |
|  - Validación transaccional, auditoría F16 y cola de sincronización     |
+--------------------+-----------------------------------+----------------+
                     |                                   |
                     v                                   v
+------------------------------------+  +---------------------------------+
|   DOMINIO PURO (src/domain/)       |  | UTILIDADES TÉCNICAS (src/utils/)|
| - permisos.ts     - configuracion  |  | - geodesy.ts    - kmzParser.ts  |
| - estados.ts      - onboarding.ts  |  | - routingEngine - osmGeocode.ts |
| - conflictos.ts   - rendimiento.ts |  | - dwgParser.ts (WASM LibreDWG)  |
| - viaticos.ts     - rentas.ts      |  +----------------+----------------+
| - tecnico.ts      - sync.ts        |                   |
+------------------------------------+                   v
                                        +---------------------------------+
                                        | SERVIDOR EXPRESS (server.ts)    |
                                        | - /api/health, /api/state       |
                                        | - /api/sync (reconciliación LWW)|
                                        | - /api/expenses/analyze-receipt |
                                        +---------------------------------+
```

---

## 2. Roles, Seguridad RBAC y Proyección de Datos

El control de acceso se rige por `src/domain/permisos.ts` y `src/domain/configuracion.ts`. Existen tres roles por membresía de empresa (`RolEmpresa`):

| Capacidad del Sistema | Administrador (`admin`) | Coordinador (`coordinador`) | Técnico (`tecnico`) |
| :--- | :---: | :---: | :---: |
| Gestión de empresa, RNC, usuarios, cargos y vigencias | Sí (Edición completa) | No (Solo lectura en secciones permitidas) | Sin acceso |
| Catálogos operativos (Clientes, Personal, Flota, GNSS, Cuadrillas) | Sí | Sí | Sin acceso a catálogos globales |
| Proyectos, Rutas KMZ, Cotizaciones y Cobros | Sí | Sí | Solo lectura operativa de rutas asignadas (sin montos) |
| Agenda, Asignaciones, Misiones y Rentas | Sí | Sí | Solo consulta de su agenda y misiones vinculadas |
| Transiciones de estado de servicio | Todas (`cotizado` → `cobrado`) | Todas (`cotizado` → `cobrado`) | Solo `programado → en_campo → procesando` |
| Registro de bitácoras de campo | Sí | Sí | Sí, solo en rutas de sus cuadrillas |
| Registro de viáticos | Sí (usa cargo `administrativo` si no tiene ficha de personal) | Sí (usa cargo `administrativo` si no tiene ficha de personal) | Sí, **exige vinculación a `personalId`** |
| Aprobación, rechazo y redistribución de viáticos | Sí (solo si están `pendiente`) | Sí (solo si están `pendiente`) | No |
| Bitácora de Auditoría (F16) | Sí | Sí | Sin acceso |
| Asistente de Onboarding inicial | Sí | No | Sin acceso |

### Aislamiento Estricto del Rol Técnico (`proyectarSnapshotParaRol`)

Cuando un usuario con rol `tecnico` carga la aplicación, el repositorio invoca `proyectarSnapshotParaRol` para generar un tipo separado llamado `SnapshotTecnico`:

1. **Filtrado de alcance:** Solo incluye las cuadrillas donde el usuario es jefe o miembro (`obtenerCuadrillasDeUsuario`), las asignaciones de esas cuadrillas y las rutas, proyectos, clientes, vehículos, equipos y misiones vinculados a dichas rutas. En viáticos, únicamente recibe los creados por él mismo (`creadoPorUsuarioId === usuarioId`).
2. **Sanitización financiera:** Mediante `sanitizarEmpresaParaTecnico`, `sanitizarProyectoParaTecnico`, `sanitizarServicioParaTecnico`, `sanitizarVehiculoParaTecnico`, `sanitizarMisionParaTecnico` y `sanitizarRutaParaTecnico`, se eliminan `presupuestoViaticosRD`, `valorContratoRD`, `cotizacionRD`, `montoCobradoRD`, `fechaPago`, `precioGalonRD`, `kmPorGal`, `mantenimientoPorKmRD`, `tollsRD`, `fuelRD`, datos de suscripción, listas de usuarios/membresías, rentas y eventos de auditoría.
3. **Reglas de captura seguras:** El técnico recibe únicamente `reglasCapturaViaticos` (versión vigente de GPS Ruta, tarifas rápidas/presets, categorías activas y los topes correspondientes exclusivamente a su cargo).

### Matriz de Visibilidad en Configuración (`puedeVerSeccionConfiguracion`)

| Sección de Configuración | `admin` | `coordinador` | `tecnico` |
| :--- | :---: | :---: | :---: |
| Empresa y Datos Generales (`empresa`) | Editar | Oculta | Oculta |
| Usuarios y Roles (`usuarios`) | Editar | Oculta | Oculta |
| Cargos de Personal (`cargos`) | Editar | Oculta | Oculta |
| Servicios, Tarifas y Terreno (`servicios`) | Editar | Solo lectura | Oculta |
| Combustibles, Flota y Rendimiento (`flota`) | Editar | Solo lectura | Oculta |
| Reglas de Viáticos, Topes y Categorías (`viaticos_categorias`) | Editar | Solo lectura | Oculta |
| Ayuda, Tutorial y Onboarding (`ayuda`) | Acceder / Reiniciar | Solo lectura | Oculta |

---

## 3. Módulo 1: Acceso, Multiempresa y Sincronización Offline (LWW)

### Archivos Principales
- **Dominio:** `src/domain/sync.ts`, `src/domain/permisos.ts`
- **Datos y Hooks:** `src/data/LocalRepositorioOperacion.ts`, `src/hooks/useOperacionEmpresa.ts`, `src/hooks/useOnlineStatus.ts`, `src/hooks/usePWAInstall.ts`
- **UI:** `src/components/AuthGate.tsx`, `src/components/OfflineSyncBanner.tsx`, `src/components/PWAInstallButton.tsx`
- **Backend:** `server.ts` (`/api/state`, `/api/sync`)

### Funciones Clave

| Función / Método | Ubicación | Propósito |
| :--- | :--- | :--- |
| `iniciarSesion` / `cambiarEmpresaActiva` / `cerrarSesion` | `LocalRepositorioOperacion.ts` | Autentica al usuario, construye `SesionActiva` con sus membresías activas y persiste la sesión local. |
| `entrarConCacheOffline` | `useOperacionEmpresa.ts` | Permite reanudar la jornada sin conexión usando la última sesión y snapshot cacheados en `localStorage`. |
| `reconciliarEntidadLWW` | `src/domain/sync.ts` | Compara registro local y remoto aplicando resolución **Last-Write-Wins (LWW)**. |
| `reconciliarColeccionLWWConReporte` | `src/domain/sync.ts` | Fusiona colecciones completas y reporta cualquier sobrescritura sobre cambios locales pendientes (`AvisoSobrescrituraLWW`). |
| `sincronizarConServidor` | `LocalRepositorioOperacion.ts` | Envía el snapshot local a `POST /api/sync`, procesa OCR en cola si aplica y reconcilia colecciones locales con la respuesta del servidor. |
| `calcularConteoPendientesPorTipo` | `src/domain/tecnico.ts` | Contabiliza registros locales cuyo `syncStatus !== 'synced'` separados por tipo de entidad para mostrar badges y triggers de auto-sync. |

### Lógica Aplicada
1. **Multiempresa (`empresaId`):** Cada registro de negocio pertenece a una empresa (`emp-aia`, `emp-caribe`, etc.). Si un usuario posee múltiples membresías activas, el sistema solicita seleccionar la empresa activa tras el login y aísla todas las lecturas/escrituras al `empresaActivaId`.
2. **Algoritmo LWW (`reconciliarEntidadLWW`):**
   - Si `local.version !== remoto.version`, gana el registro con **mayor `version`**.
   - En empate de versión, compara timestamps (`Date.parse(updatedAt)`), ganando el más reciente (`localTs >= remotoTs ? local : remoto`).
3. **Detección de Sobrescritura Offline:** Si un registro local tenía `syncStatus === 'pending'` o `'needs_ocr'` y durante la sincronización gana la copia remota, `reconciliarColeccionLWWConReporte` emite un aviso visible en la barra de estado (`OfflineSyncBanner`) para evitar pérdidas silenciosas.
4. **Auto-sincronización al reconectar:** Cuando `useOnlineStatus` detecta retorno de conectividad y `pendingCounts.total > 0`, `useOperacionEmpresa` dispara automáticamente `sincronizarAhora()`.

---

## 4. Módulo 2: Clientes, Proyectos, Rutas KMZ/GeoJSON y Visores Cartográfico/CAD

### Archivos Principales
- **Utilidades Geodésicas y Parseo:** `src/utils/geodesy.ts`, `src/utils/kmzParser.ts`, `src/utils/osmGeocode.ts`, `src/utils/dwgParser.ts`
- **UI:** `src/components/ProyectosView.tsx`, `src/components/KmzImportModal.tsx`, `src/components/KmzOsmViewer.tsx`, `src/components/DwgPlanViewer.tsx`

### Funciones Clave

| Función | Ubicación | Propósito |
| :--- | :--- | :--- |
| `latLonToUtm19N` | `src/utils/geodesy.ts` | Proyecta coordenadas geográficas WGS84 `(lat, lon)` a UTM Zona 19N (`19Q`, EPSG:32619) en metros (`easting`, `northing`). |
| `computePolygonAreaM2` / `computePerimeterM` / `computeCentroid` | `src/utils/geodesy.ts` | Calcula superficie mediante fórmula de Shoelace en coordenadas UTM, perímetro geodésico por Haversine y centroide medio. |
| `formatArea` / `formatRD` / `formatSantoDomingoAST` | `src/utils/geodesy.ts` | Formatea áreas en **tareas dominicanas** (`1 Ta = 628.86 m²`), hectáreas (`ha`) o `m²`; moneda y fechas en `America/Santo_Domingo`. |
| `parseKmzOrKmlFile` / `parseKmlText` / `parseGeoJsonText` | `src/utils/kmzParser.ts` | Descomprime `.kmz` con JSZip, sanitiza XML/KML tolerante a errores, extrae `Polygon`, `LineString`, `gx:Track`, `Point`, `ExtendedData` y metadatos (título, fecha, parcela, cliente). |
| `estimateViaticosFromKmz` | `src/utils/kmzParser.ts` | Estima el presupuesto inicial de viáticos de una ruta recién importada usando las reglas vigentes de la empresa. |
| `reverseGeocodeOSM` / `searchAddressOSM` / `inferDominicanLocationFromCoords` | `src/utils/osmGeocode.ts` | Geocodificación inversa y búsqueda en República Dominicana vía OpenStreetMap Nominatim, con respaldo offline contra centroides de las 32 provincias y códigos catastrales (`DC-01` a `DC-14`). |
| `parseDwgOrDxfFile` | `src/utils/dwgParser.ts` | Decodifica planos `.DWG` (AutoCAD R10–2018+) y `.DXF` en el navegador con `@mlightcad/libredwg-web` (WASM), reportando progreso por etapas (`reading` → `decoding` → `indexing` → `done`) y generando buckets SVG por capa (`layerBuckets`). |

### Lógica Aplicada

#### A. Geometría Catastral (RD)
- **Conversión a Tareas:** $\text{Tareas} = \dfrac{\text{Área en } m^2}{628.86}$.
- **Área de Polígono (Shoelace UTM 19N):** Se proyecta cada vértice $(lat, lon)$ a $(E_i, N_i)$ con meridiano central $-69^\circ$ y falso este $500{,}000\text{ m}$; luego $\text{Área} = \frac{1}{2} \left| \sum (E_i N_{i+1} - E_{i+1} N_i) \right|$.

#### B. Presupuesto Preliminar desde KMZ (`estimateViaticosFromKmz`)
A partir de la distancia Haversine desde la base de la empresa ($d_{\text{km}}$, mínimo $1\text{ km}$), el área total en hectáreas ($ha$) y el total de vértices ($v$):
- **Días estimados:** $\text{días} = \text{clamp}\!\left(1,\, 7,\, \left\lceil \frac{ha}{18} + \frac{v}{28} \right\rceil\right)$.
- **Combustible:** Calculado mediante `calcularCombustibleGpsRuta` (con `distanciaOneWayKm = distKm` y la regla vigente `gpsRuta`).
- **Dieta:** $\text{días} \times \text{dietaCampoRD} \times \text{kmzPersonasDietaDefault}$ (inicialmente $2{,}200 \times 2 = 4{,}400\text{ RD\$/día}$).
- **Peaje:** Si $d_{\text{km}} > \text{kmzPeajeUmbralKm}$ ($45\text{ km}$), $\text{round}\!\left(\frac{d_{\text{km}}}{50} \times \text{kmzPeajePorTramo50KmRD}\right)$ ($320\text{ RD\$}$ por tramo); si no, $0$.
- **Hospedaje:** Si $d_{\text{km}} > \text{umbralHospedajeKm}$ ($105\text{ km}$) y $\text{días} > 1$, entonces $(\text{días} - 1) \times \text{hospedajePorNocheRD}$ ($4{,}800\text{ RD\$/noche}$); si no, $0$.

#### C. Visor Cartográfico y Visor CAD
- **`KmzOsmViewer`:** Renderiza polígonos, polilíneas y puntos sobre capas satelitales/callejeras Leaflet, con trazo de rutas alternativas OSRM desde la base hasta el centroide de la parcela y selector de unidades (`Ta`, `ha`, `m²`).
- **`DwgPlanViewer`:** Renderiza planos CAD en SVG por capas activables/desactivables, soporta temas visuales (`dark`, `light`, `blueprint`), grosor de línea (`thin`, `normal`, `thick`), zoom hacia el cursor, paneo fluido y carga progresiva por lotes para archivos pesados.

---

## 5. Módulo 3: Cotizador de Servicios, Rutas Óptimas y Máquina de Estados

### Archivos Principales
- **Dominio:** `src/domain/estados.ts`, `src/domain/configuracion.ts`
- **Utilidades:** `src/utils/routingEngine.ts`
- **UI:** `src/components/RouteServicesCalculator.tsx`, `src/components/WorkflowBadge.tsx`

### Funciones Clave

| Función | Ubicación | Propósito |
| :--- | :--- | :--- |
| `calcularCotizacionServicioVigente` | `src/domain/configuracion.ts` | Calcula el precio de un servicio topográfico según la versión vigente a la fecha, área, corredor vial y tipo de terreno. |
| `fetchOptimalRoutesOSM` | `src/utils/routingEngine.ts` | Consulta OSRM (`router.project-osrm.org`) para obtener ruta Económica y ruta Expresa/Rápida, con fallback offline automático. |
| `estimateCorridorTolls` | `src/utils/routingEngine.ts` | Estima peajes de RD Vial por cuadrante geográfico (Este/Coral, Norte/Duarte, Suroeste/6 de Noviembre, Circunvalación) y distancia urbana. |
| `computeRouteViaticos` | `src/utils/routingEngine.ts` | Calcula el desglose completo de viáticos de desplazamiento de una ruta (combustible del vehículo asignado, peajes, dieta, mantenimiento por km y hospedaje). |
| `validarTransicionServicio` | `src/domain/estados.ts` | Valida y aplica cambios de estado en `Servicio`, actualizando `version`, `updatedAt`, `syncStatus` y fechas/cobros obligatorios. |
| `calcularEstadoProyecto` | `src/domain/estados.ts` | Recalcula automáticamente el estado agregado de un `Proyecto` a partir de todos sus servicios. |

### Lógica Aplicada

#### A. Fórmula de Cotización de Servicios (`calcularCotizacionServicioVigente`)
Para cada servicio seleccionado (`RTK`, `Dron & LiDAR`, `Deslinde`, `Ingeniería`, `Arquitectura` u otros configurados):

$$\text{Total}_{\text{RD\$}} = \text{round}\!\Big(\big(\text{PrecioBase} + \text{RecargoCorredor} + \text{RecargoÁrea}\big) \times \text{FactorTerreno}\Big)$$

Donde:
- $\text{RecargoCorredor} = \text{round}(\max(0, \text{corridorKm}) \times \text{recargoCorredorPorKmRD})$ (aplica si `recargoCorredorPorKmRD > 0`, p. ej. Ingeniería vial = `10,000 RD$/km`).
- $\text{RecargoÁrea} = \begin{cases} \text{round}\!\left(\dfrac{\text{areaM2} - \text{umbralAreaBaseM2}}{10{,}000} \times \text{recargoAreaPorHaExtraRD}\right) & \text{si } \text{areaM2} > \text{umbralAreaBaseM2} \\ 0 & \text{en caso contrario} \end{cases}$
  *(Nota de integridad: `umbralAreaBaseM2` configurado debe ser $> 0$ y se utiliza exactamente sin fallback silencioso).*
- $\text{FactorTerreno}$ (valores iniciales): `Llano = 1.0`, `Ondulado = 1.2`, `Montañoso = 1.45`.
- Los servicios guardan `configVersion`, `tarifaBaseUsadaRD` y `recargosUsadosRD` para **congelar el cálculo histórico**.

#### B. Viáticos Operativos de Ruta (`computeRouteViaticos`)
- **Km ida y vuelta:** $\text{roundTripKm} = \text{distanceOneWayKm} \times 2$.
- **Galones estimados:** $\text{gallons} = \dfrac{\text{roundTripKm}}{\max(5, \text{kmPorGal})}$; $\text{combustible} = \text{round}(\text{gallons} \times \text{precioGalón})$.
- **Días de campo:** $\text{fieldDays} = \text{clamp}\!\left(1,\, 7,\, \left\lceil \left(\frac{\text{ha}}{18} + 0.5 + \max(0, \text{numServicios} - 1) \times 0.35\right) \times \text{factorTerreno} \right\rceil\right)$.
- **Dieta:** Si $\text{distanceOneWayKm} < \text{umbralDistanciaUrbanaKm}$ ($28\text{ km}$) y $\text{fieldDays} = 1$, usa `dietaUrbanaRD` ($1{,}200\text{ RD\$}$); en otro caso `dietaCampoRD` ($2{,}200\text{ RD\$}$) multiplicado por `fieldDays`.
- **Peajes:** $\text{oneWayTollRD} \times 2$ si se incluyen peajes.
- **Mantenimiento:** $\text{round}(\text{roundTripKm} \times \text{mantenimientoPorKmRD})$.
- **Hospedaje:** Si se incluye hospedaje, $\max(1, \text{fieldDays}) \times \text{hospedajePorNocheRD}$ ($4{,}800\text{ RD\$}$).

#### C. Máquina de Estados de Servicios y Proyectos (`src/domain/estados.ts`)

```text
  [cotizado] <---> [aprobado] <---> [programado] <---> [en_campo] <---> [procesando] <---> [entregado] ---> [cobrado]
                                          |                 ^                 ^                             (terminal)
                                          +--- (Técnico) ---+--- (Técnico) ---+
```

- **Reglas para `tecnico` (`TRANSICIONES_TECNICO`):**
  1. `programado → en_campo`: Solo en rutas asignadas a su cuadrilla y **exige** que `fechaRealInicio` esté dentro del rango `[fechaInicio, fechaFin]` de una asignación activa de su cuadrilla en esa ruta.
  2. `en_campo → procesando`: Exige `fechaRealFin >= fechaRealInicio` y **al menos 1 entrada en `bitacoras`** del servicio.
- **Reglas para `cobrado`:** Estado terminal (no permite transición posterior). Exige `montoCobradoRD > 0` y `fechaPago` válida (`YYYY-MM-DD`).
- **Estado derivado del Proyecto (`calcularEstadoProyecto`):** Un proyecto solo alcanza `cobrado` cuando **todos** sus servicios están en `cobrado`; de lo contrario adopta el estado operativo más avanzado alcanzado por sus servicios.

---

## 6. Módulo 4: Agenda Operativa, Cuadrillas, Misiones, Conflictos y Rentas

### Archivos Principales
- **Dominio:** `src/domain/conflictos.ts`, `src/domain/rentas.ts`
- **UI:** `src/components/AgendaView.tsx`, `src/components/ResourceConflictModal.tsx`, `src/components/CatalogosView.tsx`

### Funciones Clave

| Función | Ubicación | Propósito |
| :--- | :--- | :--- |
| `detectarConflictosAsignacion` | `src/domain/conflictos.ts` | Evalúa choques de cuadrillas, personal individual, vehículos, equipos GNSS, rentas activas/reservadas y proximidad espacial antes de guardar una asignación. |
| `detectarConflictosRenta` | `src/domain/conflictos.ts` | Valida si una renta de vehículo/equipo se solapa con otra renta o con una asignación de otra misión/ruta, aplicando el umbral de cercanía de 30 km. |
| `validarResolucionConflictos` | `src/domain/conflictos.ts` | Impide guardar si hay bloqueos duros (`permiteOverride: false`) y exige `override` con motivo $\ge 5$ caracteres, `usuarioId` y `fecha` para bloqueos con excepción. |
| `calcularTotalesRenta` / `validarRenta` | `src/domain/conflictos.ts` | Calcula `subtotal = tarifa × cantidad`, `ITBIS = 18%` si aplica, `costoTotal` y valida reparto exacto por proyecto o `sin_asignar`. |
| `obtenerRentasVencidasSinDevolucion` | `src/domain/conflictos.ts` | Detecta rentas `activa` o `reservada` con `fechaFin < hoy` para alertar devoluciones pendientes en el panel Hoy y Catálogos. |
| `validarEdicionRenta` | `src/domain/rentas.ts` | Garantiza la **inmutabilidad** de rentas en estado `finalizada` o `cancelada`. |

### Lógica Aplicada

#### A. Reglas de Detección de Conflictos de Asignación (`detectarConflictosAsignacion`)
1. **Bloqueos duros sin excepción (`permiteOverride: false`):**
   - `cuadrilla_inactiva`: La cuadrilla está dada de baja (`activa === false`).
   - `vehiculo_mantenimiento` / `equipo_mantenimiento`: El recurso tiene estado físico `en_mantenimiento` o `fuera_servicio`.
   - `renta_lejana`: Un vehículo o equipo asignado tiene una renta activa/reservada en fechas solapadas para otra ruta/misión ubicada a $\ge 30\text{ km}$ (`umbralCercaniaRentaKm`).
2. **Bloqueos con excepción auditada (`permiteOverride: true`, requiere motivo $\ge 5$ caracteres):**
   - `cuadrilla`, `personal`, `vehiculo`, `equipo`: Solapamiento en `[fechaInicio, fechaFin]` con otra ruta distinta. Un técnico no puede estar en dos rutas distintas en fechas solapadas, aunque pertenezca a cuadrillas diferentes.
   - `renta_cercana`: Solapamiento con renta activa/reservada cuya ruta/misión está a **menos de $30\text{ km}$** (queda de camino).
3. **Advertencia no bloqueante (`severidad: 'advertencia'`):**
   - `spatial`: Dos rutas cuyos centroides distan menos de **$120\text{ m}$** (aviso informativo de proximidad en campo).

#### B. Reglas de Rentas y Misiones (`detectarConflictosRenta`, `validarEdicionRenta`)
- **Definición de Misión:** Agrupa un despliegue regional (zona/provincia, rango de fechas y `rutaIds`) para consolidar viáticos y rentas por campaña.
- **Renta vs. otra Renta:** Si dos rentas `activa` o `reservada` comparten el mismo recurso (`recursoTipo + recursoId`) y sus fechas se solapan, genera `renta_solapada` con **bloqueo duro** (sin override).
- **Renta vs. Asignación de otra misión/ruta:** Calcula la distancia Haversine entre la coordenada de la renta y el centroide de la ruta asignada:
  - Si $d < 30\text{ km}$ (`umbralCercaniaRentaKm`): genera `renta_cercana` (avisa y permite continuar con motivo de excepción).
  - Si $d \ge 30\text{ km}$ (o sin coordenada verificable): genera `renta_lejana` (bloqueado sin excepción).
- **Inmutabilidad de Rentas Cerradas:** Una renta `finalizada` o `cancelada` **no puede modificarse** (`"Una renta finalizada o cancelada no puede modificarse."`). Solo rentas `reservada` o `activa` admiten edición o devolución (`devolverRenta`).

---

## 7. Módulo 5: Viáticos, OCR Fiscal, Topes por Cargo/Misión, Reparto Exacto e Inmutabilidad

### Archivos Principales
- **Dominio:** `src/domain/viaticos.ts`, `src/domain/configuracion.ts`
- **UI:** `src/components/ViaticosView.tsx`, `src/components/MobileExpenseCaptureModal.tsx`, `src/components/ViaticosComparisonChart.tsx`
- **Backend:** `server.ts` (`POST /api/expenses/analyze-receipt`)

### Funciones Clave

| Función | Ubicación | Propósito |
| :--- | :--- | :--- |
| `resolverPersonalYCargoUsuario` | `src/domain/viaticos.ts` | Vincula al usuario con su ficha de personal y cargo; bloquea técnicos sin `personalId` y asigna `administrativo` a admin/coordinador sin ficha. |
| `evaluarTopeViaticoEnMision` | `src/domain/viaticos.ts` | Suma el acumulado de la persona en la misma misión y categoría (excluyendo rechazados) y determina si excede el tope vigente de su cargo. |
| `validarRepartoViatico` / `completarRepartoConSinAsignar` | `src/domain/viaticos.ts` | Exige que la suma en centavos de las líneas de reparto iguale exactamente al monto del gasto; envía el remanente a `'sin_asignar'`. |
| `escalarRepartosAMontoEmpresa` | `src/domain/viaticos.ts` | Prorratea proporcionalmente (método de resto mayor en centavos) el reparto a proyectos al monto que finalmente asume la empresa cuando el colaborador paga un excedente. |
| `validarDecisionViatico` / `validarEdicionViatico` / `validarRedistribucionViatico` / `validarEliminacionViatico` | `src/domain/viaticos.ts` | Aplican el ciclo estricto de aprobación y la inmutabilidad absoluta de registros ya decididos. |
| `calcularCombustibleGpsRuta` | `src/domain/configuracion.ts` | Calcula el monto de viático por método **GPS Ruta** aplicando distancia ida/vuelta o solo ida, mínimo de km y tarifa vigente. |
| `calcularReporteViaticosPorProyecto` / `calcularReporteViaticosPorMision` / `generarCsvReporteMisiones` | `src/domain/viaticos.ts` | Consolidan ejecutado vs. presupuesto por proyecto, costo real por misión (empresa vs. cargo colaborador + rentas) y exportación CSV. |

### Lógica Aplicada

#### A. Métodos de Captura de Viáticos y OCR
1. **OCR Móvil (`/api/expenses/analyze-receipt`):** Envía la foto del comprobante en base64 al backend Express, que invoca a Gemini (`gemini-4-hydrogen`) con esquema JSON estructurado para extraer comercio, monto en RD$, ITBIS, **NCF** (`B01`, `B02`, `E31`, etc.), fecha (`YYYY-MM-DD`), categoría y nivel de confianza. Si no hay internet, el viático se guarda en cola con estado `needs_ocr` para procesarse al sincronizar.
2. **GPS Ruta (`calcularCombustibleGpsRuta`):**
   - $\text{brutaKm} = \text{distanciaOneWayKm} \times (\text{conceptoDistancia} === \text{'ida\_vuelta'} \;?\; 2 : 1)$
   - $\text{distanciaCalculadaKm} = \max(\text{minimoKm},\, \text{brutaKm})$ *(valores iniciales: `minimoKm = 12 km`, `tarifaPorKmRD = 26.5 RD$/km`, `conceptoDistancia = 'ida_vuelta'`)*
   - $\text{montoRD} = \text{round}(\text{distanciaCalculadaKm} \times \text{tarifaPorKmRD})$
   - Congela `configVersion`, `tarifaUsadaRD` y `conceptoDistanciaUsado` en el registro del viático.
3. **Dieta Automática (Presets rápidos) y Manual:** Permiten cargar montos estandarizados (`Dieta Brigada`, `Dieta Individual`, `Peaje RD Vial`, `Hospedaje Rural`) o montos manuales.

#### B. Vinculación de Personal y Topes por Cargo y Misión
- **Validación de identidad:** Si `rol === 'tecnico'` y el usuario no tiene `personalId`, se rechaza el registro con: *`"Tu usuario no está vinculado a un registro de personal. Contacta al administrador."`*. Si un `admin` o `coordinador` no tiene `personalId`, el sistema utiliza el cargo `'administrativo'`.
- **Gastos sin `misionId`:** No se validan contra topes, no generan excedente ni requieren `motivoExcedente`.
- **Gastos con `misionId`:**
  - Calcula `acumuladoPrevioRD` sumando todos los viáticos **no rechazados** de esa misma persona (`personalId` o `usuarioId`) en la misma misión y categoría.
  - Compara `totalConNuevoRD = acumuladoPrevioRD + montoRD` contra el tope vigente del cargo + categoría (`montoMaximoPorMisionRD`).
  - **Tope igual a `RD$ 0`:** Significa que la categoría **no está permitida** para ese cargo; exige `motivoExcedente`.
  - **Excedente:** $\text{excedenteRD} = \min\!\big(\text{montoRD},\, \max(0,\, \text{totalConNuevoRD} - \text{tope})\big)$. Si $\text{excedenteRD} > 0$, muestra alerta y exige `motivoExcedente`.

#### C. Aprobación de Excedentes, Reparto Exacto e Inmutabilidad
1. **Decisión sobre excedente al aprobar:** Si `excedenteRD > 0`, el aprobador (`admin` o `coordinador`) debe elegir obligatoriamente `decisionExcedente` y un motivo de al menos 4 caracteres:
   - `aprobado_empresa`: La empresa asume el 100% del gasto (`montoAprobadoEmpresaRD = montoRD`, `montoCargoColaboradorRD = 0`).
   - `cargo_colaborador`: El colaborador asume el excedente (`montoCargoColaboradorRD = excedenteRD`, `montoAprobadoEmpresaRD = montoRD - excedenteRD`). **El excedente cargado al colaborador no entra en el reparto a proyectos ni en el costo empresa**, por lo que `escalarRepartosAMontoEmpresa` reescala los repartos al monto neto de la empresa.
2. **Reparto Exacto:** La suma de `repartos` (por proyecto o `'sin_asignar'`) debe coincidir **al centavo** con `montoRD` (al registrar) o con `montoAprobadoEmpresaRD` (al aprobar con cargo al colaborador).
3. **Inmutabilidad Estricta:**
   - Únicamente un viático en estado **`pendiente`** puede decidirse, editarse, redistribuirse o eliminarse (respetando permisos por rol).
   - **`pendiente` NO es un destino de decisión:** Nadie puede devolver un viático a `pendiente`.
   - Un viático **`aprobado`** es **inmutable para todos los roles** (incluyendo `admin` y `coordinador`).
   - Un viático **`rechazado`** es **de solo lectura** y exige motivo de rechazo $\ge 4$ caracteres al crearse.
   - No se permite eliminar viáticos aprobados o rechazados (`"Un viático aprobado o rechazado no puede eliminarse. Si fue un error, regístralo como ajuste."`); las correcciones mediante registros de ajuste están reservadas para una fase posterior.

---

## 8. Módulo 6: Control de Flota y Rendimiento de Combustible

### Archivos Principales
- **Dominio:** `src/domain/rendimiento.ts`, `src/domain/configuracion.ts`
- **UI:** `src/components/CatalogosView.tsx` (pestaña Flota / Control de Combustible)

### Funciones Clave

| Función | Ubicación | Propósito |
| :--- | :--- | :--- |
| `calcularRendimientoFlota` | `src/domain/rendimiento.ts` | Compara galones cargados aprobados frente a kilómetros recorridos dentro de la ventana temporal y clasifica desviaciones de consumo por vehículo. |
| `validarVehiculoConfig` | `src/domain/configuracion.ts` | Valida placa, descripción, precio de combustible $\ge 0$, mantenimiento $\ge 0$ y rendimiento teórico `kmPorGal > 0`. |
| `validarNuevaVigenciaRendimientoFlota` | `src/domain/configuracion.ts` | Valida nuevas versiones de parámetros de rendimiento (`umbralAlertaPct > 0`, `umbralCercaniaRentaKm > 0`, fuente activa `ruta_asignada`). |

### Lógica Aplicada (`calcularRendimientoFlota`)
1. **Ventana temporal unificada:** Por defecto analiza los últimos **90 días** hasta `fechaCalculoIso` (`[fechaInicioVentana, fechaFinVentana]`).
2. **Cargas válidas:** Solo cuenta viáticos con `categoria === 'Combustible'`, `estadoAprobacion === 'aprobado'`, mismo `vehiculoId`, `galonesCargados > 0` y `fechaIso` dentro de la ventana.
3. **Kilómetros recorridos sin duplicación:**
   - Filtra asignaciones del vehículo cuyo rango `[fechaInicio, fechaFin]` se solape con la ventana.
   - Para la fuente operativa **`ruta_asignada`**: cada `rutaId` única asignada al vehículo **cuenta una sola vez** aunque haya tenido múltiples asignaciones o días en la ventana.
   - Aplica la **misma regla de distancia que GPS Ruta**: multiplica `distanceOneWayKm` por `2` si `conceptoDistancia === 'ida_vuelta'` o por `1` si es `'solo_ida'`.
   - *(Nota: en Configuración vigente, las fuentes `bitacora` y `manual` están bloqueadas en `validarNuevaVigenciaRendimientoFlota` con el mensaje `"Esta fuente de kilómetros estará disponible próximamente."`)*.
4. **Guardia de datos insuficientes:** Si `cantidadCargas < 3` (`MINIMO_CARGAS_RENDIMIENTO`), `totalGalones <= 0` o **`kmRecorridos <= 0`**, el vehículo pasa a estado `datos_insuficientes` y nunca divide entre cero ni dispara falsas alertas.
5. **Cálculo de desviación y alerta unidireccional:**
   - $\text{rendimientoRealKmGal} = \dfrac{\text{kmRecorridos}}{\text{totalGalones}}$
   - $\text{desviacionPct} = \dfrac{\text{rendimientoRealKmGal} - \text{kmPorGalTeórico}}{\text{kmPorGalTeórico}} \times 100$
   - Clasificación de estado:
     - `alerta_desviacion` (**Alerta**): únicamente si `desviacionPct < -umbralAlertaPct` (por defecto `< -15%`, es decir, rinde significativamente **menos** km/gal que lo teórico).
     - `mejor_que_esperado` (Sin alerta): si `desviacionPct > 0`.
     - `normal`: si `-umbralAlertaPct <= desviacionPct <= 0`.

---

## 9. Módulo 7: Configuración Versionada con Vigencias y Onboarding Guiado

### Archivos Principales
- **Dominio:** `src/domain/configuracion.ts`, `src/domain/onboarding.ts`
- **UI:** `src/components/ConfiguracionView.tsx`, `src/components/OnboardingWizardModal.tsx`, `src/components/AdminHoyView.tsx`

### Funciones Clave

| Función | Ubicación | Propósito |
| :--- | :--- | :--- |
| `crearConfiguracionInicialEmpresa` / `asegurarConfiguracionEmpresa` | `src/domain/configuracion.ts` | Inicializa y completa la configuración base (5 cargos base, 3 combustibles, 5 servicios, factores de terreno, reglas de viáticos, 30 topes provisionales y regla de rendimiento). |
| `obtenerVersionVigente` | `src/domain/configuracion.ts` | Selecciona la versión más reciente cuya `vigenciaDesde <= fechaCalculoIso` (sin alterar registros históricos). |
| `validarCargoConfig` / `validarEliminarCargo` | `src/domain/configuracion.ts` | Normaliza códigos de cargo (`normalizarCodigoEstable`), impide duplicados y protege los 5 cargos base (`tecnico`, `ingeniero`, `jefe_brigada`, `chofer`, `administrativo`) o cargos con personal asignado contra eliminación. |
| `validarSolapamientoVigencia` + validadores por concepto | `src/domain/configuracion.ts` | Impide fechas duplicadas (`YYYY-MM-DD`), negativos, umbrales `<= 0` y reglas inválidas antes de crear nuevas vigencias. |
| `detectarEstadoPasoDesdeDatos` / `obtenerResumenOnboarding` | `src/domain/onboarding.ts` | Verifica progreso **real** de los pasos de puesta en marcha a partir de los datos existentes en la empresa, distinguiendo completado real de `"completado manualmente"`. |

### Lógica Aplicada

#### A. Versionado Histórico de Tarifas y Reglas
- Cada parámetro económico (combustibles, tarifas de servicio, factores de terreno, reglas GPS Ruta / dietas / peajes / hospedaje, topes de viáticos por cargo y categoría, y rendimiento de flota) almacena un arreglo de versiones con `version` incremental y `vigenciaDesde`.
- **Principio de inmutabilidad histórica:** Todo cálculo histórico conserva la tarifa o número de versión utilizada en el momento de su registro; crear una nueva vigencia futura o actual **jamás recalcula** cotizaciones, viáticos ni rentas previas.
- **Topes provisionales iniciales:** Todos los valores iniciales de `topesViatico` se crean marcados con `esEjemploPendienteConfirmar: true` y etiqueta visible `"EJEMPLO – PENDIENTE DE CONFIRMAR"`. El cargo `administrativo` hereda inicialmente los mismos valores de ejemplo que `jefe_brigada`.

#### B. Onboarding con Detección Real (`src/domain/onboarding.ts`)
Pasos definidos (`PASOS_ONBOARDING_DEFINICION`):
1. `empresa`: Válido si `validarEmpresaConfig` pasa (nombre, RNC y dirección base válidos).
2. `personal_cargos`: Completo si existe al menos 1 registro en `personal`.
3. `flota`: Completo si existe al menos 1 vehículo registrado.
4. `servicios`: Completo si existe al menos 1 servicio activo.
5. `cliente_proyecto`: Completo si existe al menos 1 proyecto registrado.
6. `kmz_demo`: Visible **solo en modo demo** (`soloEnDemo: true`); completo si `esDemo` y existe al menos 1 proyecto.

Si un administrador marca manualmente un paso como completado sin cumplir los datos mínimos reales, `obtenerResumenOnboarding` lo clasifica como `completo_manual` (`"completado manualmente"`) y mantiene separado el `porcentajeReal` del `porcentajeResuelto`.

---

## 10. Módulo 8: Módulo Móvil del Técnico en Campo

### Archivos Principales
- **Dominio:** `src/domain/tecnico.ts`, `src/domain/estados.ts`
- **UI (`src/components/tecnico/`):** `TecnicoHoyView.tsx`, `TecnicoRutasView.tsx`, `TecnicoRutaDetalleView.tsx`, `TecnicoAgendaView.tsx`, `TecnicoViaticosView.tsx`, `TecnicoBitacoraModal.tsx`, `TecnicoTransicionModal.tsx`, `TecnicoReportarSelectorModal.tsx`

### Funciones Clave

| Función | Ubicación | Propósito |
| :--- | :--- | :--- |
| `obtenerFechaHoyAST` / `sumarDiasIso` / `obtenerInicioSemanaLunes` | `src/domain/tecnico.ts` | Calcula fechas operativas exactas en zona horaria `America/Santo_Domingo (UTC-4)` y el lunes de la semana. |
| `obtenerServiciosHoyTecnico` | `src/domain/tecnico.ts` | Filtra servicios en `programado` o `en_campo` cuya ruta tenga asignación de su cuadrilla vigente hoy o en los próximos **3 días** (`DIAS_VENTANA_HOY_TECNICO = 3`), priorizando `en_campo`. |
| `obtenerAgendaSemanalTecnico` | `src/domain/tecnico.ts` | Construye la vista semanal Lunes–Domingo de asignaciones en rutas con estados operativos activos (`aprobado`, `programado`, `en_campo`, `procesando`, `entregado`). |
| `validarEdicionViaticoTecnico` / `validarEliminacionViaticoTecnico` | `src/domain/tecnico.ts` | Restringe edición y eliminación de viáticos del técnico únicamente a sus **propios** registros en estado `pendiente`. |

### Lógica Aplicada
- **Flujo de Campo:** Desde *Hoy* o *Mis Rutas*, el técnico abre el detalle de su ruta (coordenadas UTM, mapa, vehículos, equipo GNSS y bitácoras), registra bitácoras de campo con fotos y kilómetros recorridos, ejecuta transiciones permitidas (`programado → en_campo → procesando`) y reporta viáticos mediante el botón rápido **Reportar** (`OCR Móvil`, `GPS Ruta`, `Dieta Automática` o `Manual`) sin acceso a cifras contractuales de la empresa.

---

## 11. Módulo 9: Bitácora de Auditoría (F16), Tutoriales y Backend Express

### Archivos Principales
- **UI y Datos:** `src/components/AuditoriaView.tsx`, `src/components/TutorialVisualModal.tsx`, `src/data/tutoriales.ts`, `src/data/LocalRepositorioOperacion.ts`
- **Backend:** `server.ts`

### Funciones y Endpoints Clave

| Elemento | Ubicación | Propósito |
| :--- | :--- | :--- |
| `registrarEvento` (Auditoría F16) | `LocalRepositorioOperacion.ts` | Registra de forma cronológica usuario, fecha AST, entidad afectada, acción, `valorAnterior`, `valorNuevo` y metadatos (como `overrideMotivo` o `decisionExcedente`) en cada operación crítica. |
| `AuditoriaView` | `src/components/AuditoriaView.tsx` | Permite filtrar eventos por entidad (`asignacion`, `servicio`, `viatico`, `ruta`, `proyecto`, `catalogo`, `empresa`) y buscar por usuario, motivo o valor. |
| `TUTORIALES_POR_PERFIL` | `src/data/tutoriales.ts` | Tarjetas guiadas por rol (`admin`, `coordinador`, `tecnico`) que se muestran automáticamente en el primer ingreso del perfil y pueden reabrirse desde Configuración/Ayuda. |
| `GET /api/health` | `server.ts` | Verificación de estado del servidor Express (puerto 3000). |
| `GET /api/state` & `POST /api/sync` | `server.ts` | Persistencia JSON por empresa en `.data/geomatrix-saas-store.json` con autenticación Bearer de sesión (`aia-session-*`) y fusión LWW (`mergeLww`). |
| `POST /api/expenses/analyze-receipt` | `server.ts` | Proxy seguro del lado servidor hacia `@google/genai` (`gemini-4-hydrogen`) para lectura OCR estructurada de facturas dominicanas (sin exponer claves en el navegador). |

---

## 12. Resumen Ejecutivo de Reglas Críticas e Invariantes

| Área | Regla / Parámetro Exacto | Comportamiento del Sistema |
| :--- | :--- | :--- |
| **Geodesia RD** | `1 Tarea = 628.86 m²` · `UTM 19N (19Q)` | Todas las áreas se calculan en plano UTM 19N y se expresan en Ta, ha o m². |
| **GPS Ruta** | `26.5 RD$/km` · Mínimo `12 km` · `ida_vuelta` (×2) | Aplica `max(minimoKm, distancia × factor)` y congela versión y tarifa usada. |
| **Cotización** | `umbralAreaBaseM2 > 0` | Rechaza umbral $\le 0$ al configurar; usa el umbral exacto configurado sin fallback silencioso. |
| **Rentas** | Umbral cercanía `< 30 km` · ITBIS `18%` | Bloquea `renta_solapada` siempre; `renta_cercana` (<30 km) admite motivo; `renta_lejana` bloquea; `finalizada`/`cancelada` son inmutables. |
| **Agenda** | Proximidad `< 120 m` · Override $\ge 5$ chars | Mantenimiento o cuadrilla inactiva bloquean sin override; solapes permiten override auditado; `< 120 m` solo advierte. |
| **Viáticos** | Reparto exacto al centavo · Tope por persona/cargo/misión | Sin `misionId` no aplica tope; técnico sin `personalId` bloqueado; `aprobado`/`rechazado` inmutables; no se puede volver a `pendiente`. |
| **Rendimiento Flota** | Ventana `90 días` · Mín. `3 cargas` · Alerta `< -15%` | Exige `km > 0`; cuenta 1 vez cada `(vehiculo, ruta)` en `ruta_asignada` usando `conceptoDistancia`; alerta solo si rinde menos de lo esperado. |
| **Seguridad Técnico** | `SnapshotTecnico` + `ESTADOS_VENTANA_HOY = 3 días` | Cero visibilidad de precios, contratos, rentas globales o viáticos ajenos; solo transiciona `programado → en_campo → procesando` con asignación y bitácora. |

---

## 13. Guía Rápida para Exportar este Documento a PDF

Para entregar este documento en formato PDF profesional a clientes, dirección o equipo técnico:

1. **Desde VS Code / Cursor:** Instala o abre cualquier visor de vista previa Markdown (por ejemplo *Markdown Preview Enhanced* o *Markdown PDF*), haz clic derecho sobre `docs/modulos-y-logica-sistema.md` y selecciona **Export (PDF)** o **Open Preview → Print to PDF**.
2. **Desde Navegador (Chrome / Edge):** Abre el archivo renderizado (en GitHub, Typora, Obsidian o un visor Markdown local), presiona **`Ctrl + P`** (o `Cmd + P` en Mac), selecciona destino **Guardar como PDF**, habilita *Gráficos de fondo* y márgenes estándar.
3. **Vía línea de comandos (Pandoc):**
   ```bash
   pandoc docs/modulos-y-logica-sistema.md -o GeoMatrix-RD-Modulos-y-Logica.pdf --toc -V geometry:margin=2cm
   ```
