import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import ApiErrorDisplay from '../components/ApiErrorDisplay';
import { fetchJob, fetchJobStats } from '../api';
import SamplesGallery from '../components/SamplesGallery';
import JobStateIndicator from '../components/JobStateIndicator';

const JobResultsPage = () => {
  const { jobId = '' } = useParams();

  const jobQuery = useQuery({ queryKey: ['job', jobId], queryFn: () => fetchJob(jobId) });
  const statsQuery = useQuery({ queryKey: ['stats', jobId], queryFn: () => fetchJobStats(jobId) });

  const stats = statsQuery.data;

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

      <ApiErrorDisplay error={jobQuery.error ?? null} />
      {jobQuery.data && jobQuery.data.status && <JobStateIndicator status={jobQuery.data.status} />}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Estadísticas</h2>
          {statsQuery.isFetching && <span className="text-xs text-gray-500">Actualizando...</span>}
        </div>
        <ApiErrorDisplay error={statsQuery.error ?? null} />
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
        {!stats && !statsQuery.isLoading && <div className="text-sm text-gray-600">No hay estadísticas disponibles.</div>}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-800">Samples</h2>
        <SamplesGallery jobId={jobId} />
      </section>
    </div>
  );
};

export default JobResultsPage;
