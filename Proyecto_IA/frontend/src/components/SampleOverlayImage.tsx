import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sample, SampleRegion } from '../types';
import { getSampleImageUrl } from '../api';
import { normalizeBBox } from '../utils/bbox';
import { drawMaskOverlays, getRegionColor } from '../utils/maskOverlay';

interface Props {
  sample: Sample;
  jobId: string;
  showMasks: boolean;
  showBboxes: boolean;
  maskOpacity: number;
  demoMode?: boolean;
  demoCount?: number;
}

const buildDemoRegions = (width: number, height: number, count: number): SampleRegion[] => {
  if (!width || !height || count <= 0) {
    return [];
  }
  const cols = Math.min(3, Math.max(1, count));
  const rows = Math.ceil(count / cols);
  const marginX = width * 0.06;
  const marginY = height * 0.06;
  const cellWidth = (width - 2 * marginX) / cols;
  const cellHeight = (height - 2 * marginY) / rows;
  const boxWidth = cellWidth * 0.65;
  const boxHeight = cellHeight * 0.6;
  return Array.from({ length: count }, (_, idx) => {
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    const x0 = marginX + col * cellWidth + (cellWidth - boxWidth) / 2;
    const y0 = marginY + row * cellHeight + (cellHeight - boxHeight) / 2;
    return {
      bbox: [x0, y0, boxWidth, boxHeight],
      score: 0,
      concept_name: 'DEMO',
      is_demo: true
    };
  });
};

const SampleOverlayImage = ({
  sample,
  jobId,
  showMasks,
  showBboxes,
  maskOpacity,
  demoMode = false,
  demoCount = 3
}: Props) => {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const displayRegions = useMemo(() => {
    if ((sample.regions || []).length > 0) {
      return sample.regions || [];
    }
    if (!demoMode || imageSize.width === 0 || imageSize.height === 0) {
      return [];
    }
    return buildDemoRegions(imageSize.width, imageSize.height, demoCount);
  }, [demoCount, demoMode, imageSize.height, imageSize.width, sample.regions]);

  const drawMasks = useCallback(async () => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) {
      return;
    }
    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (showMasks) {
      await drawMaskOverlays(ctx, displayRegions || [], jobId, rect.width, rect.height, maskOpacity);
    }
  }, [displayRegions, jobId, maskOpacity, showMasks]);

  useEffect(() => {
    void drawMasks();
  }, [drawMasks]);

  useEffect(() => {
    if (!imageRef.current) {
      return;
    }
    const observer = new ResizeObserver(() => {
      void drawMasks();
    });
    observer.observe(imageRef.current);
    return () => observer.disconnect();
  }, [drawMasks]);

  return (
    <div className="relative">
      <img
        ref={imageRef}
        src={getSampleImageUrl(sample.image_id)}
        alt={`sample-${sample.image_id}`}
        className="h-48 w-full object-cover"
        loading="lazy"
        onLoad={() => {
          const image = imageRef.current;
          if (image) {
            setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
          }
          void drawMasks();
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {showBboxes && imageSize.width > 0 && (
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {displayRegions.map((region) => {
            const normalized = normalizeBBox(region.bbox, imageSize.width, imageSize.height);
            if (!normalized) {
              return null;
            }
            const color = getRegionColor(region);
            const labelY = Math.max(0, normalized.y - 16);
            return (
              <g key={`${sample.image_id}-${region.region_id ?? `${normalized.x}-${normalized.y}`}`}>
                <rect
                  x={normalized.x}
                  y={normalized.y}
                  width={normalized.width}
                  height={normalized.height}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray={region.is_demo ? '6 4' : undefined}
                >
                  <title>
                    {(region.concept_name || 'Concepto') +
                      ` · score ${region.score?.toFixed(2) ?? 'N/A'} · id ${region.region_id ?? 'N/D'}` +
                      (region.is_demo ? ' · DEMO' : '')}
                  </title>
                </rect>
                {region.is_demo && (
                  <g>
                    <rect
                      x={normalized.x}
                      y={labelY}
                      width={44}
                      height={14}
                      fill="white"
                      stroke={color}
                      strokeWidth={1}
                    />
                    <text x={normalized.x + 4} y={labelY + 11} fontSize={10} fill={color}>
                      DEMO
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
};

export default SampleOverlayImage;
