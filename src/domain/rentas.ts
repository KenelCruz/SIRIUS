import type { Renta } from '../types/domain';

export function validarEdicionRenta(
  rentaExistente: Pick<Renta, 'estado'>
): { valido: boolean; error?: string } {
  if (rentaExistente.estado === 'finalizada' || rentaExistente.estado === 'cancelada') {
    return {
      valido: false,
      error: 'Una renta finalizada o cancelada no puede modificarse.',
    };
  }
  return { valido: true };
}
