-- Repair profiles left missing after a schema reset and make room RLS idempotent.
-- Run this once in the Supabase SQL Editor for an existing SpellSift project.

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
    NULLIF(trim(new.raw_user_meta_data ->> 'username'), ''),
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
  VALUES (new.id, available_username, new.email, new.raw_user_meta_data ->> 'avatar_url')
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill auth accounts whose public profile disappeared during the DB repair.
INSERT INTO public.profiles (id, username, email, avatar_url)
SELECT
  u.id,
  'Player_' || substr(u.id::text, 1, 8),
  u.email,
  u.raw_user_meta_data ->> 'avatar_url'
FROM auth.users AS u
LEFT JOIN public.profiles AS p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- The client upserts players using (room_id, user_id). Schema exports from some
-- repaired projects are missing this constraint, which makes that upsert fail.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.players'::regclass
      AND contype = 'u'
      AND conname = 'players_room_id_user_id_key'
  ) THEN
    ALTER TABLE public.players
      ADD CONSTRAINT players_room_id_user_id_key UNIQUE (room_id, user_id);
  END IF;
END
$$;

DROP POLICY IF EXISTS "Allow read rooms" ON public.rooms;
DROP POLICY IF EXISTS "Allow insert rooms" ON public.rooms;
DROP POLICY IF EXISTS "Allow authenticated read rooms" ON public.rooms;
DROP POLICY IF EXISTS "Allow authenticated insert rooms" ON public.rooms;
DROP POLICY IF EXISTS "Allow host update rooms" ON public.rooms;

CREATE POLICY "Allow read rooms"
  ON public.rooms FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Allow insert rooms"
  ON public.rooms FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND host_id = auth.uid());
CREATE POLICY "Allow host update rooms"
  ON public.rooms FOR UPDATE TO authenticated
  USING (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());

DROP POLICY IF EXISTS "Allow read players" ON public.players;
DROP POLICY IF EXISTS "Allow insert players" ON public.players;
DROP POLICY IF EXISTS "Allow authenticated read players" ON public.players;
DROP POLICY IF EXISTS "Allow authenticated insert players" ON public.players;

CREATE POLICY "Allow read players"
  ON public.players FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Allow insert players"
  ON public.players FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.players TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;

-- Publish live game tables to Supabase Realtime. The guards make this safe to
-- rerun when one or more tables are already in the publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'players'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'submissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.submissions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END
$$;

-- Include room_id/user_id in DELETE events so filtered player subscriptions can
-- remove somebody from the lobby immediately when they leave.
ALTER TABLE public.players REPLICA IDENTITY FULL;
