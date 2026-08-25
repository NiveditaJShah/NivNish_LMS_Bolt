/*
# Update handle_new_user trigger to read role from signup metadata

1. Changes
- The handle_new_user function now reads the 'role' field from raw_user_meta_data
  when creating a profile, so admin/student role is set correctly at signup time.
- This eliminates the race condition where the frontend tried to update the role
  after signUp but before the trigger-created profile row existed.

2. Security
- The trigger is SECURITY DEFINER, so it runs with elevated privileges.
- The role is read from raw_user_meta_data which is set by the signup form.
- This app intentionally allows self-selecting admin role at signup.

3. Important Notes
- Idempotent: uses CREATE OR REPLACE FUNCTION.
- The trigger itself doesn't need to be recreated since it calls the same function.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
