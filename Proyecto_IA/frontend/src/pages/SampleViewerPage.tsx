import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { fetchJobSamples, getMaskUrl, getSampleImageUrl } from '../api';
import { Sample, SampleRegion } from '../types';
import ApiErrorDisplay from '../components/ApiErrorDisplay';
import { normalizeBBox } from '../utils/bbox';

const loadMaskImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });

const SampleViewerPage = () => {
  const { jobId = '', sampleId = '' } = useParams();
  const [showBboxes, setShowBboxes] = useState(true);
  const [showMasks, setShowMasks] = useState(true);
  const [maskOpacity, setMaskOpacity] = useState(0.35);
  const [conceptFilter, setConceptFilter] = useState<string>('all');
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const { data, isLoading, error } = useQuery<Sample[], Error>({
    queryKey: ['sample', jobId, sampleId],
    queryFn: () =>
      fetchJobSamples(jobId, {
        image_id: Number(sampleId),
        limit: 1
      })
  });

  const sample = data?.[0];
  const imageUrl = sample ? getSampleImageUrl(sample.image_id) : undefined;

  const concepts = useMemo(() => {
    if (!sample?.regions) {
      return [];
    }
    const unique = new Map<string, string>();
    sample.regions.forEach((region) => {
      if (region.concept_name) {
        unique.set(region.concept_name, region.concept_name);
      }
    });
    return Array.from(unique.values());
  }, [sample]);

  const filteredRegions = useMemo(() => {
    if (!sample?.regions) {
      return [];
    }
    if (conceptFilter === 'all') {
      return sample.regions;
    }
    return sample.regions.filter((region) => region.concept_name === conceptFilter);
  }, [conceptFilter, sample]);

  const drawOverlays = useCallback(async () => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas || !sample) {
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

    const scaleX = rect.width / image.naturalWidth;
    const scaleY = rect.height / image.naturalHeight;

    if (showMasks) {
      const maskRegions = filteredRegions.filter((region) => region.mask_ref);
      for (const region of maskRegions) {
        if (!region.mask_ref) {
          continue;
        }
        try {
          const maskUrl = getMaskUrl(jobId, region.mask_ref);
          const maskImage = await loadMaskImage(maskUrl);
          ctx.save();
          ctx.globalAlpha = maskOpacity;
          ctx.drawImage(maskImage, 0, 0, rect.width, rect.height);
          ctx.restore();
        } catch (err) {
          if (import.meta.env.DEV) {
            console.debug('[samples] mask load failed', region.mask_ref, err);
          }
        }
      }
    }

    if (showBboxes) {
      filteredRegions.forEach((region) => {
        const normalized = normalizeBBox(region.bbox, image.naturalWidth, image.naturalHeight);
        if (!normalized) {
          return;
        }
        const x = normalized.x * scaleX;
        const y = normalized.y * scaleY;
        const width = normalized.width * scaleX;
        const height = normalized.height * scaleY;
        ctx.strokeStyle = region.color_hex || '#10b981';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
        const label = `${region.concept_name ?? 'Concepto'}${region.score !== undefined ? ` (${region.score.toFixed(2)})` : ''}`;
        ctx.fillStyle = region.color_hex || '#10b981';
        ctx.font = '12px sans-serif';
        const textWidth = ctx.measureText(label).width;
        ctx.fillRect(x, Math.max(0, y - 16), textWidth + 6, 16);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, x + 3, Math.max(12, y - 4));
      });
    }
  }, [filteredRegions, jobId, maskOpacity, sample, showBboxes, showMasks]);

  useEffect(() => {
    void drawOverlays();
  }, [drawOverlays]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Imagen #{sampleId}</h1>
          <p className="text-sm text-gray-600">Visor con comparación antes/después y overlays.</p>
        </div>
        <Link to={`/classification/level1/jobs/${jobId}/results#samples`} className="text-sm font-semibold text-blue-700">
          Volver a resultados
        </Link>
      </div>

      {isLoading && <div className="text-sm text-gray-600">Cargando sample...</div>}
      <ApiErrorDisplay error={error ?? null} />

      {sample && (
        <div className="space-y-4 rounded-lg bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={showBboxes} onChange={(e) => setShowBboxes(e.target.checked)} />
              Mostrar bbox
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={showMasks} onChange={(e) => setShowMasks(e.target.checked)} />
              Mostrar máscaras
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              Opacidad máscara
              <input
                type="range"
                min={0.1}
                max={0.8}
                step={0.05}
                value={maskOpacity}
                onChange={(e) => setMaskOpacity(Number(e.target.value))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              Concepto
              <select
                value={conceptFilter}
                onChange={(e) => setConceptFilter(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              >
                <option value="all">Todos</option>
                {concepts.map((concept) => (
                  <option key={concept} value={concept}>
                    {concept}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {imageUrl && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase text-gray-500">Original</div>
                <img src={imageUrl} alt={`sample-${sampleId}-original`} className="w-full rounded border" />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase text-gray-500">Overlay</div>
                <div className="relative">
                  <img
                    ref={imageRef}
                    src={imageUrl}
                    alt={`sample-${sampleId}-overlay`}
                    className="w-full rounded border"
                    onLoad={() => {
                      void drawOverlays();
                    }}
                  />
                  <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
                </div>
              </div>
            </div>
          )}

          <div>
            <h2 className="text-lg font-semibold text-gray-800">Detecciones</h2>
            <p className="text-sm text-gray-600">Total: {filteredRegions.length}</p>
            <table className="mt-2 min-w-full divide-y divide-gray-200 text-sm text-gray-700">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left">Concepto</th>
                  <th className="px-3 py-2 text-left">Score</th>
                  <th className="px-3 py-2 text-left">BBox</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRegions.map((region: SampleRegion, idx: number) => (
                  <tr key={idx}>
                    <td className="px-3 py-2">{region.concept_name || region.concept_id || 'N/A'}</td>
                    <td className="px-3 py-2">{region.score?.toFixed(2) ?? 'N/A'}</td>
                    <td className="px-3 py-2">{region.bbox.join(', ')}</td>
                  </tr>
                ))}
                {filteredRegions.length === 0 && (
                  <tr>
                    <td className="px-3 py-2 text-sm text-gray-600" colSpan={3}>
                      No se detectaron regiones para esta imagen.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!sample && !isLoading && <div className="text-sm text-gray-600">No se pudo obtener la imagen.</div>}
    </div>
  );
};

export default SampleViewerPage;
