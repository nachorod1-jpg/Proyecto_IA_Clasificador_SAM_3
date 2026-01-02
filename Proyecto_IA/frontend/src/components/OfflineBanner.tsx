import { useEffect, useState } from 'react';
import { useHealthPolling } from '../hooks/useHealthPolling';

const OfflineBanner = () => {
  const { error, data } = useHealthPolling();
  const [isNavigatorOffline, setIsNavigatorOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOffline = () => setIsNavigatorOffline(true);
    const handleOnline = () => setIsNavigatorOffline(false);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const isOffline = Boolean(error) || isNavigatorOffline || Boolean(error?.isNetworkError);

  if (!isOffline && data && (!data.sam3_import_ok || !data.sam3_weights_ready)) {
    return (
      <div className="bg-yellow-500 px-4 py-2 text-center text-sm font-medium text-white">
        SAM-3 no disponible: {data.sam3_message || data.sam3_import_error}
      </div>
    );
  }

  if (!isOffline) return null;

  return (
    <div className="bg-red-600 px-4 py-2 text-center text-sm font-medium text-white">
      Backend no disponible o tardando demasiado en responder. Reintenta más tarde.
    </div>
  );
};

export default OfflineBanner;
