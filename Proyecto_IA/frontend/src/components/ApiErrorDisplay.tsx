import { ApiError, formatValidationErrors } from '../api/client';

interface Props {
  error: Error | ApiError | null;
}

const ApiErrorDisplay = ({ error }: Props) => {
  if (!error) return null;

  const apiError = error as ApiError;
  const detail = (apiError.data as { detail?: unknown })?.detail;
  const detailLines = apiError.validationErrors ?? formatValidationErrors(detail);
  const hasDetailLines = Boolean(detailLines?.length);
  const displayMessage = hasDetailLines ? 'Se encontraron errores de validación.' : error.message;

  return (
    <div className="space-y-2 rounded-md bg-red-50 p-4 text-sm text-red-700">
      <div className="font-semibold">
        {apiError.status ? `Error ${apiError.status}${apiError.statusText ? ` (${apiError.statusText})` : ''}` : 'Error'}
      </div>
      <div>{displayMessage || 'Se produjo un error inesperado.'}</div>

      {hasDetailLines && (
        <ul className="space-y-1 rounded border border-red-100 bg-white/60 p-2 text-xs text-red-800">
          {(detailLines || []).map((line, idx) => (
            <li key={`${line}-${idx}`} className="leading-snug">
              {line}
            </li>
          ))}
        </ul>
      )}

      {!hasDetailLines && detail && typeof detail === 'string' && (
        <div className="rounded border border-red-100 bg-white/60 p-2 text-xs text-red-800">{detail}</div>
      )}

      {!hasDetailLines && detail && typeof detail === 'object' && !Array.isArray(detail) && (
        <pre className="overflow-auto rounded border border-red-100 bg-white/60 p-2 text-xs text-red-800">
          {JSON.stringify(detail, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default ApiErrorDisplay;
