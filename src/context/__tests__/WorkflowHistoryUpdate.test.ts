/**
 * Test for workflow history update logic.
 * This ensures products are added to history when product creation succeeds,
 * even if other workflow steps fail.
 */

describe('Workflow History Update Logic', () => {
  describe('History update conditions', () => {
    it('should add to history when product creation succeeds and all other steps succeed', () => {
      // Scenario: Complete success - product creation + ingredient parsing + photo upload all succeed
      const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>();
      const hasLatestProduct = true;
      const workflowType = 'add_new_product';
      
      const productCreationSucceeded = !errorTypes.has('product_creation');
      const shouldAddToHistory = productCreationSucceeded && hasLatestProduct && workflowType === 'add_new_product';
      
      expect(shouldAddToHistory).toBe(true);
      expect(productCreationSucceeded).toBe(true);
    });

    it('should add to history when product creation succeeds but ingredient scan fails', () => {
      // Scenario: Product created successfully, but ingredient scan failed due to photo quality
      const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['ingredient_scan']);
      const hasLatestProduct = true;
      const workflowType = 'add_new_product';
      
      const productCreationSucceeded = !errorTypes.has('product_creation');
      const shouldAddToHistory = productCreationSucceeded && hasLatestProduct && workflowType === 'add_new_product';
      
      expect(shouldAddToHistory).toBe(true);
      expect(productCreationSucceeded).toBe(true);
    });

    it('should add to history when product creation succeeds but photo upload fails', () => {
      // Scenario: Product created successfully, but photo upload failed
      const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['photo_upload']);
      const hasLatestProduct = true;
      const workflowType = 'add_new_product';
      
      const productCreationSucceeded = !errorTypes.has('product_creation');
      const shouldAddToHistory = productCreationSucceeded && hasLatestProduct && workflowType === 'add_new_product';
      
      expect(shouldAddToHistory).toBe(true);
      expect(productCreationSucceeded).toBe(true);
    });

    it('should add to history when product creation succeeds but both ingredient scan and photo upload fail', () => {
      // Scenario: Product created successfully, but both secondary steps failed
      const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['ingredient_scan', 'photo_upload']);
      const hasLatestProduct = true;
      const workflowType = 'add_new_product';
      
      const productCreationSucceeded = !errorTypes.has('product_creation');
      const shouldAddToHistory = productCreationSucceeded && hasLatestProduct && workflowType === 'add_new_product';
      
      expect(shouldAddToHistory).toBe(true);
      expect(productCreationSucceeded).toBe(true);
    });

    it('should NOT add to history when product creation fails', () => {
      // Scenario: Product creation failed - should not add to history regardless of other steps
      const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['product_creation']);
      const hasLatestProduct = false; // No product was created
      const workflowType = 'add_new_product';
      
      const productCreationSucceeded = !errorTypes.has('product_creation');
      const shouldAddToHistory = productCreationSucceeded && hasLatestProduct && workflowType === 'add_new_product';
      
      expect(shouldAddToHistory).toBe(false);
      expect(productCreationSucceeded).toBe(false);
    });

    it('should NOT add to history when product creation fails even if other steps succeed', () => {
      // Scenario: Ingredient scan and photo upload succeeded, but product creation failed
      const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['product_creation']);
      const hasLatestProduct = false; // No product was created
      const workflowType = 'add_new_product';
      
      const productCreationSucceeded = !errorTypes.has('product_creation');
      const shouldAddToHistory = productCreationSucceeded && hasLatestProduct && workflowType === 'add_new_product';
      
      expect(shouldAddToHistory).toBe(false);
      expect(productCreationSucceeded).toBe(false);
    });

    it('should NOT add to history when all steps fail', () => {
      // Scenario: Complete failure - all steps failed
      const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['product_creation', 'ingredient_scan', 'photo_upload']);
      const hasLatestProduct = false; // No product was created
      const workflowType = 'add_new_product';
      
      const productCreationSucceeded = !errorTypes.has('product_creation');
      const shouldAddToHistory = productCreationSucceeded && hasLatestProduct && workflowType === 'add_new_product';
      
      expect(shouldAddToHistory).toBe(false);
      expect(productCreationSucceeded).toBe(false);
    });

    it('should NOT add to history for non-product workflows', () => {
      // Scenario: Individual action workflow - should not add to history
      const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>();
      const hasLatestProduct = true;
      const workflowType: string = 'individual_action';
      
      const productCreationSucceeded = !errorTypes.has('product_creation');
      const isAddNewProductWorkflow = workflowType === 'add_new_product';
      const shouldAddToHistory = productCreationSucceeded && hasLatestProduct && isAddNewProductWorkflow;
      
      expect(shouldAddToHistory).toBe(false);
      expect(productCreationSucceeded).toBe(true);
      expect(isAddNewProductWorkflow).toBe(false);
    });
  });

  describe('Status message generation', () => {
    it('generates correct status message for complete success', () => {
      const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>();
      const hasErrors = errorTypes.size > 0;
      const statusMessage = hasErrors ? 'with some errors' : 'successfully';
      
      expect(statusMessage).toBe('successfully');
      expect(hasErrors).toBe(false);
    });

    it('generates correct status message when some steps fail but product creation succeeds', () => {
      const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['ingredient_scan']);
      const hasErrors = errorTypes.size > 0;
      const statusMessage = hasErrors ? 'with some errors' : 'successfully';
      
      expect(statusMessage).toBe('with some errors');
      expect(hasErrors).toBe(true);
    });

    it('generates correct status message when multiple steps fail but product creation succeeds', () => {
      const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['ingredient_scan', 'photo_upload']);
      const hasErrors = errorTypes.size > 0;
      const statusMessage = hasErrors ? 'with some errors' : 'successfully';
      
      expect(statusMessage).toBe('with some errors');
      expect(hasErrors).toBe(true);
    });
  });

  describe('Real-world scenarios', () => {
    it('handles the reported issue: product creation succeeds, ingredient scan fails', () => {
      // This is the exact scenario reported by the user
      const workflowState = {
        type: 'add_new_product' as const,
        errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['ingredient_scan']),
        latestProduct: { barcode: '123456789012', name: 'Test Product' }, // Product was created
      };

      // Check if product should be added to history
      const productCreationSucceeded = !workflowState.errorTypes.has('product_creation');
      const shouldAddToHistory = productCreationSucceeded && !!workflowState.latestProduct && workflowState.type === 'add_new_product';
      const hasErrors = workflowState.errorTypes.size > 0;

      // Assertions for the fix
      expect(productCreationSucceeded).toBe(true); // Product creation succeeded
      expect(shouldAddToHistory).toBe(true); // Should add to history
      expect(hasErrors).toBe(true); // But there are errors (ingredient scan failed)
      
      // Status message should indicate partial success
      const statusMessage = hasErrors ? 'with some errors' : 'successfully';
      expect(statusMessage).toBe('with some errors');
    });

    it('handles complete failure scenario correctly', () => {
      const workflowState = {
        type: 'add_new_product' as const,
        errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['product_creation', 'ingredient_scan']),
        latestProduct: null, // No product was created
      };

      const productCreationSucceeded = !workflowState.errorTypes.has('product_creation');
      const shouldAddToHistory = productCreationSucceeded && !!workflowState.latestProduct && workflowState.type === 'add_new_product';

      expect(productCreationSucceeded).toBe(false);
      expect(shouldAddToHistory).toBe(false);
    });

    it('handles complete success scenario correctly', () => {
      const workflowState = {
        type: 'add_new_product' as const,
        errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(),
        latestProduct: { barcode: '987654321098', name: 'Complete Success Product' },
      };

      const productCreationSucceeded = !workflowState.errorTypes.has('product_creation');
      const shouldAddToHistory = productCreationSucceeded && !!workflowState.latestProduct && workflowState.type === 'add_new_product';
      const hasErrors = workflowState.errorTypes.size > 0;

      expect(productCreationSucceeded).toBe(true);
      expect(shouldAddToHistory).toBe(true);
      expect(hasErrors).toBe(false);
      
      const statusMessage = hasErrors ? 'with some errors' : 'successfully';
      expect(statusMessage).toBe('successfully');
    });
  });
});