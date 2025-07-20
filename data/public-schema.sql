

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."classify_all_products"() RETURNS TABLE("upc_code" "text", "old_classification" "text", "new_classification" "text")
    LANGUAGE "sql"
    AS $$
  WITH product_classifications AS (
    SELECT 
      p.upc,
      p.classification as old_classification,
      CASE 
        WHEN class_analysis.total_classes = 0 THEN 'undetermined'
        WHEN class_analysis.non_veg_count > 0 THEN 'non-vegetarian'
        WHEN class_analysis.undetermined_count > 0 THEN 'undetermined'
        WHEN class_analysis.veg_count > 0 THEN 'vegetarian'
        ELSE 'vegan'
      END as new_classification
    FROM products p
    CROSS JOIN LATERAL (
      SELECT 
        COUNT(*) as total_classes,
        COUNT(*) FILTER (WHERE i.primary_class IN ('non-vegetarian', 'may be non-vegetarian', 'typically non-vegetarian', 'typically non-vegan')) as non_veg_count,
        COUNT(*) FILTER (WHERE i.primary_class = 'undetermined') as undetermined_count,
        COUNT(*) FILTER (WHERE i.primary_class IN ('vegetarian', 'typically vegetarian')) as veg_count
      FROM ingredients i
      WHERE i.title = ANY(
        STRING_TO_ARRAY(
          RTRIM(p.analysis, '~'),
          '~'
        )
      )
      AND i.primary_class IS NOT NULL
    ) as class_analysis
  ),
  updated AS (
    UPDATE products 
    SET classification = pc.new_classification
    FROM product_classifications pc
    WHERE products.upc = pc.upc
    RETURNING products.upc, pc.old_classification, products.classification as new_classification
  )
  SELECT upc as upc_code, old_classification, new_classification
  FROM updated;
$$;


ALTER FUNCTION "public"."classify_all_products"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classify_upc"("input_upc" "text") RETURNS "text"
    LANGUAGE "sql"
    AS $$
  UPDATE products 
  SET classification = (
    WITH class_analysis AS (
      SELECT 
        COUNT(*) as total_classes,
        COUNT(*) FILTER (WHERE i.primary_class IN ('non-vegetarian', 'may be non-vegetarian', 'typically non-vegetarian', 'typically non-vegan')) as non_veg_count,
        COUNT(*) FILTER (WHERE i.primary_class = 'undetermined') as undetermined_count,
        COUNT(*) FILTER (WHERE i.primary_class IN ('vegetarian', 'typically vegetarian')) as veg_count
      FROM ingredients i
      WHERE i.title = ANY(
        STRING_TO_ARRAY(
          RTRIM(
            (SELECT p.analysis FROM products p WHERE p.upc = input_upc),
            '~'
          ),
          '~'
        )
      )
      AND i.primary_class IS NOT NULL
    )
    SELECT 
      CASE 
        WHEN total_classes = 0 THEN 'undetermined'
        WHEN non_veg_count > 0 THEN 'non-vegetarian'
        WHEN undetermined_count > 0 THEN 'undetermined'
        WHEN veg_count > 0 THEN 'vegetarian'
        ELSE 'vegan'
      END
    FROM class_analysis
  )
  WHERE upc = input_upc
  RETURNING classification;
$$;


ALTER FUNCTION "public"."classify_upc"("input_upc" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_classes_for_upc"("input_upc" "text") RETURNS TABLE("class" "text")
    LANGUAGE "sql"
    AS $$
  SELECT DISTINCT COALESCE(i.class, 'null') as class
  FROM ingredients i
  WHERE i.title = ANY(
    STRING_TO_ARRAY(
      RTRIM(
        (SELECT p.analysis FROM products p WHERE p.upc = input_upc),
        '~'
      ),
      '~'
    )
  )
  AND COALESCE(i.class, 'null') != 'ignore';
$$;


ALTER FUNCTION "public"."get_classes_for_upc"("input_upc" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_ingredients_for_upc"("input_upc" "text") RETURNS TABLE("title" "text", "class" "text")
    LANGUAGE "sql"
    AS $$
  SELECT i.title, i.class
  FROM ingredients i
  WHERE i.title = ANY(
    STRING_TO_ARRAY(
      RTRIM(
        (SELECT p.analysis FROM products p WHERE p.upc = input_upc),
        '~'
      ),
      '~'
    )
  );
$$;


ALTER FUNCTION "public"."get_ingredients_for_upc"("input_upc" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_primary_classes_for_upc"("input_upc" "text") RETURNS TABLE("primary_class" "text")
    LANGUAGE "sql"
    AS $$
  SELECT DISTINCT COALESCE(i.primary_class, 'null') as primary_class
  FROM ingredients i
  WHERE i.title = ANY(
    STRING_TO_ARRAY(
      RTRIM(
        (SELECT p.analysis FROM products p WHERE p.upc = input_upc),
        '~'
      ),
      '~'
    )
  )
  AND COALESCE(i.primary_class, 'null') != 'ignore';
$$;


ALTER FUNCTION "public"."get_primary_classes_for_upc"("input_upc" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_rate_limits"("action_type" "text") RETURNS TABLE("subscription_level" "text", "rate_limit" integer, "recent_searches" integer, "is_rate_limited" boolean, "searches_remaining" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    current_user_id uuid;
    user_subscription_level text;
    user_subscription_expires_at timestamptz;
    current_rate_limit integer;
    search_count integer;
    rate_limited boolean;
    remaining_searches integer;
BEGIN
    -- Get the current user ID
    current_user_id := auth.uid();
    -- Check if user is authenticated
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'You must be logged in to use this service';
    END IF;
    -- Get user subscription details
    SELECT
        us.subscription_level,
        us.expires_at 
    INTO 
        user_subscription_level,
        user_subscription_expires_at
    FROM
        public.user_subscription us
    WHERE
        us.user_id = current_user_id
        AND us.is_active = TRUE;
    -- If no subscription record found, default to 'free'
    IF user_subscription_level IS NULL THEN
        user_subscription_level := 'free';
    END IF;
    -- Handle expired subscriptions
    IF user_subscription_expires_at IS NOT NULL AND user_subscription_expires_at < now() THEN
        -- Auto-deactivate expired subscription
        UPDATE
            public.user_subscription us
        SET
            is_active = FALSE
        WHERE
            us.user_id = current_user_id;
        user_subscription_level := 'free';
    END IF;
    -- Set rate limits based on subscription level
    CASE user_subscription_level
    WHEN 'free' THEN
        current_rate_limit := 1000;
    WHEN 'basic' THEN
        current_rate_limit := 1000;
    WHEN 'premium' THEN
        current_rate_limit := 10000;
    ELSE
        current_rate_limit := 10; -- Default to free tier
    END CASE;
    -- Count recent searches for the specified action type
    SELECT
        count(*) INTO search_count
    FROM
        actionlog al
    WHERE
        al.userid = current_user_id
        AND al.type = action_type
        AND al.created_at > now() - interval '1 hour';
        -- Determine if rate limited
        rate_limited := search_count >= current_rate_limit;
        -- Calculate remaining searches
        remaining_searches := greatest(0, current_rate_limit - search_count);
        -- Return the rate limit information
        RETURN query
        SELECT
            coalesce(user_subscription_level, 'free')::text AS subscription_level,
            current_rate_limit AS rate_limit,
            search_count AS recent_searches,
            rate_limited AS is_rate_limited,
            remaining_searches AS searches_remaining;
    END;
$$;


ALTER FUNCTION "public"."get_rate_limits"("action_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_rate_limits"("action_type" "text", "device_id" "text" DEFAULT NULL::"text") RETURNS TABLE("subscription_level" "text", "rate_limit" integer, "recent_searches" integer, "is_rate_limited" boolean, "searches_remaining" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    current_user_id uuid;
    device_uuid uuid;
    user_subscription_level text;
    user_subscription_expires_at timestamptz;
    current_rate_limit integer;
    search_count integer;
    rate_limited boolean;
    remaining_searches integer;
BEGIN
    -- Get the current user ID
    current_user_id := auth.uid();
    -- Check if user is authenticated
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'You must be logged in to use this service';
    END IF;
    
    -- Parse and validate device_id if provided
    IF device_id IS NOT NULL AND trim(device_id) != '' THEN
        BEGIN
            device_uuid := device_id::UUID;
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'device_id must be a valid UUID if provided';
        END;
    END IF;
    -- Get user subscription details
    SELECT
        us.subscription_level,
        us.expires_at INTO user_subscription_level,
        user_subscription_expires_at
    FROM
        public.user_subscription us
    WHERE
        us.user_id = current_user_id
        AND us.is_active = TRUE;
    -- If no subscription record found, default to 'free'
    IF user_subscription_level IS NULL THEN
        user_subscription_level := 'free';
    END IF;
    -- Handle expired subscriptions
    IF user_subscription_expires_at IS NOT NULL AND user_subscription_expires_at < now() THEN
        -- Auto-deactivate expired subscription
        UPDATE
            public.user_subscription us
        SET
            is_active = FALSE
        WHERE
            us.user_id = current_user_id;
        user_subscription_level := 'free';
    END IF;
    -- Set rate limits based on subscription level
    CASE user_subscription_level
    WHEN 'free' THEN
        current_rate_limit := 1000;
    WHEN 'basic' THEN
        current_rate_limit := 1000;
    WHEN 'premium' THEN
        current_rate_limit := 10000;
    ELSE
        current_rate_limit := 10; -- Default to free tier
    END CASE;
    -- Count recent searches for the specified action type
    -- Optimized query that counts actions from either the current user OR the current device
    -- This prevents users from circumventing limits by switching accounts on the same device
    -- or by switching devices with the same account
    SELECT
        count(*) INTO search_count
    FROM
        actionlog
    WHERE
        type = action_type
        AND created_at > now() - interval '1 hour'
        AND (
            userid = current_user_id
            OR (device_uuid IS NOT NULL AND deviceid = device_uuid)
        );
        -- Determine if rate limited
        rate_limited := search_count >= current_rate_limit;
        -- Calculate remaining searches
        remaining_searches := greatest(0, current_rate_limit - search_count);
        -- Return the rate limit information
        RETURN query
        SELECT
            coalesce(user_subscription_level, 'free')::text AS subscription_level,
            current_rate_limit AS rate_limit,
            search_count AS recent_searches,
            rate_limited AS is_rate_limited,
            remaining_searches AS searches_remaining;
    END;
$$;


ALTER FUNCTION "public"."get_rate_limits"("action_type" "text", "device_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_subscription_status"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    current_user_id UUID;
    subscription_level TEXT;
    expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Check if user is authenticated
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'not logged in';
    END IF;
    
    -- Look up user's subscription
    SELECT 
        us.subscription_level,
        us.expires_at
    INTO 
        subscription_level,
        expires_at
    FROM public.user_subscription us
    WHERE us.user_id = current_user_id
    AND us.is_active = TRUE;
    
    -- If no subscription record found, return 'free'
    IF subscription_level IS NULL THEN
        RETURN 'free';
    END IF;
    
    -- Check if subscription has expired
    IF expires_at IS NOT NULL AND expires_at < NOW() THEN
        -- Update subscription to inactive
        UPDATE public.user_subscription 
        SET is_active = FALSE 
        WHERE user_id = current_user_id;
        
        RETURN 'free';
    END IF;
    
    -- Return the current subscription level
    RETURN subscription_level;
END;
$$;


ALTER FUNCTION "public"."get_subscription_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lookup_product"("barcode" "text") RETURNS TABLE("ean13" character varying, "upc" character varying, "product_name" character varying, "brand" character varying, "ingredients" character varying, "calculated_code" integer, "override_code" integer, "classification" "text", "imageurl" "text", "created" timestamp with time zone, "lastupdated" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    current_user_id UUID;
    product_found BOOLEAN := FALSE;
    final_vegan_status TEXT;
    product_classification TEXT;
    decision_reasoning TEXT;
    rate_info RECORD;
    row_count INTEGER;
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
    
    -- Get rate limit information
    SELECT * INTO rate_info FROM get_rate_limits('product_lookup');
    
    -- Check if user has exceeded rate limit
    IF rate_info.is_rate_limited THEN
        -- Return special rate limit response instead of throwing error
        RETURN QUERY
        SELECT 
            '__RATE_LIMIT_EXCEEDED__'::VARCHAR(255) as ean13,
            rate_info.subscription_level::VARCHAR(255) as upc,
            'Rate limit exceeded'::VARCHAR(255) as product_name,
            rate_info.rate_limit::VARCHAR(255) as brand,
            'You have exceeded your search limit'::VARCHAR(4096) as ingredients,
            -1::INTEGER as calculated_code,
            NULL::INTEGER as override_code,
            'RATE_LIMIT'::TEXT as classification,
            NULL::TEXT as imageurl,
            NOW() as created,
            NOW() as lastupdated;
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
        p.calculated_code,
        p.override_code,
        p.classification,
        p.imageurl,
        p.created,
        p.lastupdated
    FROM public.products p
    WHERE p.upc = barcode OR p.ean13 = barcode
    ORDER BY p.ean13
    LIMIT 1;
    
    -- Check if product was found
    GET DIAGNOSTICS row_count = ROW_COUNT;
    product_found := row_count > 0;
    
    -- Determine final vegan status and reasoning
    IF product_found THEN
        -- Get both classification and calculated_code from the returned product
        SELECT p.classification, p.calculated_code::TEXT INTO product_classification, final_vegan_status
        FROM public.products p
        WHERE p.upc = barcode OR p.ean13 = barcode
        LIMIT 1;
        
        -- Prioritize classification field, fall back to calculated_code
        IF product_classification IS NOT NULL AND product_classification IN ('vegan', 'vegetarian', 'non-vegetarian') THEN
            -- Use classification field
            CASE product_classification
                WHEN 'vegan' THEN decision_reasoning := format('Database hit: Using classification field "%s"', product_classification);
                WHEN 'vegetarian' THEN decision_reasoning := format('Database hit: Using classification field "%s"', product_classification);
                WHEN 'non-vegetarian' THEN decision_reasoning := format('Database hit: Using classification field "%s"', product_classification);
            END CASE;
        ELSIF final_vegan_status IS NOT NULL AND final_vegan_status != '500' THEN
            -- Fall back to calculated_code (but skip 500 which means "Not Sure")
            CASE final_vegan_status
                WHEN '100' THEN decision_reasoning := 'Database hit: Definitely Vegan (code 100) - using database result';
                WHEN '200' THEN decision_reasoning := 'Database hit: Definitely Vegetarian (code 200) - using database result';
                WHEN '300' THEN decision_reasoning := 'Database hit: Probably Not Vegan (code 300) - using database result';
                WHEN '400' THEN decision_reasoning := 'Database hit: Probably Vegetarian (code 400) - using database result';
                WHEN '600' THEN decision_reasoning := 'Database hit: May Not Be Vegetarian (code 600) - using database result';
                WHEN '700' THEN decision_reasoning := 'Database hit: Probably Not Vegetarian (code 700) - using database result';
                WHEN '800' THEN decision_reasoning := 'Database hit: Definitely Not Vegetarian (code 800) - using database result';
                ELSE decision_reasoning := format('Database hit: Unknown calculated_code (%s) - will fall back to Open Food Facts', final_vegan_status);
            END CASE;
        ELSE
            -- No valid classification available, will fall back to Open Food Facts
            decision_reasoning := format('Database hit: No valid classification (classification: "%s", code: %s) - will fall back to Open Food Facts', 
                COALESCE(product_classification, 'null'), COALESCE(final_vegan_status, 'null'));
        END IF;
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
            'classification', product_classification,
            'calculated_code', final_vegan_status,
            'decision_reasoning', decision_reasoning,
            'subscription_level', rate_info.subscription_level,
            'rate_limit', rate_info.rate_limit,
            'searches_used', rate_info.recent_searches + 1,
            'search_timestamp', NOW()
        )
    );
    
    RETURN;
END;
$$;


ALTER FUNCTION "public"."lookup_product"("barcode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lookup_product"("barcode" "text", "device_id" "text" DEFAULT ''::"text") RETURNS TABLE("ean13" character varying, "upc" character varying, "product_name" character varying, "brand" character varying, "ingredients" character varying, "classification" "text", "imageurl" "text", "created" timestamp with time zone, "lastupdated" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    current_user_id UUID;
    device_uuid UUID;
    product_found INTEGER := 0;
    final_vegan_status TEXT;
    product_classification TEXT;
    decision_reasoning TEXT;
    rate_info RECORD;
BEGIN
    -- Authentication check
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'not logged in';
    END IF;

    -- Convert device_id to UUID or generate one
    BEGIN
        device_uuid := device_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        device_uuid := gen_random_uuid();
    END;

    -- Check rate limits using the get_rate_limits function
    SELECT subscription_level, rate_limit, recent_searches, is_rate_limited, searches_remaining
    INTO rate_info
    FROM get_rate_limits('product_lookup', device_id);

    -- Handle rate limiting with special response format
    IF rate_info.is_rate_limited THEN
        RETURN QUERY SELECT
            '__RATE_LIMIT_EXCEEDED__'::VARCHAR(255) as ean13,
            rate_info.subscription_level::VARCHAR(255) as upc,
            NULL::VARCHAR(255) as product_name,
            rate_info.rate_limit::VARCHAR(255) as brand,
            NULL::VARCHAR(4096) as ingredients,
            NULL::TEXT as classification,
            NULL::TEXT as imageurl,
            NOW() as created,
            NOW() as lastupdated;
        RETURN;
    END IF;

    -- Product lookup
    SELECT COUNT(*) INTO product_found
    FROM public.products p
    WHERE p.upc = barcode OR p.ean13 = barcode;
    
    -- Determine final vegan status and reasoning
    IF product_found > 0 THEN
        -- Get classification from the returned product
        SELECT p.classification INTO product_classification
        FROM public.products p
        WHERE p.upc = barcode OR p.ean13 = barcode
        LIMIT 1;
        
        -- Use the classification field
        IF product_classification IS NOT NULL AND product_classification IN ('vegan', 'vegetarian', 'non-vegetarian') THEN
            -- Use classification field
            final_vegan_status := product_classification;
            decision_reasoning := format('Database hit: Using classification field "%s"', product_classification);
        ELSE
            -- No valid classification available, will fall back to Open Food Facts
            final_vegan_status := 'undetermined';
            decision_reasoning := format('Database hit: No valid classification (classification: "%s") - will fall back to Open Food Facts', 
                COALESCE(product_classification, 'null'));
        END IF;
    ELSE
        decision_reasoning := 'Database miss: Product not found in database - will fall back to Open Food Facts';
    END IF;
    
    -- Log the search operation
    INSERT INTO public.actionlog (type, input, userid, deviceid, result, metadata)
    VALUES (
        'product_lookup',
        barcode,
        current_user_id,
        device_uuid,
        CASE WHEN product_found > 0 THEN 'found' ELSE 'not_found' END,
        jsonb_build_object(
            'product_found', product_found > 0,
            'barcode_type', CASE WHEN LENGTH(barcode) = 12 THEN 'UPC' WHEN LENGTH(barcode) = 13 THEN 'EAN13' ELSE 'OTHER' END,
            'classification', final_vegan_status,
            'decision_reasoning', decision_reasoning,
            'subscription_level', rate_info.subscription_level,
            'searches_remaining', rate_info.searches_remaining
        )
    );

    -- Return the product data or empty result
    IF product_found > 0 THEN
        RETURN QUERY
        SELECT 
            p.ean13,
            p.upc,
            p.product_name,
            p.brand,
            p.ingredients,
            p.classification,
            p.imageurl,
            p.created,
            p.lastupdated
        FROM public.products p
        WHERE p.upc = barcode OR p.ean13 = barcode
        LIMIT 1;
    ELSE
        -- Return a null result to indicate not found
        RETURN QUERY SELECT
            NULL::VARCHAR(255) as ean13,
            NULL::VARCHAR(255) as upc,
            NULL::VARCHAR(255) as product_name,
            NULL::VARCHAR(255) as brand,
            NULL::VARCHAR(4096) as ingredients,
            NULL::TEXT as classification,
            NULL::TEXT as imageurl,
            NULL::TIMESTAMP WITH TIME ZONE as created,
            NULL::TIMESTAMP WITH TIME ZONE as lastupdated
        WHERE FALSE; -- This ensures no rows are returned for not found case
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error
        INSERT INTO public.actionlog (type, input, userid, deviceid, result, metadata)
        VALUES (
            'product_lookup',
            barcode,
            COALESCE(current_user_id, '00000000-0000-0000-0000-000000000000'::UUID),
            COALESCE(device_uuid, '00000000-0000-0000-0000-000000000000'::UUID),
            'error',
            jsonb_build_object(
                'error_message', SQLERRM,
                'error_state', SQLSTATE,
                'barcode', barcode
            )
        );
        RAISE;
END;
$$;


ALTER FUNCTION "public"."lookup_product"("barcode" "text", "device_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_ingredients"("search_term" "text") RETURNS TABLE("title" character varying, "class" character varying, "productcount" integer, "lastupdated" timestamp with time zone, "created" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."search_ingredients"("search_term" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_ingredients"("search_term" "text", "device_id" "text") RETURNS TABLE("title" character varying, "class" character varying, "productcount" integer, "lastupdated" timestamp with time zone, "created" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    current_user_id UUID;
    device_uuid UUID;
    search_result_count INTEGER;
    rate_info RECORD;
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
    
    -- Validate and convert device_id to UUID
    BEGIN
        device_uuid := device_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'device_id must be a valid UUID';
    END;
    
    -- Get rate limit information with device tracking
    SELECT * INTO rate_info FROM get_rate_limits('ingredient_search', device_id);
    
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
            INSERT INTO public.actionlog (type, input, userid, deviceid, result, metadata)
            VALUES (
                'ingredient_search',
                search_term,
                current_user_id,
                device_uuid,
                format('Found %s exact matches', search_result_count),
                json_build_object(
                    'device_id', device_id,
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
            INSERT INTO public.actionlog (type, input, userid, deviceid, result, metadata)
            VALUES (
                'ingredient_search',
                search_term,
                current_user_id,
                device_uuid,
                format('Found %s starts-with matches', search_result_count),
                json_build_object(
                    'device_id', device_id,
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
        INSERT INTO public.actionlog (type, input, userid, deviceid, result, metadata)
        VALUES (
            'ingredient_search',
            search_term,
            current_user_id,
            device_uuid,
            CASE 
                WHEN search_result_count > 0 THEN format('Found %s contains matches', search_result_count)
                ELSE 'No matches found'
            END,
            json_build_object(
                'device_id', device_id,
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


ALTER FUNCTION "public"."search_ingredients"("search_term" "text", "device_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_product"("barcode" "text") RETURNS TABLE("id" integer, "upc" character varying, "ean13" character varying, "product_name" character varying, "brand" character varying, "ingredients" "text", "calculated_code" character varying, "override_code" character varying, "image_url" character varying, "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    current_user_id UUID;
    product_found BOOLEAN := FALSE;
    final_vegan_status TEXT;
    decision_reasoning TEXT;
    rate_info RECORD;
    found_count INTEGER;
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
    
    -- Get rate limit information
    SELECT * INTO rate_info FROM get_rate_limits('product_lookup');
    
    -- Check if user has exceeded rate limit
    IF rate_info.is_rate_limited THEN
        -- Return special rate limit response instead of throwing error
        RETURN QUERY
        SELECT 
            -1::INTEGER as id,
            '__RATE_LIMIT_EXCEEDED__'::VARCHAR(255) as upc,
            rate_info.subscription_level::VARCHAR(255) as ean13,
            'Rate limit exceeded'::VARCHAR(255) as product_name,
            rate_info.rate_limit::VARCHAR(255) as brand,
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
    GET DIAGNOSTICS found_count = ROW_COUNT;
    product_found := found_count > 0;
    
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
            'subscription_level', rate_info.subscription_level,
            'rate_limit', rate_info.rate_limit,
            'searches_used', rate_info.recent_searches + 1,
            'search_timestamp', NOW()
        )
    );
    
    RETURN;
END;
$$;


ALTER FUNCTION "public"."search_product"("barcode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_subscription_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_subscription_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."actionlog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "input" "text" NOT NULL,
    "userid" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "result" "text",
    "metadata" "jsonb",
    "deviceid" "uuid"
);


ALTER TABLE "public"."actionlog" OWNER TO "postgres";


COMMENT ON COLUMN "public"."actionlog"."deviceid" IS 'UUID identifying the device making the request, used for device-based rate limiting. NULL for legacy records before device tracking was implemented.';



CREATE TABLE IF NOT EXISTS "public"."ingr" (
    "title" "text",
    "class" "text",
    "count" integer
);


ALTER TABLE "public"."ingr" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingr1" (
    "title" "text" NOT NULL,
    "class" "text" NOT NULL,
    "productcount" numeric
);


ALTER TABLE "public"."ingr1" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingr2025_07_16" (
    "title" "text" NOT NULL,
    "class" "text",
    "count" integer
);


ALTER TABLE "public"."ingr2025_07_16" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingredients" (
    "title" character varying(255) NOT NULL,
    "class" character varying(255),
    "productcount" integer DEFAULT 0 NOT NULL,
    "lastupdated" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "primary_class" "text"
);


ALTER TABLE "public"."ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "product_name" character varying(255),
    "brand" character varying(255),
    "upc" character varying(255),
    "ean13" character varying(255) NOT NULL,
    "ingredients" character varying(4096),
    "lastupdated" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "analysis" character varying(4096),
    "created" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "mfg" character varying(255),
    "imageurl" "text",
    "classification" "text",
    "issues" "text"
);


ALTER TABLE "public"."products" OWNER TO "postgres";


COMMENT ON COLUMN "public"."products"."imageurl" IS 'url of product image';



COMMENT ON COLUMN "public"."products"."classification" IS 'primary classification (vegan, vegetarian, non-vegetarian, undetermined)';



CREATE TABLE IF NOT EXISTS "public"."user_subscription" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subscription_level" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    CONSTRAINT "user_subscription_subscription_level_check" CHECK (("subscription_level" = ANY (ARRAY['free'::"text", 'standard'::"text", 'premium'::"text"])))
);


ALTER TABLE "public"."user_subscription" OWNER TO "postgres";


ALTER TABLE ONLY "public"."actionlog"
    ADD CONSTRAINT "actionlog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingr2025_07_16"
    ADD CONSTRAINT "ingr2025_07_16_pkey" PRIMARY KEY ("title");



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_title_unique" UNIQUE ("title");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("ean13");



ALTER TABLE ONLY "public"."user_subscription"
    ADD CONSTRAINT "unique_user_subscription" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_subscription"
    ADD CONSTRAINT "user_subscription_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_actionlog_created_at" ON "public"."actionlog" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_actionlog_deviceid_type_created" ON "public"."actionlog" USING "btree" ("deviceid", "type", "created_at");



CREATE INDEX "idx_actionlog_type" ON "public"."actionlog" USING "btree" ("type");



CREATE INDEX "idx_actionlog_type_created" ON "public"."actionlog" USING "btree" ("type", "created_at" DESC);



CREATE INDEX "idx_actionlog_userid" ON "public"."actionlog" USING "btree" ("userid");



CREATE INDEX "idx_actionlog_userid_type_created" ON "public"."actionlog" USING "btree" ("userid", "type", "created_at" DESC);



CREATE INDEX "idx_user_subscription_expires_at" ON "public"."user_subscription" USING "btree" ("expires_at");



CREATE INDEX "idx_user_subscription_level" ON "public"."user_subscription" USING "btree" ("subscription_level");



CREATE INDEX "idx_user_subscription_user_id" ON "public"."user_subscription" USING "btree" ("user_id");



CREATE INDEX "ingr_title_idx" ON "public"."ingr" USING "btree" ("title");



CREATE INDEX "ingredients_class_idx" ON "public"."ingredients" USING "btree" ("class");



CREATE INDEX "ix_ingr" ON "public"."ingr1" USING "btree" ("title");



CREATE INDEX "products_brand_idx" ON "public"."products" USING "btree" ("brand");



CREATE INDEX "products_mfg_idx" ON "public"."products" USING "btree" ("mfg");



CREATE INDEX "products_name_idx" ON "public"."products" USING "btree" ("product_name");



CREATE INDEX "products_productcount_idx" ON "public"."ingredients" USING "btree" ("productcount");



CREATE INDEX "products_upc_created" ON "public"."products" USING "btree" ("created");



CREATE INDEX "products_upc_idx" ON "public"."products" USING "btree" ("upc");



CREATE OR REPLACE TRIGGER "trigger_user_subscription_updated_at" BEFORE UPDATE ON "public"."user_subscription" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_subscription_updated_at"();



ALTER TABLE "public"."actionlog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ingr" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ingr1" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ingr2025_07_16" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_subscription" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."classify_all_products"() TO "service_role";



GRANT ALL ON FUNCTION "public"."classify_upc"("input_upc" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_classes_for_upc"("input_upc" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_ingredients_for_upc"("input_upc" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_primary_classes_for_upc"("input_upc" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_rate_limits"("action_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_rate_limits"("action_type" "text", "device_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_rate_limits"("action_type" "text", "device_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rate_limits"("action_type" "text", "device_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_subscription_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_subscription_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_subscription_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."lookup_product"("barcode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lookup_product"("barcode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lookup_product"("barcode" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."lookup_product"("barcode" "text", "device_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lookup_product"("barcode" "text", "device_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lookup_product"("barcode" "text", "device_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_ingredients"("search_term" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_ingredients"("search_term" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_ingredients"("search_term" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_ingredients"("search_term" "text", "device_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_ingredients"("search_term" "text", "device_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_ingredients"("search_term" "text", "device_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_product"("barcode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_product"("barcode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_product"("barcode" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_subscription_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_subscription_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_subscription_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."actionlog" TO "anon";
GRANT ALL ON TABLE "public"."actionlog" TO "authenticated";
GRANT ALL ON TABLE "public"."actionlog" TO "service_role";



GRANT ALL ON TABLE "public"."ingr" TO "anon";
GRANT ALL ON TABLE "public"."ingr" TO "authenticated";
GRANT ALL ON TABLE "public"."ingr" TO "service_role";



GRANT ALL ON TABLE "public"."ingr1" TO "anon";
GRANT ALL ON TABLE "public"."ingr1" TO "authenticated";
GRANT ALL ON TABLE "public"."ingr1" TO "service_role";



GRANT ALL ON TABLE "public"."ingr2025_07_16" TO "anon";
GRANT ALL ON TABLE "public"."ingr2025_07_16" TO "authenticated";
GRANT ALL ON TABLE "public"."ingr2025_07_16" TO "service_role";



GRANT ALL ON TABLE "public"."ingredients" TO "anon";
GRANT ALL ON TABLE "public"."ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."user_subscription" TO "anon";
GRANT ALL ON TABLE "public"."user_subscription" TO "authenticated";
GRANT ALL ON TABLE "public"."user_subscription" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






RESET ALL;
