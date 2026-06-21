-- Check if profile exists for the auth user
SELECT id, username, email, created_at 
FROM public.profiles 
WHERE id = 'ae46702d-52ac-436f-84c2-750de2ef21be';

-- Also check all profiles
SELECT id, username, email, created_at 
FROM public.profiles;
