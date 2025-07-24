CREATE OR REPLACE FUNCTION update_user_subscription_userid(
  device_id_param TEXT,
  new_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Log the update attempt
  RAISE LOG 'Updating user_subscription userid for device: % with user: %', device_id_param, new_user_id;

  -- Update or insert user_subscription record
  INSERT INTO user_subscription (device_id, user_id, subscription_level, is_active, created_at, updated_at)
  VALUES (device_id_param, new_user_id, 'free', true, NOW(), NOW())
  ON CONFLICT (device_id) 
  DO UPDATE SET 
    user_id = new_user_id,
    updated_at = NOW();

  -- Get count of affected rows
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Log success
  RAISE LOG 'Successfully updated % rows for device: %', updated_count, device_id_param;

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

-- Grant execute permission to the service role
GRANT EXECUTE ON FUNCTION update_user_subscription_userid(TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION update_user_subscription_userid(TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION update_user_subscription_userid(TEXT, UUID) TO authenticated;