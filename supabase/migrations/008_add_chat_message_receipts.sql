-- Track chat delivery and seen receipts for room members.

CREATE TABLE IF NOT EXISTS public.chat_message_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE NOT NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  delivered_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  seen_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (message_id, user_id)
);

ALTER TABLE public.chat_message_receipts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_chat_message_receipts_room
  ON public.chat_message_receipts(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_message_receipts_message
  ON public.chat_message_receipts(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_message_receipts_user
  ON public.chat_message_receipts(user_id);

DROP POLICY IF EXISTS "Allow read chat message receipts" ON public.chat_message_receipts;
DROP POLICY IF EXISTS "Allow insert own chat message receipts" ON public.chat_message_receipts;
DROP POLICY IF EXISTS "Allow update own chat message receipts" ON public.chat_message_receipts;

CREATE POLICY "Allow read chat message receipts"
  ON public.chat_message_receipts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players
      WHERE room_id = chat_message_receipts.room_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Allow insert own chat message receipts"
  ON public.chat_message_receipts FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.players
      WHERE room_id = chat_message_receipts.room_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Allow update own chat message receipts"
  ON public.chat_message_receipts FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.players
      WHERE room_id = chat_message_receipts.room_id AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.players
      WHERE room_id = chat_message_receipts.room_id AND user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.chat_message_receipts TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_message_receipts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_receipts;
  END IF;
END
$$;
