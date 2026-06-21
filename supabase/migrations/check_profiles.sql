-- Check if there are any profiles without auth users (orphaned records)
SELECT id, username, created_at FROM public.profiles ORDER BY created_at DESC LIMIT 10;

-- Also check if the guest user profile exists
-- Run this after attempting to sign in as guest, then check the above query
