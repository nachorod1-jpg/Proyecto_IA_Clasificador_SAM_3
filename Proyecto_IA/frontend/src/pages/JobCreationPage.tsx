import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import ApiErrorDisplay from '../components/ApiErrorDisplay';
import { createLevel1Job, fetchConcepts, fetchDatasets, resumeJob } from '../api';
import { ApiError } from '../api/client';
import { Concept, Dataset, JobStatus } from '../types';
import { useHealthPolling } from '../hooks/useHealthPolling';
import { useJobPolling } from '../hooks/useJobPolling';
import {
  addLevel1JobId,
  getCurrentLevel1JobId,
  getLevel1JobMeta,
  getLevel1JobRegistryKey,
  getRecentLevel1JobIds,
  getRequestedMaxImages,
  setCurrentLevel1JobId,
  updateLevel1JobMeta
} from '../utils/jobRegistry';

type DevicePreference = 'auto' | 'cpu' | 'cuda';
type ActivityStatus = 'info' | 'success' | 'error';

interface ActivityEntry {
  id: number;
  message: string;
  status: ActivityStatus;
}

const parseOptionalNumber = (value: string) => (value === '' ? undefined : Number(value));
const parseOptionalJson = (value: string) => {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.debug('[jobs] invalid JSON payload', error);
    }
    return undefined;
  }
};

const JobCreationPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const stateDatasetId = (location.state as { datasetId?: number })?.datasetId;

  const datasetsQuery = useQuery<Dataset[], Error>({ queryKey: ['datasets'], queryFn: fetchDatasets });
  const conceptsQuery = useQuery<Concept[], Error>({ queryKey: ['concepts'], queryFn: fetchConcepts });
  const healthQuery = useHealthPolling();

  const [form, setForm] = useState({
    dataset_id: stateDatasetId || 0,
    conceptIds: [] as number[],
    target_long_side: 384,
    box_threshold: 0.6,
    mask_threshold: 0.5,
    min_area_pixels: 0,
    batch_size: 1,
    user_confidence: undefined as number | undefined,
    device_preference: 'auto' as DevicePreference,
    max_detections_per_image: undefined as number | undefined,
    sleep_ms_between_images: undefined as number | undefined,
    max_images: undefined as number | undefined,
    safe_mode: true,
    inference_method: 'PCS_TEXT',
    prompt_text: '',
    prompt_source: 'payload' as 'payload' | 'concept',
    prompt_language: 'en',
    input_boxes_text: '',
    input_boxes_labels_text: '',
    input_box_draft: { x1: '', y1: '', x2: '', y2: '' },
    input_box_label_draft: '',
    points_per_batch: undefined as number | undefined,
    return_masks: true,
    return_boxes: true,
    return_polygons: false,
    demo_mode: false,
    demo_overlays_enabled: true,
    demo_overlays_count: 3,
    demo_overlays_include_masks: true
  });

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => createLevel1Job(payload)
  });

  const [activeJobId, setActiveJobId] = useState<number | null>(() => {
    const current = getCurrentLevel1JobId();
    if (current) return current;
    const recent = getRecentLevel1JobIds();
    return recent.length ? recent[0] : null;
  });
  const [resumeError, setResumeError] = useState<ApiError | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [isLogOpen, setIsLogOpen] = useState(true);
  const [logSeeded, setLogSeeded] = useState(false);
  const lastProgressRef = useRef<{ status?: JobStatus; processed?: number; total?: number } | null>(null);
  const jobQuery = useJobPolling(activeJobId ? String(activeJobId) : '');

  const resumeMutation = useMutation({
    mutationFn: (jobId: number) => resumeJob(String(jobId))
  });

  const appendLog = useCallback((message: string, status: ActivityStatus = 'info') => {
    setActivityLog((prev) => [...prev, { id: Date.now() + Math.random(), message, status }]);
  }, []);

  const formatErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
      return error.message.replace(/\n/g, ' | ');
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Error inesperado';
  };

  const buildPayload = (override?: Partial<typeof form>) => {
    const snapshot = { ...form, ...override };
    const promptPayload: Record<string, unknown> = {};
    const promptText = snapshot.prompt_text.trim();
    if (snapshot.inference_method === 'PCS_TEXT' || snapshot.inference_method === 'PCS_COMBINED') {
      if (promptText) {
        promptPayload.text = promptText;
      }
      if (snapshot.prompt_language) {
        promptPayload.language = snapshot.prompt_language;
      }
    }
    if (snapshot.inference_method === 'PCS_BOX' || snapshot.inference_method === 'PCS_COMBINED') {
      const boxes = parseOptionalJson(snapshot.input_boxes_text);
      const labels = parseOptionalJson(snapshot.input_boxes_labels_text);
      if (boxes) {
        promptPayload.input_boxes = boxes;
      }
      if (labels) {
        promptPayload.input_boxes_labels = labels;
      }
    }
    if (snapshot.inference_method === 'AUTO_MASK') {
      promptPayload.points_per_batch = snapshot.points_per_batch;
    }
    const payload: Record<string, unknown> = {
      dataset_id: snapshot.dataset_id,
      concepts: snapshot.conceptIds.map((id) => {
        const concept = conceptsQuery.data?.find((c) => c.id === id);
        const promptText = concept?.prompt?.trim() || concept?.name?.trim() || '';
        return { concept_id: id, prompt_text: promptText };
      }),
      user_confidence: snapshot.user_confidence ?? 0.5,
      batch_size: snapshot.batch_size,
      safe_mode: snapshot.safe_mode,
      device_preference: snapshot.device_preference,
      target_long_side: snapshot.target_long_side,
      box_threshold: snapshot.box_threshold,
      max_detections_per_image: snapshot.max_detections_per_image ?? 0,
      sleep_ms_between_images: snapshot.sleep_ms_between_images ?? 0,
      inference_method: snapshot.inference_method,
      prompt_payload: Object.keys(promptPayload).length ? promptPayload : undefined,
      thresholds: {
        confidence_threshold: snapshot.box_threshold,
        mask_threshold: snapshot.mask_threshold,
        min_area_pixels: snapshot.min_area_pixels
      },
      output_controls: {
        return_masks: snapshot.return_masks,
        return_boxes: snapshot.return_boxes,
        return_polygons: snapshot.return_polygons
      },
      demo_mode: snapshot.demo_mode,
      demo_overlays: {
        enabled: snapshot.demo_overlays_enabled,
        count_per_image: snapshot.demo_overlays_count,
        include_masks: snapshot.demo_overlays_include_masks
      }
    };
    if (typeof snapshot.max_images === 'number') {
      payload.max_images = snapshot.max_images;
    }
    return payload;
  };

  const launchJob = async (override?: Partial<typeof form>) => {
    setResumeError(null);
    setActivityLog([]);
    setLogSeeded(true);
    appendLog('Creando job…');
    const snapshot = { ...form, ...override };
    const promptText = snapshot.prompt_text.trim();
    if (snapshot.inference_method === 'PCS_COMBINED' && !promptText) {
      appendLog('PCS_COMBINED requiere un prompt de texto.', 'error');
      return;
    }
    if (snapshot.inference_method === 'PCS_BOX' && promptText) {
      appendLog('PCS_BOX ignora texto: se enviarán solo cajas.', 'info');
    }
    if (snapshot.inference_method === 'PCS_BOX' || snapshot.inference_method === 'PCS_COMBINED') {
      const boxes = parseOptionalJson(snapshot.input_boxes_text);
      if (!boxes || !Array.isArray(boxes) || boxes.length === 0) {
        appendLog('Debes definir al menos 1 bbox en input_boxes.', 'error');
        return;
      }
    }
    const payload = buildPayload(override);
    if (typeof payload.max_images === 'number') {
      appendLog(`Solicitado max_images=${payload.max_images}`, 'info');
    }
    let newJobId: number | null = null;

    try {
      const job = await mutation.mutateAsync(payload);
      newJobId = job.id;
      addLevel1JobId(job.id, payload.max_images as number | undefined);
      setCurrentLevel1JobId(job.id);
      setActiveJobId(job.id);
      appendLog(`Job creado con id=${job.id}`, 'success');
    } catch (error) {
      appendLog(`Error en create job: ${formatErrorMessage(error)}`, 'error');
      return;
    }

    if (!newJobId) {
      return;
    }

    appendLog('Arrancando job (resume)…');
    try {
      await resumeMutation.mutateAsync(newJobId);
      appendLog('Job en ejecución…', 'success');
    } catch (error) {
      setResumeError(error as ApiError);
      appendLog(`Error en resume: ${formatErrorMessage(error)}`, 'error');
    }
  };

  const sam3Unavailable = Boolean(
    healthQuery.data && (!healthQuery.data.sam3_import_ok || !healthQuery.data.sam3_weights_ready)
  );

  const isLaunching = mutation.isLoading || resumeMutation.isLoading;
  const isSubmitDisabled = useMemo(
    () => !form.dataset_id || !form.conceptIds.length || isLaunching || sam3Unavailable,
    [form.dataset_id, form.conceptIds.length, isLaunching, sam3Unavailable]
  );
  const primaryConcept = useMemo(() => {
    if (!form.conceptIds.length) {
      return undefined;
    }
    return conceptsQuery.data?.find((concept) => concept.id === form.conceptIds[0]);
  }, [conceptsQuery.data, form.conceptIds]);
  const primaryConceptPrompt = useMemo(() => {
    return primaryConcept?.prompt?.trim() || primaryConcept?.name?.trim() || '';
  }, [primaryConcept]);
  const parsedInputBoxes = useMemo(
    () => parseOptionalJson(form.input_boxes_text) as number[][] | undefined,
    [form.input_boxes_text]
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void launchJob();
  };

  useEffect(() => {
    if (!activeJobId || logSeeded) {
      return;
    }
    const meta = getLevel1JobMeta(activeJobId);
    const requestedMax = getRequestedMaxImages(activeJobId);
    appendLog(`Job detectado: #${activeJobId}`, 'info');
    if (typeof requestedMax === 'number') {
      appendLog(`Límite solicitado max_images=${requestedMax}`, 'info');
    }
    if (meta?.status) {
      appendLog(`Estado actual: ${meta.status}`, 'info');
    }
    setLogSeeded(true);
  }, [activeJobId, appendLog, logSeeded]);

  useEffect(() => {
    if (!jobQuery.data || !activeJobId) {
      return;
    }
    const job = jobQuery.data;
    const status = job.status;
    const processed = job.processed_images ?? 0;
    const total = job.total_images ?? 0;
    updateLevel1JobMeta(activeJobId, {
      status,
      processed_images: processed,
      total_images: total
    });
    const lastProgress = lastProgressRef.current;
    const statusChanged = status && status !== lastProgress?.status;
    const progressChanged = processed !== lastProgress?.processed || total !== lastProgress?.total;
    const progressLabel =
      total > 0 && processed > total
        ? `${processed} procesadas (total reportado: ${total})`
        : `${processed}/${total}`;

    if (statusChanged || progressChanged) {
      if (status === 'running') {
        appendLog(`Job running: ${progressLabel}`, 'info');
      }
      if (status === 'completed') {
        appendLog(`Job completed (${progressLabel}).`, 'success');
      }
      if (status === 'failed') {
        appendLog(`Job falló: ${job.error_message || 'Error desconocido'}`, 'error');
      }
      if (status === 'cancelled') {
        appendLog('Job cancelado.', 'error');
      }
      if (status === 'paused') {
        appendLog('Job pausado.', 'info');
      }
      if (status === 'pending') {
        appendLog('Job pendiente, esperando ejecución…', 'info');
      }
      lastProgressRef.current = { status, processed, total };
    }
  }, [jobQuery.data, activeJobId]);

  useEffect(() => {
    if (form.prompt_source !== 'concept') {
      return;
    }
    if (!primaryConceptPrompt) {
      return;
    }
    setForm((prev) => ({ ...prev, prompt_text: primaryConceptPrompt }));
  }, [form.prompt_source, primaryConceptPrompt]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== getLevel1JobRegistryKey()) {
        return;
      }
      const updatedCurrent = getCurrentLevel1JobId();
      if (updatedCurrent && updatedCurrent !== activeJobId) {
        setActiveJobId(updatedCurrent);
        setLogSeeded(false);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [activeJobId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nuevo job Nivel 1</h1>
        <p className="text-sm text-gray-600">Configura y lanza una inferencia nivel 1 sobre un dataset.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg bg-white p-5 shadow-sm">
        {healthQuery.data && sam3Unavailable && (
          <div className="rounded border border-yellow-400 bg-yellow-50 p-3 text-sm text-yellow-900">
            <p className="font-semibold">SAM-3 no disponible.</p>
            <p>{healthQuery.data.sam3_message || healthQuery.data.sam3_import_error}</p>
          </div>
        )}
        <ApiErrorDisplay error={healthQuery.error ?? null} />
        {isLaunching && <div className="text-sm text-gray-600">Preparando job y conectando con el backend…</div>}
        {activeJobId && !resumeError && !isLaunching && (
          <div className="text-sm text-gray-600">
            Job #{activeJobId} {jobQuery.data?.status ? `(${jobQuery.data.status})` : 'creado'}.
          </div>
        )}
        {activeJobId && resumeError && (
          <div className="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
            <p className="font-semibold">El job se creó pero no pudo iniciarse.</p>
            <p>Reintenta la ejecución desde el botón de abajo o visita el detalle del job.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={async () => {
                  setResumeError(null);
                  try {
                    await resumeMutation.mutateAsync(activeJobId);
                    navigate(`/classification/level1/jobs/${activeJobId}`);
                  } catch (error) {
                    setResumeError(error as ApiError);
                  }
                }}
                className="rounded border border-yellow-600 px-3 py-2 text-xs font-semibold text-yellow-700 hover:bg-yellow-100"
              >
                Reintentar ejecución
              </button>
              <button
                type="button"
                onClick={() => navigate(`/classification/level1/jobs/${activeJobId}`)}
                className="rounded border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Ver detalle del job
              </button>
            </div>
          <div className="mt-3">
            <ApiErrorDisplay error={resumeError} />
          </div>
        </div>
        )}
        {activeJobId && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span>Job actual: #{activeJobId}</span>
            <button
              type="button"
              onClick={() => navigate(`/classification/level1/jobs/${activeJobId}`)}
              className="rounded border border-gray-300 px-2 py-1 font-semibold text-gray-700 hover:bg-gray-100"
            >
              Ver detalle
            </button>
            <button
              type="button"
              onClick={() => navigate(`/classification/level1/jobs/${activeJobId}/results`)}
              className="rounded border border-gray-300 px-2 py-1 font-semibold text-gray-700 hover:bg-gray-100"
            >
              Ver resultados
            </button>
            {jobQuery.data && (
              <span>
                Estado: {jobQuery.data.status} ·{' '}
                {(jobQuery.data.processed_images ?? 0)}/{jobQuery.data.total_images ?? 0}
              </span>
            )}
          </div>
        )}
        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-gray-700">Consola / Activity Log</div>
            <button
              type="button"
              onClick={() => setIsLogOpen((prev) => !prev)}
              className="text-xs font-semibold text-blue-700 hover:underline"
            >
              {isLogOpen ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          {isLogOpen && (
            <div className="mt-2 space-y-2 text-xs text-gray-700">
              {activityLog.length === 0 && <div className="text-gray-500">Sin actividad reciente.</div>}
              {activityLog.map((entry) => (
                <div
                  key={entry.id}
                  className={`rounded border px-2 py-1 ${
                    entry.status === 'error'
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : entry.status === 'success'
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-gray-200 bg-white text-gray-700'
                  }`}
                >
                  {entry.message}
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Dataset</label>
          <select
            required
            value={form.dataset_id}
            onChange={(e) => setForm((prev) => ({ ...prev, dataset_id: Number(e.target.value) }))}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value={0}>Selecciona un dataset</option>
            {(datasetsQuery.data || []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Conceptos nivel 1</label>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(conceptsQuery.data || []).map((concept) => {
              const selected = form.conceptIds.includes(concept.id || 0);
              return (
                <label key={concept.id} className="flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        conceptIds: e.target.checked
                          ? [...prev.conceptIds, concept.id || 0]
                          : prev.conceptIds.filter((c) => c !== concept.id)
                      }))
                    }
                  />
                  <span className="text-sm text-gray-800">{concept.name}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="rounded border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3 text-sm font-semibold text-gray-700">Modo de inferencia</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Método</label>
              <select
                value={form.inference_method}
                onChange={(e) => setForm((prev) => ({ ...prev, inference_method: e.target.value }))}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              >
                <option value="PCS_TEXT">PCS (Texto)</option>
                <option value="PCS_BOX">PCS (Caja)</option>
                <option value="PCS_COMBINED">PCS (Combinado)</option>
                <option value="AUTO_MASK">AutoMask</option>
              </select>
            </div>
            {(form.inference_method === 'PCS_TEXT' || form.inference_method === 'PCS_COMBINED') && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-sm font-medium text-gray-700">Prompt (texto)</label>
                  <button
                    type="button"
                    disabled={!primaryConceptPrompt}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        prompt_text: primaryConceptPrompt,
                        prompt_source: 'concept'
                      }))
                    }
                    className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    Usar texto del Concepto
                  </button>
                </div>
                <input
                  type="text"
                  value={form.prompt_text}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, prompt_text: e.target.value, prompt_source: 'payload' }))
                  }
                  placeholder='e.g. "person"'
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                />
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-600">
                  <div>
                    Fuente actual:{' '}
                    <span className="font-semibold">
                      {form.prompt_source === 'concept' ? 'concepto' : 'payload'}
                    </span>
                    {form.conceptIds.length > 1 && form.prompt_source === 'concept' && (
                      <span className="ml-1 text-gray-500">(usa el primer concepto seleccionado)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Idioma:</span>
                    <select
                      value={form.prompt_language}
                      onChange={(e) => setForm((prev) => ({ ...prev, prompt_language: e.target.value }))}
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                    >
                      <option value="en">en</option>
                      <option value="es">es</option>
                    </select>
                    <span className="text-gray-500">(recomendado en inglés)</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {form.inference_method === 'PCS_BOX' && (
            <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
              PCS_BOX ignora prompts de texto; usa solo cajas de ejemplo para guiar la detección.
            </div>
          )}

          {(form.inference_method === 'PCS_BOX' || form.inference_method === 'PCS_COMBINED') && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <div className="text-sm font-semibold text-gray-700">Agregar bbox</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <input
                    type="number"
                    placeholder="x1"
                    value={form.input_box_draft.x1}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        input_box_draft: { ...prev.input_box_draft, x1: e.target.value }
                      }))
                    }
                    className="rounded border border-gray-300 px-2 py-1"
                  />
                  <input
                    type="number"
                    placeholder="y1"
                    value={form.input_box_draft.y1}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        input_box_draft: { ...prev.input_box_draft, y1: e.target.value }
                      }))
                    }
                    className="rounded border border-gray-300 px-2 py-1"
                  />
                  <input
                    type="number"
                    placeholder="x2"
                    value={form.input_box_draft.x2}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        input_box_draft: { ...prev.input_box_draft, x2: e.target.value }
                      }))
                    }
                    className="rounded border border-gray-300 px-2 py-1"
                  />
                  <input
                    type="number"
                    placeholder="y2"
                    value={form.input_box_draft.y2}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        input_box_draft: { ...prev.input_box_draft, y2: e.target.value }
                      }))
                    }
                    className="rounded border border-gray-300 px-2 py-1"
                  />
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <input
                    type="number"
                    placeholder="label (opcional)"
                    value={form.input_box_label_draft}
                    onChange={(e) => setForm((prev) => ({ ...prev, input_box_label_draft: e.target.value }))}
                    className="w-32 rounded border border-gray-300 px-2 py-1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const { x1, y1, x2, y2 } = form.input_box_draft;
                      const coords = [x1, y1, x2, y2].map((value) => Number(value));
                      if (coords.some((value) => Number.isNaN(value))) {
                        appendLog('BBox inválida: completa x1,y1,x2,y2.', 'error');
                        return;
                      }
                      const existingBoxes = parseOptionalJson(form.input_boxes_text) as number[][] | undefined;
                      const updatedBoxes = [...(existingBoxes || []), coords];
                      const existingLabels = parseOptionalJson(form.input_boxes_labels_text) as number[] | undefined;
                      const labelValue = form.input_box_label_draft !== '' ? Number(form.input_box_label_draft) : undefined;
                      const updatedLabels = labelValue !== undefined ? [...(existingLabels || []), labelValue] : existingLabels;
                      setForm((prev) => ({
                        ...prev,
                        input_boxes_text: JSON.stringify(updatedBoxes),
                        input_boxes_labels_text: updatedLabels ? JSON.stringify(updatedLabels) : prev.input_boxes_labels_text,
                        input_box_draft: { x1: '', y1: '', x2: '', y2: '' },
                        input_box_label_draft: ''
                      }));
                    }}
                    className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Agregar
                  </button>
                </div>
                <div className="rounded border border-gray-200 bg-white p-2 text-xs text-gray-600">
                  <div className="font-semibold text-gray-700">Cajas definidas</div>
                  <ul className="mt-1 space-y-1">
                    {(parsedInputBoxes || []).map((box, idx) => (
                      <li key={`box-${idx}`} className="flex items-center justify-between gap-2">
                        <span>{box.join(', ')}</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (!parsedInputBoxes) return;
                            const updatedBoxes = parsedInputBoxes.filter((_, i) => i !== idx);
                            const existingLabels = parseOptionalJson(form.input_boxes_labels_text) as number[] | undefined;
                            const updatedLabels = existingLabels ? existingLabels.filter((_, i) => i !== idx) : existingLabels;
                            setForm((prev) => ({
                              ...prev,
                              input_boxes_text: JSON.stringify(updatedBoxes),
                              input_boxes_labels_text: updatedLabels ? JSON.stringify(updatedLabels) : prev.input_boxes_labels_text
                            }));
                          }}
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          Quitar
                        </button>
                      </li>
                    ))}
                    {(parsedInputBoxes || []).length === 0 && <li className="text-gray-500">Sin cajas aún.</li>}
                  </ul>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">input_boxes (JSON)</label>
                <textarea
                  value={form.input_boxes_text}
                  onChange={(e) => setForm((prev) => ({ ...prev, input_boxes_text: e.target.value }))}
                  placeholder='[[x1,y1,x2,y2], [x1,y1,x2,y2]]'
                  className="mt-1 h-24 w-full rounded border border-gray-300 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">input_boxes_labels (JSON)</label>
                <textarea
                  value={form.input_boxes_labels_text}
                  onChange={(e) => setForm((prev) => ({ ...prev, input_boxes_labels_text: e.target.value }))}
                  placeholder="[1, 0]"
                  className="mt-1 h-24 w-full rounded border border-gray-300 px-3 py-2 text-xs"
                />
              </div>
            </div>
          )}

          {form.inference_method === 'AUTO_MASK' && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">points_per_batch (opcional)</label>
                <input
                  type="number"
                  min="1"
                  value={form.points_per_batch ?? ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, points_per_batch: parseOptionalNumber(e.target.value) }))}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                />
                <div className="mt-1 text-xs text-gray-500">AutoMask puede ser lento en datasets grandes.</div>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">target_long_side</label>
            <select
              value={form.target_long_side}
              onChange={(e) => setForm((prev) => ({ ...prev, target_long_side: Number(e.target.value) }))}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            >
              {[384, 512, 768].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">box_threshold</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={form.box_threshold}
              onChange={(e) => setForm((prev) => ({ ...prev, box_threshold: Number(e.target.value) }))}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">mask_threshold</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={form.mask_threshold}
              onChange={(e) => setForm((prev) => ({ ...prev, mask_threshold: Number(e.target.value) }))}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">min_area_pixels</label>
            <input
              type="number"
              min="0"
              value={form.min_area_pixels}
              onChange={(e) => setForm((prev) => ({ ...prev, min_area_pixels: Number(e.target.value) }))}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <div className="grid items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.return_masks}
                onChange={(e) => setForm((prev) => ({ ...prev, return_masks: e.target.checked }))}
              />
              return_masks
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.return_boxes}
                onChange={(e) => setForm((prev) => ({ ...prev, return_boxes: e.target.checked }))}
              />
              return_boxes
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.return_polygons}
                onChange={(e) => setForm((prev) => ({ ...prev, return_polygons: e.target.checked }))}
              />
              return_polygons
            </label>
          </div>
        </div>

        <div className="rounded border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">Demo overlays</div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.demo_mode}
                onChange={(e) => setForm((prev) => ({ ...prev, demo_mode: e.target.checked }))}
              />
              Ejecutar demo (pintar aunque no haya detecciones)
            </label>
          </div>
          {form.demo_mode && (
            <div className="mt-3 grid gap-3 text-sm text-gray-700 sm:grid-cols-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.demo_overlays_enabled}
                  onChange={(e) => setForm((prev) => ({ ...prev, demo_overlays_enabled: e.target.checked }))}
                />
                Demo overlays enabled
              </label>
              <label className="flex items-center gap-2">
                <span className="text-xs">count_per_image</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={form.demo_overlays_count}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, demo_overlays_count: Number(e.target.value) || 3 }))
                  }
                  className="w-20 rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.demo_overlays_include_masks}
                  onChange={(e) => setForm((prev) => ({ ...prev, demo_overlays_include_masks: e.target.checked }))}
                />
                incluir masks
              </label>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">batch_size</label>
            <input
              type="number"
              min="1"
              value={form.batch_size}
              onChange={(e) => setForm((prev) => ({ ...prev, batch_size: Number(e.target.value) || 1 }))}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">device_preference</label>
            <select
              value={form.device_preference}
              onChange={(e) => setForm((prev) => ({ ...prev, device_preference: e.target.value as DevicePreference }))}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            >
              {['auto', 'cpu', 'cuda'].map((device) => (
                <option key={device} value={device}>
                  {device}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">user_confidence (opcional)</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={form.user_confidence ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, user_confidence: parseOptionalNumber(e.target.value) }))}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              placeholder="e.g. 0.5"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">max_detections_per_image (opcional)</label>
            <input
              type="number"
              min="1"
              value={form.max_detections_per_image ?? ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, max_detections_per_image: parseOptionalNumber(e.target.value) }))
              }
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              placeholder="p.ej. 5"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">max_images (opcional)</label>
            <input
              type="number"
              min="1"
              value={form.max_images ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, max_images: parseOptionalNumber(e.target.value) }))}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              placeholder="p.ej. 100"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">sleep_ms_between_images (opcional)</label>
            <input
              type="number"
              min="0"
              value={form.sleep_ms_between_images ?? ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, sleep_ms_between_images: parseOptionalNumber(e.target.value) }))
              }
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              placeholder="p.ej. 50"
            />
          </div>

          <div className="grid grid-cols-2 items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.safe_mode}
                onChange={(e) => setForm((prev) => ({ ...prev, safe_mode: e.target.checked }))}
              />
              safe_mode
            </label>
          </div>
        </div>

        <ApiErrorDisplay error={mutation.error ?? null} />

        <div className="flex flex-wrap justify-between gap-3">
          <button
            type="button"
            disabled={isSubmitDisabled}
            onClick={() =>
              launchJob({
                inference_method: 'PCS_TEXT',
                prompt_text: 'person',
                max_images: form.max_images ?? 10,
                box_threshold: 0.5,
                mask_threshold: 0.5
              })
            }
            className="rounded border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
          >
            Ejecutar demo
          </button>
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Lanzar job
          </button>
        </div>
      </form>
    </div>
  );
};

export default JobCreationPage;
