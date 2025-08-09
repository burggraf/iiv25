import { useState, useEffect, useCallback } from 'react';
import { BackgroundJob } from '../types/backgroundJobs';
import { backgroundQueueService } from '../services/backgroundQueueService';
import { historyService } from '../services/HistoryService';
import { cacheService } from '../services/CacheService';
import { Product } from '../types';
import { transformJobResultToProduct } from '../utils/jobResultTransform';
import { jobEventManager } from '../services/JobEventManager';
import { PhotoWorkflowType } from '../types/photoWorkflow';
import { globalJobsState } from '../services/GlobalJobsState';

export const useBackgroundJobs = () => {
  const [activeJobs, setActiveJobs] = useState<BackgroundJob[]>([]);
  const [completedJobs, setCompletedJobs] = useState<BackgroundJob[]>([]);
  const [loading, setLoading] = useState(true);

  // Handle job completion to set isNew flag
  const handleJobCompletion = useCallback(async (job: BackgroundJob) => {
    console.log(`🎣 [useBackgroundJobs] *** HANDLING INDIVIDUAL JOB COMPLETION ***`);
    console.log(`🎣 [useBackgroundJobs] Job: ${job.id?.slice(-6)}, Type: ${job.jobType}, UPC: ${job.upc}`);
    
    try {
      // Check if job was successful based on job type
      const isJobSuccessful = () => {
        if (!job.resultData || !job.upc) {
          return false;
        }
        
        switch (job.jobType) {
          case 'product_photo_upload':
            return job.resultData.success === true;
          case 'ingredient_parsing':
            return job.resultData.isValidIngredientsList === true;
          case 'product_creation':
            return job.resultData.success === true;
          default:
            return job.resultData.success === true;
        }
      };

      if (!isJobSuccessful()) {
        console.log(`🎣 [useBackgroundJobs] Job ${job.id?.slice(-6)} failed or missing UPC, not marking as new`);
        console.log(`🎣 [useBackgroundJobs] Job type: ${job.jobType}, result data:`, job.resultData);
        return;
      }

      console.log(`🎣 [useBackgroundJobs] *** HANDLING JOB COMPLETION FOR isNew FLAG ***`);
      console.log(`🎣 [useBackgroundJobs] Job type: ${job.jobType}, UPC: ${job.upc}`);

      if (job.jobType === 'product_photo_upload') {
        // Try to use job result data to avoid redundant lookup
        console.log(`🎣 [useBackgroundJobs] Photo upload completed - attempting to use job result data`);
        
        const productFromJobResult = await transformJobResultToProduct(job);
        let productToUse: Product;
        
        if (productFromJobResult) {
          console.log(`🎣 [useBackgroundJobs] Using job result data - avoiding redundant lookup`);
          // Add cache busting to the image URL if it's a Supabase image
          productToUse = addImageCacheBusting(productFromJobResult);
          console.log(`🎣 [useBackgroundJobs] Using product from job result with image URL: ${productToUse.imageUrl}`);
        } else {
          // RARE FALLBACK: Job result transformation failed - this should be uncommon now
          console.log(`🎣 [useBackgroundJobs] RARE FALLBACK: Job result transformation failed`);
          console.log(`🎣 [useBackgroundJobs] This may indicate an older edge function version or unexpected data format`);
          
          const { ProductLookupService } = await import('../services/productLookupService');
          const freshProductResult = await ProductLookupService.lookupProductByBarcode(job.upc, { 
            context: 'useBackgroundJobs photo completion (rare fallback)' 
          });
          
          if (!freshProductResult.product) {
            console.log(`🎣 [useBackgroundJobs] FALLBACK FAILED: Could not fetch fresh product data for ${job.upc} after photo upload`);
            return;
          }
          
          console.log(`🎣 [useBackgroundJobs] Fallback successful - fresh product fetched with image URL: ${freshProductResult.product.imageUrl}`);
          productToUse = addImageCacheBusting(freshProductResult.product);
        }
        
        console.log(`🎣 [useBackgroundJobs] Photo upload completed - updating product in history`);
        
        // Add to history with isNew flag set to true - let HistoryService decide based on recent viewing
        console.log(`🎣 [useBackgroundJobs] Adding product ${job.upc} to history with isNew=true after photo upload`);
        await historyService.addToHistory(productToUse, true, true);
        
        console.log(`✅ [useBackgroundJobs] Successfully updated ${job.upc} in history with updated image and isNew flag`);
        
      } else if (job.jobType === 'ingredient_parsing') {
        // Try to use job result data to avoid redundant lookup
        console.log(`🎣 [useBackgroundJobs] Ingredient parsing completed - attempting to use job result data`);
        
        const productFromJobResult = await transformJobResultToProduct(job);
        let productToUse: Product;
        
        if (productFromJobResult) {
          console.log(`🎣 [useBackgroundJobs] Using job result data - avoiding redundant lookup`);
          productToUse = productFromJobResult;
          console.log(`🎣 [useBackgroundJobs] Using product from job result with updated ingredients`);
        } else {
          // LEGACY FALLBACK: Should be rare now that edge function returns complete product data
          console.log(`🎣 [useBackgroundJobs] LEGACY FALLBACK: Job result transformation failed for ingredient parsing`);
          console.log(`🎣 [useBackgroundJobs] This may indicate an older edge function version or deployment lag`);
          
          const { ProductLookupService } = await import('../services/productLookupService');
          const freshProductResult = await ProductLookupService.lookupProductByBarcode(job.upc, { 
            context: 'useBackgroundJobs ingredient completion (legacy fallback)' 
          });
          
          if (!freshProductResult.product) {
            console.log(`🎣 [useBackgroundJobs] FALLBACK FAILED: Could not fetch fresh product data for ${job.upc} after ingredient parsing`);
            return;
          }
          
          console.log(`🎣 [useBackgroundJobs] Fallback successful - fresh product fetched with updated ingredients`);
          productToUse = freshProductResult.product;
        }
        
        console.log(`🎣 [useBackgroundJobs] Ingredient parsing completed - updating product in history`);
        
        // Add to history with isNew flag set to true - let HistoryService decide based on recent viewing
        console.log(`🎣 [useBackgroundJobs] Adding product ${job.upc} to history with isNew=true after ingredient parsing`);
        await historyService.addToHistory(productToUse, true, true);
        
        console.log(`✅ [useBackgroundJobs] Successfully updated ${job.upc} in history with updated ingredients and isNew flag`);
        
      } else {
        // For other job types, get the updated product from cache
        const updatedProduct = await cacheService.getProduct(job.upc);
        if (!updatedProduct) {
          console.log(`🎣 [useBackgroundJobs] Product ${job.upc} not found in cache after job completion`);
          return;
        }

        console.log(`🎣 [useBackgroundJobs] ${job.jobType} completed - updating product in history`);
        
        // Add to history with isNew flag set to true - let HistoryService decide based on recent viewing
        await historyService.addToHistory(updatedProduct, true, true);
        
        console.log(`✅ [useBackgroundJobs] Successfully updated ${job.upc} in history`);
      }
    } catch (error) {
      console.error(`❌ [useBackgroundJobs] Error handling job completion for ${job.upc}:`, error);
    }
  }, []);

  // Helper function to add cache busting to image URLs
  const addImageCacheBusting = (product: any): any => {
    const { ProductImageUrlService } = require('../services/productImageUrlService');
    
    if (!product.imageUrl) {
      return product;
    }

    const isSupabaseMarker = ProductImageUrlService.isSupabaseMarker(product.imageUrl);
    const isSupabaseUrl = ProductImageUrlService.isSupabaseImageUrl(product.imageUrl, product.barcode);
    
    if (isSupabaseMarker || isSupabaseUrl) {
      const timestamp = Date.now();
      let cacheBustedImageUrl;
      
      if (isSupabaseMarker) {
        cacheBustedImageUrl = `${ProductImageUrlService.getSupabaseMarker()}?t=${timestamp}`;
      } else {
        try {
          const url = new URL(product.imageUrl);
          url.searchParams.set('t', timestamp.toString());
          cacheBustedImageUrl = url.toString();
        } catch (error) {
          const separator = product.imageUrl.includes('?') ? '&' : '?';
          cacheBustedImageUrl = `${product.imageUrl}${separator}t=${timestamp}`;
        }
      }
      
      return {
        ...product,
        imageUrl: cacheBustedImageUrl
      };
    }
    
    return product;
  };

  const refreshJobs = useCallback(async () => {
    try {
      // Load active and completed jobs separately for better performance
      const [active, completed] = await Promise.all([
        backgroundQueueService.getActiveJobs(),
        backgroundQueueService.getCompletedJobs()
      ]);
      
      // Filter out any null or invalid jobs and deduplicate by job ID
      const validActiveJobs = (active || [])
        .filter(job => job && job.id && job.status)
        .filter((job, index, array) => 
          // Keep only the first occurrence of each job ID
          array.findIndex(j => j.id === job.id) === index
        );
        
      // DEBUGGING: Special logging for report issue jobs
      const reportIssueJobs = validActiveJobs.filter(job => 
        job.workflowType === 'report_product_issue' || job.workflowType === 'report_ingredients_issue'
      );
      if (reportIssueJobs.length > 0) {
        console.log(`🚨 [DEBUG] FOUND ${reportIssueJobs.length} REPORT ISSUE JOBS IN ACTIVE LIST:`, 
          reportIssueJobs.map(job => ({
            id: job.id?.slice(-6),
            workflowType: job.workflowType,
            jobType: job.jobType,
            status: job.status,
            upc: job.upc
          }))
        );
      }
      
      const validCompletedJobs = (completed || [])
        .filter(job => job && job.id && job.status)
        .filter((job, index, array) => 
          // Keep only the first occurrence of each job ID  
          array.findIndex(j => j.id === job.id) === index
        );
      
      console.log(`[useBackgroundJobs] Refreshed jobs - Active: ${validActiveJobs.length}, Completed: ${validCompletedJobs.length}`);
      
      setActiveJobs(validActiveJobs);
      setCompletedJobs(validCompletedJobs);
      
      // CRITICAL FIX: Update global state so all components see the same jobs
      globalJobsState.setActiveJobs(validActiveJobs);
      globalJobsState.setCompletedJobs(validCompletedJobs);
    } catch (error) {
      console.error('Error refreshing jobs:', error);
      // Set empty arrays on error to prevent crashes
      setActiveJobs([]);
      setCompletedJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load - only run cleanup if there are stuck jobs
    const loadJobs = async () => {
      await refreshJobs();
      
      // Only run cleanup if we find actual stuck jobs (processing jobs not in processingJobs set)
      const activeJobs = await backgroundQueueService.getActiveJobs();
      const hasStuckJobs = activeJobs.some(job => 
        job.status === 'processing' && 
        job.startedAt && 
        (Date.now() - job.startedAt.getTime()) > 120000 // 2 minutes
      );
      
      if (hasStuckJobs) {
        console.log('Found stuck jobs, running cleanup...');
        await backgroundQueueService.cleanupStuckJobs();
        // Refresh again after cleanup
        await refreshJobs();
      }
    };
    
    loadJobs();

    // Subscribe to job updates via central manager
    const unsubscribe = jobEventManager.subscribe('useBackgroundJobs', (event, job) => {
      if (__DEV__) {
        console.log(`🎣 [useBackgroundJobs] EVENT: ${event} | Job: ${job?.id?.slice(-6) || 'none'}`);
      }
      
      if (event === 'jobs_cleared') {
        if (__DEV__) console.log(`🎣 [useBackgroundJobs] All jobs cleared`);
      } else if (job) {
        if (event === 'job_completed') {
          if (__DEV__) console.log(`🎣 [useBackgroundJobs] JOB COMPLETED: ${job.jobType}`);
          
          // CRITICAL FIX: Skip individual job processing for ALL workflow jobs
          // Workflow jobs are handled exclusively by NotificationContext to prevent duplicate history updates
          if (job.workflowId && job.workflowType) {
            if (__DEV__) console.log(`🎣 [useBackgroundJobs] Workflow job ${job.id?.slice(-6)} - skipping history processing`);
          } else {
            if (__DEV__) console.log(`🎣 [useBackgroundJobs] Individual job - processing for history updates`);
            // Handle different job types that should mark items as new
            handleJobCompletion(job);
          }
        }
      }
      
      refreshJobs(); // Refresh all jobs when any job updates
    });

    return unsubscribe;
  }, [refreshJobs, handleJobCompletion]);

  const queueJob = useCallback(async (params: {
    jobType: 'product_creation' | 'ingredient_parsing' | 'product_photo_upload';
    imageUri: string;
    upc: string;
    existingProductData?: any;
    priority?: number;
    // Workflow fields
    workflowId?: string;
    workflowType?: PhotoWorkflowType | 'individual_action';
    workflowSteps?: { total: number; current: number };
  }) => {
    // DEBUGGING: Special logging for report issue jobs
    if (params.workflowType === 'report_product_issue' || params.workflowType === 'report_ingredients_issue') {
      console.log(`🚨 [DEBUG] QUEUING REPORT ISSUE JOB:`, {
        workflowType: params.workflowType,
        jobType: params.jobType,
        upc: params.upc,
        workflowId: params.workflowId
      });
    }
    
    const job = await backgroundQueueService.queueJob(params);
    
    // DEBUGGING: Log the returned job for report issues
    if (params.workflowType === 'report_product_issue' || params.workflowType === 'report_ingredients_issue') {
      console.log(`🚨 [DEBUG] REPORT ISSUE JOB QUEUED:`, {
        id: job?.id?.slice(-6),
        status: job?.status,
        jobType: job?.jobType,
        workflowType: job?.workflowType
      });
    }
    
    // Don't call refreshJobs() here - the 'job_added' event will trigger it automatically
    return job;
  }, []);

  const cancelJob = useCallback(async (jobId: string) => {
    const success = await backgroundQueueService.cancelJob(jobId);
    // Don't call refreshJobs() here - the job events will trigger it automatically
    return success;
  }, []);

  const retryJob = useCallback(async (jobId: string) => {
    const success = await backgroundQueueService.retryJob(jobId);
    // Don't call refreshJobs() here - the job events will trigger it automatically  
    return success;
  }, []);

  const clearCompletedJobs = useCallback(async () => {
    await backgroundQueueService.clearCompletedJobs();
    await refreshJobs();
  }, [refreshJobs]);

  const clearAllJobs = useCallback(async () => {
    await backgroundQueueService.clearAllJobs();
    await refreshJobs();
  }, [refreshJobs]);

  return {
    activeJobs,
    completedJobs,
    loading,
    queueJob,
    cancelJob,
    retryJob,
    clearCompletedJobs,
    clearAllJobs,
    refreshJobs,
  };
};

export const useBackgroundJobStats = () => {
  const [stats, setStats] = useState({
    total: 0,
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  });

  const refreshStats = useCallback(async () => {
    try {
      const newStats = await backgroundQueueService.getQueueStats();
      setStats(newStats);
    } catch (error) {
      console.error('Error refreshing job stats:', error);
    }
  }, []);

  useEffect(() => {
    refreshStats();

    // Subscribe to job updates to refresh stats via central manager
    const unsubscribe = jobEventManager.subscribe('useBackgroundJobStats', () => {
      refreshStats();
    });

    return unsubscribe;
  }, [refreshStats]);

  return {
    stats,
    refreshStats,
  };
};