import axios, { AxiosError } from 'axios';
import { API_BASE_URL } from '../config/env';

export interface ApiError extends Error {
  status?: number;
  statusText?: string;
  data?: unknown;
  isNetworkError?: boolean;
  validationErrors?: string[];
}

export interface ValidationErrorDetail {
  loc?: Array<string | number>;
  msg?: string;
  type?: string;
}

export const formatValidationErrors = (detail: unknown): string[] | null => {
  if (!Array.isArray(detail)) {
    return null;
  }

  return detail.map((item) => {
    const errorItem = item as ValidationErrorDetail;
    const loc = errorItem.loc ?? [];
    const locParts = loc
      .map((segment) => (typeof segment === 'number' ? String(segment) : segment))
      .filter((segment) => Boolean(segment) && segment !== 'body');
    const fieldLabel = locParts.length ? locParts[locParts.length - 1] : 'detalle';
    const message = errorItem.msg ?? 'Error de validación';
    return `${fieldLabel}: ${message}`;
  });
};

const apiClient = axios.create({
  baseURL: API_BASE_URL || '/api',
  timeout: 60000 // 60 segundos - permite operaciones largas del modelo SAM3
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const hasResponse = Boolean(error.response);
    const responseData = error.response?.data;
    const responseMessage = (responseData as Record<string, unknown>)?.message;
    const responseDetail = (responseData as Record<string, unknown>)?.detail;
    const validationErrors = formatValidationErrors(responseDetail);

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
      : validationErrors?.length
        ? validationErrors.join('\n')
        : responseDetail
          ? String(responseDetail)
          : error.message;

    const enrichedError: ApiError = Object.assign(new Error(message), {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: responseData,
      isNetworkError: false,
      validationErrors
    });

    return Promise.reject(enrichedError);
  }
);

export default apiClient;
