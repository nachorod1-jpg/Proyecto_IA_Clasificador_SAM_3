import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJobSamples } from '../api';
import { DEFAULT_PAGE_SIZE } from '../config/env';
import { Sample } from '../types';
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
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [concept, setConcept] = useState<number | undefined>();
  const [bucket, setBucket] = useState('');

  const { data, isLoading, error, refetch, isFetching } = useQuery<
    Awaited<ReturnType<typeof fetchJobSamples>>,
    ApiError
  >({
    queryKey: ['samples', jobId, offset, limit, concept, bucket],
    queryFn: () => fetchJobSamples(jobId, { offset, limit, concept_id: concept, bucket }),
    keepPreviousData: true
  });

  const items = data?.items || [];
  const total = data?.total ?? items.length;
  const totalPages = useMemo(() => (limit ? Math.ceil(total / limit) : 1), [limit, total]);
  const currentPage = limit ? Math.floor(offset / limit) + 1 : 1;

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setOffset((page - 1) * limit);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setOffset(0);
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Concepto</label>
          <input
            type="number"
            value={concept ?? ''}
            onChange={(e) => setConcept(e.target.value ? Number(e.target.value) : undefined)}
            className="w-32 rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="ID"
          />
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
            setOffset(0);
            refetch();
          }}
          className="self-end rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Aplicar filtros
        </button>
      </div>

      {error && <ApiErrorDisplay error={error} />}
      {error?.status === 404 && !isLoading && (
        <div className="text-sm text-gray-600">Aún no hay resultados para este job.</div>
      )}
      {isLoading && <div className="text-sm text-gray-600">Cargando samples...</div>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {items.map((sample: Sample) => {
          const imgSrc = sample.image_url || `/api/v1/images/${sample.image_id}`;
          return (
            <div key={sample.sample_id ?? `${sample.image_id}-${sample.concept_id}`} className="overflow-hidden rounded-lg border bg-white shadow-sm">
              <img src={imgSrc} alt={`sample-${sample.image_id}`} className="h-40 w-full object-cover" loading="lazy" />
              <div className="p-3 text-xs text-gray-700">
                <div className="font-semibold">Concepto: {sample.concept_name || sample.concept_id || 'N/A'}</div>
                <div>Bucket: {sample.bucket || 'N/D'}</div>
                {typeof sample.score === 'number' && <div>Score: {sample.score.toFixed(2)}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {!items.length && !isLoading && <div className="text-sm text-gray-600">No hay samples para los filtros seleccionados.</div>}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1 || isFetching}
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            Anterior
          </button>
          <div className="text-sm text-gray-700">
            Página {currentPage} de {totalPages}
          </div>
          <button
            type="button"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages || isFetching}
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
};

export default SamplesGallery;
