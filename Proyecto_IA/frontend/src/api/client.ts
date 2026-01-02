import axios, { AxiosError } from 'axios';
import { API_BASE_URL } from '../config/env';

export interface ApiError extends Error {
  status?: number;
  isNetworkError?: boolean;
}

const apiClient = axios.create({
  baseURL: API_BASE_URL || '/api',
  timeout: 10000
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.code === 'ECONNABORTED' || error.message === 'Network Error' || !error.response) {
      const networkError: ApiError = Object.assign(new Error('No se pudo conectar con el servidor.'), {
        isNetworkError: true
      });
      return Promise.reject(networkError);
    }

    const message = (error.response?.data as Record<string, unknown>)?.message
      ? String((error.response?.data as Record<string, unknown>).message)
      : (error.response?.data as Record<string, unknown>)?.detail
        ? String((error.response?.data as Record<string, unknown>).detail)
        : error.message;

    const enrichedError: ApiError = Object.assign(new Error(message), {
      status: error.response?.status,
      isNetworkError: false
    });

    return Promise.reject(enrichedError);
  }
);

export default apiClient;
