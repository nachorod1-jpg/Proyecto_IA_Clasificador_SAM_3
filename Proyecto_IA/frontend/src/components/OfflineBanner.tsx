import { useBackendHealth } from '../hooks/useBackendHealth';

const OfflineBanner = () => {
  const { data, isBackendOffline, isConnecting } = useBackendHealth();

  if (isConnecting) {
    return (
      <div className="bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white">
        Conectando con el backend…
      </div>
    );
  }

  if (!isBackendOffline && data && (!data.sam3_import_ok || !data.sam3_weights_ready)) {
    return (
      <div className="bg-yellow-500 px-4 py-2 text-center text-sm font-medium text-white">
        SAM-3 no disponible: {data.sam3_message || data.sam3_import_error}
      </div>
    );
  }

  if (!isBackendOffline) return null;

  return (
    <div className="bg-red-600 px-4 py-2 text-center text-sm font-medium text-white">
      Backend no disponible o tardando demasiado en responder. Reintenta más tarde.
    </div>
  );
};

export default OfflineBanner;
