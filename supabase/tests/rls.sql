\set ON_ERROR_STOP on

-- Direct-write/RLS checks. Run after flow.sql, because it reuses the first
-- room created by that test and acts as Bob.

SELECT set_config('spellsift.room_id', (SELECT id::text FROM public.rooms LIMIT 1), false);

SET ROLE authenticated;
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

DO $$
BEGIN
  BEGIN
    UPDATE public.players SET score = 999
    WHERE room_id = current_setting('spellsift.room_id')::uuid
      AND user_id = '22222222-2222-2222-2222-222222222222';
    RAISE EXCEPTION 'direct player score update unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'blocked direct player score update';
  END;

  BEGIN
    UPDATE public.profiles SET wins = 999
    WHERE id = '22222222-2222-2222-2222-222222222222';
    RAISE EXCEPTION 'direct profile update unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'blocked direct profile update';
  END;

  BEGIN
    INSERT INTO public.submissions (room_id, user_id, word, is_valid)
    VALUES (
      current_setting('spellsift.room_id')::uuid,
      '22222222-2222-2222-2222-222222222222',
      'cheat',
      true
    );
    RAISE EXCEPTION 'direct submission insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'blocked direct submission insert';
  END;

  BEGIN
    UPDATE public.rooms SET status = 'ended'
    WHERE id = current_setting('spellsift.room_id')::uuid;
    RAISE EXCEPTION 'direct room update unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'blocked direct room update';
  END;

  BEGIN
    PERFORM 1 FROM public.dictionary_words LIMIT 1;
    RAISE EXCEPTION 'dictionary table was readable';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'blocked direct dictionary read';
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.rooms
    WHERE id = current_setting('spellsift.room_id')::uuid
  ) THEN
    RAISE EXCEPTION 'room member cannot read their own room';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.players
    WHERE room_id = current_setting('spellsift.room_id')::uuid
  ) THEN
    RAISE EXCEPTION 'room member cannot read room players';
  END IF;

  -- Opponents' words stay private until the round ends.
  DECLARE
    v_play_room public.rooms;
    v_alice UUID := '11111111-1111-1111-1111-111111111111';
    v_bob UUID := '22222222-2222-2222-2222-222222222222';
  BEGIN
    SELECT * INTO v_play_room FROM public.create_room(60, false, 4);

    PERFORM set_config('request.jwt.claim.sub', v_alice::text, true);
    PERFORM public.join_room_by_code(v_play_room.room_code);
    PERFORM public.set_ready(v_play_room.id, true);

    PERFORM set_config('request.jwt.claim.sub', v_bob::text, true);
    PERFORM public.start_game(v_play_room.id, 'TRAIN');

    PERFORM set_config('request.jwt.claim.sub', v_alice::text, true);
    PERFORM public.submit_word(v_play_room.id, 'RAIN');

    PERFORM set_config('request.jwt.claim.sub', v_bob::text, true);
    IF EXISTS (
      SELECT 1 FROM public.submissions
      WHERE room_id = v_play_room.id AND user_id = v_alice
    ) THEN
      RAISE EXCEPTION 'opponent submissions were readable during play';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_alice::text, true);
    IF NOT EXISTS (
      SELECT 1 FROM public.submissions
      WHERE room_id = v_play_room.id AND user_id = v_alice
    ) THEN
      RAISE EXCEPTION 'player cannot read their own submission during play';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_bob::text, true);
  END;

  -- Receipts may only reference a message from the same room, even on update.
  DECLARE
    v_message UUID;
    v_other_room UUID;
  BEGIN
    SELECT id INTO v_message
    FROM public.chat_messages
    WHERE room_id = current_setting('spellsift.room_id')::uuid
    ORDER BY created_at
    LIMIT 1;

    IF v_message IS NULL THEN
      RAISE EXCEPTION 'no chat message available for the receipt test';
    END IF;

    INSERT INTO public.chat_message_receipts (message_id, room_id, user_id, delivered_at)
    VALUES (
      v_message,
      current_setting('spellsift.room_id')::uuid,
      '22222222-2222-2222-2222-222222222222',
      now()
    );

    SELECT id INTO v_other_room FROM public.create_room(60, false, 4);

    BEGIN
      UPDATE public.chat_message_receipts
      SET room_id = v_other_room
      WHERE message_id = v_message
        AND user_id = '22222222-2222-2222-2222-222222222222';
      RAISE EXCEPTION 'cross-room receipt update unexpectedly succeeded';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'blocked cross-room receipt update';
    END;
  END;
END $$;

RESET ROLE;
SELECT 'rls checks ok' AS result;
