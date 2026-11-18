# GeoMatrix RD — PWA de Gestión Topográfica y Viáticos

Aplicación web progresiva (PWA) multi-empresa diseñada para empresas de agrimensura y topografía en República Dominicana (**empresa piloto: AIA Services**). Moneda en **RD$** y marcas de tiempo en zona **America/Santo_Domingo (AST)**.

## Funcionalidades Principales

- **F1. Acceso y Multiempresa**: Inicio de sesión con selector de empresa y soporte offline usando la última sesión y datos locales en caché.
- **F2. Clientes y Proyectos**: Registro de clientes (RNC, contacto) y proyectos iniciando en estado `cotizado`, con presupuesto de viáticos y valor de contrato.
- **F3. Rutas desde KMZ / KML / GeoJSON**: Carga y parseo geodésico (UTM Zona 19N, áreas en $m^2$, hectáreas y tareas dominicanas, perímetro, centroide), autollenado y geocodificación OpenStreetMap, más visualización interactiva Leaflet.
- **F4, F7, F8. Servicios, Estados y Bitácora**: Servicios sumatorios por ruta con máquina de estados normalizada (`cotizado → aprobado → programado → en_campo → procesando → entregado → cobrado`), captura obligatoria de `montoCobradoRD` y `fechaPago` al cobrar, y bitácora con notas y evidencia fotográfica.
- **F5, F6. Asignaciones por Rango de Fechas y Conflictos**: Asignación de cuadrillas, vehículos y equipos GNSS sobre `[fechaInicio, fechaFin]`, expansión día por día en la agenda, bloqueos duros por mantenimiento, bloqueos con override auditado (`motivo`, `usuarioId`, `fecha`) por solapamiento, y advertencia no bloqueante por proximidad espacial (< 120 m).
- **F9–F11. Viáticos, OCR y Reparto Exacto**: Captura móvil por foto OCR (Gemini), ruta GPS (OSRM / Haversine) o tarifa estándar; distribución exacta en `RD$` entre uno o varios proyectos o `sin_asignar`; aprobación o rechazo con motivo obligatorio; gráfica comparativa Presupuesto vs. Gasto Real.
- **F15–F16. Sincronización LWW y Auditoría**: Cola offline (`pending`, `needs_ocr`) sincronizada contra Express (`server.ts`) con reconciliación Last-Write-Wins por `version` y `updatedAt`, y bitácora filtrable de eventos y excepciones.

## Roles y Cuentas Demo

Contraseña para todas las cuentas piloto: `demo123`

| Correo | Rol | Alcance |
| --- | --- | --- |
| `admin@aiaservices.do` | `admin` / `coordinador` | Acceso total en **AIA Services** (incluye empresa y usuarios) + Coordinador en **Geodesia Caribe SRL** |
| `coordinador@aiaservices.do` | `coordinador` | Crea y edita clientes, proyectos, rutas, servicios, catálogos, asigna cuadrillas, aprueba viáticos y ve auditoría |
| `carlos@aiaservices.do` | `tecnico` | Ve únicamente sus rutas/servicios asignados, registra inicio/cierre de campo, bitácora y viáticos propios |
| `laura@aiaservices.do` | `tecnico` | Brigada Cibao Sur (Santiago) |

## Arquitectura

- `src/types/domain.ts`: Modelo normalizado multi-empresa.
- `src/domain/`: Reglas de negocio puras (permisos, máquina de estados, conflictos por rango de fechas, reparto exacto de viáticos, reconciliación LWW).
- `src/data/`: Interfaz `RepositorioOperacion` e implementación local/offline `LocalRepositorioOperacion` lista para reemplazarse por Supabase sin tocar las vistas (`docs/modelo-datos.md`).
- `src/components/`: Vistas modulares y componentes reutilizables.
- `server.ts`: Servidor Express + Vite con autenticación por sesión (`x-session-token`), persistencia aislada por `empresaId` en `.data/geomatrix-saas-store.json` y endpoint OCR `/api/expenses/analyze-receipt`.

## Comandos

```bash
npm install
npm test        # Pruebas unitarias de dominio (Vitest)
npm run lint    # Verificación TypeScript (tsc --noEmit)
npm run build   # Build de producción Vite
npm run dev     # Servidor Express + Vite en puerto 3000
```

## Supuestos pendientes de validación

1. **Un técnico no puede estar en dos rutas el mismo día (salvo misma ruta)**: Implementado en `src/domain/conflictos.ts` (`detectarConflictosAsignacion`). Si dos cuadrillas distintas comparten a un mismo técnico y se asignan a rutas diferentes con rangos de fechas solapados, se marca como conflicto bloqueante con opción de override auditado; si la asignación pertenece a la misma `rutaId`, se permite.
2. **El reparto de viáticos es por monto exacto, no por porcentaje**: Implementado en `src/domain/viaticos.ts` (`validarRepartoViatico`). La suma exacta en `RD$` de las líneas asignadas a proyectos (más `sin_asignar` cuando aplique) debe igualar el monto total del comprobante.
