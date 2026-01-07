import { JobStatus } from '../types';

const STORAGE_KEY = 'sam3_level1_job_registry';
const MAX_RECENT = 50;

export interface JobRegistryMeta {
  status?: JobStatus;
  processed_images?: number;
  total_images?: number;
  lastSeenAt?: string;
}

interface JobRegistryData {
  currentLevel1JobId?: number;
  recentLevel1JobIds: number[];
  jobMeta: Record<string, JobRegistryMeta | undefined>;
  requestedMaxImages: Record<string, number | undefined>;
}

const getEmptyRegistry = (): JobRegistryData => ({
  recentLevel1JobIds: [],
  jobMeta: {},
  requestedMaxImages: {}
});

const readRegistry = (): JobRegistryData => {
  if (typeof window === 'undefined') {
    return getEmptyRegistry();
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return getEmptyRegistry();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<JobRegistryData>;
    return {
      currentLevel1JobId: parsed.currentLevel1JobId,
      recentLevel1JobIds: Array.isArray(parsed.recentLevel1JobIds) ? parsed.recentLevel1JobIds : [],
      jobMeta: parsed.jobMeta ?? {},
      requestedMaxImages: parsed.requestedMaxImages ?? {}
    };
  } catch {
    return getEmptyRegistry();
  }
};

const writeRegistry = (registry: JobRegistryData) => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
};

export const getLevel1JobRegistryKey = () => STORAGE_KEY;

export const getCurrentLevel1JobId = (): number | null => {
  const registry = readRegistry();
  return registry.currentLevel1JobId ?? null;
};

export const setCurrentLevel1JobId = (jobId: number) => {
  const registry = readRegistry();
  registry.currentLevel1JobId = jobId;
  writeRegistry(registry);
};

export const clearCurrentLevel1JobId = () => {
  const registry = readRegistry();
  delete registry.currentLevel1JobId;
  writeRegistry(registry);
};

export const getRecentLevel1JobIds = (): number[] => {
  const registry = readRegistry();
  return registry.recentLevel1JobIds;
};

export const addLevel1JobId = (jobId: number, requestedMaxImages?: number) => {
  const registry = readRegistry();
  const filtered = registry.recentLevel1JobIds.filter((id) => id !== jobId);
  registry.recentLevel1JobIds = [jobId, ...filtered].slice(0, MAX_RECENT);
  registry.currentLevel1JobId = jobId;
  if (typeof requestedMaxImages === 'number') {
    registry.requestedMaxImages[String(jobId)] = requestedMaxImages;
  }
  writeRegistry(registry);
};

export const updateLevel1JobMeta = (jobId: number, meta: JobRegistryMeta) => {
  const registry = readRegistry();
  registry.jobMeta[String(jobId)] = { ...registry.jobMeta[String(jobId)], ...meta, lastSeenAt: new Date().toISOString() };
  writeRegistry(registry);
};

export const getLevel1JobMeta = (jobId: number): JobRegistryMeta | undefined => {
  const registry = readRegistry();
  return registry.jobMeta[String(jobId)];
};

export const getRequestedMaxImages = (jobId: number): number | undefined => {
  const registry = readRegistry();
  return registry.requestedMaxImages[String(jobId)];
};

export const getRecentLevel1JobsSnapshot = () => readRegistry();
