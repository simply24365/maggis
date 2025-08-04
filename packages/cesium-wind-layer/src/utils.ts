export function deepMerge<T extends Record<string, any>>(from: Partial<T>, to: T): T {
  // Handle null or undefined cases
  if (!from) return to;
  if (!to) return from as T;

  // Create a new object to avoid modifying the original
  const result = { ...to };

  for (const key in from) {
    if (Object.prototype.hasOwnProperty.call(from, key)) {
      const fromValue = from[key];
      const toValue = to[key];

      // Handle array case
      if (Array.isArray(fromValue)) {
        result[key] = fromValue.slice();
        continue;
      }

      // Handle object case
      if (fromValue && typeof fromValue === 'object') {
        result[key] = deepMerge(fromValue, toValue || {}) as T[Extract<keyof T, string>];
        continue;
      }

      // Handle primitive values
      if (fromValue !== undefined) {
        result[key] = fromValue;
      }
    }
  }

  return result;
}

/**
 * Fetches an image and converts it to a mask array
 * @param imageUrl - URL of the image to fetch
 * @param width - Expected width of the mask data
 * @param height - Expected height of the mask data
 * @returns Promise that resolves to FlowDataDemention mask data
 */
export async function fetchImageAsMask(imageUrl: string, width: number, height: number): Promise<{ array: Float32Array; min: number; max: number }> {
  return new Promise((resolve, reject) => {
    // Check if we're in a sandboxed environment or if DOM APIs are available
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      reject(new Error('DOM APIs not available - may be running in sandboxed environment'));
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        // Create canvas and get image data
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context - may be running in sandboxed environment without allow-scripts permission'));
          return;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw the image scaled to the expected dimensions
        ctx.drawImage(img, 0, 0, width, height);
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // Convert to grayscale mask (using red channel or luminance)
        const maskArray = new Float32Array(width * height);
        let min = Number.MAX_VALUE;
        let max = Number.MIN_VALUE;
        
        for (let i = 0; i < maskArray.length; i++) {
          const pixelIndex = i * 4; // RGBA
          const r = data[pixelIndex];
          const g = data[pixelIndex + 1];
          const b = data[pixelIndex + 2];
          const alpha = data[pixelIndex + 3];
          
          // Convert to grayscale (luminance formula) and normalize to 0-1
          // Where white areas (255) = 1 (valid), black areas (0) = 0 (invalid)
          const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          
          // Consider alpha channel - if alpha is 0, treat as invalid (0)
          const maskValue = alpha === 0 ? 0 : luminance;
          
          maskArray[i] = maskValue;
          
          if (maskValue > 0) {
            min = Math.min(min, maskValue);
            max = Math.max(max, maskValue);
          }
        }
        
        // If no valid pixels found, set default values
        if (min === Number.MAX_VALUE) {
          min = 0;
          max = 1;
        }
        
        resolve({
          array: maskArray,
          min,
          max
        });
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error(`Failed to load image: ${imageUrl}`));
    };
    
    img.src = imageUrl;
  });
}
