import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './pages/App';
import SystemStatusPage from './pages/SystemStatusPage';
import DatasetsPage from './pages/DatasetsPage';
import JobCreationPage from './pages/JobCreationPage';
import JobDetailPage from './pages/JobDetailPage';
import JobResultsPage from './pages/JobResultsPage';
import DatasetDetailPage from './pages/DatasetDetailPage';
import SampleViewerPage from './pages/SampleViewerPage';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<App />}> 
              <Route index element={<Navigate to="/system/status" replace />} />
              <Route path="/system/status" element={<SystemStatusPage />} />
              <Route path="/datasets" element={<DatasetsPage />} />
              <Route path="/datasets/:datasetId" element={<DatasetDetailPage />} />
              <Route path="/classification/level1/new" element={<JobCreationPage />} />
              <Route path="/classification/level1/jobs/:jobId" element={<JobDetailPage />} />
              <Route path="/classification/level1/jobs/:jobId/results" element={<JobResultsPage />} />
              <Route path="/classification/level1/jobs/:jobId/samples/:sampleId" element={<SampleViewerPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
