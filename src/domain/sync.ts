import type { EstadoSync } from '../types/domain';

export interface EntidadVersionada {
  id: string;
  version: number;
  updatedAt: string;
  syncStatus?: EstadoSync;
}

export interface SobrescrituraLWW {
  id: string;
  localUpdatedAt: string;
  remotoUpdatedAt: string;
}

export interface ResultadoReconciliacionLWW<T extends EntidadVersionada> {
  items: T[];
  sobrescritosLocales: SobrescrituraLWW[];
}

export function reconciliarEntidadLWW<T extends EntidadVersionada>(local: T, remoto: T): T {
  if (local.version !== remoto.version) {
    return local.version > remoto.version ? local : remoto;
  }
  const localTs = Date.parse(local.updatedAt) || 0;
  const remotoTs = Date.parse(remoto.updatedAt) || 0;
  return localTs >= remotoTs ? local : remoto;
}

export function reconciliarColeccionLWW<T extends EntidadVersionada>(
  locales: T[],
  remotos: T[]
): T[] {
  return reconciliarColeccionLWWConReporte(locales, remotos).items;
}

export function reconciliarColeccionLWWConReporte<T extends EntidadVersionada>(
  locales: T[],
  remotos: T[]
): ResultadoReconciliacionLWW<T> {
  const mapa = new Map<string, T>();
  const sobrescritosLocales: SobrescrituraLWW[] = [];

  for (const item of remotos) {
    mapa.set(item.id, item);
  }

  for (const localItem of locales) {
    const remotoItem = mapa.get(localItem.id);
    if (!remotoItem) {
      mapa.set(localItem.id, localItem);
    } else {
      const ganador = reconciliarEntidadLWW(localItem, remotoItem);
      const teniaCambiosLocales =
        localItem.syncStatus === 'pending' || localItem.syncStatus === 'needs_ocr';
      if (teniaCambiosLocales && ganador === remotoItem) {
        sobrescritosLocales.push({
          id: localItem.id,
          localUpdatedAt: localItem.updatedAt,
          remotoUpdatedAt: remotoItem.updatedAt,
        });
      }
      mapa.set(localItem.id, ganador);
    }
  }

  return {
    items: Array.from(mapa.values()),
    sobrescritosLocales,
  };
}
