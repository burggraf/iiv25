-- Simplified fix that forces profiles to always override
CREATE OR REPLACE FUNCTION get_rate_limits(action_type text, device_id text DEFAULT NULL)
    RETURNS TABLE(
        subscription_level text,
        rate_limit integer,
        recent_searches integer,
        is_rate_limited boolean,
        searches_remaining integer)
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
DECLARE
    current_user_id uuid;
    device_uuid uuid;
    profile_subscription_level text;
    profile_expires_at timestamptz;
    user_subscription_level text;
    final_subscription_level text;
    current_rate_limit integer;
    search_count integer;
    rate_limited boolean;
    remaining_searches integer;
BEGIN
    -- Get the current user ID
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'You must be logged in to use this service';
    END IF;
    
    -- Parse device_id if provided
    IF device_id IS NOT NULL AND trim(device_id) != '' THEN
        BEGIN
            device_uuid := device_id::UUID;
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'device_id must be a valid UUID if provided';
        END;
    END IF;

    -- ALWAYS check profiles table first - this is the definitive source
    SELECT p.subscription_level, p.expires_at
    INTO profile_subscription_level, profile_expires_at
    FROM public.profiles p
    WHERE p.id = current_user_id;
    
    -- If profiles has a subscription and it's not expired, use it
    IF profile_subscription_level IS NOT NULL AND 
       (profile_expires_at IS NULL OR profile_expires_at > NOW()) THEN
        final_subscription_level := profile_subscription_level;
    ELSE
        -- Fallback to user_subscription table
        -- Try device-based lookup first
        IF device_uuid IS NOT NULL THEN
            SELECT us.subscription_level INTO user_subscription_level
            FROM public.user_subscription us
            WHERE us.deviceid = device_uuid AND us.is_active = TRUE;
        END IF;
        
        -- If no device subscription, try user-based lookup
        IF user_subscription_level IS NULL THEN
            SELECT us.subscription_level INTO user_subscription_level
            FROM public.user_subscription us
            WHERE us.userid = current_user_id AND us.is_active = TRUE;
        END IF;
        
        -- Use user subscription or default to free
        final_subscription_level := coalesce(user_subscription_level, 'free');
    END IF;

    -- Set rate limits - simplified logic
    CASE final_subscription_level
    WHEN 'standard', 'premium' THEN
        current_rate_limit := 999999; -- Unlimited for paid tiers
    ELSE
        current_rate_limit := 10; -- 10 for free tier
    END CASE;

    -- Count recent searches - for search actions, count both product_search and ingredient_search
    IF action_type IN ('product_search', 'ingredient_search') THEN
        SELECT count(*) INTO search_count
        FROM actionlog
        WHERE type IN ('product_search', 'ingredient_search')
        AND created_at > now() - interval '24 hours'
        AND (userid = current_user_id OR (device_uuid IS NOT NULL AND deviceid = device_uuid));
    ELSE
        SELECT count(*) INTO search_count
        FROM actionlog
        WHERE type = action_type
        AND created_at > now() - interval '24 hours'
        AND (userid = current_user_id OR (device_uuid IS NOT NULL AND deviceid = device_uuid));
    END IF;

    -- Determine if rate limited
    rate_limited := search_count >= current_rate_limit;
    remaining_searches := greatest(0, current_rate_limit - search_count);

    -- Return results
    RETURN QUERY
    SELECT
        coalesce(final_subscription_level, 'free')::text AS subscription_level,
        current_rate_limit AS rate_limit,
        search_count AS recent_searches,
        rate_limited AS is_rate_limited,
        remaining_searches AS searches_remaining;
END;
$$;