export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';

export interface Dataset {
  id: number;
  name: string;
  root_path?: string;
  path?: string;
  num_images?: number;
  created_at?: string;
}

export interface Concept {
  id?: number;
  name: string;
  prompt: string;
  level: number;
  is_active?: boolean;
  family?: string;
  color_hex?: string;
}

export interface Job {
  id: number;
  status: JobStatus;
  state?: JobStatus;
  created_at?: string;
  updated_at?: string;
  started_at?: string;
  finished_at?: string;
  error_message?: string;
  processed_images?: number;
  total_images?: number;
  stats?: Stats;
  safe_mode?: boolean;
  safe_load?: boolean;
}

export interface StatsBucket {
  bucket: string;
  count: number;
}

export interface ConceptStats {
  concept_id?: number;
  concept_name?: string;
  buckets?: StatsBucket[];
  total?: number;
}

export interface Stats {
  total_images?: number;
  concepts?: ConceptStats[];
  buckets?: StatsBucket[];
}

export interface Region {
  bbox: [number, number, number, number];
  score?: number;
  concept_id?: number;
  concept_name?: string;
}

export interface Sample {
  sample_id?: number;
  id?: number;
  image_id: number;
  concept_id?: number;
  concept_name?: string;
  bucket?: string;
  score?: number;
  regions: Region[];
  image_url?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total?: number;
  limit?: number;
  offset?: number;
}

export interface HealthInfo {
  gpu_available: boolean;
  gpu_name?: string;
  vram_mb?: number;
  sam3_weights_ready: boolean;
  sam3_message: string;
  sam3_import_ok: boolean;
  sam3_import_error?: string;
  sam3_import_traceback?: string;
  python_executable: string;
  transformers_version?: string;
  transformers_file?: string;
  sam3_symbols: string[];
}
