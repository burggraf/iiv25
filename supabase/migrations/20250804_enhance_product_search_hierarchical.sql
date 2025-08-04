-- Migration: Enhance product search with hierarchical 3-tier wildcard matching
-- Created: 2025-08-04
-- Description: Updates search_products function to match ingredient search behavior with hierarchical search strategy
-- 
-- Changes:
-- - Adds third-tier "contains" search pattern (ILIKE '%term%')
-- - Implements hierarchical fallback: exact → prefix → contains matching
-- - Updates logging to track which search strategy was successful
-- - Maintains backwards compatibility and performance optimizations
--
-- This enhancement allows users to find products with search terms anywhere in the product name,
-- providing consistency with the ingredient search functionality.

-- Search Products PostgreSQL Function with Rate Limiting and Pagination
-- Created: 2025-01-24
-- Updated: 2025-08-04 - Added hierarchical 3-tier search strategy matching ingredient search
-- Purpose: Secure product search by name with authentication check, rate limiting, and automatic logging
--
-- This function provides name-based product search with rate limiting and pagination:
-- 1. Authentication check (requires valid auth.uid())
-- 2. Rate limit check based on subscription level:
--    - Free: 10 total searches per day (combined with ingredient_search and product_lookup)
--    - Standard: unlimited searches per day  
--    - Premium: unlimited searches per day
-- 3. Three-tier hierarchical search strategy (exact match → prefix match → contains match)
-- 4. Pagination support (250 products per page)
-- 5. Automatic logging with detailed metadata about the search
--
-- Features:
-- - SECURITY DEFINER: Bypasses RLS restrictions while maintaining user authentication
-- - Rate limiting: Prevents abuse based on subscription tiers with graceful responses
-- - Subscription awareness: Checks user_subscription table for current level
-- - Expiration handling: Automatically downgrades expired subscriptions to free
-- - Automatic logging: All searches logged to actionlog table with enhanced metadata
-- - Three-tier hierarchical search: Exact match first, then prefix match, then contains match
-- - Pagination: Returns 250 results per page with offset support
-- - Graceful rate limits: Returns special response instead of throwing errors
-- - Optimized indexing: Uses proper text_pattern_ops index for fast LIKE queries
CREATE OR REPLACE FUNCTION search_products(search_term text, device_id text, page_offset integer DEFAULT 0)
    RETURNS TABLE(
        ean13 varchar(255),
        upc varchar(255),
        product_name varchar(255),
        brand varchar(255),
        ingredients varchar(4096),
        classification text,
        imageurl text,
        issues text,
        created timestamp with time zone,
        lastupdated timestamp with time zone)
    SECURITY DEFINER
    SET search_path = public
    LANGUAGE plpgsql
    AS $$
DECLARE
    current_user_id uuid;
    device_uuid uuid;
    search_result_count integer;
    rate_info RECORD;
    cleaned_term text;
BEGIN
    -- Check if user is authenticated
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'not logged in';
    END IF;
    
    -- Validate inputs
    IF search_term IS NULL OR trim(search_term) = '' THEN
        RAISE EXCEPTION 'search term cannot be empty';
    END IF;
    
    IF device_id IS NULL OR trim(device_id) = '' THEN
        RAISE EXCEPTION 'device_id cannot be empty';
    END IF;
    
    -- Validate page_offset
    IF page_offset IS NULL OR page_offset < 0 THEN
        page_offset := 0;
    END IF;
    
    -- Validate and convert device_id to UUID
    BEGIN
        device_uuid := device_id::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'device_id must be a valid UUID';
    END;
    
    -- Get rate limit information
    SELECT * INTO rate_info
    FROM get_rate_limits('search', device_id);
    
    -- Check if user has exceeded rate limit
    IF rate_info.is_rate_limited THEN
        -- Return special rate limit response instead of throwing error
        RETURN QUERY
        SELECT
            '__RATE_LIMIT_EXCEEDED__'::varchar(255) AS ean13,
            rate_info.subscription_level::varchar(255) AS upc,
            'Rate limit exceeded'::varchar(255) AS product_name,
            rate_info.rate_limit::varchar(255) AS brand,
            'You have exceeded your search limit'::varchar(4096) AS ingredients,
            'RATE_LIMIT'::text AS classification,
            NULL::text AS imageurl,
            NULL::text AS issues,
            NOW() AS created,
            NOW() AS lastupdated;
        RETURN;
    END IF;
    
    -- Clean the search term
    cleaned_term := trim(lower(search_term));
    
    -- Step 1: Search for exact match first
    RETURN QUERY
    SELECT
        p.ean13,
        p.upc,
        p.product_name,
        p.brand,
        p.ingredients,
        p.classification,
        p.imageurl,
        p.issues,
        p.created,
        p.lastupdated
    FROM
        public.products p
    WHERE
        lower((p.product_name)::text) = cleaned_term
    ORDER BY
        lower((p.product_name)::text)
    LIMIT 250
    OFFSET page_offset;
    
    -- If exact match found, log and return
    GET DIAGNOSTICS search_result_count = ROW_COUNT;
    IF search_result_count > 0 THEN
        -- Log the search operation using unified 'search' action type
        INSERT INTO public.actionlog(type, input, userid, deviceid, result, metadata)
        VALUES (
            'search',
            search_term,
            current_user_id,
            device_uuid,
            format('Found %s exact matches', search_result_count),
            json_build_object(
                'device_id', device_id,
                'search_type', 'product',
                'search_strategy', 'exact_match',
                'result_count', search_result_count,
                'search_term_length', length(search_term),
                'page_offset', page_offset,
                'subscription_level', rate_info.subscription_level,
                'rate_limit', rate_info.rate_limit,
                'searches_used', rate_info.recent_searches + 1
            )
        );
        RETURN;
    END IF;
    
    -- Step 2: Search for prefix/starts-with match if no exact match
    RETURN QUERY
    SELECT
        p.ean13,
        p.upc,
        p.product_name,
        p.brand,
        p.ingredients,
        p.classification,
        p.imageurl,
        p.issues,
        p.created,
        p.lastupdated
    FROM
        public.products p
    WHERE
        lower((p.product_name)::text) >= cleaned_term
        AND lower((p.product_name)::text) < (cleaned_term || chr(255))
        AND lower((p.product_name)::text) LIKE (cleaned_term || '%')
    ORDER BY
        lower((p.product_name)::text)
    LIMIT 250
    OFFSET page_offset;
    
    -- If prefix match found, log and return
    GET DIAGNOSTICS search_result_count = ROW_COUNT;
    IF search_result_count > 0 THEN
        -- Log the search operation using unified 'search' action type
        INSERT INTO public.actionlog(type, input, userid, deviceid, result, metadata)
        VALUES (
            'search',
            search_term,
            current_user_id,
            device_uuid,
            format('Found %s prefix matches', search_result_count),
            json_build_object(
                'device_id', device_id,
                'search_type', 'product',
                'search_strategy', 'starts_with',
                'result_count', search_result_count,
                'search_term_length', length(search_term),
                'page_offset', page_offset,
                'subscription_level', rate_info.subscription_level,
                'rate_limit', rate_info.rate_limit,
                'searches_used', rate_info.recent_searches + 1
            )
        );
        RETURN;
    END IF;
    
    -- Step 3: Search for contains pattern (NEW - matching ingredient search)
    RETURN QUERY
    SELECT
        p.ean13,
        p.upc,
        p.product_name,
        p.brand,
        p.ingredients,
        p.classification,
        p.imageurl,
        p.issues,
        p.created,
        p.lastupdated
    FROM
        public.products p
    WHERE
        lower((p.product_name)::text) ILIKE ('%' || cleaned_term || '%')
    ORDER BY
        lower((p.product_name)::text)
    LIMIT 250
    OFFSET page_offset;
    
    -- Log the search operation (even if no results) using unified 'search' action type
    GET DIAGNOSTICS search_result_count = ROW_COUNT;
    INSERT INTO public.actionlog(type, input, userid, deviceid, result, metadata)
    VALUES (
        'search',
        search_term,
        current_user_id,
        device_uuid,
        CASE 
            WHEN search_result_count > 0 THEN format('Found %s contains matches', search_result_count)
            ELSE 'No matches found'
        END,
        json_build_object(
            'device_id', device_id,
            'search_type', 'product',
            'search_strategy', 'contains',
            'result_count', search_result_count,
            'search_term_length', length(search_term),
            'page_offset', page_offset,
            'subscription_level', rate_info.subscription_level,
            'rate_limit', rate_info.rate_limit,
            'searches_used', rate_info.recent_searches + 1
        )
    );
    
    RETURN;
END;
$$;

-- Migration Notes:
-- 1. This replaces the existing search_products function with enhanced hierarchical search
-- 2. Backwards compatible - all existing searches will work the same or better
-- 3. New "contains" search tier will find products with search terms anywhere in the name
-- 4. Logging has been updated to use unified 'search' action type (consistent with ingredient search)
-- 5. Performance optimizations for exact/prefix matches are maintained
--
-- To test after deployment:
-- - Search for "chocolate" should find products with chocolate anywhere in name
-- - Search hierarchy: exact → prefix → contains (returns results from first successful tier)
-- - Check actionlog table for 'search_strategy' metadata to verify which tier was used
--
-- Expected Benefits:
-- - Broader search results matching user expectations
-- - Consistent behavior with ingredient search functionality
-- - Better user experience when searching for products