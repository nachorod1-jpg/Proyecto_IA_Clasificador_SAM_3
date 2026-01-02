import { JobStatus } from '../types';

const statusClasses: Record<JobStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  running: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-200 text-gray-700',
  paused: 'bg-orange-100 text-orange-800'
};

const JobStateIndicator = ({ status }: { status: JobStatus }) => (
  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[status] || 'bg-gray-100 text-gray-800'}`}>
    {status.toUpperCase()}
  </span>
);

export default JobStateIndicator;
