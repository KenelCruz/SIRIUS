# SIRIUS: Sistema Integral de Recursos, Información, Operaciones y Análisis

Aplicación web progresiva (PWA) multi-empresa diseñada para empresas de agrimensura y topografía en República Dominicana (**empresa piloto: AIA Services**). Moneda en **RD$** y marcas de tiempo en zona **America/Santo_Domingo (AST)**.

## Funcionalidades Principales

- **F1. Acceso y Multiempresa**: Inicio de sesión con selector de empresa y soporte offline usando la última sesión y datos locales en caché.
- **F2. Clientes y Proyectos**: Registro de clientes (RNC, contacto) y proyectos iniciando en estado `cotizado`, con presupuesto de viáticos y valor de contrato.
- **F3. Rutas desde KMZ / KML / GeoJSON**: Carga y parseo geodésico (UTM Zona 19N, áreas en $m^2$, hectáreas y tareas dominicanas, perímetro, centroide), autollenado y geocodificación OpenStreetMap, más visualización interactiva Leaflet.
- **F4, F7, F8. Servicios, Estados y Bitácora**: Servicios sumatorios por ruta con máquina de estados normalizada (`cotizado → aprobado → programado → en_campo → procesando → entregado → cobrado`), captura obligatoria de `montoCobradoRD` y `fechaPago` al cobrar, y bitácora con notas y evidencia fotográfica.
- **F5, F6. Asignaciones por Rango de Fechas y Conflictos**: Asignación de cuadrillas, vehículos y equipos GNSS sobre `[fechaInicio, fechaFin]`, expansión día por día en la agenda, bloqueos duros por mantenimiento, bloqueos con override auditado (`motivo`, `usuarioId`, `fecha`) por solapamiento, y advertencia no bloqueante por proximidad espacial (< 120 m).
- **F9–F11. Viáticos, OCR y Reparto Exacto**: Captura móvil por foto OCR (Gemini), ruta GPS (OSRM / Haversine) o tarifa estándar; distribución exacta en `RD$` entre uno o varios proyectos o `sin_asignar`; aprobación o rechazo con motivo obligatorio; gráfica comparativa Presupuesto vs. Gasto Real.
- **F15–F16. Sincronización LWW y Auditoría**: Cola offline (`pending`, `needs_ocr`) sincronizada contra Express (`server.ts`) con reconciliación Last-Write-Wins por `version` y `updatedAt`, aviso explícito cuando un registro del servidor sobrescribe un cambio local pendiente, y bitácora filtrable de eventos y excepciones.
- **T1–T10. Experiencia Móvil del Técnico (`rol === 'tecnico'`)**:
  - Aislamiento estricto por proyección de tipos (`proyectarSnapshotParaRol` → `SnapshotTecnico`): el técnico nunca recibe en sus vistas presupuestos de viáticos, valores de contrato, cotizaciones, tarifas de vehículos/combustible, usuarios/membresías, personal de otras cuadrillas ni historial de auditoría.
  - Navegación móvil dedicada de 4 botones (`Hoy`, `Mis rutas`, `Reportar`, `Mis viáticos`), sin pestañas globales de Proyectos, Calculadora, Mapa externo, Catálogos ni Auditoría.
  - `Hoy` (hoy + próximos 3 días), `Mi agenda semanal` (solo lectura Lunes–Domingo), detalle de ruta con visor KMZ integrado (solo lectura), transición `programado → en_campo` bloqueada fuera del rango de asignación de la cuadrilla, cierre `en_campo → procesando` bloqueado sin al menos 1 entrada de bitácora, y edición/eliminación de viáticos restringida a gastos propios en estado `pendiente`.

## Roles y Cuentas Demo

Las cuentas piloto de acceso rápido y el banner `"Datos de demostración, no son reales"` se muestran cuando `import.meta.env.DEV` está activo o `VITE_ENABLE_DEMO=true`. Contraseña demo: `demo123`.

| Correo | Rol | Alcance |
| --- | --- | --- |
| `admin@aiaservices.do` | `admin` / `coordinador` | Acceso total en **AIA Services** (incluye empresa y usuarios) + Coordinador en **Geodesia Caribe SRL** |
| `coordinador@aiaservices.do` | `coordinador` | Crea y edita clientes, proyectos, rutas, servicios, catálogos, asigna cuadrillas, aprueba viáticos y ve auditoría |
| `carlos@aiaservices.do` | `tecnico` | Ve únicamente sus rutas/servicios asignados, registra inicio/cierre de campo, bitácora y viáticos propios |
| `laura@aiaservices.do` | `tecnico` | Brigada Cibao Sur (Santiago) |

## Arquitectura y Notas Técnicas

- `src/types/domain.ts`: Modelo normalizado multi-empresa y tipo proyectado `SnapshotTecnico` (`ProyeccionSnapshotPorRol`).
- `src/domain/`: Reglas de negocio puras (permisos, proyección por rol, máquina de estados, conflictos por rango de fechas, reparto exacto de viáticos, reconciliación LWW y lógica de jornada del técnico).
  - **Cambio de firma en `validarTransicionServicio`** (`src/domain/estados.ts`): ahora acepta `asignaciones?`, `cuadrillasUsuarioIds?` y `bitacoras?` para validar en dominio puro que el técnico solo inicie campo dentro del rango `[fechaInicio, fechaFin]` de su asignación y no cierre a `procesando` sin al menos una entrada en `bitacoras`.
- `src/data/` y `src/hooks/useOperacionEmpresa.ts`: Las vistas consumen estado y acciones exclusivamente a través del hook `useOperacionEmpresa` sobre `RepositorioOperacion`.
- `src/components/tecnico/`: Vistas móvil-primero exclusivas del técnico (`TecnicoHoyView`, `TecnicoRutasView`, `TecnicoRutaDetalleView`, `TecnicoAgendaView`, `TecnicoViaticosView`, `TecnicoBitacoraModal`, `TecnicoTransicionModal`, `TecnicoReportarSelectorModal`).
- `server.ts`: Servidor Express + Vite con autenticación por sesión (`x-session-token`), persistencia aislada por `empresaId` en `.data/geomatrix-saas-store.json` y endpoint OCR `/api/expenses/analyze-receipt`.

## Comandos

```bash
npm install
npm test        # Pruebas unitarias de dominio (Vitest)
npm run lint    # Verificación TypeScript (tsc --noEmit)
npm run build   # Build de producción Vite
npm run dev     # Servidor Express + Vite en puerto 3000
```


