export * from './domain';

export type WorkflowStatus =
  | 'cotizado'
  | 'aprobado'
  | 'programado'
  | 'en_campo'
  | 'procesando'
  | 'entregado'
  | 'cobrado';

export type AreaUnit = 'm2' | 'ha' | 'tareas';

export type ExpenseCategory =
  | 'Combustible'
  | 'Dieta'
  | 'Hospedaje'
  | 'Peaje'
  | 'Materiales'
  | 'Otro';

export type ExpenseMethod =
  | 'OCR Móvil'
  | 'GPS Ruta'
  | 'Dieta Automática'
  | 'Manual';

export type UserRole = 'admin' | 'coordinador' | 'tecnico';

export interface GeoPoint {
  lat: number;
  lon: number;
  elev: number;
  easting: number;
  northing: number;
  zone: string;
}

export interface KmzFeature {
  id: string;
  name: string;
  description?: string;
  attributes?: Record<string, string>;
  geometryType: 'Polygon' | 'LineString' | 'Point';
  points: GeoPoint[];
  areaM2: number;
  perimeterM: number;
}
