-- Lookup Product PostgreSQL Function with Rate Limiting
-- Created: 2025-01-18
-- Purpose: Secure product lookup by UPC/EAN barcode with authentication check, rate limiting, and automatic logging
--
-- This function provides barcode-based product lookup with rate limiting:
-- 1. Authentication check (requires valid auth.uid())
-- 2. Rate limit check based on subscription level:
--    - Free: 10 total searches per day (combined with product_search and ingredient_search)
--    - Standard: unlimited searches per day
--    - Premium: unlimited searches per day
-- 3. Product lookup by UPC/EAN13 barcode
-- 4. Automatic logging with detailed metadata about the decision path
--
-- Features:
-- - SECURITY DEFINER: Bypasses RLS restrictions while maintaining user authentication
-- - Rate limiting: Prevents abuse based on subscription tiers with graceful responses
-- - Subscription awareness: Checks user_subscription table for current level
-- - Expiration handling: Automatically downgrades expired subscriptions to free
-- - Automatic logging: All lookups logged to actionlog table with enhanced metadata
-- - Barcode search: Searches both UPC and EAN13 fields
-- - Limited results: Returns single product match or null
-- - Graceful rate limits: Returns special response instead of throwing errors
CREATE OR REPLACE FUNCTION lookup_product(barcode text, device_id text)
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
    product_found integer := 0;
    final_vegan_status text;
    product_classification text;
    decision_reasoning text;
    rate_info RECORD;
BEGIN
    -- Check if user is authenticated
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'not logged in';
    END IF;
    -- Validate inputs
    IF barcode IS NULL OR trim(barcode) = '' THEN
        RAISE EXCEPTION 'barcode cannot be empty';
    END IF;
    IF device_id IS NULL OR trim(device_id) = '' THEN
        RAISE EXCEPTION 'device_id cannot be empty';
    END IF;
    -- Validate and convert device_id to UUID
    BEGIN
        device_uuid := device_id::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'device_id must be a valid UUID';
    END;
    -- Get rate limit information
    SELECT
        * INTO rate_info
    FROM
        get_rate_limits('product_lookup', device_id);
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
            -- Clean barcode
            barcode := trim(barcode);
            -- Search for product by UPC or EAN13
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
                p.upc = barcode
                OR p.ean13 = barcode
            ORDER BY
                p.ean13
            LIMIT 1;
            -- Check if product was found
            GET DIAGNOSTICS product_found = ROW_COUNT;
            -- Determine final vegan status and reasoning
            IF product_found > 0 THEN
                -- Get classification from the returned product
                SELECT
                    p.classification INTO product_classification
                FROM
                    public.products p
                WHERE
                    p.upc = barcode
                    OR p.ean13 = barcode
                LIMIT 1;
                -- Use classification field
                IF product_classification IS NOT NULL AND product_classification IN ('vegan', 'vegetarian', 'non-vegetarian') THEN
                    CASE product_classification
                    WHEN 'vegan' THEN
                        decision_reasoning := format('Database hit: Using classification field "%s"', product_classification);
    WHEN 'vegetarian' THEN
                        decision_reasoning := format('Database hit: Using classification field "%s"', product_classification);
    WHEN 'non-vegetarian' THEN
                        decision_reasoning := format('Database hit: Using classification field "%s"', product_classification);
                    END CASE;
                    ELSE
                        -- No valid classification available, will fall back to Open Food Facts
                        decision_reasoning := format('Database hit: No valid classification (classification: "%s") - will fall back to Open Food Facts', COALESCE(product_classification, 'null'));
                    END IF;
                ELSE
                    decision_reasoning := 'Database miss: Product not found in database - will fall back to Open Food Facts';
                    END IF;
                    -- Log the search operation
                    INSERT INTO public.actionlog(type, input, userid, deviceid, result, metadata)
                        VALUES ('product_lookup', barcode, current_user_id, device_uuid, CASE WHEN product_found > 0 THEN
                                'Product found in database'
                            ELSE
                                'Product not found in database'
                            END, json_build_object('barcode', barcode, 'device_id', device_id, 'database_hit', product_found > 0, 'classification', product_classification, 'decision_reasoning', decision_reasoning, 'subscription_level', rate_info.subscription_level, 'rate_limit', rate_info.rate_limit, 'searches_used', rate_info.recent_searches + 1, 'search_timestamp', NOW()));
                        RETURN;
END;

$$;

-- Usage Examples:
-- SELECT * FROM lookup_product('1234567890123', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
-- SELECT * FROM lookup_product('0123456789012', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
-- Rate Limits by Subscription Level:
-- Free: 10 searches per hour
-- Standard: unlimited searches per hour
-- Premium: unlimited searches per hour
-- Error Messages:
-- 'not logged in' - User must be authenticated
-- 'barcode cannot be empty' - Valid barcode required
-- 'device_id cannot be empty' - Valid device_id required
-- 'device_id must be a valid UUID' - device_id must be in valid UUID format
-- Rate Limit Handling:
-- When rate limit is exceeded, function returns a special record with:
-- - id: -1
-- - upc: '__RATE_LIMIT_EXCEEDED__'
-- - ean13: subscription level (free/standard/premium)
-- - product_name: 'Rate limit exceeded'
-- - brand: rate limit for that tier
-- - classification: 'RATE_LIMIT'
-- This allows client-side graceful handling without throwing errors
-- Function Requirements:
-- 1. User must be authenticated (auth.uid() IS NOT NULL)
-- 2. Device ID must be provided as valid UUID format
-- 3. products table must exist with columns: id, upc, ean13, product_name, brand, ingredients, classification, image_url, created_at, updated_at
-- 4. actionlog table must exist with columns: type, input, userid, deviceid, result, metadata, created_at
-- 5. user_subscription table must exist with columns: user_id, subscription_level, expires_at, is_active
-- Enhanced Metadata Logging:
-- The function logs comprehensive metadata including:
-- - barcode: The searched barcode
-- - device_id: The device ID making the request
-- - database_hit: Whether product was found in database
-- - classification: The classification value from database (if found)
-- - decision_reasoning: Human-readable explanation of the decision path
-- - subscription_level: Current user's subscription tier
-- - rate_limit: Maximum searches allowed for this tier
-- - searches_used: Number of searches used in current hour (including this one)
-- - search_timestamp: When the search was performed
-- Security Notes:
-- - SECURITY DEFINER allows function to bypass RLS policies
-- - Explicit schema qualification (public.) prevents schema injection
-- - User authentication is still required and validated
-- - Rate limiting prevents abuse and protects database resources
-- - All database operations are logged for audit purposes
-- - Subscription expiration is automatically handled
