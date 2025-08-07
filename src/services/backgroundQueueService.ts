import AsyncStorage from '@react-native-async-storage/async-storage';
import { BackgroundJob, JobType, JobStatus } from '../types/backgroundJobs';
import deviceIdService from './deviceIdService';
import * as FileSystem from 'expo-file-system';
import { EventEmitter } from 'eventemitter3';

const STORAGE_KEY_JOBS = 'background_jobs';
const STORAGE_KEY_COMPLETED_JOBS = 'completed_background_jobs';
const MAX_COMPLETED_JOBS = 20; // Keep last 20 completed jobs (reduced from 50)
const MAX_ACTIVE_JOBS = 10; // Maximum active jobs allowed

class BackgroundQueueServiceClass extends EventEmitter {
  private jobs: BackgroundJob[] = [];
  private processingJobs = new Set<string>();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log(`🔧 [BackgroundQueue] Already initialized`);
      return;
    }
    
    console.log(`🚀 [BackgroundQueue] Initializing background queue service`);
    await this.loadJobsFromStorage();
    this.initialized = true;
    
    console.log(`📋 [BackgroundQueue] Loaded ${this.jobs.length} jobs from storage`);
    
    // Clean up any stuck jobs first
    await this.cleanupStuckJobs();
    
    // Resume any processing jobs that were interrupted
    await this.resumeInterruptedJobs();
  }

  /**
   * Queue a new photo processing job
   */
  async queueJob(params: {
    jobType: JobType;
    imageUri: string;
    upc: string;
    existingProductData?: any;
    priority?: number;
    workflowId?: string;
    workflowType?: 'add_new_product' | 'individual_action';
    workflowSteps?: { total: number; current: number };
  }): Promise<BackgroundJob> {
    await this.initialize();
    
    // CRITICAL: Prevent duplicate jobs
    const existingJob = this.jobs.find(job => 
      job.jobType === params.jobType && 
      job.upc === params.upc && 
      (job.status === 'queued' || job.status === 'processing')
    );
    
    if (existingJob) {
      console.log(`⚠️ [BackgroundQueue] Duplicate job prevented: ${existingJob.id.slice(-6)} already ${existingJob.status} for ${params.jobType}/${params.upc}`);
      return existingJob;
    }

    // CRITICAL: Prevent excessive job buildup
    if (this.jobs.length >= MAX_ACTIVE_JOBS) {
      console.log(`🚫 [BackgroundQueue] Maximum active jobs reached (${MAX_ACTIVE_JOBS}). Cleaning up old jobs first.`);
      await this.cleanupStuckJobs();
      
      if (this.jobs.length >= MAX_ACTIVE_JOBS) {
        throw new Error(`Too many active jobs (${this.jobs.length}). Please wait for some to complete or clear the queue.`);
      }
    }
    
    const deviceId = await deviceIdService.getDeviceId();
    // Generate truly unique job ID with microsecond precision and crypto-strong random
    const timestamp = Date.now();
    const microseconds = performance.now().toString().replace('.', '');
    const randomPart = Math.random().toString(36).substr(2, 12);
    const jobId = `job_${timestamp}_${microseconds.slice(-6)}_${randomPart}`;
    
    console.log(`🚀 [BackgroundQueue] Queueing job ${jobId}: ${params.jobType} for UPC ${params.upc}`);
    
    // Get image metadata
    const imageInfo = await FileSystem.getInfoAsync(params.imageUri);
    
    const job: BackgroundJob = {
      id: jobId,
      jobType: params.jobType,
      status: 'queued',
      priority: params.priority || 1,
      upc: params.upc,
      deviceId,
      imageUri: params.imageUri,
      existingProductData: params.existingProductData,
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date(),
      estimatedCompletionAt: new Date(Date.now() + this.getEstimatedProcessingTime(params.jobType)),
      // Workflow fields
      workflowId: params.workflowId,
      workflowType: params.workflowType,
      workflowSteps: params.workflowSteps,
      metadata: {
        fileSize: imageInfo.exists ? (imageInfo as any).size : undefined,
      }
    };

    this.jobs.push(job);
    await this.saveJobsToStorage();
    
    console.log(`📋 [BackgroundQueue] Queue now has ${this.jobs.length} jobs. Current queue:`, 
      this.jobs.map(j => `${j.id.slice(-6)} (${j.jobType}, ${j.status}, pri:${j.priority}, upc:${j.upc})`));
    
    this.emit('job_added', job);
    
    // Start processing immediately if possible
    this.processNextJob();
    
    return job;
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<BackgroundJob | null> {
    await this.initialize();
    return this.jobs.find(job => job.id === jobId) || null;
  }

  /**
   * Get all jobs for current device
   */
  async getJobs(includeCompleted = false): Promise<BackgroundJob[]> {
    await this.initialize();
    
    if (includeCompleted) {
      const completedJobs = await this.getCompletedJobsFromStorage();
      return [...this.jobs, ...completedJobs];
    }
    
    return [...this.jobs];
  }

  /**
   * Get active jobs (queued or processing)
   */
  async getActiveJobs(): Promise<BackgroundJob[]> {
    await this.initialize();
    return this.jobs.filter(job => job.status === 'queued' || job.status === 'processing');
  }

  /**
   * Get completed jobs (completed, failed, cancelled) 
   */
  async getCompletedJobs(): Promise<BackgroundJob[]> {
    return await this.getCompletedJobsFromStorage();
  }

  private async getCompletedJobsFromStorage(): Promise<BackgroundJob[]> {
    try {
      const completedJobsJson = await AsyncStorage.getItem(STORAGE_KEY_COMPLETED_JOBS);
      if (completedJobsJson) {
        const jobsData = JSON.parse(completedJobsJson);
        return jobsData.map((job: any) => ({
          ...job,
          createdAt: new Date(job.createdAt),
          startedAt: job.startedAt ? new Date(job.startedAt) : undefined,
          completedAt: job.completedAt ? new Date(job.completedAt) : undefined,
          estimatedCompletionAt: job.estimatedCompletionAt ? new Date(job.estimatedCompletionAt) : undefined,
        }));
      }
    } catch (error) {
      console.error('Error loading completed jobs from storage:', error);
    }
    return [];
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    await this.initialize();
    
    const jobIndex = this.jobs.findIndex(job => job.id === jobId);
    if (jobIndex === -1) return false;
    
    const job = this.jobs[jobIndex];
    
    if (job.status === 'processing') {
      // Can't cancel a job that's already processing
      return false;
    }
    
    job.status = 'cancelled';
    job.completedAt = new Date();
    
    // Move to completed jobs
    await this.moveJobToCompleted(job);
    this.jobs.splice(jobIndex, 1);
    
    await this.saveJobsToStorage();
    this.emit('job_updated', job);
    
    return true;
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<boolean> {
    await this.initialize();
    
    const job = this.jobs.find(job => job.id === jobId);
    if (!job || job.status !== 'failed') return false;
    
    job.status = 'queued';
    job.retryCount++;
    job.errorMessage = undefined;
    job.estimatedCompletionAt = new Date(Date.now() + this.getEstimatedProcessingTime(job.jobType));
    
    await this.saveJobsToStorage();
    this.emit('job_updated', job);
    
    // Start processing
    this.processNextJob();
    
    return true;
  }

  /**
   * Process the next job in the queue
   */
  private async processNextJob(): Promise<void> {
    // Find the highest priority queued job
    const queuedJobs = this.jobs.filter(job => job.status === 'queued');
    const nextJob = queuedJobs
      .sort((a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime())[0];
    
    console.log(`🔍 [BackgroundQueue] Looking for next job. Queued: ${queuedJobs.length}, Processing: ${this.processingJobs.size}`);
    
    if (!nextJob) {
      console.log(`✅ [BackgroundQueue] No jobs to process. Queue is empty.`);
      return;
    }
    
    if (this.processingJobs.has(nextJob.id)) {
      console.log(`⏭️ [BackgroundQueue] Job ${nextJob.id.slice(-6)} already processing, skipping`);
      return;
    }
    
    console.log(`▶️ [BackgroundQueue] Starting job ${nextJob.id.slice(-6)}: ${nextJob.jobType} for UPC ${nextJob.upc}`);
    this.processingJobs.add(nextJob.id);
    
    try {
      await this.processJob(nextJob);
    } catch (error) {
      console.error(`❌ [BackgroundQueue] Error processing job ${nextJob.id.slice(-6)}:`, error);
    } finally {
      this.processingJobs.delete(nextJob.id);
      console.log(`🏁 [BackgroundQueue] Finished processing job ${nextJob.id.slice(-6)}`);
      
      // Process next job
      setTimeout(() => this.processNextJob(), 1000);
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: BackgroundJob): Promise<void> {
    const timeoutMs = 60000; // 60 second timeout
    
    try {
      console.log(`🔄 [BackgroundQueue] Processing ${job.id.slice(-6)}: ${job.jobType} for UPC ${job.upc}`);
      
      // Update job status
      job.status = 'processing';
      job.startedAt = new Date();
      await this.saveJobsToStorage();
      this.emit('job_updated', job);
      
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Job timed out after ${timeoutMs}ms`)), timeoutMs);
      });
      
      // Create the actual processing promise
      const processingPromise = (async () => {
        let result;
        
        switch (job.jobType) {
          case 'product_creation':
            result = await this.processProductCreation(job);
            break;
          case 'ingredient_parsing':
            result = await this.processIngredientParsing(job);
            break;
          case 'product_photo_upload':
            result = await this.processProductPhotoUpload(job);
            break;
          default:
            throw new Error(`Unknown job type: ${job.jobType}`);
        }
        
        return result;
      })();
      
      // Race between processing and timeout
      const result = await Promise.race([processingPromise, timeoutPromise]);
      
      console.log(`✅ [BackgroundQueue] Job ${job.id.slice(-6)} completed successfully. Result type: ${typeof result}, has error: ${result?.error ? 'yes' : 'no'}`);
      
      // Job completed successfully
      job.status = 'completed';
      job.completedAt = new Date();
      job.resultData = result;
      
      try {
        await this.moveJobToCompleted(job);
        console.log(`📦 [BackgroundQueue] Job ${job.id.slice(-6)} moved to completed storage`);
      } catch (error) {
        console.error(`📦 [BackgroundQueue] Error moving job ${job.id.slice(-6)} to completed:`, error);
        // Continue anyway - we don't want to lose the job
      }
      
      // Always remove from active queue, even if moveJobToCompleted failed
      this.removeJobFromQueue(job.id);
      console.log(`📋 [BackgroundQueue] Job ${job.id.slice(-6)} removed from active queue. Active queue now has ${this.jobs.length} jobs`);
      
      // CRITICAL: Save the updated active jobs to storage IMMEDIATELY after removal
      await this.saveJobsToStorage();
      console.log(`💾 [BackgroundQueue] Updated active jobs saved to storage after job ${job.id.slice(-6)} completion`);
      
      console.log(`🎉 [BackgroundQueue] *** EMITTING JOB_COMPLETED EVENT ***`);
      console.log(`🎉 [BackgroundQueue] Event details:`, {
        jobId: job.id?.slice(-8) || 'NO_ID',
        jobType: job.jobType,
        upc: job.upc,
        status: job.status,
        timestamp: new Date().toISOString(),
        hasResultData: !!job.resultData,
        resultDataKeys: job.resultData ? Object.keys(job.resultData) : [],
        resultSuccess: job.resultData?.success,
        resultImageUrl: job.resultData?.imageUrl
      });
      
      this.emit('job_completed', job);
      console.log(`📡 [BackgroundQueue] job_completed event emitted for job ${job.id.slice(-6)}`);
      
      // Send local notification (non-blocking)
      this.sendLocalNotification(job, 'completed').catch(error => {
        console.error(`📱 [BackgroundQueue] Error sending notification for job ${job.id.slice(-6)}:`, error);
      });
      
    } catch (error) {
      console.error(`❌ [BackgroundQueue] Job ${job.id.slice(-6)} failed:`, error);
      
      // Handle retry logic
      if (job.retryCount < job.maxRetries) {
        console.log(`🔄 [BackgroundQueue] Retrying job ${job.id.slice(-6)} (attempt ${job.retryCount + 1}/${job.maxRetries})`);
        
        job.status = 'queued';
        job.retryCount++;
        job.errorMessage = (error as Error).message;
        
        // Exponential backoff: schedule retry
        const delay = Math.pow(2, job.retryCount) * 1000; // 2s, 4s, 8s
        console.log(`⏰ [BackgroundQueue] Scheduling retry for job ${job.id.slice(-6)} in ${delay}ms`);
        setTimeout(() => this.processNextJob(), delay);
        
      } else {
        console.log(`💀 [BackgroundQueue] Job ${job.id.slice(-6)} failed permanently after ${job.maxRetries} retries`);
        
        // Max retries reached, mark as failed
        job.status = 'failed';
        job.completedAt = new Date();
        job.errorMessage = (error as Error).message;
        
        try {
          await this.moveJobToCompleted(job);
          console.log(`📦 [BackgroundQueue] Failed job ${job.id.slice(-6)} moved to completed storage`);
        } catch (moveError) {
          console.error(`📦 [BackgroundQueue] Error moving failed job ${job.id.slice(-6)} to completed:`, moveError);
          // Continue anyway - we don't want to lose the job
        }
        
        // Always remove from active queue, even if moveJobToCompleted failed
        this.removeJobFromQueue(job.id);
        console.log(`📋 [BackgroundQueue] Failed job ${job.id.slice(-6)} removed from active queue. Active queue now has ${this.jobs.length} jobs`);
        
        // CRITICAL: Save the updated active jobs to storage IMMEDIATELY after removal
        await this.saveJobsToStorage();
        console.log(`💾 [BackgroundQueue] Updated active jobs saved to storage after job ${job.id.slice(-6)} failure`);
        
        console.log(`💥 [BackgroundQueue] *** EMITTING JOB_FAILED EVENT ***`);
        console.log(`💥 [BackgroundQueue] Failed job details:`, {
          jobId: job.id?.slice(-8) || 'NO_ID',
          jobType: job.jobType,
          upc: job.upc,
          status: job.status,
          timestamp: new Date().toISOString(),
          errorMessage: job.errorMessage,
          retryCount: job.retryCount,
          maxRetries: job.maxRetries
        });
        
        this.emit('job_failed', job);
        console.log(`📡 [BackgroundQueue] job_failed event emitted for job ${job.id.slice(-6)}`);
        
        // Send failure notification (non-blocking)
        this.sendLocalNotification(job, 'failed').catch(notificationError => {
          console.error(`📱 [BackgroundQueue] Error sending failure notification for job ${job.id.slice(-6)}:`, notificationError);
        });
      }
      
      // NOTE: saveJobsToStorage() is now called immediately after removeJobFromQueue() above
      // to ensure storage is consistent and prevent race conditions
      this.emit('job_updated', job);
    }
  }

  /**
   * Process product creation job
   */
  private async processProductCreation(job: BackgroundJob): Promise<any> {
    // This will use the existing ProductCreationService
    const { ProductCreationService } = await import('./productCreationService');
    
    // Convert image to base64 if not already done
    if (!job.imageBase64) {
      const base64 = await FileSystem.readAsStringAsync(job.imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      job.imageBase64 = base64;
    }
    
    const result = await ProductCreationService.createProductFromPhoto(
      job.imageBase64,
      job.upc,
      job.imageUri,
      {
        workflowId: job.workflowId,
        workflowType: job.workflowType
      }
    );
    
    return result;
  }

  /**
   * Process ingredient parsing job
   */
  private async processIngredientParsing(job: BackgroundJob): Promise<any> {
    // This will use the existing IngredientOCRService
    const { IngredientOCRService } = await import('./ingredientOCRService');
    
    if (!job.imageBase64) {
      const base64 = await FileSystem.readAsStringAsync(job.imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      job.imageBase64 = base64;
    }
    
    const result = await IngredientOCRService.parseIngredientsFromImage(
      job.imageBase64,
      job.upc,
      job.existingProductData
    );
    
    return result;
  }

  /**
   * Process product photo upload job
   */
  private async processProductPhotoUpload(job: BackgroundJob): Promise<any> {
    console.log(`📸 [BackgroundQueue] *** PROCESSING PHOTO UPLOAD JOB ***`);
    console.log(`📸 [BackgroundQueue] Job ID: ${job.id.slice(-6)}`);
    console.log(`📸 [BackgroundQueue] UPC: ${job.upc}`);
    console.log(`📸 [BackgroundQueue] Image URI: ${job.imageUri}`);
    console.log(`📸 [BackgroundQueue] Processing timestamp:`, new Date().toISOString());
    
    // Import ProductImageUploadService statically to avoid module loading issues
    const { ProductImageUploadService } = require('./productImageUploadService');
    
    console.log(`📸 [BackgroundQueue] Step 1: Uploading image to storage...`);
    
    // Upload image and get URL
    const uploadResult = await ProductImageUploadService.uploadProductImage(job.imageUri, job.upc);
    
    console.log(`📸 [BackgroundQueue] Step 2: Image upload result:`, {
      success: uploadResult.success,
      imageUrl: uploadResult.imageUrl,
      error: uploadResult.error
    });
    
    if (!uploadResult.success || !uploadResult.imageUrl) {
      const errorMessage = uploadResult.error || 'Failed to upload image';
      console.error(`❌ [BackgroundQueue] Image upload failed: ${errorMessage}`);
      throw new Error(errorMessage);
    }
    
    console.log(`📸 [BackgroundQueue] Step 3: Updating database with new image URL...`);
    console.log(`📸 [BackgroundQueue] New image URL: ${uploadResult.imageUrl}`);
    
    // Update the database with the new image URL and get full response
    const updateResult = await ProductImageUploadService.updateProductImageUrlWithResponse(job.upc, uploadResult.imageUrl);
    
    console.log(`📸 [BackgroundQueue] Step 4: Database update result:`, {
      success: updateResult.success,
      hasUpdatedProduct: !!updateResult.updatedProduct,
      upc: job.upc,
      imageUrl: uploadResult.imageUrl
    });
    
    if (!updateResult.success) {
      const errorMessage = updateResult.error || 'Image uploaded but failed to update product record';
      console.error(`❌ [BackgroundQueue] Database update failed: ${errorMessage}`);
      throw new Error(errorMessage);
    }
    
    const result = {
      success: true,
      imageUrl: uploadResult.imageUrl,
      updatedProduct: updateResult.updatedProduct, // Include the full product data!
    };
    
    console.log(`✅ [BackgroundQueue] Photo upload job completed successfully:`, result);
    console.log(`✅ [BackgroundQueue] Final result will trigger cache invalidation`);
    
    return result;
  }

  /**
   * Send local notification for job completion/failure
   */
  private async sendLocalNotification(job: BackgroundJob, type: 'completed' | 'failed'): Promise<void> {
    // TODO: Implement with expo-notifications
    // This is stubbed for now as requested
    
    const notification = {
      jobId: job.id,
      type: type === 'completed' ? 'job_completed' : 'job_failed',
      title: this.getNotificationTitle(job, type),
      body: this.getNotificationBody(job, type),
      data: {
        jobId: job.id,
        jobType: job.jobType,
        upc: job.upc,
        resultData: job.resultData,
      }
    };
    
    console.log(`Would send notification: ${notification.type} for job ${notification.jobId} (${job.jobType})`);
    
    // TODO: Replace with actual notification sending
    // await Notifications.scheduleNotificationAsync({
    //   content: {
    //     title: notification.title,
    //     body: notification.body,
    //     data: notification.data,
    //   },
    //   trigger: null, // Show immediately
    // });
  }

  private getNotificationTitle(job: BackgroundJob, type: 'completed' | 'failed'): string {
    if (type === 'failed') {
      return 'Photo Processing Failed';
    }
    
    switch (job.jobType) {
      case 'product_creation':
        return 'New Product Added!';
      case 'ingredient_parsing':
        return 'Ingredients Updated!';
      case 'product_photo_upload':
        return 'Photo Uploaded!';
      default:
        return 'Processing Complete!';
    }
  }

  private getNotificationBody(job: BackgroundJob, type: 'completed' | 'failed'): string {
    if (type === 'failed') {
      return `Failed to process ${job.jobType.replace('_', ' ')} for ${job.upc}. Tap to retry.`;
    }
    
    switch (job.jobType) {
      case 'product_creation':
        return `Successfully created product for barcode ${job.upc}`;
      case 'ingredient_parsing':
        return `Ingredients analyzed for ${job.upc}`;
      case 'product_photo_upload':
        return `Photo uploaded for ${job.upc}`;
      default:
        return `Processing completed for ${job.upc}`;
    }
  }

  private getEstimatedProcessingTime(jobType: JobType): number {
    // Estimated processing times in milliseconds
    switch (jobType) {
      case 'product_creation':
        return 30000; // 30 seconds
      case 'ingredient_parsing':
        return 20000; // 20 seconds
      case 'product_photo_upload':
        return 10000; // 10 seconds
      default:
        return 15000; // 15 seconds
    }
  }

  private async loadJobsFromStorage(): Promise<void> {
    try {
      console.log(`💾 [BackgroundQueue] Loading jobs from AsyncStorage`);
      const jobsJson = await AsyncStorage.getItem(STORAGE_KEY_JOBS);
      if (jobsJson) {
        const jobsData = JSON.parse(jobsJson);
        
        // Validate and filter jobs
        const validJobs = (Array.isArray(jobsData) ? jobsData : [])
          .filter((job: any) => {
            // Check if job has required fields
            if (!job || !job.id || !job.jobType || !job.status || !job.upc) {
              console.warn(`💾 [BackgroundQueue] Skipping invalid job:`, job);
              return false;
            }
            
            // CRITICAL: Only load jobs that should be in active queue
            // Completed, failed, or cancelled jobs should NOT be in active storage
            if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
              console.warn(`💾 [BackgroundQueue] Skipping completed/failed job from active storage: ${job.id?.slice(-6)} (${job.status})`);
              return false;
            }
            
            return true;
          })
          .map((job: any) => ({
            ...job,
            createdAt: job.createdAt ? new Date(job.createdAt) : new Date(),
            startedAt: job.startedAt ? new Date(job.startedAt) : undefined,
            completedAt: job.completedAt ? new Date(job.completedAt) : undefined,
            estimatedCompletionAt: job.estimatedCompletionAt ? new Date(job.estimatedCompletionAt) : undefined,
          }));
        
        this.jobs = validJobs;
        console.log(`💾 [BackgroundQueue] Loaded ${this.jobs.length} valid jobs:`, 
          this.jobs.map(j => `${j.id.slice(-6)} (${j.jobType}, ${j.status}, upc:${j.upc})`));
        
        // If we had to filter out some jobs, save the cleaned data
        if (validJobs.length !== jobsData.length) {
          console.log(`💾 [BackgroundQueue] Cleaned up storage (removed ${jobsData.length - validJobs.length} invalid/completed jobs)`);
          await this.saveJobsToStorage();
        }
      } else {
        console.log(`💾 [BackgroundQueue] No jobs found in storage`);
        this.jobs = [];
      }
    } catch (error) {
      console.error('💾 [BackgroundQueue] Error loading jobs from storage:', error);
      console.log('💾 [BackgroundQueue] Clearing corrupted storage');
      this.jobs = [];
      // Clear corrupted storage
      await AsyncStorage.removeItem(STORAGE_KEY_JOBS);
    }
  }

  private async saveJobsToStorage(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_JOBS, JSON.stringify(this.jobs));
    } catch (error) {
      console.error('Error saving jobs to storage:', error);
    }
  }


  private async moveJobToCompleted(job: BackgroundJob): Promise<void> {
    try {
      console.log(`📦 [BackgroundQueue] Moving job ${job.id.slice(-6)} to completed storage`);
      const completedJobs = await this.getCompletedJobsFromStorage();
      completedJobs.unshift(job); // Add to beginning
      
      // Keep only the most recent completed jobs
      const trimmedJobs = completedJobs.slice(0, MAX_COMPLETED_JOBS);
      
      await AsyncStorage.setItem(STORAGE_KEY_COMPLETED_JOBS, JSON.stringify(trimmedJobs));
      console.log(`📦 [BackgroundQueue] Job ${job.id.slice(-6)} stored in completed jobs (${trimmedJobs.length} total)`);
    } catch (error) {
      console.error(`📦 [BackgroundQueue] Error moving job ${job.id.slice(-6)} to completed:`, error);
    }
  }

  private removeJobFromQueue(jobId: string): void {
    const beforeCount = this.jobs.length;
    console.log(`🗑️ [BackgroundQueue] Attempting to remove job ${jobId.slice(-6)} from active queue (${beforeCount} jobs total)`);
    
    // Remove ALL instances of this job ID (in case of duplicates)
    let removedCount = 0;
    this.jobs = this.jobs.filter(job => {
      if (job.id === jobId) {
        removedCount++;
        console.log(`🗑️ [BackgroundQueue] Removing job instance ${jobId.slice(-6)} (status: ${job.status})`);
        return false;
      }
      return true;
    });
    
    const afterCount = this.jobs.length;
    if (removedCount > 0) {
      console.log(`✅ [BackgroundQueue] Removed ${removedCount} instance(s) of job ${jobId.slice(-6)}. Queue: ${beforeCount} -> ${afterCount} jobs`);
    } else {
      console.log(`⚠️ [BackgroundQueue] Job ${jobId.slice(-6)} not found in active queue (${beforeCount} jobs)`);
      // Debug: Log what jobs ARE in the queue
      if (this.jobs.length > 0) {
        console.log(`🔍 [BackgroundQueue] Current active jobs:`, 
          this.jobs.map(j => `${j.id.slice(-6)} (${j.jobType}, ${j.status})`));
      }
    }
  }

  private async resumeInterruptedJobs(): Promise<void> {
    // Reset any jobs that were processing when the app was closed
    const processingJobs = this.jobs.filter(job => job.status === 'processing');
    
    for (const job of processingJobs) {
      job.status = 'queued';
      job.startedAt = undefined;
    }
    
    if (processingJobs.length > 0) {
      await this.saveJobsToStorage();
      
      // Start processing after a short delay
      setTimeout(() => this.processNextJob(), 2000);
    }
  }

  /**
   * Subscribe to job updates
   */
  subscribeToJobUpdates(callback: (event: string, job?: BackgroundJob) => void): () => void {
    const events = ['job_added', 'job_updated', 'job_completed', 'job_failed', 'jobs_cleared'];
    
    console.log(`📡 [BackgroundQueue] *** SETTING UP EVENT SUBSCRIPTION ***`);
    console.log(`📡 [BackgroundQueue] Registering listener for events:`, events);
    console.log(`📡 [BackgroundQueue] Callback function:`, callback?.name || 'anonymous');
    console.log(`📡 [BackgroundQueue] Subscription timestamp:`, new Date().toISOString());
    
    // Create a wrapper callback to add debugging
    const debugCallback = (event: string, job?: BackgroundJob) => {
      console.log(`📡 [BackgroundQueue] *** EVENT FIRED: ${event} ***`);
      console.log(`📡 [BackgroundQueue] Event timestamp:`, new Date().toISOString());
      if (job) {
        console.log(`📡 [BackgroundQueue] Job details:`, {
          jobId: job.id?.slice(-8) || 'NO_ID',
          jobType: job.jobType,
          upc: job.upc,
          status: job.status
        });
      }
      console.log(`📡 [BackgroundQueue] Calling original callback...`);
      
      try {
        callback(event, job);
        console.log(`📡 [BackgroundQueue] Callback executed successfully for ${event}`);
      } catch (error) {
        console.error(`📡 [BackgroundQueue] Error in callback for ${event}:`, error);
      }
    };
    
    events.forEach(event => {
      if (event === 'jobs_cleared') {
        this.on(event, () => {
          console.log(`📡 [BackgroundQueue] ${event} event listener triggered`);
          debugCallback(event);
        });
      } else {
        this.on(event, (job: BackgroundJob) => {
          console.log(`📡 [BackgroundQueue] ${event} event listener triggered for job ${job.id?.slice(-6)}`);
          debugCallback(event, job);
        });
      }
    });
    
    console.log(`📡 [BackgroundQueue] Event subscription setup complete`);
    
    return () => {
      console.log(`📡 [BackgroundQueue] Unsubscribing from events:`, events);
      events.forEach(event => {
        this.off(event, debugCallback);
      });
    };
  }

  /**
   * Clear all completed jobs
   */
  async clearCompletedJobs(): Promise<void> {
    console.log(`🧹 [BackgroundQueue] Clearing all completed jobs`);
    await AsyncStorage.removeItem(STORAGE_KEY_COMPLETED_JOBS);
  }

  /**
   * Clear ALL jobs (active and completed) - for debugging only
   */
  async clearAllJobs(): Promise<void> {
    console.log(`🧹 [BackgroundQueue] CLEARING ALL JOBS (active and completed)`);
    
    // Clear memory
    this.jobs = [];
    this.processingJobs.clear();
    
    // Clear storage
    await AsyncStorage.removeItem(STORAGE_KEY_JOBS);
    await AsyncStorage.removeItem(STORAGE_KEY_COMPLETED_JOBS);
    
    console.log(`🧹 [BackgroundQueue] All jobs cleared from memory and storage`);
    
    // Emit update to refresh UI
    this.emit('jobs_cleared');
  }

  /**
   * Get current job count immediately (for debugging)
   */
  getJobCount(): { active: number; processing: number; total: number } {
    const active = this.jobs.filter(job => job.status === 'queued').length;
    const processing = this.jobs.filter(job => job.status === 'processing').length;
    return {
      active,
      processing, 
      total: this.jobs.length
    };
  }

  /**
   * Debug function to inspect current storage state
   */
  async debugStorageState(): Promise<void> {
    console.log(`🔍 [BackgroundQueue] === DEBUG STORAGE STATE ===`);
    
    try {
      const activeJobsJson = await AsyncStorage.getItem(STORAGE_KEY_JOBS);
      const completedJobsJson = await AsyncStorage.getItem(STORAGE_KEY_COMPLETED_JOBS);
      
      console.log(`🔍 Active jobs storage:`, activeJobsJson ? JSON.parse(activeJobsJson).length + ' jobs' : 'null');
      console.log(`🔍 Completed jobs storage:`, completedJobsJson ? JSON.parse(completedJobsJson).length + ' jobs' : 'null');
      console.log(`🔍 Memory jobs:`, this.jobs.length);
      console.log(`🔍 Processing jobs:`, Array.from(this.processingJobs));
      
      if (activeJobsJson) {
        const activeJobs = JSON.parse(activeJobsJson);
        activeJobs.forEach((job: any, index: number) => {
          console.log(`🔍 Active job ${index}:`, {
            id: job.id?.slice(-8) || 'NO_ID',
            type: job.jobType || 'NO_TYPE',
            status: job.status || 'NO_STATUS',
            upc: job.upc || 'NO_UPC',
            created: job.createdAt,
            started: job.startedAt,
            completed: job.completedAt
          });
        });
      }
      
    } catch (error) {
      console.error(`🔍 Error debugging storage:`, error);
    }
    
    console.log(`🔍 [BackgroundQueue] === END DEBUG ===`);
  }

  /**
   * Force complete or fail all stuck processing jobs
   */
  async cleanupStuckJobs(): Promise<number> {
    await this.initialize();
    
    const stuckJobs = this.jobs.filter(job => {
      if (job.status === 'processing') {
        // Job is marked as processing but not actually being processed
        if (!this.processingJobs.has(job.id)) {
          // Only consider it stuck if it's been processing for a reasonable amount of time
          // This prevents cleanup of jobs that completed but weren't properly cleaned up
          const timeSinceStarted = job.startedAt ? (Date.now() - job.startedAt.getTime()) : 0;
          
          if (timeSinceStarted > 120000) { // 2 minutes instead of immediately marking as stuck
            console.log(`🧹 [BackgroundQueue] Found orphaned processing job: ${job.id.slice(-6)} (${Math.round(timeSinceStarted / 1000)}s old)`);
            return true;
          } else {
            console.log(`🧹 [BackgroundQueue] Skipping recent orphaned job: ${job.id.slice(-6)} (${Math.round(timeSinceStarted / 1000)}s old)`);
            return false;
          }
        }
        
        // Job has been processing for too long (increased timeout)
        if (job.startedAt && (Date.now() - job.startedAt.getTime()) > 300000) { // 5 minutes instead of 10 seconds
          console.log(`🧹 [BackgroundQueue] Found timed-out processing job: ${job.id.slice(-6)}`);
          return true;
        }
      }
      return false;
    });
    
    console.log(`🧹 [BackgroundQueue] Found ${stuckJobs.length} stuck jobs`);
    
    for (const job of stuckJobs) {
      console.log(`🧹 [BackgroundQueue] Cleaning up stuck job ${job.id.slice(-6)}: ${job.jobType}`);
      
      // Instead of always marking as failed, try to determine if job actually completed
      // Check if the job has result data, which would indicate it completed successfully
      if (job.resultData && !job.resultData.error) {
        console.log(`🧹 [BackgroundQueue] Job ${job.id.slice(-6)} has result data, marking as completed instead of failed`);
        job.status = 'completed';
        job.completedAt = new Date();
        
        // Move to completed and emit success event
        await this.moveJobToCompleted(job);
        this.removeJobFromQueue(job.id);
        this.emit('job_completed', job);
      } else {
        // Only mark as failed if we're confident it actually failed
        job.status = 'failed';
        job.completedAt = new Date();
        job.errorMessage = 'Job was stuck in processing state and was automatically cleaned up';
        
        // Move to completed
        await this.moveJobToCompleted(job);
        this.removeJobFromQueue(job.id);
        this.emit('job_failed', job);
      }
      
      // Remove from processing set
      this.processingJobs.delete(job.id);
    }
    
    if (stuckJobs.length > 0) {
      // Save active jobs to storage after cleanup
      await this.saveJobsToStorage();
      console.log(`🧹 [BackgroundQueue] Cleaned up ${stuckJobs.length} stuck jobs and updated storage`);
    }
    
    return stuckJobs.length;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    total: number;
    queued: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    await this.initialize();
    
    const completedJobs = await this.getCompletedJobs();
    const allJobs = [...this.jobs, ...completedJobs];
    
    return {
      total: allJobs.length,
      queued: this.jobs.filter(job => job.status === 'queued').length,
      processing: this.jobs.filter(job => job.status === 'processing').length,
      completed: completedJobs.filter(job => job.status === 'completed').length,
      failed: completedJobs.filter(job => job.status === 'failed').length,
    };
  }
}

export const backgroundQueueService = new BackgroundQueueServiceClass();