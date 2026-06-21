-- COMPREHENSIVE DATABASE DIAGNOSTICS

-- 1. Check if tables exist and have RLS enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- 2. Check profiles table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 3. Check existing profiles
SELECT id, username, email, created_at FROM public.profiles LIMIT 10;

-- 4. Check existing auth users
SELECT id, email, created_at, last_sign_in_at FROM auth.users LIMIT 10;

-- 5. Test if we can insert a profile (without auth context)
-- First check the trigger function
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_name LIKE '%user%';

-- 6. Check all RLS policies
SELECT schemaname, tablename, policyname, permissive, roles
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
