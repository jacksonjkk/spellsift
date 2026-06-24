-- Make Auth signup resilient when a requested username is already taken, and
-- backfill any Auth users whose public profile was never created.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested_username text;
  available_username text;
BEGIN
  requested_username := COALESCE(
    NULLIF(trim(new.raw_user_meta_data->>'username'), ''),
    'Player_' || substr(new.id::text, 1, 6)
  );
  available_username := requested_username;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE username = available_username AND id <> new.id
  ) THEN
    available_username := left(requested_username, 40) || '_' || substr(new.id::text, 1, 6);
  END IF;

  INSERT INTO public.profiles (id, username, email, avatar_url)
  VALUES (new.id, available_username, new.email, new.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

WITH missing_profiles AS (
  SELECT
    u.id,
    COALESCE(NULLIF(trim(u.raw_user_meta_data->>'username'), ''), 'Player_' || substr(u.id::text, 1, 6)) AS requested_username,
    u.email,
    u.raw_user_meta_data->>'avatar_url' AS avatar_url
  FROM auth.users AS u
  LEFT JOIN public.profiles AS p ON p.id = u.id
  WHERE p.id IS NULL
),
resolved_profiles AS (
  SELECT
    id,
    CASE
      WHEN count(*) OVER (PARTITION BY requested_username) > 1
        OR EXISTS (
          SELECT 1 FROM public.profiles AS existing
          WHERE existing.username = missing_profiles.requested_username
        )
      THEN left(requested_username, 40) || '_' || substr(id::text, 1, 6)
      ELSE requested_username
    END AS username,
    email,
    avatar_url
  FROM missing_profiles
)
INSERT INTO public.profiles (id, username, email, avatar_url)
SELECT id, username, email, avatar_url
FROM resolved_profiles
ON CONFLICT (id) DO NOTHING;
