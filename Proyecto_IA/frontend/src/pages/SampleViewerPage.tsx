import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { fetchSampleById } from '../api';
import { Region } from '../types';
import ApiErrorDisplay from '../components/ApiErrorDisplay';

const renderBbox = (bbox: [number, number, number, number]) => {
  const [x1, y1, x2, y2] = bbox;
  const width = x2 - x1;
  const height = y2 - y1;
  return (
    <rect
      x={x1}
      y={y1}
      width={width}
      height={height}
      fill="none"
      stroke="#10b981"
      strokeWidth={2}
      rx={2}
    />
  );
};

const SampleViewerPage = () => {
  const { sampleId = '' } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ['sample', sampleId], queryFn: () => fetchSampleById(sampleId) });

  const imageUrl = data?.image_url || (data?.image_id ? `/api/v1/images/${data.image_id}` : undefined);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sample #{sampleId}</h1>
        <p className="text-sm text-gray-600">Visor con regiones detectadas.</p>
      </div>
      {isLoading && <div className="text-sm text-gray-600">Cargando sample...</div>}
      <ApiErrorDisplay error={error ?? null} />
      {imageUrl && data && (
        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
          <div className="relative">
            <img src={imageUrl} alt={`sample-${sampleId}`} className="w-full object-contain" />
            <svg className="absolute inset-0 h-full w-full">
              {data.regions?.map((region: Region, idx: number) => (
                <g key={idx}>
                  {renderBbox(region.bbox)}
                  <text x={region.bbox[0] + 4} y={region.bbox[1] + 14} fill="#111827" fontSize="12" fontWeight="bold" stroke="white" strokeWidth="0.5">
                    {region.concept_name || region.concept_id || 'concept'} ({region.score?.toFixed(2) || 'N/A'})
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <div className="p-4">
            <h2 className="text-lg font-semibold text-gray-800">Regiones</h2>
            <table className="mt-2 min-w-full divide-y divide-gray-200 text-sm text-gray-700">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left">Concepto</th>
                  <th className="px-3 py-2 text-left">Score</th>
                  <th className="px-3 py-2 text-left">BBox</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data.regions || []).map((region, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2">{region.concept_name || region.concept_id || 'N/A'}</td>
                    <td className="px-3 py-2">{region.score?.toFixed(2) ?? 'N/A'}</td>
                    <td className="px-3 py-2">{region.bbox.join(', ')}</td>
                  </tr>
                ))}
                {!(data.regions || []).length && (
                  <tr>
                    <td className="px-3 py-2 text-sm text-gray-600" colSpan={3}>
                      No hay regiones disponibles.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {!imageUrl && !isLoading && <div className="text-sm text-gray-600">No se pudo obtener la imagen.</div>}
    </div>
  );
};

export default SampleViewerPage;
