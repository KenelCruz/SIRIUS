export type WorkflowStatus =
  | 'COTIZADO'
  | 'APROBADO'
  | 'PROGRAMADO'
  | 'EN CAMPO'
  | 'PROCESANDO'
  | 'ENTREGADO'
  | 'COBRADO';

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

export type UserRole = 'Coordinador' | 'Topógrafo';

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

export interface SurveyProject {
  id: string;
  parcelCode: string;
  title: string;
  client: string;
  province: string;
  surveyor: string;
  equipmentSerial: string;
  status: WorkflowStatus;
  scheduledDate: string;
  updatedAt: string;
  budgetViaticosRD: number;
  contractValueRD: number;
  kmzFileName: string;
  features: KmzFeature[];
  centroid: GeoPoint;
  totalAreaM2: number;
  totalPerimeterM: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
  notes?: string;
  selectedServices?: string[];
  routeSummary?: {
    routeName: string;
    distanceOneWayKm: number;
    durationMin: number;
    tollsRD: number;
    fuelRD: number;
    vehicleLabel: string;
  };
}

export interface ViaticoExpense {
  id: string;
  surveyId: string;
  parcelCode: string;
  surveyor: string;
  category: ExpenseCategory;
  merchant: string;
  amountRD: number;
  itbisRD: number;
  ncf?: string;
  dateIso: string;
  timestampAST: string;
  method: ExpenseMethod;
  gpsCoords?: {
    lat: number;
    lon: number;
    easting: number;
    northing: number;
  };
  distanceKm?: number;
  receiptThumbnail?: string;
  pendingReceiptBase64?: string;
  pendingReceiptMime?: string;
  syncStatus: 'synced' | 'pending' | 'needs_ocr';
  approved: boolean;
  notes?: string;
}

export interface ConflictDetail {
  type: 'surveyor' | 'equipment' | 'spatial';
  message: string;
  conflictingSurveyCode: string;
  conflictingSurveyTitle: string;
  overlapPct?: number;
}
