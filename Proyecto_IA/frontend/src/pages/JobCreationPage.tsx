import { FormEvent, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import ApiErrorDisplay from '../components/ApiErrorDisplay';
import { createLevel1Job, fetchConcepts, fetchDatasets, resumeJob } from '../api';
import { ApiError } from '../api/client';
import { Concept, Dataset } from '../types';
import { useHealthPolling } from '../hooks/useHealthPolling';

type DevicePreference = 'auto' | 'cpu' | 'cuda';

const parseOptionalNumber = (value: string) => (value === '' ? undefined : Number(value));

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
    batch_size: 1,
    user_confidence: undefined as number | undefined,
    device_preference: 'auto' as DevicePreference,
    max_detections_per_image: undefined as number | undefined,
    sleep_ms_between_images: undefined as number | undefined,
    max_images: undefined as number | undefined,
    safe_mode: true,
    safe_load: true
  });

  const mutation = useMutation({
    mutationFn: () =>
      createLevel1Job({
        dataset_id: form.dataset_id,
        concepts: form.conceptIds.map((id) => {
          const concept = conceptsQuery.data?.find((c) => c.id === id);
          return { concept_id: id, prompt_text: concept?.prompt || concept?.name };
        }),
        user_confidence: form.user_confidence,
        batch_size: form.batch_size,
        safe_mode: form.safe_mode,
        safe_load: form.safe_load,
        device_preference: form.device_preference,
        target_long_side: form.target_long_side,
        box_threshold: form.box_threshold,
        max_detections_per_image: form.max_detections_per_image,
        sleep_ms_between_images: form.sleep_ms_between_images,
        max_images: form.max_images
      })
  });

  const [createdJobId, setCreatedJobId] = useState<number | null>(null);
  const [resumeError, setResumeError] = useState<ApiError | null>(null);

  const resumeMutation = useMutation({
    mutationFn: (jobId: number) => resumeJob(String(jobId))
  });

  const launchJob = async () => {
    setResumeError(null);
    setCreatedJobId(null);
    let newJobId: number | null = null;
    try {
      const job = await mutation.mutateAsync();
      newJobId = job.id;
      setCreatedJobId(job.id);
      await resumeMutation.mutateAsync(job.id);
      navigate(`/classification/level1/jobs/${job.id}`);
    } catch (error) {
      if (!newJobId) {
        return;
      }
      setResumeError(error as ApiError);
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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void launchJob();
  };

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
        {createdJobId && !resumeError && !isLaunching && (
          <div className="text-sm text-gray-600">Job #{createdJobId} creado en estado pendiente.</div>
        )}
        {createdJobId && resumeError && (
          <div className="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
            <p className="font-semibold">El job se creó pero no pudo iniciarse.</p>
            <p>Reintenta la ejecución desde el botón de abajo o visita el detalle del job.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={async () => {
                  setResumeError(null);
                  try {
                    await resumeMutation.mutateAsync(createdJobId);
                    navigate(`/classification/level1/jobs/${createdJobId}`);
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
                onClick={() => navigate(`/classification/level1/jobs/${createdJobId}`)}
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
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.safe_load}
                onChange={(e) => setForm((prev) => ({ ...prev, safe_load: e.target.checked }))}
              />
              safe_load
            </label>
          </div>
        </div>

        <ApiErrorDisplay error={mutation.error ?? null} />

        <div className="flex justify-end">
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
