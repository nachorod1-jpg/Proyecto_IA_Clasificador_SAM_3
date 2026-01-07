import { useMutation } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import ApiErrorDisplay from '../components/ApiErrorDisplay';
import JobStateIndicator from '../components/JobStateIndicator';
import ProgressBar from '../components/ProgressBar';
import { cancelJob, resumeJob } from '../api';
import { useJobPolling } from '../hooks/useJobPolling';
import { ApiError } from '../api/client';
import { getRequestedMaxImages, setCurrentLevel1JobId } from '../utils/jobRegistry';
import { useEffect, useMemo } from 'react';

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
  const canResume = status === 'cancelled' || status === 'failed' || status === 'paused' || status === 'pending';
  const requestedMaxImages = useMemo(
    () => (jobId ? getRequestedMaxImages(Number(jobId)) : undefined),
    [jobId]
  );
  const statusMessage =
    status === 'pending'
      ? 'Job pendiente, esperando ejecución...'
      : status === 'running'
        ? 'Clasificación en curso...'
        : status === 'completed'
          ? 'Clasificación completada.'
          : status === 'failed'
            ? 'El job falló durante la ejecución.'
            : status === 'cancelled'
              ? 'El job fue cancelado.'
              : status === 'paused'
                ? 'El job está pausado.'
                : null;

  const processed = data?.processed_images ?? 0;
  const total = data?.total_images ?? 0;
  const progressLabel =
    total > 0 && processed > total
      ? `${processed} procesadas (total reportado: ${total})`
      : `${processed} / ${total}`;

  useEffect(() => {
    if (!jobId) return;
    setCurrentLevel1JobId(Number(jobId));
  }, [jobId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job #{jobId}</h1>
          <p className="text-sm text-gray-600">Monitorea el progreso y estado.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm font-semibold text-blue-700">
          <Link to={`/classification/level1/jobs/${jobId}/results`}>Ver resultados</Link>
          <Link to={`/classification/level1/jobs/${jobId}/results#samples`}>Cargar samples</Link>
        </div>
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
          {statusMessage && <div className="text-sm text-gray-600">{statusMessage}</div>}
          <div className="text-sm text-gray-700">
            <span className="font-semibold">Progreso:</span> {progressLabel}
          </div>
          <ProgressBar processed={processed} total={total} />
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
              <span className="font-semibold">Límite solicitado:</span>{' '}
              {typeof requestedMaxImages === 'number' ? requestedMaxImages : 'N/D'}
            </div>
            <div>
              <span className="font-semibold">safe_mode:</span> {String(data.safe_mode)}
            </div>
            <div>
              <span className="font-semibold">safe_load:</span> {String(data.safe_load)}
            </div>
            <div>
              <span className="font-semibold">Método:</span> {data.inference_method || 'PCS_TEXT'}
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
              {status === 'pending' ? 'Reintentar resume' : 'Reanudar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobDetailPage;
