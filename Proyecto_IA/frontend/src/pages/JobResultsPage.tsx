import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import ApiErrorDisplay from '../components/ApiErrorDisplay';
import { fetchJob, fetchJobStats } from '../api';
import SamplesGallery from '../components/SamplesGallery';
import JobStateIndicator from '../components/JobStateIndicator';
import { ApiError } from '../api/client';
import { Job } from '../types';
import { useEffect } from 'react';
import { setCurrentLevel1JobId } from '../utils/jobRegistry';

const JobResultsPage = () => {
  const { jobId = '' } = useParams();

  const jobQuery = useQuery<Job, ApiError>({
    queryKey: ['job', jobId],
    queryFn: () => fetchJob(jobId),
  });
  const statsQuery = useQuery<Awaited<ReturnType<typeof fetchJobStats>>, ApiError>({
    queryKey: ['stats', jobId],
    queryFn: () => fetchJobStats(jobId),
  });

  const stats = statsQuery.data;
  const jobError = jobQuery.error as ApiError | undefined;
  const statsError = statsQuery.error as ApiError | undefined;
  const jobNotFound = jobError?.status === 404;
  const statsNotFound = statsError?.status === 404;

  useEffect(() => {
    if (jobId) {
      setCurrentLevel1JobId(Number(jobId));
    }
  }, [jobId]);

  if (jobNotFound) {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-yellow-50 p-4 text-sm text-yellow-800">Job no encontrado.</div>
        <ApiErrorDisplay error={jobError ?? null} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Resultados job #{jobId}</h1>
          <p className="text-sm text-gray-600">Estadísticas y samples del job completado.</p>
        </div>
        <Link to={`/classification/level1/jobs/${jobId}`} className="text-sm font-semibold text-blue-700">
          Volver al monitor
        </Link>
      </div>

      <ApiErrorDisplay error={jobError ?? null} />
      {jobQuery.data && (
        <div className="space-y-2 rounded-lg bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            {jobQuery.data.status && <JobStateIndicator status={jobQuery.data.status} />}
            <span className="text-sm text-gray-600">
              {jobQuery.data.processed_images ?? 0} / {jobQuery.data.total_images ?? 0}
            </span>
          </div>
          <div className="grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
            <div>Creado: {jobQuery.data.created_at || 'N/D'}</div>
            <div>Actualizado: {jobQuery.data.updated_at || 'N/D'}</div>
            <div>Inicio: {jobQuery.data.started_at || 'N/D'}</div>
            <div>Fin: {jobQuery.data.finished_at || 'N/D'}</div>
          </div>
          {jobQuery.data.error_message && (
            <div className="text-xs font-semibold text-red-700">{jobQuery.data.error_message}</div>
          )}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Estadísticas</h2>
          {statsQuery.isFetching && <span className="text-xs text-gray-500">Actualizando...</span>}
        </div>
        {!statsNotFound && <ApiErrorDisplay error={statsError ?? null} />}
        {stats && (
          <div className="grid gap-4 rounded-lg bg-white p-4 shadow-sm sm:grid-cols-2">
            <div>
              <div className="text-sm font-semibold text-gray-700">Total de imágenes</div>
              <div className="text-2xl font-bold text-gray-900">{stats.total_images ?? 'N/D'}</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-700">Buckets</div>
              <ul className="mt-1 space-y-1 text-sm text-gray-700">
                {(stats.buckets || []).map((b) => (
                  <li key={b.bucket} className="flex justify-between">
                    <span>{b.bucket}</span>
                    <span className="font-semibold">{b.count}</span>
                  </li>
                ))}
                {!(stats.buckets || []).length && <li className="text-gray-500">Sin datos</li>}
              </ul>
            </div>
            <div className="sm:col-span-2">
              <div className="text-sm font-semibold text-gray-700">Por concepto</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(stats.concepts || []).map((concept) => (
                  <div key={concept.concept_id} className="rounded border border-gray-200 p-3">
                    <div className="font-semibold text-gray-800">{concept.concept_name || concept.concept_id}</div>
                    <ul className="mt-1 space-y-1 text-sm text-gray-700">
                      {(concept.buckets || []).map((b) => (
                        <li key={b.bucket} className="flex justify-between">
                          <span>{b.bucket}</span>
                          <span className="font-semibold">{b.count}</span>
                        </li>
                      ))}
                      {!(concept.buckets || []).length && <li className="text-gray-500">Sin datos</li>}
                    </ul>
                  </div>
                ))}
                {!(stats.concepts || []).length && <div className="text-sm text-gray-600">No hay estadísticas por concepto.</div>}
              </div>
            </div>
          </div>
        )}
        {!stats && !statsQuery.isLoading && statsNotFound && (
          <div className="text-sm text-gray-600">Estadísticas aún no disponibles.</div>
        )}
        {!stats && !statsQuery.isLoading && !statsNotFound && (
          <div className="text-sm text-gray-600">No hay estadísticas disponibles.</div>
        )}
      </section>

      <section id="samples">
        <h2 className="text-lg font-semibold text-gray-800">Samples</h2>
        <SamplesGallery jobId={jobId} />
      </section>
    </div>
  );
};

export default JobResultsPage;
