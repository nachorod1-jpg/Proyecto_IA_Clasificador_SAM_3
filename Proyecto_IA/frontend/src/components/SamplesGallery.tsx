import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchConcepts, fetchJobImages, fetchJobSamples } from '../api';
import { Concept, JobImage, Sample } from '../types';
import ApiErrorDisplay from './ApiErrorDisplay';
import { ApiError } from '../api/client';
import SampleOverlayImage from './SampleOverlayImage';
import { getRegionColor } from '../utils/maskOverlay';

interface Props {
  jobId: string;
}

const buckets = [
  { value: '', label: 'Todos' },
  { value: 'max', label: 'Top' },
  { value: 'b1', label: 'Alta' },
  { value: 'b2', label: 'Media' },
  { value: 'min', label: 'Baja' }
];

const DEFAULT_LIMIT = 50;

const SamplesGallery = ({ jobId }: Props) => {
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [concept, setConcept] = useState<number | undefined>();
  const [bucket, setBucket] = useState('max');
  const [showProcessedImages, setShowProcessedImages] = useState(false);
  const [showBboxes, setShowBboxes] = useState(true);
  const [showMasks, setShowMasks] = useState(true);
  const [maskOpacity, setMaskOpacity] = useState(0.35);

  const { data: concepts } = useQuery<Concept[], ApiError>({
    queryKey: ['concepts'],
    queryFn: fetchConcepts
  });

  // Dev tip: curl -s "http://localhost:8000/api/v1/jobs/{jobId}/samples?limit=50&bucket=max"
  const { data, isLoading, error, refetch, isFetching } = useQuery<
    Awaited<ReturnType<typeof fetchJobSamples>>,
    ApiError
  >({
    queryKey: ['samples', jobId, limit, concept, bucket],
    queryFn: () => fetchJobSamples(jobId, { limit, concept_id: concept, bucket })
  });

  const jobImagesQuery = useQuery<Awaited<ReturnType<typeof fetchJobImages>>, ApiError>({
    queryKey: ['job-images', jobId, limit],
    queryFn: () => fetchJobImages(jobId, { limit }),
    enabled: showProcessedImages
  });

  const items = data || [];
  const jobImages = jobImagesQuery.data || [];

  const isNotFound = error?.status === 404;
  const hasNoSamples = !isLoading && !error && items.length === 0;

  const conceptsOptions = useMemo(
    () => [{ id: undefined, name: 'Todos' }, ...(concepts || [])],
    [concepts]
  );

  const fallbackItems = useMemo(() => {
    if (!showProcessedImages || items.length > 0) {
      return [];
    }
    return jobImages.map((image) => ({
      image_id: image.image_id,
      rel_path: image.rel_path,
      abs_path: image.abs_path,
      regions: []
    }));
  }, [items.length, jobImages, showProcessedImages]);

  const galleryItems = items.length > 0 ? items : fallbackItems;

  const summarizeConcepts = (sample: Sample) => {
    const summary = new Map<string, number>();
    (sample.regions || []).forEach((region) => {
      const key = region.concept_name || 'Concepto';
      summary.set(key, (summary.get(key) ?? 0) + 1);
    });
    return Array.from(summary.entries()).map(([name, count]) => `${name}: ${count}`);
  };

  const legendItems = useMemo(() => {
    const map = new Map<string, string>();
    galleryItems.forEach((sample) => {
      (sample.regions || []).forEach((region) => {
        const name = region.concept_name || 'Concepto';
        map.set(name, getRegionColor(region));
      });
    });
    return Array.from(map.entries());
  }, [galleryItems]);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Concepto</label>
          <select
            value={concept ?? ''}
            onChange={(e) => setConcept(e.target.value ? Number(e.target.value) : undefined)}
            className="w-40 rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {conceptsOptions.map((c) => (
              <option key={c.id ?? 'all'} value={c.id ?? ''}>
                {c.name ?? c.id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Bucket</label>
          <select
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
            className="w-36 rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {buckets.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Límite</label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="w-28 rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {[24, 50, 75].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="self-end rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Aplicar filtros
        </button>
        <button
          type="button"
          onClick={() => refetch()}
          className="self-end rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
        >
          Refrescar
        </button>
        <label className="flex items-center gap-2 self-end text-sm text-gray-700">
          <input type="checkbox" checked={showBboxes} onChange={(e) => setShowBboxes(e.target.checked)} />
          Mostrar cajas
        </label>
        <label className="flex items-center gap-2 self-end text-sm text-gray-700">
          <input type="checkbox" checked={showMasks} onChange={(e) => setShowMasks(e.target.checked)} />
          Mostrar máscaras
        </label>
        <label className="flex items-center gap-2 self-end text-sm text-gray-700">
          Opacidad
          <input
            type="range"
            min={0.1}
            max={0.8}
            step={0.05}
            value={maskOpacity}
            onChange={(e) => setMaskOpacity(Number(e.target.value))}
          />
        </label>
      </div>

      {legendItems.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-gray-600">
          {legendItems.map(([name, color]) => (
            <span key={name} className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              {name}
            </span>
          ))}
        </div>
      )}

      {!isNotFound && error && <ApiErrorDisplay error={error} />}
      {isNotFound && !isLoading && <div className="text-sm text-gray-600">No hay samples para este job (aún).</div>}
      {isLoading && <div className="text-sm text-gray-600">Cargando samples...</div>}

      {hasNoSamples && (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
          <div>No se han devuelto samples para este job.</div>
          <button
            type="button"
            onClick={() => setShowProcessedImages(true)}
            className="mt-2 rounded bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Mostrar imágenes procesadas (sin detecciones)
          </button>
        </div>
      )}

      {showProcessedImages && jobImagesQuery.isLoading && (
        <div className="text-sm text-gray-600">Cargando imágenes procesadas...</div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {galleryItems.map((sample: Sample) => {
          const detectionCount = sample.regions?.length ?? 0;
          const conceptSummary = summarizeConcepts(sample);
          return (
            <div
              key={`${sample.image_id}-${sample.rel_path ?? sample.abs_path ?? 'sample'}`}
              className="overflow-hidden rounded-lg border bg-white shadow-sm"
            >
              <SampleOverlayImage
                sample={sample}
                jobId={jobId}
                showBboxes={showBboxes}
                showMasks={showMasks}
                maskOpacity={maskOpacity}
              />
              <div className="space-y-2 p-3 text-xs text-gray-700">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Imagen #{sample.image_id}</div>
                  <Link
                    to={`/classification/level1/jobs/${jobId}/samples/${sample.image_id}`}
                    className="text-xs font-semibold text-blue-700 hover:underline"
                  >
                    Ver detalle
                  </Link>
                </div>
                {sample.rel_path && (
                  <div className="break-all">
                    <span className="font-semibold">rel_path:</span> {sample.rel_path}
                  </div>
                )}
                <div className="rounded bg-gray-50 p-2 text-[11px] text-gray-700">
                  <div>Detecciones: {detectionCount}</div>
                  {conceptSummary.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {conceptSummary.map((item) => (
                        <span key={item} className="rounded bg-white px-2 py-0.5 text-[10px] text-gray-600">
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1 text-gray-500">No detecciones: pruebe threshold menor / prompt en inglés.</div>
                  )}
                </div>
                {detectionCount > 0 && (
                  <div>
                    <div className="font-semibold text-gray-800">Regiones</div>
                    <ul className="mt-1 space-y-1">
                      {(sample.regions || []).map((region, idx) => (
                        <li key={`${sample.image_id}-region-${idx}`} className="rounded border border-gray-200 px-2 py-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{region.concept_name || 'Concepto'}</span>
                            {typeof region.score === 'number' && <span>Score: {region.score.toFixed(2)}</span>}
                            {region.color_hex && (
                              <span
                                className="rounded px-2 py-0.5 text-[10px] font-semibold text-white"
                                style={{ backgroundColor: region.color_hex }}
                              >
                                {region.color_hex}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-600">BBox: {region.bbox.join(', ')}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showProcessedImages && hasNoSamples && jobImagesQuery.isSuccess && jobImages.length === 0 && (
        <div className="text-sm text-gray-600">No hay imágenes procesadas para este job.</div>
      )}
      {isFetching && !isLoading && <div className="text-xs text-gray-500">Actualizando samples...</div>}
    </div>
  );
};

export default SamplesGallery;
