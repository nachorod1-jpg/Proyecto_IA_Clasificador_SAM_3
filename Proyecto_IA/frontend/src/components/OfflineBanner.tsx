import { useHealthPolling } from '../hooks/useHealthPolling';

const OfflineBanner = () => {
  const { error } = useHealthPolling();

  if (!error) return null;

  return (
    <div className="bg-red-600 px-4 py-2 text-center text-sm font-medium text-white">
      Backend no disponible o tardando demasiado en responder. Reintenta más tarde.
    </div>
  );
};

export default OfflineBanner;
