\set ON_ERROR_STOP on

-- End-to-end RPC/RLS flow test.
--
-- Run against a fresh local database after:
--   1. supabase/tests/bootstrap.sql
--   2. supabase/schema.sql (or all migrations)
--   3. supabase/seed/dictionary.sql
--
-- The test inserts fixed UUIDs, so it must run on an empty public schema.

-- Users and profiles (trigger creates profiles).
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com', '{"username":"Alice","avatar_url":"https://api.dicebear.com/7.x/avataaars/svg?seed=Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com', '{"username":"Bob","avatar_url":"https://api.dicebear.com/7.x/avataaars/svg?seed=Bob"}'),
  ('33333333-3333-3333-3333-333333333333', 'carol@example.com', '{"username":"Carol","avatar_url":"https://api.dicebear.com/7.x/avataaars/svg?seed=Carol"}');

CREATE TEMP TABLE test_state (
  room_id UUID,
  room_code TEXT,
  chat_id UUID
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.profiles) <> 3 THEN
    RAISE EXCEPTION 'profile trigger did not create three profiles';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'email') THEN
    RAISE EXCEPTION 'profiles still exposes email';
  END IF;
END $$;

-- Alice creates a room.
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
INSERT INTO test_state (room_id, room_code)
SELECT id, room_code FROM public.create_room(60, false, 4);

DO $$
BEGIN
  IF (SELECT status FROM public.rooms WHERE id = (SELECT room_id FROM test_state)) <> 'lobby' THEN
    RAISE EXCEPTION 'new room was not in lobby';
  END IF;
  IF (SELECT room_code FROM test_state) !~ '^[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'room code format invalid: %', (SELECT room_code FROM test_state);
  END IF;
END $$;

-- Bob joins by code.
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT * FROM public.join_room_by_code((SELECT room_code FROM test_state));

-- Both players ready up.
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT public.set_ready((SELECT room_id FROM test_state), true);
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT public.set_ready((SELECT room_id FROM test_state), true);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.players WHERE room_id = (SELECT room_id FROM test_state) AND left_at IS NULL AND ready) <> 2 THEN
    RAISE EXCEPTION 'both players should be ready';
  END IF;
END $$;

-- Host starts the game.
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT * FROM public.start_game((SELECT room_id FROM test_state), 'ANTIGRAVITY');

DO $$
BEGIN
  IF (SELECT status FROM public.rooms WHERE id = (SELECT room_id FROM test_state)) <> 'playing' THEN
    RAISE EXCEPTION 'start_game did not set playing';
  END IF;
  IF (SELECT started_at FROM public.rooms WHERE id = (SELECT room_id FROM test_state)) IS NULL THEN
    RAISE EXCEPTION 'start_game did not set started_at';
  END IF;
END $$;

-- Valid and invalid submissions.
DO $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.submit_word((SELECT room_id FROM test_state), 'tiny');
  IF NOT (v_result->>'valid')::boolean THEN
    RAISE EXCEPTION 'TINY should be valid: %', v_result;
  END IF;

  v_result := public.submit_word((SELECT room_id FROM test_state), 'giant');
  IF NOT (v_result->>'valid')::boolean THEN
    RAISE EXCEPTION 'GIANT should be valid: %', v_result;
  END IF;

  v_result := public.submit_word((SELECT room_id FROM test_state), 'tiny');
  IF (v_result->>'valid')::boolean THEN
    RAISE EXCEPTION 'duplicate TINY should be rejected';
  END IF;

  v_result := public.submit_word((SELECT room_id FROM test_state), 'zoo');
  IF (v_result->>'valid')::boolean THEN
    RAISE EXCEPTION 'ZOO uses letters outside the base word';
  END IF;

  IF (SELECT score FROM public.players WHERE room_id = (SELECT room_id FROM test_state) AND user_id = '11111111-1111-1111-1111-111111111111') <> 2 THEN
    RAISE EXCEPTION 'Alice score should be 2';
  END IF;
END $$;

-- Bob submits three winning words.
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
DO $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.submit_word((SELECT room_id FROM test_state), 'gravity');
  IF NOT (v_result->>'valid')::boolean THEN
    RAISE EXCEPTION 'GRAVITY should be valid: %', v_result;
  END IF;
  v_result := public.submit_word((SELECT room_id FROM test_state), 'train');
  IF NOT (v_result->>'valid')::boolean THEN
    RAISE EXCEPTION 'TRAIN should be valid: %', v_result;
  END IF;
  v_result := public.submit_word((SELECT room_id FROM test_state), 'rain');
  IF NOT (v_result->>'valid')::boolean THEN
    RAISE EXCEPTION 'RAIN should be valid: %', v_result;
  END IF;
END $$;

-- Simulate the timer having elapsed, then finalize as a non-host player.
UPDATE public.rooms SET started_at = now() - interval '2 minutes' WHERE id = (SELECT room_id FROM test_state);
DO $$
BEGIN
  PERFORM public.finish_room((SELECT room_id FROM test_state));
  IF (SELECT status FROM public.rooms WHERE id = (SELECT room_id FROM test_state)) <> 'ended' THEN
    RAISE EXCEPTION 'finish_room did not end the room';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.game_results
    WHERE room_id = (SELECT room_id FROM test_state)
      AND round_number = 1
      AND is_tie = false
      AND winner_id = '22222222-2222-2222-2222-222222222222'
  ) THEN
    RAISE EXCEPTION 'Bob should be recorded as the winner';
  END IF;
  IF (SELECT wins FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222') <> 1 THEN
    RAISE EXCEPTION 'winner wins were not incremented';
  END IF;
  IF (SELECT games_played FROM public.profiles WHERE id = '11111111-1111-1111-1111-111111111111') <> 1 THEN
    RAISE EXCEPTION 'loser games_played was not incremented';
  END IF;
END $$;

-- Chat and moderation.
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
UPDATE test_state SET chat_id = (SELECT id FROM public.send_chat_message((SELECT room_id FROM test_state), 'Good game!'));

SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
DO $$
BEGIN
  PERFORM public.report_chat_message((SELECT chat_id FROM test_state), 'Spam');
  IF NOT EXISTS (SELECT 1 FROM public.chat_reports WHERE message_id = (SELECT chat_id FROM test_state)) THEN
    RAISE EXCEPTION 'report was not stored';
  END IF;
  PERFORM public.block_player('11111111-1111-1111-1111-111111111111');
  IF NOT public.has_blocked('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'block was not stored';
  END IF;
  PERFORM public.unblock_player('11111111-1111-1111-1111-111111111111');
END $$;

-- Reset and rematch.
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
DO $$
BEGIN
  PERFORM public.reset_room((SELECT room_id FROM test_state));
  IF (SELECT status FROM public.rooms WHERE id = (SELECT room_id FROM test_state)) <> 'lobby' THEN
    RAISE EXCEPTION 'reset_room did not return to lobby';
  END IF;
  IF (SELECT round_number FROM public.rooms WHERE id = (SELECT room_id FROM test_state)) <> 2 THEN
    RAISE EXCEPTION 'reset_room did not increment the round';
  END IF;
END $$;

-- Dictionary RPC.
DO $$
DECLARE
  v_invalid TEXT[];
BEGIN
  v_invalid := public.check_words(ARRAY['tiny', 'giant', 'notaword']);
  IF NOT ('notaword' = ANY(v_invalid)) THEN
    RAISE EXCEPTION 'check_words should report notaword as invalid';
  END IF;
END $$;

-- Account deletion helper: Alice hosts an active room; Bob should be promoted.
SELECT set_config('spellsift.room_id', (SELECT room_id::text FROM test_state), false);
DO $$
BEGIN
  PERFORM public.prepare_account_deletion('11111111-1111-1111-1111-111111111111');
  IF (SELECT host_id FROM public.rooms WHERE id = current_setting('spellsift.room_id')::uuid) <> '22222222-2222-2222-2222-222222222222' THEN
    RAISE EXCEPTION 'host migration did not promote Bob';
  END IF;
  IF (SELECT left_at FROM public.players WHERE room_id = current_setting('spellsift.room_id')::uuid AND user_id = '11111111-1111-1111-1111-111111111111') IS NULL THEN
    RAISE EXCEPTION 'departing player was not soft-left';
  END IF;
END $$;

SELECT 'schema flow ok' AS result;
