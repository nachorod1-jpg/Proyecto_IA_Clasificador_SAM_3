import { useQuery } from '@tanstack/react-query';
import { fetchJob } from '../api';
import { Job } from '../types';
import { ApiError } from '../api/client';
import { updateLevel1JobMeta } from '../utils/jobRegistry';

const getInterval = (status?: string) => {
  if (status === 'running') return 1000;
  if (status === 'pending') return 3000;
  return false;
};

export const useJobPolling = (jobId: string) => {
  const query = useQuery<Job, ApiError>({
    queryKey: ['job', jobId],
    queryFn: () => fetchJob(jobId),
    refetchInterval: (data) => getInterval(data?.status),
    enabled: Boolean(jobId),
    onSuccess: (data) => {
      if (!jobId) return;
      updateLevel1JobMeta(Number(jobId), {
        status: data.status,
        processed_images: data.processed_images,
        total_images: data.total_images
      });
    }
  });

  return query;
};
