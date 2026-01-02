import { useCallback, useEffect, useRef, useState } from 'react';

const lineOptions = [200, 500, 1000];

type Mode = 'sse' | 'polling' | 'disabled' | null;

const BackendLogPanel = () => {
  const [lines, setLines] = useState<string[]>([]);
  const [lineLimit, setLineLimit] = useState<number>(200);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const limitRef = useRef(lineLimit);
  const pausedRef = useRef(paused);

  useEffect(() => {
    limitRef.current = lineLimit;
  }, [lineLimit]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const source = new EventSource('/api/v1/logs/stream');
    let opened = false;

    source.onopen = () => {
      opened = true;
      setMode('sse');
      setError(null);
    };

    source.onmessage = (event) => {
      if (pausedRef.current) return;
      const payload = event.data as string;
      setLines((prev) => {
        const next = [...prev, payload];
        return next.slice(-limitRef.current);
      });
    };

    source.onerror = () => {
      source.close();
      if (!opened) {
        setError('Streaming no disponible, se usará polling.');
      }
      setMode('polling');
    };

    return () => {
      source.close();
    };
  }, []);

  useEffect(() => {
    if (mode !== 'polling') return;
    let active = true;

    const fetchTail = async () => {
      try {
        const response = await fetch(`/api/v1/logs/tail?lines=${lineLimit}`);
        if (response.status === 403) {
          setMode('disabled');
          setError('Los endpoints de logs están deshabilitados.');
          return;
        }
        if (!response.ok) {
          throw new Error('No se pudo leer los logs');
        }
        const text = await response.text();
        if (active && !pausedRef.current) {
          const split = text ? text.split('\n') : [];
          setLines(split.slice(-limitRef.current));
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError('No se pudieron obtener los logs.');
        }
      }
    };

    fetchTail();
    const id = setInterval(fetchTail, 2000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [mode, lineLimit]);

  useEffect(() => {
    if (paused) return;
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines, paused]);

  const togglePause = () => setPaused((prev) => !prev);

  const copyLogs = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setError('Copiado al portapapeles.');
      setTimeout(() => setError(null), 2000);
    } catch (err) {
      setError('No se pudo copiar.');
    }
  }, [lines]);

  const modeLabel = mode === 'sse' ? 'Streaming' : mode === 'polling' ? 'Polling' : 'Deshabilitado';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">Modo:</span>
          <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">{modeLabel}</span>
        </div>
        <label className="text-sm text-gray-700">
          Líneas
          <select
            className="ml-2 rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            value={lineLimit}
            onChange={(e) => setLineLimit(Number(e.target.value))}
          >
            {lineOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={togglePause}
            className="rounded bg-primary px-3 py-1 text-sm text-white hover:bg-primary/90"
          >
            {paused ? 'Reanudar' : 'Pausar'}
          </button>
          <button
            type="button"
            onClick={copyLogs}
            className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-100"
          >
            Copiar
          </button>
        </div>
      </div>
      {error && <div className="text-sm text-orange-700">{error}</div>}
      <div
        ref={containerRef}
        className="h-80 overflow-y-auto rounded border border-gray-200 bg-black p-3 font-mono text-xs text-green-200"
      >
        {lines.length === 0 && <div className="text-gray-400">Sin datos de log.</div>}
        {lines.map((line, idx) => (
          <div key={`${idx}-${line.slice(0, 10)}`}>{line}</div>
        ))}
      </div>
    </div>
  );
};

export default BackendLogPanel;
