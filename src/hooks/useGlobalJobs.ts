/**
 * Hook that reads from global jobs state
 * This ensures all components see the same job data
 */

import { useState, useEffect } from 'react';
import { BackgroundJob } from '../types/backgroundJobs';
import { globalJobsState } from '../services/GlobalJobsState';

export const useGlobalJobs = () => {
  const [activeJobs, setActiveJobs] = useState<BackgroundJob[]>([]);
  const [completedJobs, setCompletedJobs] = useState<BackgroundJob[]>([]);

  useEffect(() => {
    // Initial load
    setActiveJobs(globalJobsState.getActiveJobs());
    setCompletedJobs(globalJobsState.getCompletedJobs());

    // Subscribe to updates
    const unsubscribe = globalJobsState.subscribe(() => {
      setActiveJobs(globalJobsState.getActiveJobs());
      setCompletedJobs(globalJobsState.getCompletedJobs());
    });

    return unsubscribe;
  }, []);

  return { activeJobs, completedJobs };
};