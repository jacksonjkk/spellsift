-- Check 1: Are RLS policies actually enabled on tables?
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename IN ('profiles', 'rooms', 'players', 'submissions', 'chat_messages', 'game_results');

-- Check 2: Do profiles exist?
SELECT COUNT(*) as profile_count FROM public.profiles;

-- Check 3: Check auth users
SELECT COUNT(*) as auth_user_count FROM auth.users;

-- Check 4: List all policies with their details
SELECT tablename, policyname, permissive, roles, qual, with_check 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
