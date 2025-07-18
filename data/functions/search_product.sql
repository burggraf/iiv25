-- Search Product PostgreSQL Function with Rate Limiting
-- Created: 2025-01-18
-- Purpose: Secure product lookup by barcode with authentication check, rate limiting, and automatic logging
-- 
-- This function provides barcode-based product lookup with rate limiting:
-- 1. Authentication check (requires valid auth.uid())
-- 2. Rate limit check based on subscription level:
--    - Free: 3 searches per hour
--    - Standard: 20 searches per hour  
--    - Premium: 250 searches per hour
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

CREATE OR REPLACE FUNCTION search_product(barcode TEXT)
RETURNS TABLE (
    id INTEGER,
    upc VARCHAR(255),
    ean13 VARCHAR(255),
    product_name VARCHAR(255),
    brand VARCHAR(255),
    ingredients TEXT,
    calculated_code VARCHAR(255),
    override_code VARCHAR(255),
    image_url VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    current_user_id UUID;
    subscription_level TEXT;
    product_found BOOLEAN := FALSE;
    recent_searches INTEGER;
    rate_limit INTEGER;
    expires_at TIMESTAMP WITH TIME ZONE;
    final_vegan_status TEXT;
    decision_reasoning TEXT;
BEGIN
    -- Check if user is authenticated
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'not logged in';
    END IF;
    
    -- Validate input
    IF barcode IS NULL OR trim(barcode) = '' THEN
        RAISE EXCEPTION 'barcode cannot be empty';
    END IF;
    
    -- Get user's subscription status
    SELECT 
        us.subscription_level,
        us.expires_at
    INTO 
        subscription_level,
        expires_at
    FROM public.user_subscription us
    WHERE us.user_id = current_user_id
    AND us.is_active = TRUE;
    
    -- If no subscription record found, default to 'free'
    IF subscription_level IS NULL THEN
        subscription_level := 'free';
    END IF;
    
    -- Check if subscription has expired
    IF expires_at IS NOT NULL AND expires_at < NOW() THEN
        -- Update subscription to inactive
        UPDATE public.user_subscription 
        SET is_active = FALSE 
        WHERE user_id = current_user_id;
        
        subscription_level := 'free';
    END IF;
    
    -- Set rate limits based on subscription level
    CASE subscription_level
        WHEN 'free' THEN rate_limit := 3;
        WHEN 'standard' THEN rate_limit := 20;
        WHEN 'premium' THEN rate_limit := 250;
        ELSE rate_limit := 3; -- Default to free tier
    END CASE;
    
    -- Check recent searches in the last hour
    SELECT COUNT(*)
    INTO recent_searches
    FROM public.actionlog
    WHERE userid = current_user_id
    AND type = 'product_lookup'
    AND created_at > NOW() - INTERVAL '1 hour';
    
    -- Check if user has exceeded rate limit
    IF recent_searches >= rate_limit THEN
        -- Return special rate limit response instead of throwing error
        RETURN QUERY
        SELECT 
            -1::INTEGER as id,
            '__RATE_LIMIT_EXCEEDED__'::VARCHAR(255) as upc,
            subscription_level::VARCHAR(255) as ean13,
            'Rate limit exceeded'::VARCHAR(255) as product_name,
            rate_limit::VARCHAR(255) as brand,
            'You have exceeded your search limit'::TEXT as ingredients,
            'RATE_LIMIT'::VARCHAR(255) as calculated_code,
            NULL::VARCHAR(255) as override_code,
            NULL::VARCHAR(255) as image_url,
            NOW() as created_at,
            NOW() as updated_at;
        RETURN;
    END IF;
    
    -- Clean barcode
    barcode := trim(barcode);
    
    -- Search for product by UPC or EAN13
    RETURN QUERY
    SELECT 
        p.id,
        p.upc,
        p.ean13,
        p.product_name,
        p.brand,
        p.ingredients,
        p.calculated_code,
        p.override_code,
        p.image_url,
        p.created_at,
        p.updated_at
    FROM public.products p
    WHERE p.upc = barcode OR p.ean13 = barcode
    ORDER BY p.id
    LIMIT 1;
    
    -- Check if product was found
    GET DIAGNOSTICS product_found = FOUND;
    
    -- Determine final vegan status and reasoning
    IF product_found THEN
        -- Get the calculated_code from the returned product
        SELECT p.calculated_code INTO final_vegan_status
        FROM public.products p
        WHERE p.upc = barcode OR p.ean13 = barcode
        LIMIT 1;
        
        -- Map calculated_code to vegan status for reasoning
        CASE final_vegan_status
            WHEN '100' THEN decision_reasoning := 'Database hit: Definitely Vegan (code 100) - using database result';
            WHEN '200' THEN decision_reasoning := 'Database hit: Definitely Vegetarian (code 200) - using database result';
            WHEN '300' THEN decision_reasoning := 'Database hit: Probably Not Vegan (code 300) - using database result';
            WHEN '400' THEN decision_reasoning := 'Database hit: Probably Vegetarian (code 400) - using database result';
            WHEN '500' THEN decision_reasoning := 'Database hit: Not Sure (code 500) - will fall back to Open Food Facts';
            WHEN '600' THEN decision_reasoning := 'Database hit: May Not Be Vegetarian (code 600) - using database result';
            WHEN '700' THEN decision_reasoning := 'Database hit: Probably Not Vegetarian (code 700) - using database result';
            WHEN '800' THEN decision_reasoning := 'Database hit: Definitely Not Vegetarian (code 800) - using database result';
            ELSE decision_reasoning := format('Database hit: Unknown calculated_code (%s) - will fall back to Open Food Facts', final_vegan_status);
        END CASE;
    ELSE
        decision_reasoning := 'Database miss: Product not found in database - will fall back to Open Food Facts';
    END IF;
    
    -- Log the search operation
    INSERT INTO public.actionlog (type, input, userid, result, metadata)
    VALUES (
        'product_lookup',
        barcode,
        current_user_id,
        CASE 
            WHEN product_found THEN 'Product found in database'
            ELSE 'Product not found in database'
        END,
        json_build_object(
            'barcode', barcode,
            'database_hit', product_found,
            'calculated_code', final_vegan_status,
            'decision_reasoning', decision_reasoning,
            'subscription_level', subscription_level,
            'rate_limit', rate_limit,
            'searches_used', recent_searches + 1,
            'search_timestamp', NOW()
        )
    );
    
    RETURN;
END;
$$;

-- Usage Examples:
-- SELECT * FROM search_product('1234567890123');
-- SELECT * FROM search_product('0123456789012');

-- Rate Limits by Subscription Level:
-- Free: 3 searches per hour
-- Standard: 20 searches per hour
-- Premium: 250 searches per hour

-- Error Messages:
-- 'not logged in' - User must be authenticated
-- 'barcode cannot be empty' - Valid barcode required

-- Rate Limit Handling:
-- When rate limit is exceeded, function returns a special record with:
-- - id: -1
-- - upc: '__RATE_LIMIT_EXCEEDED__'
-- - ean13: subscription level (free/standard/premium)
-- - product_name: 'Rate limit exceeded'
-- - brand: rate limit for that tier
-- - calculated_code: 'RATE_LIMIT'
-- This allows client-side graceful handling without throwing errors

-- Function Requirements:
-- 1. User must be authenticated (auth.uid() IS NOT NULL)
-- 2. products table must exist with columns: id, upc, ean13, product_name, brand, ingredients, calculated_code, override_code, image_url, created_at, updated_at
-- 3. actionlog table must exist with columns: type, input, userid, result, metadata, created_at
-- 4. user_subscription table must exist with columns: user_id, subscription_level, expires_at, is_active

-- Enhanced Metadata Logging:
-- The function logs comprehensive metadata including:
-- - barcode: The searched barcode
-- - database_hit: Whether product was found in database
-- - calculated_code: The calculated_code value from database (if found)
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