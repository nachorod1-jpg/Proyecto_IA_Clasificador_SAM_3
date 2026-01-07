import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchConcepts, fetchJobSamples } from '../api';
import { DEFAULT_PAGE_SIZE } from '../config/env';
import { Concept, Sample } from '../types';
import ApiErrorDisplay from './ApiErrorDisplay';
import { ApiError } from '../api/client';

interface Props {
  jobId: string;
}

const buckets = [
  { value: '', label: 'Todos' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'uncertain', label: 'Uncertain' }
];

const SamplesGallery = ({ jobId }: Props) => {
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [concept, setConcept] = useState<number | undefined>();
  const [bucket, setBucket] = useState('');

  const { data: concepts } = useQuery<Concept[], ApiError>({
    queryKey: ['concepts'],
    queryFn: fetchConcepts
  });

  const { data, isLoading, error, refetch, isFetching } = useQuery<Awaited<ReturnType<typeof fetchJobSamples>>, ApiError>({
    queryKey: ['samples', jobId, limit, concept, bucket],
    queryFn: () => fetchJobSamples(jobId, { limit, concept_id: concept, bucket })
  });

  const items = data || [];

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
  };

  const isNotFound = error?.status === 404;
  const hasNoSamples = !isLoading && !error && items.length === 0;

  const resolveImageSrc = (sample: Sample) => {
    const candidate = sample.abs_path || sample.rel_path;
    if (!candidate) return null;
    const trimmed = candidate.trim();
    if (/^(https?:|data:|blob:)/i.test(trimmed)) {
      return trimmed;
    }
    return null;
  };

  const conceptsOptions = useMemo(
    () => [{ id: undefined, name: 'Todos' }, ...(concepts || [])],
    [concepts]
  );

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
            onChange={(e) => handleLimitChange(Number(e.target.value))}
            className="w-28 rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {[24, 48, 60].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            refetch();
          }}
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
      </div>

      {!isNotFound && error && <ApiErrorDisplay error={error} />}
      {isNotFound && !isLoading && <div className="text-sm text-gray-600">No hay samples para este job (aún).</div>}
      {isLoading && <div className="text-sm text-gray-600">Cargando samples...</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((sample: Sample) => {
          const imgSrc = resolveImageSrc(sample);
          return (
            <div key={`${sample.image_id}-${sample.rel_path ?? sample.abs_path ?? 'sample'}`} className="overflow-hidden rounded-lg border bg-white shadow-sm">
              {imgSrc ? (
                <img src={imgSrc} alt={`sample-${sample.image_id}`} className="h-48 w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-48 items-center justify-center bg-gray-100 text-center text-xs text-gray-500">
                  Imagen no accesible vía HTTP.
                </div>
              )}
              <div className="space-y-2 p-3 text-xs text-gray-700">
                <div className="font-semibold">Imagen #{sample.image_id}</div>
                {sample.rel_path && (
                  <div className="break-all">
                    <span className="font-semibold">rel_path:</span> {sample.rel_path}
                  </div>
                )}
                {sample.abs_path && (
                  <div className="break-all">
                    <span className="font-semibold">abs_path:</span> {sample.abs_path}
                  </div>
                )}
                {!imgSrc && (
                  <div className="rounded border border-yellow-200 bg-yellow-50 p-2 text-[11px] text-yellow-800">
                    La imagen no es accesible vía HTTP; se requiere endpoint de serving o descarga.
                  </div>
                )}
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
                    {!(sample.regions || []).length && <li className="text-gray-500">Sin regiones.</li>}
                  </ul>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {hasNoSamples && <div className="text-sm text-gray-600">No hay samples para este job (aún).</div>}
      {isFetching && !isLoading && <div className="text-xs text-gray-500">Actualizando samples...</div>}
    </div>
  );
};

export default SamplesGallery;
