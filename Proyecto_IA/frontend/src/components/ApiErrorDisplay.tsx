import { ApiError } from '../api/client';

interface Props {
  error: Error | ApiError | null;
}

const ApiErrorDisplay = ({ error }: Props) => {
  if (!error) return null;

  const apiError = error as ApiError;
  const detail = (apiError.data as { detail?: unknown })?.detail;
  const hasDetailArray = Array.isArray(detail);

  return (
    <div className="space-y-2 rounded-md bg-red-50 p-4 text-sm text-red-700">
      <div className="font-semibold">
        {apiError.status ? `Error ${apiError.status}${apiError.statusText ? ` (${apiError.statusText})` : ''}` : 'Error'}
      </div>
      <div>{error.message || 'Se produjo un error inesperado.'}</div>

      {hasDetailArray && (
        <ul className="space-y-1 rounded border border-red-100 bg-white/60 p-2 text-xs text-red-800">
          {(detail as Array<{ loc?: unknown[]; msg?: string; type?: string }>).map((item, idx) => (
            <li key={`${item.type}-${idx}`} className="leading-snug">
              <span className="font-semibold">{item.type || 'detalle'}:</span>{' '}
              {item.msg || JSON.stringify(item)}
              {item.loc && <span className="text-[11px] text-red-600"> [loc: {(item.loc || []).join(' > ')}]</span>}
            </li>
          ))}
        </ul>
      )}

      {!hasDetailArray && detail && typeof detail === 'string' && (
        <div className="rounded border border-red-100 bg-white/60 p-2 text-xs text-red-800">{detail}</div>
      )}

      {!hasDetailArray && detail && typeof detail === 'object' && !Array.isArray(detail) && (
        <pre className="overflow-auto rounded border border-red-100 bg-white/60 p-2 text-xs text-red-800">
          {JSON.stringify(detail, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default ApiErrorDisplay;
