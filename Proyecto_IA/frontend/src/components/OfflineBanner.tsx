import { useEffect, useState } from 'react';
import { useHealthPolling } from '../hooks/useHealthPolling';

const OfflineBanner = () => {
  const { error } = useHealthPolling();
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

  if (!isOffline) return null;

  return (
    <div className="bg-red-600 px-4 py-2 text-center text-sm font-medium text-white">
      Backend no disponible o tardando demasiado en responder. Reintenta más tarde.
    </div>
  );
};

export default OfflineBanner;
