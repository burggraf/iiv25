

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



CREATE OR REPLACE FUNCTION "public"."admin_actionlog_paginated"("page_size" integer DEFAULT 20, "page_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result JSONB;
  activity_data JSONB;
  total_count BIGINT;
BEGIN
  -- Check admin access
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Get total count of activity logs
  SELECT COUNT(*) INTO total_count FROM actionlog;

  -- Get paginated activity logs with user email lookup
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'type', a.type,
      'input', a.input,
      'result', a.result,
      'created_at', a.created_at,
      'userid', a.userid,
      'user_email', COALESCE(u.email, 'anonymous user'),
      'metadata', a.metadata,
      'deviceid', a.deviceid
    )
    ORDER BY a.created_at DESC
  ) INTO activity_data
  FROM (
    SELECT 
      al.id,
      al.type,
      al.input,
      al.result,
      al.created_at,
      al.userid,
      al.metadata,
      al.deviceid
    FROM actionlog al
    ORDER BY al.created_at DESC
    LIMIT page_size OFFSET page_offset
  ) a
  LEFT JOIN auth.users u ON a.userid = u.id;

  -- Build final result with both activities and pagination info
  result := jsonb_build_object(
    'activities', COALESCE(activity_data, '[]'::jsonb),
    'total_count', total_count,
    'page_size', page_size,
    'page_offset', page_offset,
    'has_more', (page_offset + page_size) < total_count
  );

  RETURN result;
END;
$$;


ALTER FUNCTION "public"."admin_actionlog_paginated"("page_size" integer, "page_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_actionlog_recent"("limit_count" integer DEFAULT 100) RETURNS TABLE("id" "uuid", "type" "text", "input" "text", "userid" "uuid", "created_at" timestamp with time zone, "result" "text", "metadata" "jsonb", "deviceid" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check admin access
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  RETURN QUERY
  SELECT a.id, a.type, a.input, a.userid, a.created_at, a.result, a.metadata, a.deviceid
  FROM actionlog a
  ORDER BY a.created_at DESC
  LIMIT limit_count;
END;
$$;


ALTER FUNCTION "public"."admin_actionlog_recent"("limit_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_check_user_access"("user_email" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Admin email whitelist - update with actual admin emails
  RETURN user_email = ANY(ARRAY[
    'markb@mantisbible.com',
    'cburggraf@me.com'
    -- Add more admin emails here
  ]);
END;
$$;


ALTER FUNCTION "public"."admin_check_user_access"("user_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_classify_upc"("upc_code" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check admin access
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Call the existing classify_upc function with elevated privileges
  PERFORM classify_upc(upc_code);
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error and re-raise it
    RAISE NOTICE 'admin_classify_upc failed for UPC %: %', upc_code, SQLERRM;
    RAISE;
END;
$$;


ALTER FUNCTION "public"."admin_classify_upc"("upc_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_ingredient"("ingredient_title" "text", "ingredient_class" "text" DEFAULT NULL::"text", "ingredient_primary_class" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check admin access
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  INSERT INTO ingredients (title, class, primary_class, productcount, lastupdated, created)
  VALUES (ingredient_title, ingredient_class, ingredient_primary_class, 0, NOW(), NOW());

  RETURN TRUE;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ingredient with title "%" already exists', ingredient_title;
END;
$$;


ALTER FUNCTION "public"."admin_create_ingredient"("ingredient_title" "text", "ingredient_class" "text", "ingredient_primary_class" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_ingredient"("ingredient_title" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check admin access
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  DELETE FROM ingredients WHERE title = ingredient_title;
  
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."admin_delete_ingredient"("ingredient_title" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_ingredient_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  stats JSONB := '{}';
  total_count BIGINT;
  classified_count BIGINT;
  unclassified_count BIGINT;
  class_distribution JSONB;
  primary_class_distribution JSONB;
BEGIN
  -- Check admin access
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Get total ingredient count
  SELECT COUNT(*) INTO total_count FROM ingredients;

  -- Get classified count (has class OR primary_class)
  SELECT COUNT(*) INTO classified_count 
  FROM ingredients 
  WHERE class IS NOT NULL OR primary_class IS NOT NULL;

  -- Calculate unclassified
  unclassified_count := total_count - classified_count;

  -- Get class distribution
  SELECT jsonb_agg(
    jsonb_build_object(
      'class', COALESCE(class, 'Unclassified'),
      'count', count,
      'percentage', ROUND((count::DECIMAL / total_count) * 100, 1)
    )
    ORDER BY count DESC
  ) INTO class_distribution
  FROM (
    SELECT COALESCE(class, 'Unclassified') as class, COUNT(*) as count
    FROM ingredients
    GROUP BY class
  ) class_stats;

  -- Get primary class distribution  
  SELECT jsonb_agg(
    jsonb_build_object(
      'class', COALESCE(primary_class, 'Unclassified'),
      'count', count,
      'percentage', ROUND((count::DECIMAL / total_count) * 100, 1)
    )
    ORDER BY count DESC
  ) INTO primary_class_distribution
  FROM (
    SELECT COALESCE(primary_class, 'Unclassified') as primary_class, COUNT(*) as count
    FROM ingredients
    GROUP BY primary_class
  ) primary_class_stats;

  -- Build final result
  stats := jsonb_build_object(
    'total_ingredients', total_count,
    'with_classification', classified_count,
    'without_classification', unclassified_count,
    'class_distribution', COALESCE(class_distribution, '[]'::jsonb),
    'primary_class_distribution', COALESCE(primary_class_distribution, '[]'::jsonb)
  );

  RETURN stats;
END;
$$;


ALTER FUNCTION "public"."admin_get_ingredient_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_ingredients_for_upc"("product_upc" "text") RETURNS TABLE("title" "text", "class" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check admin access
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Return ingredients for the given UPC
  RETURN QUERY
  SELECT (get_ingredients_for_upc(product_upc)).title,
         (get_ingredients_for_upc(product_upc)).class;
END;
$$;


ALTER FUNCTION "public"."admin_get_ingredients_for_upc"("product_upc" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_product"("product_upc" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  product_data JSONB;
BEGIN
  -- Check admin access
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Get product by UPC
  SELECT to_jsonb(p.*) INTO product_data
  FROM products p
  WHERE p.upc = product_upc;

  -- Return product data or null if not found
  RETURN product_data;
END;
$$;


ALTER FUNCTION "public"."admin_get_product"("product_upc" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_product_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  stats JSONB := '{}';
  total_count BIGINT;
  classified_count BIGINT;
  unclassified_count BIGINT;
  vegan_count BIGINT;
  vegetarian_count BIGINT;
  classification_distribution JSONB;
  brand_distribution JSONB;
BEGIN
  -- Check admin access
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Get total product count
  SELECT COUNT(*) INTO total_count FROM products;

  -- Get classified count (has classification)
  SELECT COUNT(*) INTO classified_count 
  FROM products 
  WHERE classification IS NOT NULL AND classification != '';

  -- Calculate unclassified
  unclassified_count := total_count - classified_count;

  -- Get vegan count
  SELECT COUNT(*) INTO vegan_count 
  FROM products 
  WHERE LOWER(classification) = 'vegan';

  -- Get vegetarian count  
  SELECT COUNT(*) INTO vegetarian_count 
  FROM products 
  WHERE LOWER(classification) = 'vegetarian';

  -- Get classification distribution
  SELECT jsonb_agg(
    jsonb_build_object(
      'classification', COALESCE(classification, 'Unclassified'),
      'count', count,
      'percentage', ROUND((count::DECIMAL / total_count) * 100, 1)
    )
    ORDER BY count DESC
  ) INTO classification_distribution
  FROM (
    SELECT COALESCE(classification, 'Unclassified') as classification, COUNT(*) as count
    FROM products
    GROUP BY classification
  ) class_stats;

  -- Get brand distribution (top 15)
  SELECT jsonb_agg(
    jsonb_build_object(
      'brand', COALESCE(brand, 'Unknown'),
      'count', count,
      'percentage', ROUND((count::DECIMAL / total_count) * 100, 1)
    )
    ORDER BY count DESC
  ) INTO brand_distribution
  FROM (
    SELECT COALESCE(brand, 'Unknown') as brand, COUNT(*) as count
    FROM products
    GROUP BY brand
    ORDER BY COUNT(*) DESC
    LIMIT 15
  ) brand_stats;

  -- Build final result
  stats := jsonb_build_object(
    'total_products', total_count,
    'classified_products', classified_count,
    'unclassified_products', unclassified_count,
    'vegan_products', vegan_count,
    'vegetarian_products', vegetarian_count,
    'classification_distribution', COALESCE(classification_distribution, '[]'::jsonb),
    'brand_distribution', COALESCE(brand_distribution, '[]'::jsonb)
  );

  RETURN stats;
END;
$$;


ALTER FUNCTION "public"."admin_get_product_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_unclassified_ingredients"("page_size" integer DEFAULT 20, "page_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result JSONB;
  ingredients_data JSONB;
  total_count BIGINT;
BEGIN
  -- Check admin access
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Get total count of unclassified ingredients
  SELECT COUNT(*) INTO total_count
  FROM ingredients
  WHERE class IS NULL;

  -- Get paginated unclassified ingredients ordered by product count descending
  SELECT jsonb_agg(
    jsonb_build_object(
      'title', title,
      'class', class,
      'primary_class', primary_class,
      'productcount', productcount,
      'lastupdated', lastupdated,
      'created', created
    )
    ORDER BY productcount DESC
  ) INTO ingredients_data
  FROM (
    SELECT title, class, primary_class, productcount, lastupdated, created
    FROM ingredients
    WHERE class IS NULL
    ORDER BY productcount DESC
    LIMIT page_size OFFSET page_offset
  ) paginated_ingredients;

  -- Build result with both ingredients and pagination info
  result := jsonb_build_object(
    'ingredients', COALESCE(ingredients_data, '[]'::jsonb),
    'total_count', total_count
  );

  RETURN result;
END;
$$;


ALTER FUNCTION "public"."admin_get_unclassified_ingredients"("page_size" integer, "page_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_ingredient_stats"() RETURNS TABLE("stat_type" "text", "stat_value" "text", "count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check admin access
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Return stats for classes
  RETURN QUERY
  SELECT 'class'::TEXT, COALESCE(i.class, 'NULL'), COUNT(*)
  FROM ingredients i
  GROUP BY i.class
  ORDER BY COUNT(*) DESC;

  -- Return stats for primary_classes
  RETURN QUERY
  SELECT 'primary_class'::TEXT, COALESCE(i.primary_class, 'NULL'), COUNT(*)
  FROM ingredients i
  GROUP BY i.primary_class
  ORDER BY COUNT(*) DESC;
END;
$$;


ALTER FUNCTION "public"."admin_ingredient_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_product_stats"() RETURNS TABLE("stat_type" "text", "stat_value" "text", "count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check admin access
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Classification stats
  RETURN QUERY
  SELECT 'classification'::TEXT, COALESCE(p.classification, 'NULL'), COUNT(*)
  FROM products p
  GROUP BY p.classification
  ORDER BY COUNT(*) DESC;

  -- Brand stats (top 20)
  RETURN QUERY
  SELECT 'brand'::TEXT, COALESCE(p.brand, 'NULL'), COUNT(*)
  FROM products p
  GROUP BY p.brand
  ORDER BY COUNT(*) DESC
  LIMIT 20;
END;
$$;


ALTER FUNCTION "public"."admin_product_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_search_ingredients"("query" "text", "limit_count" integer DEFAULT 50) RETURNS TABLE("title" "text", "class" "text", "primary_class" "text", "productcount" integer, "lastupdated" timestamp with time zone, "created" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check admin access first
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  RETURN QUERY
  SELECT i.title::TEXT, i.class::TEXT, i.primary_class, i.productcount, i.lastupdated, i.created
  FROM ingredients i
  WHERE i.title ILIKE '%' || query || '%'
  ORDER BY i.productcount DESC, i.title ASC
  LIMIT limit_count;
END;
$$;


ALTER FUNCTION "public"."admin_search_ingredients"("query" "text", "limit_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_search_ingredients_exact"("query" "text", "search_type" "text" DEFAULT 'exact'::"text", "limit_count" integer DEFAULT 50) RETURNS TABLE("title" "text", "class" "text", "primary_class" "text", "productcount" integer, "lastupdated" timestamp with time zone, "created" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check admin access first
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Execute different search based on search_type
  IF search_type = 'exact' THEN
    -- Exact match
    RETURN QUERY
    SELECT i.title::TEXT, i.class::TEXT, i.primary_class, i.productcount, i.lastupdated, i.created
    FROM ingredients i
    WHERE i.title = query
    ORDER BY i.productcount DESC, i.title ASC
    LIMIT limit_count;
    
  ELSIF search_type = 'starts_with' THEN
    -- Starts with pattern (query should end with %)
    RETURN QUERY
    SELECT i.title::TEXT, i.class::TEXT, i.primary_class, i.productcount, i.lastupdated, i.created
    FROM ingredients i
    WHERE i.title ILIKE query
    ORDER BY i.productcount DESC, i.title ASC
    LIMIT limit_count;
    
  ELSIF search_type = 'ends_with' THEN
    -- Ends with pattern (query should start with %)
    RETURN QUERY
    SELECT i.title::TEXT, i.class::TEXT, i.primary_class, i.productcount, i.lastupdated, i.created
    FROM ingredients i
    WHERE i.title ILIKE query
    ORDER BY i.productcount DESC, i.title ASC
    LIMIT limit_count;
    
  ELSIF search_type = 'contains' THEN
    -- Contains pattern (query should start and end with %)
    RETURN QUERY
    SELECT i.title::TEXT, i.class::TEXT, i.primary_class, i.productcount, i.lastupdated, i.created
    FROM ingredients i
    WHERE i.title ILIKE query
    ORDER BY i.productcount DESC, i.title ASC
    LIMIT limit_count;
    
  ELSIF search_type = 'pattern' THEN
    -- Custom pattern (query contains % in middle or other positions)
    RETURN QUERY
    SELECT i.title::TEXT, i.class::TEXT, i.primary_class, i.productcount, i.lastupdated, i.created
    FROM ingredients i
    WHERE i.title ILIKE query
    ORDER BY i.productcount DESC, i.title ASC
    LIMIT limit_count;
    
  ELSE
    -- Default to exact match for unknown search types
    RETURN QUERY
    SELECT i.title::TEXT, i.class::TEXT, i.primary_class, i.productcount, i.lastupdated, i.created
    FROM ingredients i
    WHERE i.title = query
    ORDER BY i.productcount DESC, i.title ASC
    LIMIT limit_count;
  END IF;
END;
$$;


ALTER FUNCTION "public"."admin_search_ingredients_exact"("query" "text", "search_type" "text", "limit_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_search_ingredients_with_filters"("query" "text", "search_type" "text" DEFAULT 'exact'::"text", "filter_classes" "text"[] DEFAULT NULL::"text"[], "filter_primary_classes" "text"[] DEFAULT NULL::"text"[], "limit_count" integer DEFAULT 50) RETURNS TABLE("title" "text", "class" "text", "primary_class" "text", "productcount" integer, "lastupdated" timestamp with time zone, "created" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  base_query TEXT;
  where_conditions TEXT[] := ARRAY[]::TEXT[];
  final_query TEXT;
BEGIN
  -- Check admin access first
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Build base query
  base_query := 'SELECT i.title::TEXT, i.class::TEXT, i.primary_class, i.productcount, i.lastupdated, i.created FROM ingredients i';

  -- Add search condition based on search_type
  IF search_type = 'exact' THEN
    where_conditions := array_append(where_conditions, 'i.title = ' || quote_literal(query));
  ELSIF search_type = 'starts_with' OR search_type = 'ends_with' OR search_type = 'contains' OR search_type = 'pattern' THEN
    where_conditions := array_append(where_conditions, 'i.title ILIKE ' || quote_literal(query));
  ELSE
    -- Default to exact match for unknown search types
    where_conditions := array_append(where_conditions, 'i.title = ' || quote_literal(query));
  END IF;

  -- Add class filter if provided
  IF filter_classes IS NOT NULL AND array_length(filter_classes, 1) > 0 THEN
    -- Handle null values in the filter
    IF 'null' = ANY(filter_classes) THEN
      -- Include both specified classes and null values
      IF array_length(filter_classes, 1) > 1 THEN
        where_conditions := array_append(where_conditions, 
          '(i.class = ANY(' || quote_literal(filter_classes) || '::TEXT[]) OR i.class IS NULL)');
      ELSE
        -- Only null requested
        where_conditions := array_append(where_conditions, 'i.class IS NULL');
      END IF;
    ELSE
      -- No null values, just use IN clause
      where_conditions := array_append(where_conditions, 
        'i.class = ANY(' || quote_literal(filter_classes) || '::TEXT[])');
    END IF;
  END IF;

  -- Add primary_class filter if provided
  IF filter_primary_classes IS NOT NULL AND array_length(filter_primary_classes, 1) > 0 THEN
    -- Handle null values in the filter
    IF 'null' = ANY(filter_primary_classes) THEN
      -- Include both specified primary_classes and null values
      IF array_length(filter_primary_classes, 1) > 1 THEN
        where_conditions := array_append(where_conditions, 
          '(i.primary_class = ANY(' || quote_literal(filter_primary_classes) || '::TEXT[]) OR i.primary_class IS NULL)');
      ELSE
        -- Only null requested
        where_conditions := array_append(where_conditions, 'i.primary_class IS NULL');
      END IF;
    ELSE
      -- No null values, just use IN clause
      where_conditions := array_append(where_conditions, 
        'i.primary_class = ANY(' || quote_literal(filter_primary_classes) || '::TEXT[])');
    END IF;
  END IF;

  -- Build final query
  final_query := base_query;
  IF array_length(where_conditions, 1) > 0 THEN
    final_query := final_query || ' WHERE ' || array_to_string(where_conditions, ' AND ');
  END IF;
  final_query := final_query || ' ORDER BY i.productcount DESC, i.title ASC LIMIT ' || limit_count;

  -- Execute and return
  RETURN QUERY EXECUTE final_query;
END;
$$;


ALTER FUNCTION "public"."admin_search_ingredients_with_filters"("query" "text", "search_type" "text", "filter_classes" "text"[], "filter_primary_classes" "text"[], "limit_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_search_ingredients_with_filters_paginated"("query" "text", "search_type" "text" DEFAULT 'exact'::"text", "filter_classes" "text"[] DEFAULT NULL::"text"[], "filter_primary_classes" "text"[] DEFAULT NULL::"text"[], "page_size" integer DEFAULT 50, "page_offset" integer DEFAULT 0) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  base_query TEXT;
  count_query TEXT;
  where_conditions TEXT[] := ARRAY[]::TEXT[];
  final_query TEXT;
  total_count INT;
  result_ingredients JSON;
  has_more BOOLEAN;
BEGIN
  -- Check admin access first
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Build base query
  base_query := 'SELECT i.title::TEXT, i.class::TEXT, i.primary_class, i.productcount, i.lastupdated, i.created FROM ingredients i';
  count_query := 'SELECT COUNT(*) FROM ingredients i';

  -- Add search condition based on search_type
  IF search_type = 'exact' THEN
    where_conditions := array_append(where_conditions, 'i.title = ' || quote_literal(query));
  ELSIF search_type = 'starts_with' OR search_type = 'ends_with' OR search_type = 'contains' OR search_type = 'pattern' THEN
    where_conditions := array_append(where_conditions, 'i.title ILIKE ' || quote_literal(query));
  ELSE
    -- Default to exact match for unknown search types
    where_conditions := array_append(where_conditions, 'i.title = ' || quote_literal(query));
  END IF;

  -- Add class filter if provided
  IF filter_classes IS NOT NULL AND array_length(filter_classes, 1) > 0 THEN
    -- Handle null values in the filter
    IF 'null' = ANY(filter_classes) THEN
      -- Include both specified classes and null values
      IF array_length(filter_classes, 1) > 1 THEN
        where_conditions := array_append(where_conditions, 
          '(i.class = ANY(' || quote_literal(filter_classes) || '::TEXT[]) OR i.class IS NULL)');
      ELSE
        -- Only null requested
        where_conditions := array_append(where_conditions, 'i.class IS NULL');
      END IF;
    ELSE
      -- No null values, just use IN clause
      where_conditions := array_append(where_conditions, 
        'i.class = ANY(' || quote_literal(filter_classes) || '::TEXT[])');
    END IF;
  END IF;

  -- Add primary_class filter if provided
  IF filter_primary_classes IS NOT NULL AND array_length(filter_primary_classes, 1) > 0 THEN
    -- Handle null values in the filter
    IF 'null' = ANY(filter_primary_classes) THEN
      -- Include both specified primary_classes and null values
      IF array_length(filter_primary_classes, 1) > 1 THEN
        where_conditions := array_append(where_conditions, 
          '(i.primary_class = ANY(' || quote_literal(filter_primary_classes) || '::TEXT[]) OR i.primary_class IS NULL)');
      ELSE
        -- Only null requested
        where_conditions := array_append(where_conditions, 'i.primary_class IS NULL');
      END IF;
    ELSE
      -- No null values, just use IN clause
      where_conditions := array_append(where_conditions, 
        'i.primary_class = ANY(' || quote_literal(filter_primary_classes) || '::TEXT[])');
    END IF;
  END IF;

  -- Build WHERE clause
  IF array_length(where_conditions, 1) > 0 THEN
    base_query := base_query || ' WHERE ' || array_to_string(where_conditions, ' AND ');
    count_query := count_query || ' WHERE ' || array_to_string(where_conditions, ' AND ');
  END IF;

  -- Get total count
  EXECUTE count_query INTO total_count;

  -- Build final query with pagination
  final_query := base_query || ' ORDER BY i.productcount DESC, i.title ASC LIMIT ' || page_size || ' OFFSET ' || page_offset;

  -- Execute and get results as JSON
  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || final_query || ') t' INTO result_ingredients;

  -- Determine if there are more results
  has_more := (page_offset + page_size) < total_count;

  -- Return structured response
  RETURN json_build_object(
    'ingredients', COALESCE(result_ingredients, '[]'::json),
    'total_count', total_count,
    'page_size', page_size,
    'page_offset', page_offset,
    'has_more', has_more
  );
END;
$$;


ALTER FUNCTION "public"."admin_search_ingredients_with_filters_paginated"("query" "text", "search_type" "text", "filter_classes" "text"[], "filter_primary_classes" "text"[], "page_size" integer, "page_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_search_products"("query" "text", "limit_count" integer DEFAULT 50) RETURNS TABLE("product_name" "text", "brand" "text", "upc" "text", "ean13" "text", "ingredients" "text", "analysis" "text", "classification" "text", "lastupdated" timestamp with time zone, "created" timestamp with time zone, "mfg" "text", "imageurl" "text", "issues" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check admin access
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  RETURN QUERY
  SELECT p.product_name::TEXT, p.brand::TEXT, p.upc::TEXT, p.ean13::TEXT, 
         p.ingredients::TEXT, p.analysis::TEXT, p.classification, 
         p.lastupdated, p.created, p.mfg::TEXT, p.imageurl, p.issues
  FROM products p
  WHERE p.product_name ILIKE '%' || query || '%' 
     OR p.brand ILIKE '%' || query || '%'
     OR p.upc = query
  ORDER BY p.lastupdated DESC
  LIMIT limit_count;
END;
$$;


ALTER FUNCTION "public"."admin_search_products"("query" "text", "limit_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_ingredient"("ingredient_title" "text", "new_class" "text" DEFAULT NULL::"text", "new_primary_class" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check admin access
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  UPDATE ingredients 
  SET 
    class = COALESCE(new_class, class),
    primary_class = COALESCE(new_primary_class, primary_class),
    lastupdated = NOW()
  WHERE title = ingredient_title;

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."admin_update_ingredient"("ingredient_title" "text", "new_class" "text", "new_primary_class" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_product"("product_upc" "text", "updates" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check admin access
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  UPDATE products 
  SET 
    product_name = COALESCE((updates ->> 'product_name')::TEXT, product_name),
    brand = COALESCE((updates ->> 'brand')::TEXT, brand),
    upc = COALESCE((updates ->> 'upc')::TEXT, upc),
    ingredients = COALESCE((updates ->> 'ingredients')::TEXT, ingredients),
    analysis = COALESCE((updates ->> 'analysis')::TEXT, analysis),
    classification = COALESCE((updates ->> 'classification')::TEXT, classification),
    mfg = COALESCE((updates ->> 'mfg')::TEXT, mfg),
    imageurl = COALESCE((updates ->> 'imageurl')::TEXT, imageurl),
    issues = COALESCE((updates ->> 'issues')::TEXT, issues),
    lastupdated = NOW()
  WHERE upc = product_upc;

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."admin_update_product"("product_upc" "text", "updates" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_user_subscription"("subscription_id" "uuid", "updates" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check admin access
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  UPDATE user_subscription 
  SET 
    subscription_level = COALESCE((updates ->> 'subscription_level')::TEXT, subscription_level),
    expires_at = COALESCE((updates ->> 'expires_at')::TIMESTAMPTZ, expires_at),
    is_active = COALESCE((updates ->> 'is_active')::BOOLEAN, is_active),
    updated_at = NOW()
  WHERE id = subscription_id;

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."admin_update_user_subscription"("subscription_id" "uuid", "updates" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_user_stats"() RETURNS TABLE("stat_type" "text", "count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check admin access
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Total users
  RETURN QUERY
  SELECT 'total_users'::TEXT, COUNT(*)
  FROM auth.users;

  -- Users by authentication method (if available in raw_user_meta_data)
  RETURN QUERY
  SELECT 'email_users'::TEXT, COUNT(*)
  FROM auth.users
  WHERE email IS NOT NULL;

  -- Recent users (last 30 days)
  RETURN QUERY
  SELECT 'recent_users_30d'::TEXT, COUNT(*)
  FROM auth.users
  WHERE created_at >= NOW() - INTERVAL '30 days';
END;
$$;


ALTER FUNCTION "public"."admin_user_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_user_subscription_search"("query" "text" DEFAULT ''::"text", "limit_count" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "user_id" "uuid", "subscription_level" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "expires_at" timestamp with time zone, "is_active" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check admin access
  IF NOT admin_check_user_access(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  RETURN QUERY
  SELECT us.id, us.userid as user_id, us.subscription_level, us.created_at, us.updated_at, us.expires_at, us.is_active
  FROM user_subscription us
  WHERE query = '' OR us.userid::TEXT ILIKE '%' || query || '%'
  ORDER BY us.created_at DESC
  LIMIT limit_count;
END;
$$;


ALTER FUNCTION "public"."admin_user_subscription_search"("query" "text", "limit_count" integer) OWNER TO "postgres";


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
      END as new_classification,
      CASE 
        WHEN class_analysis.may_non_veg_count = 0 AND class_analysis.typically_vegan_count = 0 AND class_analysis.typically_veg_count = 0 AND class_analysis.null_class_count = 0 THEN ''
        ELSE ARRAY_TO_STRING(
          ARRAY_REMOVE(ARRAY[
            CASE WHEN class_analysis.may_non_veg_count > 0 THEN 'may be non-vegetarian' END,
            CASE WHEN class_analysis.typically_vegan_count > 0 THEN 'typically vegan' END,
            CASE WHEN class_analysis.typically_veg_count > 0 THEN 'typically vegetarian' END,
            CASE WHEN class_analysis.null_class_count > 0 THEN 'null' END
          ], NULL),
          ', '
        )
      END as issues_text
    FROM products p
    CROSS JOIN LATERAL (
      SELECT 
        COUNT(*) as total_classes,
        COUNT(*) FILTER (WHERE i.primary_class IN ('non-vegetarian', 'may be non-vegetarian', 'typically non-vegetarian', 'typically non-vegan')) as non_veg_count,
        COUNT(*) FILTER (WHERE i.primary_class = 'undetermined') as undetermined_count,
        COUNT(*) FILTER (WHERE i.primary_class IN ('vegetarian', 'typically vegetarian')) as veg_count,
        COUNT(*) FILTER (WHERE i.class = 'may be non-vegetarian') as may_non_veg_count,
        COUNT(*) FILTER (WHERE i.class = 'typically vegan') as typically_vegan_count,
        COUNT(*) FILTER (WHERE i.class = 'typically vegetarian') as typically_veg_count,
        COUNT(*) FILTER (WHERE i.class IS NULL) as null_class_count
      FROM ingredients i
      WHERE i.title = ANY(
        STRING_TO_ARRAY(
          RTRIM(p.analysis, '~'),
          '~'
        )
      )
    ) as class_analysis
  ),
  updated AS (
    UPDATE products 
    SET 
      classification = pc.new_classification,
      issues = pc.issues_text
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
  WITH analysis_data AS (
    SELECT 
      COUNT(*) as total_classes,
      COUNT(*) FILTER (WHERE i.primary_class IN ('non-vegetarian', 'may be non-vegetarian', 'typically non-vegetarian', 'typically non-vegan')) as non_veg_count,
      COUNT(*) FILTER (WHERE i.primary_class = 'undetermined') as undetermined_count,
      COUNT(*) FILTER (WHERE i.primary_class IN ('vegetarian', 'typically vegetarian')) as veg_count,
      COUNT(*) FILTER (WHERE i.class = 'may be non-vegetarian') as may_non_veg_count,
      COUNT(*) FILTER (WHERE i.class = 'typically vegan') as typically_vegan_count,
      COUNT(*) FILTER (WHERE i.class = 'typically vegetarian') as typically_veg_count,
      COUNT(*) FILTER (WHERE i.class IS NULL) as null_class_count
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
  ),
  classification_result AS (
    SELECT 
      CASE 
        WHEN total_classes = 0 THEN 'undetermined'
        WHEN non_veg_count > 0 THEN 'non-vegetarian'
        WHEN undetermined_count > 0 THEN 'undetermined'
        WHEN veg_count > 0 THEN 'vegetarian'
        ELSE 'vegan'
      END as new_classification,
      CASE 
        WHEN may_non_veg_count = 0 AND typically_vegan_count = 0 AND typically_veg_count = 0 AND null_class_count = 0 THEN ''
        ELSE ARRAY_TO_STRING(
          ARRAY_REMOVE(ARRAY[
            CASE WHEN may_non_veg_count > 0 THEN 'may be non-vegetarian' END,
            CASE WHEN typically_vegan_count > 0 THEN 'typically vegan' END,
            CASE WHEN typically_veg_count > 0 THEN 'typically vegetarian' END,
            CASE WHEN null_class_count > 0 THEN 'null' END
          ], NULL),
          ', '
        )
      END as issues_text
    FROM analysis_data
  )
  UPDATE products 
  SET 
    classification = cr.new_classification,
    issues = cr.issues_text
  FROM classification_result cr
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
    LANGUAGE "sql" SECURITY DEFINER
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
        us.userid = current_user_id
        AND us.is_active = TRUE;
    -- If no subscription record found, default to 'free'
    IF user_subscription_level IS NULL THEN
        user_subscription_level := 'free';
    END IF;
    -- Handle expired subscriptions
    IF user_subscription_expires_at IS NOT NULL AND user_subscription_expires_at < now() THEN
        -- Auto-deactivate expired subscription
        UPDATE
            public.user_subscription
        SET
            is_active = FALSE
        WHERE
            userid = current_user_id;
        user_subscription_level := 'free';
    END IF;
    -- Set rate limits based on subscription level and action type
    -- Different limits for product lookups vs searches
    IF action_type = 'product_lookup' THEN
        CASE user_subscription_level
        WHEN 'free' THEN
            current_rate_limit := 10; -- 10 product lookups per day for free users
        WHEN 'standard' THEN
            current_rate_limit := 999999; -- Unlimited for premium users
        WHEN 'premium' THEN
            current_rate_limit := 999999; -- Unlimited for premium users
        ELSE
            current_rate_limit := 10; -- Default to free tier
        END CASE;
    ELSIF action_type = 'ingredient_search' THEN
        CASE user_subscription_level
        WHEN 'free' THEN
            current_rate_limit := 10; -- 10 searches per day for free users
        WHEN 'standard' THEN
            current_rate_limit := 999999; -- Unlimited for premium users
        WHEN 'premium' THEN
            current_rate_limit := 999999; -- Unlimited for premium users
        ELSE
            current_rate_limit := 10; -- Default to free tier
        END CASE;
    ELSE
        -- Default rate limits for other action types
        CASE user_subscription_level
        WHEN 'free' THEN
            current_rate_limit := 10;
        WHEN 'standard' THEN
            current_rate_limit := 999999;
        WHEN 'premium' THEN
            current_rate_limit := 999999;
        ELSE
            current_rate_limit := 10; -- Default to free tier
        END CASE;
    END IF;
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
        AND created_at > now() - interval '24 hours' -- Changed from 1 hour to 24 hours (daily limit)
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


CREATE OR REPLACE FUNCTION "public"."get_subscription_status"("device_id_param" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    device_uuid UUID;
    subscription_record RECORD;
    profile_record RECORD;
    final_subscription_level TEXT;
    final_expires_at TIMESTAMP WITH TIME ZONE;
    final_is_active BOOLEAN;
BEGIN
    -- Convert device_id_param to UUID
    BEGIN
        device_uuid := device_id_param::UUID;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RAISE LOG 'Invalid device ID format: %', device_id_param;
            RETURN json_build_object(
                'subscription_level', 'free',
                'is_active', true,
                'device_id', device_id_param,
                'expires_at', null
            );
    END;
    
    -- Look up subscription by device ID
    SELECT 
        us.subscription_level,
        us.expires_at,
        us.is_active,
        us.deviceid,
        us.userid
    INTO 
        subscription_record
    FROM public.user_subscription us
    WHERE us.deviceid = device_uuid;
    
    -- If no subscription record found, return 'free'
    IF subscription_record IS NULL THEN
        RETURN json_build_object(
            'subscription_level', 'free',
            'is_active', true,
            'device_id', device_id_param,
            'expires_at', null
        );
    END IF;
    
    -- Initialize with user_subscription values
    final_subscription_level := subscription_record.subscription_level;
    final_expires_at := subscription_record.expires_at;
    final_is_active := subscription_record.is_active;
    
    -- Check for profiles override if user is logged in
    IF subscription_record.userid IS NOT NULL THEN
        SELECT 
            p.subscription_level,
            p.expires_at,
            p.is_active
        INTO 
            profile_record
        FROM public.profiles p
        WHERE p.id = subscription_record.userid;
        
        -- Apply profiles override if it exists and has higher precedence
        IF profile_record IS NOT NULL AND profile_record.subscription_level IS NOT NULL THEN
            -- Check if profile subscription has expired
            IF profile_record.expires_at IS NOT NULL AND profile_record.expires_at < NOW() THEN
                -- Profile subscription expired, use user_subscription values
                -- (already set above)
                NULL;
            ELSE
                -- Profile subscription is active, check if it's higher than user subscription
                -- Hierarchy: premium > standard > free (null)
                IF (profile_record.subscription_level = 'premium' AND 
                    (final_subscription_level != 'premium')) OR
                   (profile_record.subscription_level = 'standard' AND 
                    (final_subscription_level NOT IN ('premium', 'standard'))) THEN
                    
                    -- Profile has higher subscription level, use profile values for final result
                    -- Note: We no longer update user_subscription table since we always check profiles
                    final_subscription_level := profile_record.subscription_level;
                    final_expires_at := profile_record.expires_at;
                    final_is_active := profile_record.is_active;
                END IF;
            END IF;
        END IF;
    END IF;
    
    -- Check if final subscription has expired
    IF final_expires_at IS NOT NULL AND final_expires_at < NOW() THEN
        -- Update user_subscription to inactive only if it's the user_subscription that expired
        -- (not the profile override)
        IF final_expires_at = subscription_record.expires_at THEN
            UPDATE public.user_subscription 
            SET is_active = FALSE,
                updated_at = NOW()
            WHERE deviceid = device_uuid;
        END IF;
        
        RETURN json_build_object(
            'subscription_level', 'free',
            'is_active', false,
            'device_id', device_id_param,
            'expires_at', final_expires_at
        );
    END IF;
    
    -- Return the final subscription status
    RETURN json_build_object(
        'subscription_level', final_subscription_level,
        'is_active', final_is_active,
        'device_id', device_id_param,
        'expires_at', final_expires_at
    );
END;
$$;


ALTER FUNCTION "public"."get_subscription_status"("device_id_param" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_usage_stats"("device_id_param" "text") RETURNS TABLE("product_lookups_today" integer, "product_lookups_limit" integer, "searches_today" integer, "searches_limit" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    current_user_id uuid;
    device_uuid uuid;
    user_subscription_level text;
    product_lookup_count integer;
    search_count integer;
    product_limit integer;
    search_limit integer;
BEGIN
    -- Get the current user ID for security validation
    current_user_id := auth.uid();
    
    -- Check if user is authenticated
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'You must be logged in to use this service';
    END IF;

    -- Validate and parse device_id parameter
    IF device_id_param IS NULL OR trim(device_id_param) = '' THEN
        RAISE EXCEPTION 'device_id parameter is required';
    END IF;

    BEGIN
        device_uuid := device_id_param::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'device_id must be a valid UUID';
    END;

    -- Get subscription level for this device
    SELECT subscription_level 
    INTO user_subscription_level
    FROM public.user_subscription 
    WHERE deviceid = device_uuid  -- Now both sides are UUID
      AND is_active = TRUE
    ORDER BY created_at DESC
    LIMIT 1;

    -- Default to free if no subscription found
    IF user_subscription_level IS NULL THEN
        user_subscription_level := 'free';
    END IF;

    -- Set limits based on subscription level
    IF user_subscription_level = 'free' THEN
        product_limit := 10;
        search_limit := 10;
    ELSE
        -- Premium users get unlimited (represented as high number)
        product_limit := 999999;
        search_limit := 999999;
    END IF;

    -- Count product lookups in the last 24 hours for this device
    SELECT COUNT(*)
    INTO product_lookup_count
    FROM actionlog
    WHERE deviceid = device_uuid  -- Both sides are UUID
      AND type = 'product_lookup'
      AND created_at > now() - interval '24 hours';

    -- Count searches in the last 24 hours for this device
    SELECT COUNT(*)
    INTO search_count
    FROM actionlog
    WHERE deviceid = device_uuid  -- Both sides are UUID
      AND type = 'ingredient_search'
      AND created_at > now() - interval '24 hours';

    RETURN QUERY SELECT
        product_lookup_count::integer,
        product_limit::integer,
        search_count::integer,
        search_limit::integer;
END;
$$;


ALTER FUNCTION "public"."get_usage_stats"("device_id_param" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lookup_product"("barcode" "text", "device_id" "text") RETURNS TABLE("ean13" character varying, "upc" character varying, "product_name" character varying, "brand" character varying, "ingredients" character varying, "classification" "text", "imageurl" "text", "issues" "text", "created" timestamp with time zone, "lastupdated" timestamp with time zone)
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
        device_uuid := device_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'device_id must be a valid UUID';
    END;
    
    -- Get rate limit information
    SELECT * INTO rate_info FROM get_rate_limits('product_lookup', device_id);
    
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
            'RATE_LIMIT'::TEXT as classification,
            NULL::TEXT as imageurl,
            NULL::TEXT as issues,
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
        p.classification,
        p.imageurl,
        p.issues,
        p.created,
        p.lastupdated
    FROM public.products p
    WHERE p.upc = barcode OR p.ean13 = barcode
    ORDER BY p.ean13
    LIMIT 1;
    
    -- Check if product was found
    GET DIAGNOSTICS product_found = ROW_COUNT;
    
    -- Determine final vegan status and reasoning
    IF product_found > 0 THEN
        -- Get classification from the returned product
        SELECT p.classification INTO product_classification
        FROM public.products p
        WHERE p.upc = barcode OR p.ean13 = barcode
        LIMIT 1;
        
        -- Use classification field
        IF product_classification IS NOT NULL AND product_classification IN ('vegan', 'vegetarian', 'non-vegetarian') THEN
            CASE product_classification
                WHEN 'vegan' THEN decision_reasoning := format('Database hit: Using classification field "%s"', product_classification);
                WHEN 'vegetarian' THEN decision_reasoning := format('Database hit: Using classification field "%s"', product_classification);
                WHEN 'non-vegetarian' THEN decision_reasoning := format('Database hit: Using classification field "%s"', product_classification);
            END CASE;
        ELSE
            -- No valid classification available, will fall back to Open Food Facts
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
        CASE 
            WHEN product_found > 0 THEN 'Product found in database'
            ELSE 'Product not found in database'
        END,
        json_build_object(
            'barcode', barcode,
            'device_id', device_id,
            'database_hit', product_found > 0,
            'classification', product_classification,
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


CREATE OR REPLACE FUNCTION "public"."update_subscription"("device_id_param" "text", "subscription_level_param" "text", "expires_at_param" timestamp with time zone DEFAULT NULL::timestamp with time zone, "is_active_param" boolean DEFAULT true) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    current_user_id uuid;
    device_uuid uuid;
BEGIN
    -- Get the current user ID
    current_user_id := auth.uid();
    
    -- Check if user is authenticated
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'You must be logged in to use this service';
    END IF;

    -- Validate and convert device_id to UUID
    IF device_id_param IS NULL OR trim(device_id_param) = '' THEN
        RAISE EXCEPTION 'device_id parameter is required';
    END IF;

    BEGIN
        device_uuid := device_id_param::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'device_id must be a valid UUID';
    END;

    -- Insert or update subscription record
    INSERT INTO public.user_subscription (
        userid,
        deviceid,
        subscription_level,
        is_active,
        expires_at,
        created_at,
        updated_at
    ) VALUES (
        current_user_id,
        device_uuid,  -- Now UUID
        subscription_level_param,
        is_active_param,
        expires_at_param,
        now(),
        now()
    )
    ON CONFLICT (deviceid) 
    DO UPDATE SET
        userid = EXCLUDED.userid,
        subscription_level = EXCLUDED.subscription_level,
        is_active = EXCLUDED.is_active,
        expires_at = EXCLUDED.expires_at,
        updated_at = now();

    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."update_subscription"("device_id_param" "text", "subscription_level_param" "text", "expires_at_param" timestamp with time zone, "is_active_param" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_subscription_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_subscription_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_subscription_userid"("device_id_param" "text", "new_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  updated_count INTEGER;
  device_uuid UUID;
BEGIN
  -- Convert device_id_param to UUID
  BEGIN
    device_uuid := device_id_param::UUID;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE LOG 'Invalid device ID format: %', device_id_param;
      RETURN false;
  END;

  -- Log the update attempt
  RAISE LOG 'Updating user_subscription userid for device: % with user: %', device_uuid, new_user_id;

  -- Update or insert user_subscription record
  INSERT INTO user_subscription (deviceid, userid, subscription_level, is_active, created_at, updated_at)
  VALUES (device_uuid, new_user_id, 'free', true, NOW(), NOW())
  ON CONFLICT (deviceid) 
  DO UPDATE SET 
    userid = new_user_id,
    updated_at = NOW();

  -- Get count of affected rows
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Log success
  RAISE LOG 'Successfully updated % rows for device: %', updated_count, device_uuid;

  -- Return success if any rows were affected
  RETURN updated_count > 0;

EXCEPTION
  WHEN OTHERS THEN
    -- Log the error
    RAISE LOG 'Error updating user_subscription userid for device %: %', device_id_param, SQLERRM;
    -- Return false on error
    RETURN false;
END;
$$;


ALTER FUNCTION "public"."update_user_subscription_userid"("device_id_param" "text", "new_user_id" "uuid") OWNER TO "postgres";

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



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subscription_level" "text",
    "expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'user profiles with subscription overrides';



CREATE TABLE IF NOT EXISTS "public"."user_subscription" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "userid" "uuid",
    "subscription_level" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "deviceid" "uuid" NOT NULL,
    CONSTRAINT "user_subscription_subscription_level_check" CHECK (("subscription_level" = ANY (ARRAY['free'::"text", 'standard'::"text", 'premium'::"text"])))
);


ALTER TABLE "public"."user_subscription" OWNER TO "postgres";


ALTER TABLE ONLY "public"."actionlog"
    ADD CONSTRAINT "actionlog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_title_unique" UNIQUE ("title");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("ean13");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_subscription"
    ADD CONSTRAINT "user_subscription_deviceid_key" UNIQUE ("deviceid");



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



CREATE INDEX "idx_user_subscription_user_id" ON "public"."user_subscription" USING "btree" ("userid");



CREATE INDEX "ingredients_class_idx" ON "public"."ingredients" USING "btree" ("class");



CREATE INDEX "products_brand_idx" ON "public"."products" USING "btree" ("brand");



CREATE INDEX "products_mfg_idx" ON "public"."products" USING "btree" ("mfg");



CREATE INDEX "products_name_idx" ON "public"."products" USING "btree" ("product_name");



CREATE INDEX "products_productcount_idx" ON "public"."ingredients" USING "btree" ("productcount");



CREATE INDEX "products_upc_created" ON "public"."products" USING "btree" ("created");



CREATE INDEX "products_upc_idx" ON "public"."products" USING "btree" ("upc");



CREATE OR REPLACE TRIGGER "trigger_user_subscription_updated_at" BEFORE UPDATE ON "public"."user_subscription" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_subscription_updated_at"();



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE "public"."actionlog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_subscription" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_actionlog_paginated"("page_size" integer, "page_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_actionlog_paginated"("page_size" integer, "page_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_actionlog_paginated"("page_size" integer, "page_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_actionlog_recent"("limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_actionlog_recent"("limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_actionlog_recent"("limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_check_user_access"("user_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_check_user_access"("user_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_check_user_access"("user_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_classify_upc"("upc_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_classify_upc"("upc_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_classify_upc"("upc_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_create_ingredient"("ingredient_title" "text", "ingredient_class" "text", "ingredient_primary_class" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_create_ingredient"("ingredient_title" "text", "ingredient_class" "text", "ingredient_primary_class" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_ingredient"("ingredient_title" "text", "ingredient_class" "text", "ingredient_primary_class" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_delete_ingredient"("ingredient_title" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_delete_ingredient"("ingredient_title" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_ingredient"("ingredient_title" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_ingredient_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_ingredient_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_ingredient_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_ingredients_for_upc"("product_upc" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_ingredients_for_upc"("product_upc" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_ingredients_for_upc"("product_upc" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_product"("product_upc" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_product"("product_upc" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_product"("product_upc" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_product_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_product_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_product_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_unclassified_ingredients"("page_size" integer, "page_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_unclassified_ingredients"("page_size" integer, "page_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_unclassified_ingredients"("page_size" integer, "page_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_ingredient_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_ingredient_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_ingredient_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_product_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_product_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_product_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_search_ingredients"("query" "text", "limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_search_ingredients"("query" "text", "limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_search_ingredients"("query" "text", "limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_search_ingredients_exact"("query" "text", "search_type" "text", "limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_search_ingredients_exact"("query" "text", "search_type" "text", "limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_search_ingredients_exact"("query" "text", "search_type" "text", "limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_search_ingredients_with_filters"("query" "text", "search_type" "text", "filter_classes" "text"[], "filter_primary_classes" "text"[], "limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_search_ingredients_with_filters"("query" "text", "search_type" "text", "filter_classes" "text"[], "filter_primary_classes" "text"[], "limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_search_ingredients_with_filters"("query" "text", "search_type" "text", "filter_classes" "text"[], "filter_primary_classes" "text"[], "limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_search_ingredients_with_filters_paginated"("query" "text", "search_type" "text", "filter_classes" "text"[], "filter_primary_classes" "text"[], "page_size" integer, "page_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_search_ingredients_with_filters_paginated"("query" "text", "search_type" "text", "filter_classes" "text"[], "filter_primary_classes" "text"[], "page_size" integer, "page_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_search_ingredients_with_filters_paginated"("query" "text", "search_type" "text", "filter_classes" "text"[], "filter_primary_classes" "text"[], "page_size" integer, "page_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_search_products"("query" "text", "limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_search_products"("query" "text", "limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_search_products"("query" "text", "limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_update_ingredient"("ingredient_title" "text", "new_class" "text", "new_primary_class" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_update_ingredient"("ingredient_title" "text", "new_class" "text", "new_primary_class" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_ingredient"("ingredient_title" "text", "new_class" "text", "new_primary_class" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_update_product"("product_upc" "text", "updates" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_update_product"("product_upc" "text", "updates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_product"("product_upc" "text", "updates" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_update_user_subscription"("subscription_id" "uuid", "updates" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_update_user_subscription"("subscription_id" "uuid", "updates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_user_subscription"("subscription_id" "uuid", "updates" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_user_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_user_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_user_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_user_subscription_search"("query" "text", "limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_user_subscription_search"("query" "text", "limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_user_subscription_search"("query" "text", "limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."classify_all_products"() TO "service_role";



GRANT ALL ON FUNCTION "public"."classify_upc"("input_upc" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_classes_for_upc"("input_upc" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_ingredients_for_upc"("input_upc" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_ingredients_for_upc"("input_upc" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_primary_classes_for_upc"("input_upc" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_rate_limits"("action_type" "text", "device_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_rate_limits"("action_type" "text", "device_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rate_limits"("action_type" "text", "device_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_subscription_status"("device_id_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_subscription_status"("device_id_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_subscription_status"("device_id_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_usage_stats"("device_id_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_usage_stats"("device_id_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_usage_stats"("device_id_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."lookup_product"("barcode" "text", "device_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lookup_product"("barcode" "text", "device_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lookup_product"("barcode" "text", "device_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_ingredients"("search_term" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_ingredients"("search_term" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_ingredients"("search_term" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_ingredients"("search_term" "text", "device_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_ingredients"("search_term" "text", "device_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_ingredients"("search_term" "text", "device_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_subscription"("device_id_param" "text", "subscription_level_param" "text", "expires_at_param" timestamp with time zone, "is_active_param" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_subscription"("device_id_param" "text", "subscription_level_param" "text", "expires_at_param" timestamp with time zone, "is_active_param" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_subscription"("device_id_param" "text", "subscription_level_param" "text", "expires_at_param" timestamp with time zone, "is_active_param" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_subscription_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_subscription_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_subscription_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_subscription_userid"("device_id_param" "text", "new_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_subscription_userid"("device_id_param" "text", "new_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_subscription_userid"("device_id_param" "text", "new_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."actionlog" TO "anon";
GRANT ALL ON TABLE "public"."actionlog" TO "authenticated";
GRANT ALL ON TABLE "public"."actionlog" TO "service_role";



GRANT ALL ON TABLE "public"."ingredients" TO "anon";
GRANT ALL ON TABLE "public"."ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



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
