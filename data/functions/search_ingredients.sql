-- Search Ingredients PostgreSQL Function with Rate Limiting
-- Created: 2025-01-17
-- Updated: 2025-01-17 - Added rate limiting with graceful response handling
-- Purpose: Secure ingredient search with authentication check, rate limiting, and automatic logging
-- 
-- This function provides a hierarchical search strategy for ingredients with rate limiting:
-- 1. Authentication check (requires valid auth.uid())
-- 2. Rate limit check based on subscription level:
--    - Free: 10 searches per hour
--    - Basic: 100 searches per hour  
--    - Premium: 1000 searches per hour
-- 3. Hierarchical search (exact → starts with → contains)
-- 4. Automatic logging with subscription and rate limit metadata
--
-- Features:
-- - SECURITY DEFINER: Bypasses RLS restrictions while maintaining user authentication
-- - Rate limiting: Prevents abuse based on subscription tiers with graceful responses
-- - Subscription awareness: Checks user_subscription table for current level
-- - Expiration handling: Automatically downgrades expired subscriptions to free
-- - Automatic logging: All searches logged to actionlog table with enhanced metadata
-- - Hierarchical search: Returns results from first successful search strategy
-- - Limited results: Maximum 100 results per search
-- - Graceful rate limits: Returns special response instead of throwing errors

CREATE OR REPLACE FUNCTION search_ingredients(search_term TEXT)
RETURNS TABLE (
    title VARCHAR(255),
    class VARCHAR(255),
    productcount INTEGER,
    lastupdated TIMESTAMP WITH TIME ZONE,
    created TIMESTAMP WITH TIME ZONE
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    current_user_id UUID;
    search_result_count INTEGER;
    rate_info RECORD;
BEGIN
    -- Check if user is authenticated
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'not logged in';
    END IF;
    
    -- Validate input
    IF search_term IS NULL OR trim(search_term) = '' THEN
        RAISE EXCEPTION 'search term cannot be empty';
    END IF;
    
    -- Get rate limit information
    SELECT * INTO rate_info FROM get_rate_limits('ingredient_search');
    
    -- Check if user has exceeded rate limit
    IF rate_info.is_rate_limited THEN
        -- Return special rate limit response instead of throwing error
        RETURN QUERY
        SELECT 
            '__RATE_LIMIT_EXCEEDED__'::VARCHAR(255) as title,
            rate_info.subscription_level::VARCHAR(255) as class,
            rate_info.rate_limit::INTEGER as productcount,
            NOW() as lastupdated,
            NOW() as created;
        RETURN;
    END IF;
    
    -- Clean search term
    search_term := trim(lower(search_term));
    
    -- Valid ingredient classes to filter by
    DECLARE
        valid_classes TEXT[] := ARRAY[
            'may be non-vegetarian',
            'non-vegetarian', 
            'typically non-vegan',
            'typically non-vegetarian',
            'typically vegan',
            'typically vegetarian',
            'vegan',
            'vegetarian'
        ];
    BEGIN
        -- Step 1: Search for exact match first
        RETURN QUERY
        SELECT i.title, i.class, i.productcount, i.lastupdated, i.created
        FROM public.ingredients i
        WHERE i.title = search_term
        AND i.class = ANY(valid_classes)
        ORDER BY i.title
        LIMIT 100;
        
        -- If exact match found, log and return
        GET DIAGNOSTICS search_result_count = ROW_COUNT;
        IF search_result_count > 0 THEN
            -- Log the search operation
            INSERT INTO public.actionlog (type, input, userid, result, metadata)
            VALUES (
                'ingredient_search',
                search_term,
                current_user_id,
                format('Found %s exact matches', search_result_count),
                json_build_object(
                    'search_strategy', 'exact_match',
                    'result_count', search_result_count,
                    'search_term_length', length(search_term),
                    'subscription_level', rate_info.subscription_level,
                    'rate_limit', rate_info.rate_limit,
                    'searches_used', rate_info.recent_searches + 1
                )
            );
            RETURN;
        END IF;
        
        -- Step 2: Search for starts with pattern
        RETURN QUERY
        SELECT i.title, i.class, i.productcount, i.lastupdated, i.created
        FROM public.ingredients i
        WHERE i.title ILIKE (search_term || '%')
        AND i.class = ANY(valid_classes)
        ORDER BY i.title
        LIMIT 100;
        
        -- If starts with match found, log and return
        GET DIAGNOSTICS search_result_count = ROW_COUNT;
        IF search_result_count > 0 THEN
            -- Log the search operation
            INSERT INTO public.actionlog (type, input, userid, result, metadata)
            VALUES (
                'ingredient_search',
                search_term,
                current_user_id,
                format('Found %s starts-with matches', search_result_count),
                json_build_object(
                    'search_strategy', 'starts_with',
                    'result_count', search_result_count,
                    'search_term_length', length(search_term),
                    'subscription_level', rate_info.subscription_level,
                    'rate_limit', rate_info.rate_limit,
                    'searches_used', rate_info.recent_searches + 1
                )
            );
            RETURN;
        END IF;
        
        -- Step 3: Search for contains pattern
        RETURN QUERY
        SELECT i.title, i.class, i.productcount, i.lastupdated, i.created
        FROM public.ingredients i
        WHERE i.title ILIKE ('%' || search_term || '%')
        AND i.class = ANY(valid_classes)
        ORDER BY i.title
        LIMIT 100;
        
        -- Log the search operation (even if no results)
        GET DIAGNOSTICS search_result_count = ROW_COUNT;
        INSERT INTO public.actionlog (type, input, userid, result, metadata)
        VALUES (
            'ingredient_search',
            search_term,
            current_user_id,
            CASE 
                WHEN search_result_count > 0 THEN format('Found %s contains matches', search_result_count)
                ELSE 'No matches found'
            END,
            json_build_object(
                'search_strategy', 'contains',
                'result_count', search_result_count,
                'search_term_length', length(search_term),
                'subscription_level', rate_info.subscription_level,
                'rate_limit', rate_info.rate_limit,
                'searches_used', rate_info.recent_searches + 1
            )
        );
        
        RETURN;
    END;
END;
$$;

-- Usage Examples:
-- SELECT * FROM search_ingredients('salt');
-- SELECT * FROM search_ingredients('milk powder');

-- Rate Limits by Subscription Level:
-- Free: 10 searches per hour
-- Basic: 100 searches per hour
-- Premium: 1000 searches per hour

-- Error Messages:
-- 'not logged in' - User must be authenticated
-- 'search term cannot be empty' - Valid search term required

-- Rate Limit Handling:
-- When rate limit is exceeded, function returns a special record with:
-- - title: '__RATE_LIMIT_EXCEEDED__'
-- - class: subscription level (free/basic/premium)
-- - productcount: rate limit for that tier
-- This allows client-side graceful handling without throwing errors

-- Function Requirements:
-- 1. User must be authenticated (auth.uid() IS NOT NULL)
-- 2. ingredients table must exist with columns: title, class, productcount, lastupdated, created
-- 3. actionlog table must exist with columns: type, input, userid, result, metadata, created_at
-- 4. user_subscription table must exist with columns: user_id, subscription_level, expires_at, is_active
-- 5. Valid ingredient classes are pre-defined in the function

-- Enhanced Metadata Logging:
-- The function now logs additional metadata including:
-- - subscription_level: Current user's subscription tier
-- - rate_limit: Maximum searches allowed for this tier
-- - searches_used: Number of searches used in current hour (including this one)
-- - search_strategy: Which search strategy was successful
-- - result_count: Number of results found
-- - search_term_length: Length of search term for analytics

-- Security Notes:
-- - SECURITY DEFINER allows function to bypass RLS policies
-- - Explicit schema qualification (public.) prevents schema injection
-- - User authentication is still required and validated
-- - Rate limiting prevents abuse and protects database resources
-- - All database operations are logged for audit purposes
-- - Subscription expiration is automatically handled