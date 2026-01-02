import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchDatasets } from '../api';
import { ApiError } from '../api/client';
import { Dataset } from '../types';

const DatasetDetailPage = () => {
  const { datasetId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery<Dataset[], ApiError>({ queryKey: ['datasets'], queryFn: fetchDatasets });

  const datasetsErrorMessage = error?.status === 404
    ? 'El endpoint /api/v1/datasets no está disponible (404).'
    : error?.message;
  const datasetsError = datasetsErrorMessage ? new Error(datasetsErrorMessage) : null;

  const dataset = data?.find((d) => String(d.id) === datasetId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Detalle del dataset</h1>
        <p className="text-sm text-gray-600">Información básica del dataset seleccionado.</p>
      </div>
      {isLoading && <div className="text-sm text-gray-600">Cargando dataset...</div>}
      {datasetsError && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{datasetsError.message}</div>}
      {!dataset && !isLoading && <div className="text-sm text-gray-600">Dataset no encontrado.</div>}
      {dataset && (
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <div className="grid gap-3 text-sm text-gray-700 sm:grid-cols-2">
            <div>
              <div className="font-semibold">Nombre</div>
              <div>{dataset.name}</div>
            </div>
            <div>
              <div className="font-semibold">Ruta</div>
              <div>{dataset.root_path || dataset.path}</div>
            </div>
            <div>
              <div className="font-semibold">Imágenes</div>
              <div>{dataset.num_images ?? 'N/D'}</div>
            </div>
            <div>
              <div className="font-semibold">Creado</div>
              <div>{dataset.created_at ?? 'N/D'}</div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              onClick={() => navigate('/classification/level1/new', { state: { datasetId: dataset.id } })}
            >
              Clasificar Nivel 1 con este dataset
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatasetDetailPage;
