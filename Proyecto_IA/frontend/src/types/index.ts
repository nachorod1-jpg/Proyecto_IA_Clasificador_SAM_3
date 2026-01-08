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
  created_at?: string;
  updated_at?: string;
  started_at?: string;
  finished_at?: string;
  error_message?: string;
  processed_images?: number;
  total_images?: number;
  max_images?: number;
  stats?: Stats;
  safe_mode?: boolean;
  safe_load?: boolean;
  inference_method?: string;
  debug?: {
    method_used?: string;
    text_used?: string | null;
    concept_prompt_source?: 'payload' | 'concept' | 'none';
    boxes_used_count?: number;
    thresholds_used?: {
      confidence_threshold?: number;
      mask_threshold?: number;
      min_area_pixels?: number;
    };
  };
  demo_mode?: boolean;
  demo_overlays?: {
    enabled?: boolean;
    count_per_image?: number;
    include_masks?: boolean;
  };
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

export type BBox = Array<number | string>;

export interface Region {
  bbox: BBox;
  score?: number;
  concept_id?: number;
  concept_name?: string;
}

export interface SampleRegion {
  bbox: BBox;
  score?: number;
  color_hex?: string;
  concept_name?: string;
  concept_id?: number;
  mask_ref?: string;
  mask_url?: string;
  bbox_xyxy?: BBox;
  region_id?: number;
  is_demo?: boolean;
}

export interface Sample {
  image_id: number;
  rel_path?: string;
  abs_path?: string;
  regions: SampleRegion[];
  image_url?: string;
  concept_id?: number;
}

export interface JobImage {
  image_id: number;
  rel_path?: string;
  abs_path?: string;
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
