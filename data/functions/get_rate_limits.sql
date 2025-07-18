CREATE OR REPLACE FUNCTION get_rate_limits(action_type text)
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
    user_id uuid;
    user_subscription_level text;
    user_subscription_expires_at timestamptz;
    current_rate_limit integer;
    search_count integer;
    rate_limited boolean;
    remaining_searches integer;
BEGIN
    -- Get the current user ID
    user_id := auth.uid();
    -- Check if user is authenticated
    IF user_id IS NULL THEN
        RAISE EXCEPTION 'You must be logged in to use this service';
    END IF;
    -- Get user subscription details
    SELECT
        subscription_level,
        expires_at INTO user_subscription_level,
        user_subscription_expires_at
    FROM
        public.user_subscription
    WHERE
        user_subscription.user_id = get_rate_limits.user_id
        AND is_active = TRUE;
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
            user_subscription.user_id = get_rate_limits.user_id;
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
        actionlog
    WHERE
        userid = user_id
        AND type = action_type
        AND created_at > now() - interval '1 hour';
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

