import apiClient from './client';
import { Concept, Dataset, HealthInfo, Job, JobImage, Sample } from '../types';

export const fetchHealth = async (): Promise<HealthInfo> => {
  const { data } = await apiClient.get('/api/v1/health');
  return data;
};

export const fetchDatasets = async (): Promise<Dataset[]> => {
  const { data } = await apiClient.get('/api/v1/datasets');
  return data;
};

export const createDataset = async (payload: Partial<Dataset>): Promise<Dataset> => {
  const { data } = await apiClient.post('/api/v1/datasets', payload);
  return data;
};

export const fetchConcepts = async (): Promise<Concept[]> => {
  const { data } = await apiClient.get('/api/v1/concepts', { params: { level: 1 } });
  return data;
};

export const upsertConcept = async (payload: Concept): Promise<Concept> => {
  const { data } = await apiClient.post('/api/v1/concepts', payload);
  return data;
};

export const createLevel1Job = async (payload: Record<string, unknown>): Promise<Job> => {
  const path = '/api/v1/jobs/level1';
  const { data } = await apiClient.post(path, payload);
  return data;
};

export const fetchJob = async (jobId: string): Promise<Job> => {
  const { data } = await apiClient.get(`/api/v1/jobs/${jobId}`);
  return data;
};

export const cancelJob = async (jobId: string) => {
  await apiClient.post(`/api/v1/jobs/${jobId}/cancel`);
};

export const resumeJob = async (jobId: string) => {
  await apiClient.post(`/api/v1/jobs/${jobId}/resume`);
};

export const fetchJobSamples = async (
  jobId: string,
  params: { limit?: number; concept_id?: number; bucket?: string; image_id?: number }
): Promise<Sample[]> => {
  const url = `/api/v1/jobs/${jobId}/samples`;
  if (import.meta.env.DEV) {
    const resolved = apiClient.getUri({ url, params });
    console.debug('[samples] request', resolved, params);
  }
  const { data } = await apiClient.get(url, { params });
  if (import.meta.env.DEV) {
    console.debug('[samples] response length', Array.isArray(data) ? data.length : 0);
  }
  return data;
};

export const fetchSampleById = async (sampleId: string): Promise<Sample> => {
  const { data } = await apiClient.get(`/api/v1/samples/${sampleId}`);
  return data;
};

export const fetchJobImages = async (jobId: string, params: { limit?: number }): Promise<JobImage[]> => {
  const url = `/api/v1/jobs/${jobId}/images`;
  if (import.meta.env.DEV) {
    const resolved = apiClient.getUri({ url, params });
    console.debug('[job-images] request', resolved, params);
  }
  const { data } = await apiClient.get(url, { params });
  if (import.meta.env.DEV) {
    console.debug('[job-images] response length', Array.isArray(data) ? data.length : 0);
  }
  return data;
};

export const getSampleImageUrl = (imageId: number) => `/api/v1/images/${imageId}/file`;

export const getMaskUrl = (jobId: string, maskRef: string) =>
  `/api/v1/jobs/${jobId}/masks/${encodeURI(maskRef)}`;
