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
          <StatCard label="Backend" value={data.status} />
          <StatCard label="Modelo" value={data.model_status} />
          <StatCard label="Modo seguro" value={String(data.safe_mode ?? '')} />
          <StatCard label="Safe load" value={String(data.safe_load ?? '')} />
          <StatCard label="Dispositivo" value={data.device} />
          <StatCard label="VRAM (GB)" value={data.vram_gb} />
          <StatCard label="RAM (GB)" value={data.ram_gb} />
          <StatCard label="GPU" value={data.gpu_name} />
          <StatCard label="Uptime (s)" value={data.uptime} />
          {data.message && <StatCard label="Mensaje" value={data.message} />}
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
