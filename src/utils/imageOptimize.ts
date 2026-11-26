export interface CompressedImageResult {
  dataUrl: string;
  mimeType: string;
}

export async function compressImageFast(
  file: File,
  options: { maxDim?: number; quality?: number } = {}
): Promise<CompressedImageResult> {
  const maxDim = options.maxDim ?? 1080;
  const quality = options.quality ?? 0.78;

  if (file.type === 'application/pdf') {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer el archivo PDF.'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(file);
    });
    return { dataUrl, mimeType: 'application/pdf' };
  }

  // Fast path: decode off main thread via createImageBitmap when supported
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      let width = bitmap.width;
      let height = bitmap.height;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close?.();
        return {
          dataUrl: canvas.toDataURL('image/jpeg', quality),
          mimeType: 'image/jpeg',
        };
      }
      bitmap.close?.();
    } catch {
      // Fallback below to ObjectURL + HTMLImageElement
    }
  }

  // Fallback path: ObjectURL avoids loading huge multi-MB base64 strings first
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('El archivo seleccionado no es una imagen válida.'));
      el.src = objectUrl;
    });

    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    if (width > maxDim || height > maxDim) {
      const ratio = Math.min(maxDim / width, maxDim / height);
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('No se pudo inicializar el compresor de imagen.');
    }
    ctx.drawImage(img, 0, 0, width, height);
    return {
      dataUrl: canvas.toDataURL('image/jpeg', quality),
      mimeType: 'image/jpeg',
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function compressPhotoDataUrl(
  file: File,
  maxDim = 1024,
  quality = 0.78
): Promise<string> {
  const { dataUrl } = await compressImageFast(file, { maxDim, quality });
  return dataUrl;
}
