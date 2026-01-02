import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import ApiErrorDisplay from '../components/ApiErrorDisplay';
import DataTable from '../components/DataTable';
import { createDataset, fetchConcepts, fetchDatasets, upsertConcept } from '../api';
import { Concept, Dataset } from '../types';

const DatasetsPage = () => {
  const queryClient = useQueryClient();
  const [datasetForm, setDatasetForm] = useState({ name: '', root_path: '' });
  const [conceptForm, setConceptForm] = useState<Concept>({ name: '', prompt: '', level: 1 });

  const datasetsQuery = useQuery<Dataset[], Error>({ queryKey: ['datasets'], queryFn: fetchDatasets });
  const conceptsQuery = useQuery<Concept[], Error>({ queryKey: ['concepts'], queryFn: fetchConcepts });

  const createDatasetMutation = useMutation({
    mutationFn: () => createDataset(datasetForm),
    onSuccess: () => {
      setDatasetForm({ name: '', root_path: '' });
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
    }
  });

  const upsertConceptMutation = useMutation({
    mutationFn: () => upsertConcept(conceptForm),
    onSuccess: () => {
      setConceptForm({ name: '', prompt: '', level: 1 });
      queryClient.invalidateQueries({ queryKey: ['concepts'] });
    }
  });

  const handleDatasetSubmit = (e: FormEvent) => {
    e.preventDefault();
    createDatasetMutation.mutate();
  };

  const handleConceptSubmit = (e: FormEvent) => {
    e.preventDefault();
    upsertConceptMutation.mutate();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Datasets</h1>
        <p className="text-sm text-gray-600">Registra nuevos datasets y consulta los existentes.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">Registrar nuevo dataset</h2>
        <form onSubmit={handleDatasetSubmit} className="grid gap-4 rounded-lg bg-white p-4 shadow-sm sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Nombre</label>
            <input
              required
              value={datasetForm.name}
              onChange={(e) => setDatasetForm((prev) => ({ ...prev, name: e.target.value }))}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Ruta</label>
            <input
              required
              value={datasetForm.root_path}
              onChange={(e) => setDatasetForm((prev) => ({ ...prev, root_path: e.target.value }))}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="/ruta/al/dataset"
            />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-3">
            <button
              type="submit"
              disabled={createDatasetMutation.isLoading}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Registrar
            </button>
          </div>
          <ApiErrorDisplay error={createDatasetMutation.error ?? null} />
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">Listado</h2>
        <ApiErrorDisplay error={datasetsQuery.error ?? null} />
        <DataTable
          data={datasetsQuery.data || []}
          columns={[
            { key: 'id', header: 'ID' },
            { key: 'name', header: 'Nombre', render: (d) => <Link className="text-blue-700" to={`/datasets/${d.id}`}>{d.name}</Link> },
            { key: 'root_path', header: 'Ruta' },
            { key: 'num_images', header: 'Imágenes' },
            { key: 'created_at', header: 'Creado' }
          ]}
          emptyMessage={datasetsQuery.isLoading ? 'Cargando...' : 'No hay datasets registrados.'}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">Conceptos Nivel 1</h2>
        <form onSubmit={handleConceptSubmit} className="grid gap-4 rounded-lg bg-white p-4 shadow-sm sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Nombre</label>
            <input
              required
              value={conceptForm.name}
              onChange={(e) => setConceptForm((prev) => ({ ...prev, name: e.target.value }))}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Prompt</label>
            <input
              required
              value={conceptForm.prompt}
              onChange={(e) => setConceptForm((prev) => ({ ...prev, prompt: e.target.value }))}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Activo</label>
            <select
              value={conceptForm.is_active ? 'true' : 'false'}
              onChange={(e) => setConceptForm((prev) => ({ ...prev, is_active: e.target.value === 'true' }))}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </div>
          <div className="sm:col-span-3 flex justify-end gap-3">
            <button
              type="submit"
              disabled={upsertConceptMutation.isLoading}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Guardar concepto
            </button>
          </div>
          <ApiErrorDisplay error={upsertConceptMutation.error ?? null} />
        </form>
        <ApiErrorDisplay error={conceptsQuery.error ?? null} />
        <DataTable
          data={conceptsQuery.data || []}
          columns={[
            { key: 'id', header: 'ID' },
            { key: 'name', header: 'Nombre' },
            { key: 'prompt', header: 'Prompt' },
            { key: 'is_active', header: 'Activo', render: (c) => (c.is_active ? 'Sí' : 'No') }
          ]}
          emptyMessage={conceptsQuery.isLoading ? 'Cargando...' : 'No hay conceptos registrados.'}
        />
      </section>
    </div>
  );
};

export default DatasetsPage;
