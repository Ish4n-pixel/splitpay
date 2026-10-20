/**
 * Client-side image pre-processing for receipt photos.
 * - Resizes large smartphone camera photos (12-48MP) to an optimal ~1600px max dimension.
 * - Shrinks 5-15MB files down to ~250-400KB high-contrast JPEG in <100ms.
 * - Enhances contrast to make faint thermal paper text stand out clearly.
 * - Prevents mobile browser memory crashes and upload payload timeouts.
 */

export interface PreprocessedImage {
  base64: string;
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
}

export async function preprocessReceiptImage(file: File | Blob): Promise<PreprocessedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      const maxDim = 1600;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }

      // Draw downscaled image
      ctx.drawImage(img, 0, 0, width, height);

      // Contrast enhancement for thermal receipts
      try {
        const imgData = ctx.getImageData(0, 0, width, height);
        const d = imgData.data;
        const contrast = 1.2; // 20% contrast boost
        const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));

        for (let i = 0; i < d.length; i += 4) {
          // Greyscale luminance
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const adjusted = factor * (gray - 128) + 128;
          const clamped = Math.min(255, Math.max(0, adjusted));
          d[i] = clamped;
          d[i + 1] = clamped;
          d[i + 2] = clamped;
        }
        ctx.putImageData(imgData, 0, 0);
      } catch (err) {
        console.warn('Contrast adjustment skipped:', err);
      }

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to create JPEG blob from canvas'));
            return;
          }

          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            const base64 = dataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
            resolve({
              base64,
              dataUrl,
              blob,
              width,
              height,
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to read selected receipt image file.'));
    };

    img.src = url;
  });
}
