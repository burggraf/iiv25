/**
 * Global Jobs State Singleton
 * Forces all components to share the same job data
 */

import { BackgroundJob } from '../types/backgroundJobs';

class GlobalJobsState {
  private static instance: GlobalJobsState;
  private activeJobs: BackgroundJob[] = [];
  private completedJobs: BackgroundJob[] = [];
  private listeners: Set<() => void> = new Set();

  static getInstance(): GlobalJobsState {
    if (!GlobalJobsState.instance) {
      GlobalJobsState.instance = new GlobalJobsState();
    }
    return GlobalJobsState.instance;
  }

  setActiveJobs(jobs: BackgroundJob[]) {
    this.activeJobs = jobs;
    this.notifyListeners();
  }

  setCompletedJobs(jobs: BackgroundJob[]) {
    this.completedJobs = jobs;
    this.notifyListeners();
  }

  getActiveJobs(): BackgroundJob[] {
    return this.activeJobs;
  }

  getCompletedJobs(): BackgroundJob[] {
    return this.completedJobs;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener());
  }
}

export const globalJobsState = GlobalJobsState.getInstance();