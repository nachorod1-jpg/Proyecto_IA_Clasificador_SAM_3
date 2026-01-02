import ApiErrorDisplay from '../components/ApiErrorDisplay';
import BackendLogPanel from '../components/BackendLogPanel';
import { useHealthPolling } from '../hooks/useHealthPolling';

const StatCard = ({ label, value }: { label: string; value?: string | number | boolean }) => (
  <div className="rounded-lg bg-white p-4 shadow-sm">
    <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
    <div className="mt-1 text-lg font-semibold text-gray-800">{value ?? 'N/D'}</div>
  </div>
);

const SystemStatusPage = () => {
  const { data, isLoading, error } = useHealthPolling();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Estado del sistema</h1>
        <p className="text-sm text-gray-600">Monitorea el estado del backend y la configuración del modelo.</p>
      </div>
      {isLoading && <div className="text-sm text-gray-600">Consultando salud del backend...</div>}
      <ApiErrorDisplay error={error ?? null} />
      {data && (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          <StatCard label="GPU disponible" value={data.gpu_available ? 'Sí' : 'No'} />
          <StatCard label="GPU" value={data.gpu_name} />
          <StatCard label="VRAM (MB)" value={data.vram_mb} />
          <StatCard label="SAM-3 import" value={data.sam3_import_ok ? 'OK' : 'Fallo'} />
          <StatCard label="SAM-3 pesos" value={data.sam3_weights_ready ? 'Listos' : 'Pendiente'} />
          <StatCard label="Mensaje SAM-3" value={data.sam3_message} />
          <StatCard label="Python" value={data.python_executable} />
          <StatCard label="Transformers" value={data.transformers_version} />
          <StatCard label="Ruta transformers" value={data.transformers_file} />
        </div>
      )}
      {data && !data.sam3_import_ok && (
        <div className="rounded border border-yellow-400 bg-yellow-50 p-4 text-sm text-yellow-900">
          <p className="font-semibold">SAM-3 no disponible (import).</p>
          <p>{data.sam3_import_error || data.sam3_message}</p>
          {data.sam3_import_traceback && (
            <details className="mt-2">
              <summary className="cursor-pointer font-medium">Ver traceback</summary>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">{data.sam3_import_traceback}</pre>
            </details>
          )}
        </div>
      )}
      <details className="rounded-lg bg-white shadow-sm" open>
        <summary className="cursor-pointer list-none rounded-t-lg border-b px-4 py-3 text-lg font-semibold text-gray-900">
          Logs recientes
        </summary>
        <div className="p-4">
          <p className="mb-3 text-sm text-gray-600">
            Visualiza los logs del backend sin salir de la aplicación. El panel intenta usar streaming (SSE) y
            vuelve a modo polling si el endpoint no está disponible.
          </p>
          <BackendLogPanel />
        </div>
      </details>
    </div>
  );
};

export default SystemStatusPage;
