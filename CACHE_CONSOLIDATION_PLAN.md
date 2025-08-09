# Cache Invalidation Consolidation Plan

## Current State
- ✅ Cache invalidation working correctly
- ✅ History updates working properly  
- ✅ Background job processing functional
- ❌ Code duplication between services
- ❌ Inconsistent patterns across components

## Recommended Approach: Gradual Consolidation

### Phase 1: Cleanup (1-2 hours, Low Risk)
1. **Remove dead code**
   - [ ] Delete `/src/services/CacheInvalidationService.ts` (unused)
   - [ ] Update tests to reference optimized service
   - [ ] Remove deprecated methods from optimized service

2. **Simplify optimized service**
   - [ ] Remove complex batching logic (not needed)
   - [ ] Simplify strategy interface to basic immediate/delayed
   - [ ] Keep working job processing logic

### Phase 2: Centralize Component Calls (2-3 hours, Medium Risk)
1. **Add convenience methods to optimized service**
   ```typescript
   // Add to OptimizedCacheInvalidationService
   public async updateProductCache(barcode: string, product: Product, reason: string): Promise<void>
   public async invalidateProductCache(barcode: string, reason: string): Promise<void>
   ```

2. **Update component calls gradually**
   - [ ] ScannerScreen.tsx - Replace direct cacheService calls
   - [ ] ProductResult.tsx - Replace direct cacheService calls  
   - [ ] Test each change individually

### Phase 3: Rename and Document (1 hour, Low Risk)
1. **Rename optimized service to main service**
   - [ ] Rename file: `CacheInvalidationService.optimized.ts` → `CacheInvalidationService.ts`
   - [ ] Update import statements
   - [ ] Update variable names (`optimizedCacheInvalidationService` → `cacheInvalidationService`)

2. **Add documentation**
   - [ ] Document cache invalidation patterns
   - [ ] Add JSDoc comments to public methods
   - [ ] Document when to use direct vs. service calls

## Alternative: Keep Current Implementation

If consolidation risk is too high:
1. **Minor cleanup only**
   - [ ] Delete unused original service
   - [ ] Document why optimized version is used
   - [ ] Update tests to match active code

2. **Add consistency guidelines**
   - [ ] Document when components should use cacheService directly
   - [ ] Document when to use cache invalidation service
   - [ ] Add linting rules if possible

## Decision Criteria

**Go with consolidation if:**
- Team has 4+ hours for gradual implementation
- Testing capacity is available for each phase
- Code maintainability is priority

**Keep current if:**
- System must remain stable short-term
- Limited development resources
- Recent refactoring solved critical issues

## Risk Assessment

**Low Risk Changes:**
- Removing unused files
- Updating tests  
- Documentation improvements

**Medium Risk Changes:**
- Changing component cache call patterns
- Renaming services
- Modifying active service logic

**High Risk Changes:**
- Rewriting job processing logic
- Changing HistoryService integration
- Modifying cache event flow

## Success Metrics

- [ ] All existing tests pass
- [ ] Cache invalidation continues working correctly
- [ ] History updates continue working
- [ ] Background job processing unaffected
- [ ] Reduced code complexity (lines of code)
- [ ] Consistent patterns across components