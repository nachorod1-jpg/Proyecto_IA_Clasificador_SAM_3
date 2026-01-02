import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJob } from '../api';
import { Job } from '../types';

const getInterval = (status?: string) => {
  if (status === 'running') return 1000;
  if (status === 'pending') return 3000;
  return false;
};

export const useJobPolling = (jobId: string) => {
  const maxProgressRef = useRef<number>(0);

  const query = useQuery<Job, Error>({
    queryKey: ['job', jobId],
    queryFn: () => fetchJob(jobId),
    refetchInterval: (data) => getInterval(data?.status || data?.state),
    enabled: Boolean(jobId)
  });

  useEffect(() => {
    if (!query.data) return;
    const processed = query.data.processed_images ?? 0;
    if (processed < maxProgressRef.current) {
      console.debug('Progreso no decrece; se mantiene el máximo conocido');
      query.data.processed_images = maxProgressRef.current;
      return;
    }
    maxProgressRef.current = processed;
  }, [query.data]);

  return query;
};
