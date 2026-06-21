-- Make lobby chat private to room members and delete it when the room closes.

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Allow insert chat messages" ON public.chat_messages;

CREATE POLICY "Allow read chat messages"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players
      WHERE room_id = chat_messages.room_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Allow insert chat messages"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.players
      WHERE room_id = chat_messages.room_id AND user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT ON public.chat_messages TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END
$$;

-- Ensure deleting a room also destroys all of its chat history.
ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_room_id_fkey;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_room_id_fkey
  FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.destroy_closed_room_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF new.status = 'ended' AND old.status IS DISTINCT FROM new.status THEN
    DELETE FROM public.chat_messages WHERE room_id = new.id;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS destroy_chat_when_room_ends ON public.rooms;
CREATE TRIGGER destroy_chat_when_room_ends
  AFTER UPDATE OF status ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.destroy_closed_room_chat();

CREATE OR REPLACE FUNCTION public.destroy_empty_room_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.players WHERE room_id = old.room_id
  ) THEN
    DELETE FROM public.chat_messages WHERE room_id = old.room_id;
  END IF;
  RETURN old;
END;
$$;

DROP TRIGGER IF EXISTS destroy_chat_when_room_is_empty ON public.players;
CREATE TRIGGER destroy_chat_when_room_is_empty
  AFTER DELETE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.destroy_empty_room_chat();
