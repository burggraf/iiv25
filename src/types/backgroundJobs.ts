export type JobType = 'product_creation' | 'ingredient_parsing' | 'product_photo_upload';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface BackgroundJob {
  id: string;
  jobType: JobType;
  status: JobStatus;
  priority: number; // Higher number = higher priority
  
  // Job context
  upc: string;
  deviceId: string;
  
  // Workflow context for grouping related jobs
  workflowId?: string; // Unique ID for grouping related jobs
  workflowType?: 'add_new_product' | 'individual_action'; // Workflow classification
  workflowSteps?: { total: number; current: number }; // Progress tracking
  
  // Input data
  imageUri: string; // Local file path
  imageBase64?: string; // Base64 encoded image data
  existingProductData?: any; // Product data for ingredient parsing
  
  // Processing results
  resultData?: any;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  
  // Timing
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedCompletionAt?: Date;
  
  // Metadata
  metadata?: {
    imageDimensions?: { width: number; height: number };
    fileSize?: number;
    originalFileName?: string;
  };
}

export interface JobProgress {
  jobId: string;
  progress: number; // 0-100
  stage: string; // e.g., 'uploading', 'processing', 'saving'
  message?: string;
}

export interface JobNotification {
  id: string;
  jobId: string;
  type: 'job_started' | 'job_progress' | 'job_completed' | 'job_failed';
  title: string;
  body: string;
  data?: any;
  sentAt?: Date;
  acknowledgedAt?: Date;
}