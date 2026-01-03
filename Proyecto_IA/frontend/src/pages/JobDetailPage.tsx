import { useMutation } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import ApiErrorDisplay from '../components/ApiErrorDisplay';
import JobStateIndicator from '../components/JobStateIndicator';
import ProgressBar from '../components/ProgressBar';
import { cancelJob, resumeJob } from '../api';
import { useJobPolling } from '../hooks/useJobPolling';
import { ApiError } from '../api/client';

const JobDetailPage = () => {
  const { jobId = '' } = useParams();
  const { data, isLoading, error } = useJobPolling(jobId);

  const apiError = error as ApiError | null;
  const jobNotFound = apiError?.status === 404;

  const cancelMutation = useMutation({
    mutationFn: () => cancelJob(jobId)
  });

  const resumeMutation = useMutation({
    mutationFn: () => resumeJob(jobId)
  });

  const status = data?.status || data?.state;
  const canCancel = status === 'running';
  const canResume = status === 'cancelled' || status === 'failed' || status === 'paused';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job #{jobId}</h1>
          <p className="text-sm text-gray-600">Monitorea el progreso y estado.</p>
        </div>
        <Link to={`/classification/level1/jobs/${jobId}/results`} className="text-sm font-semibold text-blue-700">
          Ver resultados
        </Link>
      </div>

      {isLoading && <div className="text-sm text-gray-600">Cargando job...</div>}
      {jobNotFound && (
        <div className="rounded-md bg-yellow-50 p-4 text-sm text-yellow-800">Job no encontrado.</div>
      )}
      {!jobNotFound && <ApiErrorDisplay error={error ?? null} />}

      {data && !jobNotFound && (
        <div className="space-y-4 rounded-lg bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            {status && <JobStateIndicator status={status} />}
            {data.error_message && <div className="text-sm text-red-700">{data.error_message}</div>}
          </div>
          <ProgressBar processed={data.processed_images} total={data.total_images} />
          <div className="grid gap-3 text-sm text-gray-700 sm:grid-cols-2">
            <div>
              <span className="font-semibold">Creado:</span> {data.created_at || 'N/D'}
            </div>
            <div>
              <span className="font-semibold">Actualizado:</span> {data.updated_at || 'N/D'}
            </div>
            <div>
              <span className="font-semibold">Inicio:</span> {data.started_at || 'N/D'}
            </div>
            <div>
              <span className="font-semibold">Fin:</span> {data.finished_at || 'N/D'}
            </div>
            <div>
              <span className="font-semibold">safe_mode:</span> {String(data.safe_mode)}
            </div>
            <div>
              <span className="font-semibold">safe_load:</span> {String(data.safe_load)}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={!canCancel || cancelMutation.isLoading}
              onClick={() => cancelMutation.mutate()}
              className="rounded border border-red-600 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!canResume || resumeMutation.isLoading}
              onClick={() => resumeMutation.mutate()}
              className="rounded border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              Reanudar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobDetailPage;
