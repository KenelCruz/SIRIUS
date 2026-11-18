import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 rounded-sm border border-[#0284C7] bg-[#0284C7]/10 px-3 py-1.5 text-xs font-semibold text-[#0284C7] hover:bg-[#0284C7] hover:text-white transition-colors whitespace-nowrap shrink-0 min-h-[36px]"
      >
        <Download className="w-3.5 h-3.5" />
        Instalar PWA
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="inline-flex items-center gap-1.5 rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-xs font-medium text-[#334155] hover:bg-[#F1F5F9] transition-colors whitespace-nowrap shrink-0 min-h-[36px]"
        title="Instalar en móvil o escritorio como PWA offline"
      >
        <Smartphone className="w-3.5 h-3.5 text-[#0284C7]" />
        <span className="hidden sm:inline">{isIOS ? 'Instalar en iOS' : 'Instalar App'}</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/60 p-4">
          <div className="w-full max-w-md rounded-md border border-[#CBD5E1] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-[#0D1C2F]">
                  Instalar SIRIUS en tu dispositivo
                </h3>
                <p className="mt-1 text-xs text-[#43474D]">
                  Operación en campo sin señal y acceso directo desde la pantalla de inicio.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="rounded-sm p-1 text-[#43474D] hover:bg-[#F1F5F9]"
                aria-label="Cerrar guía"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-4 space-y-2 text-sm text-[#334155] list-decimal pl-5">
                <li>
                  Toca el botón <strong>Compartir</strong> en la barra inferior de Safari.
                </li>
                <li>
                  Desliza hacia abajo y selecciona <strong>Agregar a inicio</strong>.
                </li>
                <li>
                  Confirma con <strong>Agregar</strong> para habilitar el modo independiente offline.
                </li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-2 text-sm text-[#334155] list-decimal pl-5">
                <li>
                  En Chrome o Edge móvil, abre el menú del navegador y toca{' '}
                  <strong>Instalar aplicación</strong> o <strong>Añadir a pantalla de inicio</strong>.
                </li>
                <li>
                  En escritorio, haz clic en el ícono de instalación en la barra de direcciones.
                </li>
                <li>
                  Todos los archivos KMZ cargados y gastos capturados se almacenan localmente ante pérdida de señal.
                </li>
              </ol>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="rounded-sm bg-[#0F2942] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
