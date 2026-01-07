import { useCallback, useEffect, useRef, useState } from 'react';
import { Sample } from '../types';
import { getSampleImageUrl } from '../api';
import { normalizeBBox } from '../utils/bbox';
import { drawMaskOverlays, getRegionColor } from '../utils/maskOverlay';

interface Props {
  sample: Sample;
  jobId: string;
  showMasks: boolean;
  showBboxes: boolean;
  maskOpacity: number;
}

const SampleOverlayImage = ({ sample, jobId, showMasks, showBboxes, maskOpacity }: Props) => {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

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
      await drawMaskOverlays(ctx, sample.regions || [], jobId, rect.width, rect.height, maskOpacity);
    }
  }, [jobId, maskOpacity, sample.regions, showMasks]);

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
          {(sample.regions || []).map((region) => {
            const normalized = normalizeBBox(region.bbox, imageSize.width, imageSize.height);
            if (!normalized) {
              return null;
            }
            const color = getRegionColor(region);
            return (
              <rect
                key={`${sample.image_id}-${region.region_id ?? `${normalized.x}-${normalized.y}`}`}
                x={normalized.x}
                y={normalized.y}
                width={normalized.width}
                height={normalized.height}
                fill="none"
                stroke={color}
                strokeWidth={2}
              >
                <title>
                  {(region.concept_name || 'Concepto') +
                    ` · score ${region.score?.toFixed(2) ?? 'N/A'} · id ${region.region_id ?? 'N/D'}`}
                </title>
              </rect>
            );
          })}
        </svg>
      )}
    </div>
  );
};

export default SampleOverlayImage;
