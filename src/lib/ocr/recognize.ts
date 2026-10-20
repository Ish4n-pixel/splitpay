/**
 * Browser-side receipt OCR engine using Tesseract.js.
 * Pre-processes the image on a canvas (greyscale + contrast boost)
 * for higher accuracy on printed thermal paper receipts.
 */

export interface OcrProgress {
  status: string;
  progress: number; // 0 to 1
}

export async function recognizeReceipt(
  imageSource: File | Blob | string,
  onProgress?: (p: OcrProgress) => void
): Promise<string> {
  const { createWorker } = await import('tesseract.js');

  onProgress?.({ status: 'Initializing OCR engine...', progress: 0.1 });

  const worker = await createWorker('eng');

  try {
    // If running in browser and input is a File/Blob, preprocess via canvas
    let processedSource: string | File | Blob = imageSource;
    if (typeof window !== 'undefined' && typeof imageSource !== 'string' && (imageSource as any instanceof Blob)) {
      try {
        processedSource = await preprocessImageCanvas(imageSource);
      } catch (err) {
        console.warn('Canvas pre-processing skipped:', err);
        processedSource = imageSource;
      }
    }

    onProgress?.({ status: 'Scanning receipt lines...', progress: 0.4 });

    const ret = await worker.recognize(processedSource as any);

    onProgress?.({ status: 'Processing text...', progress: 0.95 });

    return ret.data.text;
  } finally {
    await worker.terminate();
    onProgress?.({ status: 'Done', progress: 1.0 });
  }
}

/**
 * Grayscales and boosts contrast on an image blob to make faint receipt fonts stand out.
 */
async function preprocessImageCanvas(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(url);
        return;
      }

      // Constrain width to 1600px for speed while maintaining high OCR legibility
      const scale = Math.min(1, 1600 / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;

      // Greyscale + contrast enhancement
      const contrast = 1.25; // 25% boost
      const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));

      for (let i = 0; i < d.length; i += 4) {
        // Luminance greyscale
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const adjusted = factor * (gray - 128) + 128;
        const clamped = Math.min(255, Math.max(0, adjusted));

        d[i] = clamped;
        d[i + 1] = clamped;
        d[i + 2] = clamped;
      }

      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}
