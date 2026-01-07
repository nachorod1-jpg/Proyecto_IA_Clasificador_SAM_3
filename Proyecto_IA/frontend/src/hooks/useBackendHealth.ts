import { ApiError } from '../api/client';
import { useHealthPolling } from './useHealthPolling';

const isServerError = (error?: ApiError | null) => Boolean(error?.status && error.status >= 500);

export const useBackendHealth = () => {
  const query = useHealthPolling();
  const apiError = query.error as ApiError | null;
  const isBackendOffline = Boolean(apiError?.isNetworkError || isServerError(apiError));
  const isConnecting = query.isLoading && !query.data && !query.error;

  return {
    ...query,
    isBackendOffline,
    isConnecting
  };
};
