-- Create a webhook-specific subscription update function that doesn't require user authentication
-- This function is used by the subscription webhook edge function with service role permissions

CREATE OR REPLACE FUNCTION "public"."webhook_update_subscription"(
    "device_id_param" "text", 
    "subscription_level_param" "text", 
    "expires_at_param" timestamp with time zone DEFAULT NULL::timestamp with time zone, 
    "is_active_param" boolean DEFAULT true
) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    device_uuid uuid;
    existing_user_id uuid;
BEGIN
    -- Validate and convert device_id to UUID
    IF device_id_param IS NULL OR trim(device_id_param) = '' THEN
        RAISE EXCEPTION 'device_id parameter is required';
    END IF;

    BEGIN
        device_uuid := device_id_param::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'device_id must be a valid UUID';
    END;

    -- First, try to find existing user_id for this device
    SELECT userid INTO existing_user_id 
    FROM public.user_subscription 
    WHERE deviceid = device_uuid;

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
        existing_user_id,  -- Use existing user_id if found, NULL otherwise
        device_uuid,
        subscription_level_param,
        is_active_param,
        expires_at_param,
        now(),
        now()
    )
    ON CONFLICT (deviceid) 
    DO UPDATE SET
        subscription_level = EXCLUDED.subscription_level,
        is_active = EXCLUDED.is_active,
        expires_at = EXCLUDED.expires_at,
        updated_at = now();

    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'webhook_update_subscription error: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- Grant necessary permissions for the webhook function
GRANT EXECUTE ON FUNCTION "public"."webhook_update_subscription"("device_id_param" "text", "subscription_level_param" "text", "expires_at_param" timestamp with time zone, "is_active_param" boolean) TO "service_role";

-- Add comment to document the function's purpose
COMMENT ON FUNCTION "public"."webhook_update_subscription" IS 'Updates subscription status via webhook calls with service role permissions. Does not require user authentication.';