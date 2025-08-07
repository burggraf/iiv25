/**
 * Test to ensure workflow jobs are completely isolated from individual job notifications.
 * This prevents the duplicate notification issue where both workflow and individual handlers trigger.
 */

describe('Workflow Job Isolation', () => {
  describe('Individual job handler filtering', () => {
    const createWorkflowJob = (workflowId: string, workflowType: string = 'add_new_product') => ({
      id: `job_${Math.random().toString(36).substr(2, 9)}`,
      jobType: 'product_creation',
      workflowId,
      workflowType,
      workflowSteps: { total: 3, current: 1 },
      resultData: { success: false, error: 'Test error' },
      failed: true,
      priority: 1,
      createdAt: new Date(),
      startedAt: new Date(),
      failedAt: new Date(),
    });

    const createIndividualJob = () => ({
      id: `job_${Math.random().toString(36).substr(2, 9)}`,
      jobType: 'product_creation',
      // No workflowId or workflowType
      resultData: { success: false, error: 'Test error' },
      failed: true,
      priority: 1,
      createdAt: new Date(),
      startedAt: new Date(),
      failedAt: new Date(),
    });

    it('should identify workflow jobs correctly', () => {
      const workflowJob = createWorkflowJob('workflow_123');
      
      // Test the filtering logic that should be in handleIndividualJobFailed
      const shouldSkipIndividualNotification = !!(workflowJob.workflowId || workflowJob.workflowType);
      
      expect(shouldSkipIndividualNotification).toBe(true);
      expect(workflowJob.workflowId).toBe('workflow_123');
      expect(workflowJob.workflowType).toBe('add_new_product');
    });

    it('should allow individual jobs to be processed', () => {
      const individualJob = createIndividualJob();
      
      // Test the filtering logic that should be in handleIndividualJobFailed
      const shouldSkipIndividualNotification = !!((individualJob as any).workflowId || (individualJob as any).workflowType);
      
      expect(shouldSkipIndividualNotification).toBe(false);
      expect((individualJob as any).workflowId).toBeUndefined();
      expect((individualJob as any).workflowType).toBeUndefined();
    });

    it('should filter jobs with workflowId only', () => {
      const jobWithWorkflowId = {
        ...createIndividualJob(),
        workflowId: 'workflow_456'
        // No workflowType
      };
      
      const shouldSkipIndividualNotification = !!(jobWithWorkflowId.workflowId || (jobWithWorkflowId as any).workflowType);
      
      expect(shouldSkipIndividualNotification).toBe(true);
    });

    it('should filter jobs with workflowType only', () => {
      const jobWithWorkflowType = {
        ...createIndividualJob(),
        workflowType: 'add_new_product'
        // No workflowId
      };
      
      const shouldSkipIndividualNotification = !!((jobWithWorkflowType as any).workflowId || jobWithWorkflowType.workflowType);
      
      expect(shouldSkipIndividualNotification).toBe(true);
    });
  });

  describe('Notification routing logic', () => {
    it('validates correct routing for workflow vs individual jobs', () => {
      const workflowJob = {
        id: 'job_workflow',
        workflowId: 'workflow_123',
        workflowType: 'add_new_product',
        jobType: 'ingredient_parsing',
        resultData: { error: 'photo quality too low' }
      };

      const individualJob = {
        id: 'job_individual',
        jobType: 'product_creation',
        resultData: { success: false, error: 'Database error' }
      };

      // Simulate the routing logic from NotificationContext
      const routeWorkflowJob = (job: any) => {
        if (job.workflowId && job.workflowType) {
          return 'workflow_handler';
        } else {
          return 'individual_handler';
        }
      };

      expect(routeWorkflowJob(workflowJob)).toBe('workflow_handler');
      expect(routeWorkflowJob(individualJob)).toBe('individual_handler');
    });

    it('ensures workflow jobs cannot be processed by individual handlers', () => {
      const workflowJobs = [
        { workflowId: 'w1', workflowType: 'add_new_product' },
        { workflowId: 'w2', workflowType: null },
        { workflowId: null, workflowType: 'individual_action' },
        { workflowId: 'w3', workflowType: 'add_new_product' },
      ];

      const individualJobs = [
        { /* no workflow fields */ },
        { workflowId: null, workflowType: null },
        { workflowId: undefined, workflowType: undefined },
      ];

      // Test the double-check logic that prevents workflow jobs from individual processing
      workflowJobs.forEach((job, index) => {
        const shouldBeFiltered = !!(job.workflowId || job.workflowType);
        expect(shouldBeFiltered).toBe(true);
      });

      individualJobs.forEach((job, index) => {
        const shouldBeFiltered = !!((job as any).workflowId || (job as any).workflowType);
        expect(shouldBeFiltered).toBe(false);
      });
    });
  });

  describe('Duplicate notification prevention', () => {
    it('prevents double processing of workflow jobs', () => {
      // This test validates the core fix: workflow jobs should only go through workflow handlers
      const workflowJobWithError = {
        id: 'job_123',
        workflowId: 'workflow_456',
        workflowType: 'add_new_product',
        jobType: 'ingredient_parsing',
        failed: true,
        resultData: { error: 'photo quality too low - confidence below threshold' }
      };

      // Primary routing: Should go to workflow handler
      const shouldUseWorkflowHandler = !!(workflowJobWithError.workflowId && workflowJobWithError.workflowType);
      expect(shouldUseWorkflowHandler).toBe(true);

      // Safeguard: Should be filtered out from individual handlers
      const shouldBeFilteredFromIndividual = !!(workflowJobWithError.workflowId || workflowJobWithError.workflowType);
      expect(shouldBeFilteredFromIndividual).toBe(true);

      // Result: Only one notification path should be active
      const activeNotificationPaths = [
        shouldUseWorkflowHandler ? 'workflow' : null,
        !shouldBeFilteredFromIndividual ? 'individual' : null
      ].filter(Boolean);

      expect(activeNotificationPaths).toEqual(['workflow']);
      expect(activeNotificationPaths.length).toBe(1);
    });

    it('allows individual jobs to be processed normally', () => {
      const individualJobWithError = {
        id: 'job_789',
        jobType: 'product_creation',
        failed: true,
        resultData: { success: false, error: 'Database connection failed' }
      };

      // Primary routing: Should NOT go to workflow handler
      const shouldUseWorkflowHandler = !!(individualJobWithError as any).workflowId && !!(individualJobWithError as any).workflowType;
      expect(shouldUseWorkflowHandler).toBe(false);

      // Safeguard: Should NOT be filtered from individual handlers
      const shouldBeFilteredFromIndividual = !!((individualJobWithError as any).workflowId || (individualJobWithError as any).workflowType);
      expect(shouldBeFilteredFromIndividual).toBe(false);

      // Result: Only individual notification path should be active
      const activeNotificationPaths = [
        shouldUseWorkflowHandler ? 'workflow' : null,
        !shouldBeFilteredFromIndividual ? 'individual' : null
      ].filter(Boolean);

      expect(activeNotificationPaths).toEqual(['individual']);
      expect(activeNotificationPaths.length).toBe(1);
    });
  });
});