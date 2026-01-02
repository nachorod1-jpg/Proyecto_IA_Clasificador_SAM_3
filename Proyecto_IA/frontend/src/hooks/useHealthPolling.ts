import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '../api';
import { ApiError } from '../api/client';
import { HealthInfo } from '../types';

export const useHealthPolling = () =>
  useQuery<HealthInfo, ApiError>({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 10000,
    refetchOnWindowFocus: true
  });
