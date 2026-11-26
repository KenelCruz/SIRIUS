import React, { useState } from 'react';
import { ImageOff, Maximize2, X } from 'lucide-react';

interface MediaThumbProps {
  src: string;
  alt: string;
  caption?: string;
  sizeClass?: string;
  onRemove?: () => void;
  removeLabel?: string;
}

export const MediaThumb: React.FC<MediaThumbProps> = ({
  src,
  alt,
  caption,
  sizeClass = 'h-20 w-20',
  onRemove,
  removeLabel = 'Quitar imagen',
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  return (
    <>
      <div
        className={`group relative shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-900 ${sizeClass}`}
      >
        {hasError || !src ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-slate-800 to-slate-900 p-2 text-center text-slate-300">
            <ImageOff className="h-4 w-4 text-slate-400" />
            <span className="text-[10px] font-medium leading-tight text-slate-200 line-clamp-2">
              {caption || 'Sin vista previa'}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsLightboxOpen(true)}
            className="relative block h-full w-full text-left focus-visible:outline-none"
            aria-label={`Ampliar ${alt}`}
          >
            {!isLoaded && (
              <div
                aria-hidden="true"
                className="absolute inset-0 animate-pulse bg-slate-800"
              />
            )}
            <img
              src={src}
              alt={alt}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onLoad={() => setIsLoaded(true)}
              onError={() => setHasError(true)}
              className={`h-full w-full object-cover transition-all duration-300 group-hover:scale-105 motion-reduce:transform-none ${
                isLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#091A2C]/90 via-[#091A2C]/30 to-transparent"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 px-1.5 py-1">
              <span className="truncate text-[10px] font-semibold text-white drop-shadow-sm">
                {caption || 'Ver'}
              </span>
              <Maximize2 className="h-2.5 w-2.5 shrink-0 text-white/90 opacity-85 group-hover:opacity-100" />
            </div>
          </button>
        )}

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={removeLabel}
            className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-lg bg-[#091A2C]/85 text-white backdrop-blur-sm transition-colors hover:bg-[#DC2626]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isLightboxOpen && !hasError && src && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#091A2C]/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-white/15 bg-[#0F2942] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex max-h-[78vh] items-center justify-center bg-slate-950">
              <img
                src={src}
                alt={alt}
                decoding="async"
                referrerPolicy="no-referrer"
                className="max-h-[78vh] w-full object-contain"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#091A2C]/95 via-[#091A2C]/60 to-transparent"
              />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-4 px-5 py-3.5 text-white">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{caption || alt}</div>
                  <div className="text-xs text-slate-300 truncate">{alt}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLightboxOpen(false)}
                  className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 whitespace-nowrap transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
