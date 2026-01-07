import { SampleRegion } from '../types';
import { getMaskUrl } from '../api';

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
};

const hslToHex = (h: number, s: number, l: number) => {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) =>
    light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (value: number) => Math.round(255 * value).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
};

const fallbackColor = (region: SampleRegion) => {
  const seed = region.concept_id ? region.concept_id.toString() : region.concept_name || 'region';
  const hash = Math.abs(hashString(seed));
  const hue = hash % 360;
  return hslToHex(hue, 70, 45);
};

export const getRegionColor = (region: SampleRegion) => region.color_hex || fallbackColor(region);

const hexToRgb = (color: string) => {
  const normalized = color.replace('#', '');
  const bigint = parseInt(normalized.length === 3 ? normalized.repeat(2) : normalized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
};

const loadMaskImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });

const buildOutlineMask = (data: Uint8ClampedArray, width: number, height: number) => {
  const outline = new Uint8ClampedArray(width * height);
  const idx = (x: number, y: number) => y * width + x;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const alpha = data[idx(x, y) * 4 + 3];
      if (alpha === 0) {
        continue;
      }
      const hasEdge =
        data[idx(x - 1, y) * 4 + 3] === 0 ||
        data[idx(x + 1, y) * 4 + 3] === 0 ||
        data[idx(x, y - 1) * 4 + 3] === 0 ||
        data[idx(x, y + 1) * 4 + 3] === 0;
      if (hasEdge) {
        outline[idx(x, y)] = 255;
      }
    }
  }
  return outline;
};

const paintMask = (
  ctx: CanvasRenderingContext2D,
  maskImage: HTMLImageElement,
  width: number,
  height: number,
  color: string,
  opacity: number
) => {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) {
    return;
  }
  tempCtx.drawImage(maskImage, 0, 0, width, height);
  const imageData = tempCtx.getImageData(0, 0, width, height);
  const { r, g, b } = hexToRgb(color.startsWith('#') ? color : '#10b981');
  for (let i = 0; i < imageData.data.length; i += 4) {
    const alpha = imageData.data[i + 3] || imageData.data[i];
    if (alpha === 0) {
      imageData.data[i + 3] = 0;
      continue;
    }
    imageData.data[i] = r;
    imageData.data[i + 1] = g;
    imageData.data[i + 2] = b;
    imageData.data[i + 3] = Math.round((alpha / 255) * opacity * 255);
  }
  tempCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(tempCanvas, 0, 0);

  const outlineMask = buildOutlineMask(imageData.data, width, height);
  const outlineData = ctx.createImageData(width, height);
  for (let i = 0; i < outlineMask.length; i += 1) {
    if (outlineMask[i] === 0) {
      continue;
    }
    const offset = i * 4;
    outlineData.data[offset] = r;
    outlineData.data[offset + 1] = g;
    outlineData.data[offset + 2] = b;
    outlineData.data[offset + 3] = 220;
  }
  ctx.putImageData(outlineData, 0, 0);
};

export const drawMaskOverlays = async (
  ctx: CanvasRenderingContext2D,
  regions: SampleRegion[],
  jobId: string,
  width: number,
  height: number,
  opacity: number
) => {
  const maskRegions = regions.filter((region) => region.mask_ref || region.mask_url);
  for (const region of maskRegions) {
    const maskUrl = region.mask_url || getMaskUrl(jobId, region.mask_ref || '');
    if (!maskUrl) {
      continue;
    }
    try {
      const maskImage = await loadMaskImage(maskUrl);
      const color = getRegionColor(region);
      paintMask(ctx, maskImage, width, height, color, opacity);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.debug('[samples] mask load failed', region.mask_ref, err);
      }
    }
  }
};
