import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueries } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchJob, resumeJob } from '../api';
import ApiErrorDisplay from '../components/ApiErrorDisplay';
import JobStateIndicator from '../components/JobStateIndicator';
import { ApiError } from '../api/client';
import { Job } from '../types';
import {
  getCurrentLevel1JobId,
  getLevel1JobMeta,
  getLevel1JobRegistryKey,
  getRecentLevel1JobIds,
  setCurrentLevel1JobId,
  updateLevel1JobMeta
} from '../utils/jobRegistry';

const shouldPoll = (status?: string) => status === 'pending' || status === 'running';

const JobsL1Page = () => {
  const [jobIds, setJobIds] = useState<number[]>(() => getRecentLevel1JobIds());
  const currentJobId = getCurrentLevel1JobId();

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === getLevel1JobRegistryKey()) {
        setJobIds(getRecentLevel1JobIds());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const queries = useQueries({
    queries: jobIds.map((jobId) => ({
      queryKey: ['job', jobId],
      queryFn: () => fetchJob(String(jobId)),
      refetchInterval: (data: Job | undefined) => (shouldPoll(data?.status) ? 5000 : false),
      retry: false,
      onSuccess: (data: Job) => {
        updateLevel1JobMeta(jobId, {
          status: data.status,
          processed_images: data.processed_images,
          total_images: data.total_images
        });
      }
    }))
  });

  const resumeMutation = useMutation({
    mutationFn: (jobId: number) => resumeJob(String(jobId))
  });

  const rows = useMemo(
    () =>
      jobIds.map((jobId, index) => {
        const query = queries[index];
        return { jobId, query };
      }),
    [jobIds, queries]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs L1</h1>
          <p className="text-sm text-gray-600">Historial local de jobs L1 lanzados en esta máquina.</p>
        </div>
        <button
          type="button"
          onClick={() => setJobIds(getRecentLevel1JobIds())}
          className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
        >
          Refrescar lista
        </button>
      </div>

      {jobIds.length === 0 && <div className="text-sm text-gray-600">Aún no hay jobs registrados localmente.</div>}

      {jobIds.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Job ID</th>
                <th className="px-4 py-3">Método</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Progreso</th>
                <th className="px-4 py-3">Timestamps</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ jobId, query }) => {
                const data = query.data;
                const status = data?.status;
                const processed = data?.processed_images ?? getLevel1JobMeta(jobId)?.processed_images ?? 0;
                const total = data?.total_images ?? getLevel1JobMeta(jobId)?.total_images ?? 0;
                const progressLabel =
                  total > 0 && processed > total
                    ? `${processed} procesadas (total reportado: ${total})`
                    : `${processed}/${total}`;
                const canResume = status === 'cancelled' || status === 'failed' || status === 'paused' || status === 'pending';
                return (
                  <tr key={jobId}>
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      #{jobId}
                      {currentJobId === jobId && <span className="ml-2 rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">Actual</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">{data?.inference_method || 'PCS_TEXT'}</td>
                    <td className="px-4 py-3">
                      {status ? <JobStateIndicator status={status} /> : <span className="text-gray-500">N/D</span>}
                      {query.isFetching && <div className="text-[10px] text-gray-400">Actualizando...</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{progressLabel}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <div>Creado: {data?.created_at || 'N/D'}</div>
                      <div>Actualizado: {data?.updated_at || getLevel1JobMeta(jobId)?.lastSeenAt || 'N/D'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          to={`/classification/level1/jobs/${jobId}`}
                          onClick={() => setCurrentLevel1JobId(jobId)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                        >
                          Ver detalle
                        </Link>
                        <Link
                          to={`/classification/level1/jobs/${jobId}/results`}
                          className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                        >
                          Ver resultados
                        </Link>
                        <button
                          type="button"
                          disabled={!canResume || resumeMutation.isLoading}
                          onClick={() => resumeMutation.mutate(jobId)}
                          className="rounded border border-blue-600 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                        >
                          Reanudar
                        </button>
                      </div>
                      {query.error && <ApiErrorDisplay error={query.error as ApiError} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default JobsL1Page;
