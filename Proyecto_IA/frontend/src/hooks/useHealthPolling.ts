import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '../api';
import { HealthInfo } from '../types';

export const useHealthPolling = () =>
  useQuery<HealthInfo, Error>({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 10000,
    refetchOnWindowFocus: true
  });
