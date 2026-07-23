/*
# Auto-create user_profiles on signup

## Overview
Adds a database trigger that automatically inserts a row into `user_profiles`
whenever a new user registers in `auth.users`. This ensures the "Shared by"
email is always available without relying on client-side code.

## Changes
- Creates function `handle_new_user_profile()` that inserts into user_profiles
- Creates trigger `on_auth_user_created` on auth.users AFTER INSERT
*/

CREATE OR REPLACE FUNCTION handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_profiles (user_id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_profile();