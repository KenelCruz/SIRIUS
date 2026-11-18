export interface EntidadVersionada {
  id: string;
  version: number;
  updatedAt: string;
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
  const mapa = new Map<string, T>();
  for (const item of remotos) {
    mapa.set(item.id, item);
  }
  for (const item of locales) {
    const existente = mapa.get(item.id);
    if (!existente) {
      mapa.set(item.id, item);
    } else {
      mapa.set(item.id, reconciliarEntidadLWW(item, existente));
    }
  }
  return Array.from(mapa.values());
}
