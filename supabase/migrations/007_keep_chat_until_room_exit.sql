-- Keep room chat visible through results and rematches.
-- Chat is cleaned up when the room is deleted or when the final player exits.

DROP TRIGGER IF EXISTS destroy_chat_when_room_ends ON public.rooms;
DROP FUNCTION IF EXISTS public.destroy_closed_room_chat();
