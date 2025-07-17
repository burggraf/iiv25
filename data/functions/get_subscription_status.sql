-- Get Subscription Status PostgreSQL Function
-- Created: 2025-01-17
-- Purpose: Retrieve current user's subscription level with expiration handling
-- 
-- This function checks the authenticated user's subscription status and handles:
-- 1. Users without subscription records (returns 'free')
-- 2. Expired subscriptions (automatically deactivates and returns 'free')
-- 3. Active subscriptions (returns current level: 'free', 'standard', or 'premium')
--
-- Features:
-- - SECURITY DEFINER: Bypasses RLS restrictions while maintaining user authentication
-- - Automatic expiration handling: Deactivates expired subscriptions
-- - Authentication check: Requires valid auth.uid() to execute
-- - Defaults to 'free' for users without subscription records
-- - Handles subscription expiration automatically

CREATE OR REPLACE FUNCTION get_subscription_status()
RETURNS TEXT
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
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

-- Usage Examples:
-- SELECT get_subscription_status();

-- Return Values:
-- 'free' - User has no subscription or subscription has expired
-- 'standard' - User has active standard subscription
-- 'premium' - User has active premium subscription

-- Function Requirements:
-- 1. User must be authenticated (auth.uid() IS NOT NULL)
-- 2. user_subscription table must exist with columns: user_id, subscription_level, expires_at, is_active
-- 3. Subscription levels must be: 'free', 'standard', or 'premium'

-- Related Table Schema:
-- CREATE TABLE user_subscription (
--     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
--     user_id UUID NOT NULL,
--     subscription_level TEXT NOT NULL CHECK (subscription_level IN ('free', 'standard', 'premium')),
--     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
--     updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
--     expires_at TIMESTAMP WITH TIME ZONE,
--     is_active BOOLEAN DEFAULT TRUE,
--     CONSTRAINT unique_user_subscription UNIQUE (user_id)
-- );

-- Security Notes:
-- - SECURITY DEFINER allows function to bypass RLS policies
-- - Explicit schema qualification (public.) prevents schema injection
-- - User authentication is still required and validated
-- - Function automatically handles subscription expiration
-- - Returns 'free' as safe default for users without subscription records