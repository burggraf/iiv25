

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


CREATE OR REPLACE FUNCTION "public"."search_ingredients"("search_term" "text") RETURNS TABLE("title" character varying, "class" character varying, "productcount" integer, "lastupdated" timestamp with time zone, "created" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    current_user_id UUID;
    subscription_level TEXT;
    search_result_count INTEGER;
    recent_searches INTEGER;
    rate_limit INTEGER;
    expires_at TIMESTAMP WITH TIME ZONE;
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
    AND type = 'ingredient_search'
    AND created_at > NOW() - INTERVAL '1 hour';
    
    -- Check if user has exceeded rate limit
    IF recent_searches >= rate_limit THEN
        -- Return a special record indicating rate limit exceeded
        -- Use special values that the client can detect
        RETURN QUERY
        SELECT 
            '__RATE_LIMIT_EXCEEDED__'::VARCHAR(255) as title,
            subscription_level::VARCHAR(255) as class,
            rate_limit::INTEGER as productcount,
            NOW()::TIMESTAMP WITH TIME ZONE as lastupdated,
            NOW()::TIMESTAMP WITH TIME ZONE as created;
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
                    'subscription_level', subscription_level,
                    'rate_limit', rate_limit,
                    'searches_used', recent_searches + 1
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
                    'subscription_level', subscription_level,
                    'rate_limit', rate_limit,
                    'searches_used', recent_searches + 1
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
                'subscription_level', subscription_level,
                'rate_limit', rate_limit,
                'searches_used', recent_searches + 1
            )
        );
        
        RETURN;
    END;
END;
$$;


ALTER FUNCTION "public"."search_ingredients"("search_term" "text") OWNER TO "postgres";


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
    "metadata" "jsonb"
);


ALTER TABLE "public"."actionlog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingr" (
    "title" "text" NOT NULL,
    "class" "text" NOT NULL,
    "productcount" numeric
);


ALTER TABLE "public"."ingr" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingredients" (
    "title" character varying(255) NOT NULL,
    "class" character varying(255),
    "productcount" integer DEFAULT 0 NOT NULL,
    "lastupdated" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
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
    "ingredientsaddedtomasterlist" integer DEFAULT 0,
    "created" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "mfg" character varying(255),
    "override_code" integer DEFAULT '-1'::integer NOT NULL,
    "override_notes" character varying(255) NOT NULL,
    "calculated_code" integer DEFAULT '-1'::integer NOT NULL,
    "calculated_code_sugar_vegan" integer DEFAULT '-1'::integer NOT NULL,
    "calculated_code_sugar_vegetarian" integer DEFAULT '-1'::integer NOT NULL,
    "gs1cat" character varying(8) DEFAULT ''::character varying NOT NULL,
    "rerun" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "imageUrl" "text"
);


ALTER TABLE "public"."products" OWNER TO "postgres";


COMMENT ON COLUMN "public"."products"."imageUrl" IS 'url of product image';



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



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_title_unique" UNIQUE ("title");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("ean13");



ALTER TABLE ONLY "public"."user_subscription"
    ADD CONSTRAINT "unique_user_subscription" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_subscription"
    ADD CONSTRAINT "user_subscription_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_actionlog_created_at" ON "public"."actionlog" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_actionlog_type" ON "public"."actionlog" USING "btree" ("type");



CREATE INDEX "idx_actionlog_userid" ON "public"."actionlog" USING "btree" ("userid");



CREATE INDEX "idx_user_subscription_expires_at" ON "public"."user_subscription" USING "btree" ("expires_at");



CREATE INDEX "idx_user_subscription_level" ON "public"."user_subscription" USING "btree" ("subscription_level");



CREATE INDEX "idx_user_subscription_user_id" ON "public"."user_subscription" USING "btree" ("user_id");



CREATE INDEX "ingredients_class_idx" ON "public"."ingredients" USING "btree" ("class");



CREATE INDEX "ix_ingr" ON "public"."ingr" USING "btree" ("title");



CREATE INDEX "products_brand_idx" ON "public"."products" USING "btree" ("brand");



CREATE INDEX "products_calculated_code_idx" ON "public"."products" USING "btree" ("calculated_code");



CREATE INDEX "products_gs1cat_idx" ON "public"."products" USING "btree" ("gs1cat");



CREATE INDEX "products_mfg_idx" ON "public"."products" USING "btree" ("mfg");



CREATE INDEX "products_name_idx" ON "public"."products" USING "btree" ("product_name");



CREATE INDEX "products_productcount_idx" ON "public"."ingredients" USING "btree" ("productcount");



CREATE INDEX "products_upc_idx" ON "public"."products" USING "btree" ("upc");



CREATE OR REPLACE TRIGGER "trigger_user_subscription_updated_at" BEFORE UPDATE ON "public"."user_subscription" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_subscription_updated_at"();



ALTER TABLE "public"."actionlog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ingr" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_subscription" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_subscription_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_subscription_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_subscription_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."search_ingredients"("search_term" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_ingredients"("search_term" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_ingredients"("search_term" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_subscription_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_subscription_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_subscription_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."actionlog" TO "anon";
GRANT ALL ON TABLE "public"."actionlog" TO "authenticated";
GRANT ALL ON TABLE "public"."actionlog" TO "service_role";



GRANT ALL ON TABLE "public"."ingr" TO "anon";
GRANT ALL ON TABLE "public"."ingr" TO "authenticated";
GRANT ALL ON TABLE "public"."ingr" TO "service_role";



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
