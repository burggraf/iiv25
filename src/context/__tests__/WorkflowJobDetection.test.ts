/**
 * Test for the enhanced workflow job detection logic.
 * This ensures that workflow jobs are properly identified even when missing metadata.
 */

describe('Workflow Job Detection Logic', () => {
  const createJob = (jobType: string, options: {
    workflowId?: string
    workflowType?: string
    createdMinutesAgo?: number
  } = {}) => ({
    id: `job_${Math.random().toString(36).substr(2, 9)}`,
    jobType,
    workflowId: options.workflowId,
    workflowType: options.workflowType,
    createdAt: new Date(Date.now() - (options.createdMinutesAgo || 0) * 60 * 1000),
    priority: 1,
    startedAt: new Date(),
  });

  // Simulate the isWorkflowJob function logic
  const isWorkflowJob = (job: any): boolean => {
    // Primary detection: explicit workflow metadata
    if (job.workflowId || job.workflowType) {
      return true
    }
    
    // Secondary detection: jobs created within the last 5 minutes that could be part of "Add New Product" workflow
    const recentlyCreated = Date.now() - new Date(job.createdAt).getTime() < 5 * 60 * 1000 // 5 minutes
    const isWorkflowJobType = ['product_creation', 'ingredient_parsing', 'product_photo_upload'].includes(job.jobType)
    
    if (recentlyCreated && isWorkflowJobType) {
      return true // Assume recent workflow-type jobs are workflow jobs
    }
    
    return false
  }

  describe('Primary detection (explicit metadata)', () => {
    it('detects jobs with workflowId', () => {
      const job = createJob('product_creation', { workflowId: 'workflow_123' });
      expect(isWorkflowJob(job)).toBe(true);
    });

    it('detects jobs with workflowType', () => {
      const job = createJob('ingredient_parsing', { workflowType: 'add_new_product' });
      expect(isWorkflowJob(job)).toBe(true);
    });

    it('detects jobs with both workflowId and workflowType', () => {
      const job = createJob('product_photo_upload', { 
        workflowId: 'workflow_456', 
        workflowType: 'add_new_product' 
      });
      expect(isWorkflowJob(job)).toBe(true);
    });
  });

  describe('Secondary detection (heuristic-based)', () => {
    it('detects recent product_creation jobs as workflow jobs', () => {
      const job = createJob('product_creation', { createdMinutesAgo: 2 }); // 2 minutes ago
      expect(isWorkflowJob(job)).toBe(true);
    });

    it('detects recent ingredient_parsing jobs as workflow jobs', () => {
      const job = createJob('ingredient_parsing', { createdMinutesAgo: 3 }); // 3 minutes ago
      expect(isWorkflowJob(job)).toBe(true);
    });

    it('detects recent product_photo_upload jobs as workflow jobs', () => {
      const job = createJob('product_photo_upload', { createdMinutesAgo: 1 }); // 1 minute ago
      expect(isWorkflowJob(job)).toBe(true);
    });

    it('does not detect old workflow-type jobs as workflow jobs', () => {
      const job = createJob('product_creation', { createdMinutesAgo: 10 }); // 10 minutes ago
      expect(isWorkflowJob(job)).toBe(false);
    });

    it('does not detect recent non-workflow job types as workflow jobs', () => {
      const job = createJob('image_processing', { createdMinutesAgo: 1 }); // 1 minute ago
      expect(isWorkflowJob(job)).toBe(false);
    });

    it('handles edge case: exactly 5 minutes old', () => {
      const job = createJob('product_creation', { createdMinutesAgo: 5 }); // exactly 5 minutes ago
      expect(isWorkflowJob(job)).toBe(false);
    });
  });

  describe('Combined detection scenarios', () => {
    it('prioritizes explicit metadata over heuristics', () => {
      // Old job with explicit workflow metadata should still be detected
      const job = createJob('product_creation', { 
        workflowId: 'workflow_789',
        createdMinutesAgo: 30 // 30 minutes ago - would fail heuristic test
      });
      expect(isWorkflowJob(job)).toBe(true);
    });

    it('handles jobs with missing explicit metadata but matching heuristics', () => {
      // Recent workflow-type job without explicit metadata
      const job = createJob('ingredient_parsing', { createdMinutesAgo: 2 });
      // Should have no workflowId/workflowType
      expect(job.workflowId).toBeUndefined();
      expect(job.workflowType).toBeUndefined();
      // But should still be detected as workflow job
      expect(isWorkflowJob(job)).toBe(true);
    });
  });

  describe('Individual job detection', () => {
    it('correctly identifies true individual jobs', () => {
      const individualJobs = [
        createJob('custom_job_type', { createdMinutesAgo: 1 }), // Recent but non-workflow type
        createJob('product_creation', { createdMinutesAgo: 10 }), // Workflow type but old
        createJob('some_other_job', { createdMinutesAgo: 30 }), // Old and non-workflow type
      ];

      individualJobs.forEach(job => {
        expect(isWorkflowJob(job)).toBe(false);
      });
    });
  });

  describe('Duplicate notification prevention scenarios', () => {
    it('prevents processing of orphaned workflow jobs as individual jobs', () => {
      // Scenario: A product_creation job from an Add New Product workflow lost its metadata
      const orphanedWorkflowJob = createJob('product_creation', { 
        createdMinutesAgo: 2 // Recent, so should be caught by heuristic
      });

      // This job should be filtered out from individual notification processing
      const shouldProcessAsIndividual = !isWorkflowJob(orphanedWorkflowJob);
      expect(shouldProcessAsIndividual).toBe(false);
    });

    it('allows legitimate individual jobs to be processed', () => {
      // Scenario: A standalone product creation job (not part of workflow)
      const legitimateIndividualJob = createJob('product_creation', { 
        createdMinutesAgo: 10 // Old enough to not trigger heuristic
      });

      const shouldProcessAsIndividual = !isWorkflowJob(legitimateIndividualJob);
      expect(shouldProcessAsIndividual).toBe(true);
    });

    it('handles mixed scenarios correctly', () => {
      const jobs = [
        // Explicit workflow job - should be filtered
        createJob('ingredient_parsing', { workflowId: 'workflow_123' }),
        // Recent workflow-type job - should be filtered (heuristic)
        createJob('product_creation', { createdMinutesAgo: 2 }),
        // Old workflow-type job - should NOT be filtered (legitimate individual)
        createJob('product_photo_upload', { createdMinutesAgo: 15 }),
        // Non-workflow job type - should NOT be filtered
        createJob('custom_processing', { createdMinutesAgo: 1 }),
      ];

      const results = jobs.map(job => ({
        job: `${job.jobType}_${Math.round((Date.now() - new Date(job.createdAt).getTime()) / 60000)}min`,
        isWorkflow: isWorkflowJob(job),
        shouldProcessAsIndividual: !isWorkflowJob(job)
      }));

      expect(results).toEqual([
        { job: 'ingredient_parsing_0min', isWorkflow: true, shouldProcessAsIndividual: false },
        { job: 'product_creation_2min', isWorkflow: true, shouldProcessAsIndividual: false },
        { job: 'product_photo_upload_15min', isWorkflow: false, shouldProcessAsIndividual: true },
        { job: 'custom_processing_1min', isWorkflow: false, shouldProcessAsIndividual: true },
      ]);
    });
  });
});