import axios, { AxiosError } from 'axios';
import { API_BASE_URL } from '../config/env';

export interface ApiError extends Error {
  status?: number;
  statusText?: string;
  data?: unknown;
  isNetworkError?: boolean;
}

const apiClient = axios.create({
  baseURL: API_BASE_URL || '/api',
  timeout: 10000
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const hasResponse = Boolean(error.response);
    const responseData = error.response?.data;
    const responseMessage = (responseData as Record<string, unknown>)?.message;
    const responseDetail = (responseData as Record<string, unknown>)?.detail;

    if (!hasResponse) {
      const networkMessage =
        error.code === 'ECONNABORTED'
          ? 'Tiempo de espera agotado al contactar con el servidor.'
          : 'No se pudo conectar con el servidor.';
      const networkError: ApiError = Object.assign(new Error(networkMessage), {
        isNetworkError: true
      });
      return Promise.reject(networkError);
    }

    const message = responseMessage
      ? String(responseMessage)
      : responseDetail
        ? String(responseDetail)
        : error.message;

    const enrichedError: ApiError = Object.assign(new Error(message), {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: responseData,
      isNetworkError: false
    });

    return Promise.reject(enrichedError);
  }
);

export default apiClient;
