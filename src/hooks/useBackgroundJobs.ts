import { useState, useEffect, useCallback } from 'react';
import { BackgroundJob } from '../types/backgroundJobs';
import { backgroundQueueService } from '../services/backgroundQueueService';

export const useBackgroundJobs = () => {
  const [activeJobs, setActiveJobs] = useState<BackgroundJob[]>([]);
  const [completedJobs, setCompletedJobs] = useState<BackgroundJob[]>([]);
  const [loading, setLoading] = useState(true);

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
      
      const validCompletedJobs = (completed || [])
        .filter(job => job && job.id && job.status)
        .filter((job, index, array) => 
          // Keep only the first occurrence of each job ID  
          array.findIndex(j => j.id === job.id) === index
        );
      
      console.log(`[useBackgroundJobs] Refreshed jobs - Active: ${validActiveJobs.length}, Completed: ${validCompletedJobs.length}`);
      
      setActiveJobs(validActiveJobs);
      setCompletedJobs(validCompletedJobs);
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

    // Subscribe to job updates
    const unsubscribe = backgroundQueueService.subscribeToJobUpdates((event, job) => {
      if (event === 'jobs_cleared') {
        console.log(`Job update: ${event} - All jobs cleared`);
      } else if (job) {
        console.log(`Job update: ${event} - ${job.id.slice(-6)} (${job.jobType}, ${job.status})`);
      }
      refreshJobs(); // Refresh all jobs when any job updates
    });

    return unsubscribe;
  }, [refreshJobs]);

  const queueJob = useCallback(async (params: {
    jobType: 'product_creation' | 'ingredient_parsing' | 'product_photo_upload';
    imageUri: string;
    upc: string;
    existingProductData?: any;
    priority?: number;
  }) => {
    const job = await backgroundQueueService.queueJob(params);
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

    // Subscribe to job updates to refresh stats
    const unsubscribe = backgroundQueueService.subscribeToJobUpdates(() => {
      refreshStats();
    });

    return unsubscribe;
  }, [refreshStats]);

  return {
    stats,
    refreshStats,
  };
};