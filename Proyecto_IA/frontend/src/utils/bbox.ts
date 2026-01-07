import { BBox } from '../types';

export interface NormalizedBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const toNumber = (value: number | string): number => {
  const asNumber = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(asNumber) ? asNumber : NaN;
};

export const normalizeBBox = (
  bbox: BBox,
  imageWidth: number,
  imageHeight: number
): NormalizedBBox | null => {
  if (!bbox || bbox.length !== 4) {
    return null;
  }

  const numeric = bbox.map(toNumber);
  if (numeric.some((value) => Number.isNaN(value))) {
    if (import.meta.env.DEV) {
      console.debug('[samples] bbox inválido (no numérico)', bbox);
    }
    return null;
  }

  const [x1, y1, x2, y2] = numeric;
  let x = x1;
  let y = y1;
  let width = x2;
  let height = y2;

  const looksLikeCorners =
    x2 > x1 &&
    y2 > y1 &&
    x2 <= imageWidth + 1 &&
    y2 <= imageHeight + 1;

  if (looksLikeCorners) {
    width = x2 - x1;
    height = y2 - y1;
  }

  if (!looksLikeCorners) {
    const rightEdge = x1 + x2;
    const bottomEdge = y1 + y2;
    if (rightEdge <= imageWidth + 1 && bottomEdge <= imageHeight + 1) {
      width = x2;
      height = y2;
    }
  }

  const clampedWidth = Math.max(0, Math.min(width, imageWidth - x));
  const clampedHeight = Math.max(0, Math.min(height, imageHeight - y));

  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
    width: clampedWidth,
    height: clampedHeight
  };
};
