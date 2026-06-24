-- Let clients flush their typed notepad words after the visible timer reaches
-- zero, and prevent the host from finalizing before that sync window closes.

CREATE OR REPLACE FUNCTION public.submit_word(p_room_id UUID, p_word TEXT)
RETURNS JSONB AS $$
DECLARE
    v_room_status TEXT;
    v_started_at TIMESTAMP WITH TIME ZONE;
    v_duration INT;
    v_submission_grace_seconds INT := 10;
    v_base_word TEXT;
    v_user_id UUID := auth.uid();
    v_word_clean TEXT;
    v_base_clean TEXT;
BEGIN
    v_word_clean := lower(trim(p_word));
    
    SELECT status, base_word, started_at, timer_duration 
    INTO v_room_status, v_base_word, v_started_at, v_duration
    FROM public.rooms
    WHERE id = p_room_id;
    
    v_base_clean := lower(trim(v_base_word));
    
    IF v_room_status IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Room not found.');
    END IF;
    
    IF v_room_status != 'playing' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Game is not active.');
    END IF;
    
    IF v_started_at + ((v_duration + v_submission_grace_seconds) || ' seconds')::interval < now() THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Round submission window has expired.');
    END IF;
    
    IF length(v_word_clean) = 0 THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Word cannot be empty.');
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM public.submissions 
        WHERE room_id = p_room_id AND user_id = v_user_id AND lower(word) = v_word_clean
    ) THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Word already submitted.');
    END IF;

    IF v_word_clean = v_base_clean THEN
        INSERT INTO public.submissions (room_id, user_id, word, is_valid)
        VALUES (p_room_id, v_user_id, trim(p_word), false)
        ON CONFLICT DO NOTHING;
        RETURN jsonb_build_object('valid', false, 'error', 'Cannot submit the base word.');
    END IF;
    
    IF NOT public.validate_word_letters(v_word_clean, v_base_clean) THEN
        INSERT INTO public.submissions (room_id, user_id, word, is_valid)
        VALUES (p_room_id, v_user_id, trim(p_word), false)
        ON CONFLICT DO NOTHING;
        RETURN jsonb_build_object('valid', false, 'error', 'Word uses invalid letters.');
    END IF;
    
    INSERT INTO public.submissions (room_id, user_id, word, is_valid)
    VALUES (p_room_id, v_user_id, trim(p_word), true);
    
    UPDATE public.players
    SET score = score + 1
    WHERE room_id = p_room_id AND user_id = v_user_id;
    
    RETURN jsonb_build_object('valid', true, 'word', trim(p_word));
EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Word already submitted.');
    WHEN OTHERS THEN
        RETURN jsonb_build_object('valid', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.finish_room(p_room_id UUID)
RETURNS VOID AS $$
DECLARE
    v_host_id UUID;
    v_room_status TEXT;
    v_started_at TIMESTAMP WITH TIME ZONE;
    v_duration INT;
    v_submission_grace_seconds INT := 10;
    v_winner_id UUID := NULL;
    v_total_players INT;
    v_max_score INT := 0;
    v_players_at_max INT := 0;
    v_is_tie BOOLEAN := false;
BEGIN
    SELECT host_id, status, started_at, timer_duration
    INTO v_host_id, v_room_status, v_started_at, v_duration
    FROM public.rooms WHERE id = p_room_id FOR UPDATE;

    IF v_host_id IS NULL THEN
        RAISE EXCEPTION 'Room not found.';
    END IF;

    IF auth.uid() IS DISTINCT FROM v_host_id THEN
        RAISE EXCEPTION 'Only the host can finalize the game.';
    END IF;

    IF v_room_status = 'ended' THEN
        RETURN;
    END IF;

    IF v_room_status != 'playing' THEN
        RAISE EXCEPTION 'Game is not active.';
    END IF;

    IF v_started_at + ((v_duration + v_submission_grace_seconds) || ' seconds')::interval > now() THEN
        RAISE EXCEPTION 'Submission window is still open.';
    END IF;

    SELECT count(*)::int, COALESCE(max(score), 0)
    INTO v_total_players, v_max_score
    FROM public.players
    WHERE room_id = p_room_id;

    SELECT count(*)::int INTO v_players_at_max
    FROM public.players
    WHERE room_id = p_room_id AND score = v_max_score;

    IF v_max_score > 0 AND v_players_at_max = 1 THEN
        SELECT user_id INTO v_winner_id
        FROM public.players
        WHERE room_id = p_room_id AND score = v_max_score
        LIMIT 1;
    ELSIF v_players_at_max > 1 THEN
        v_is_tie := true;
    END IF;

    UPDATE public.rooms SET status = 'ended' WHERE id = p_room_id;

    IF v_total_players > 0 THEN
        INSERT INTO public.game_results (room_id, winner_id, is_tie, tie_score, total_players)
        VALUES (
            p_room_id,
            v_winner_id,
            v_is_tie,
            CASE WHEN v_is_tie THEN v_max_score ELSE NULL END,
            v_total_players
        );

        IF v_winner_id IS NOT NULL THEN
            UPDATE public.profiles SET wins = wins + 1 WHERE id = v_winner_id;
        END IF;

        IF v_is_tie THEN
            UPDATE public.profiles AS profile
            SET ties = profile.ties + 1
            FROM public.players AS player
            WHERE player.room_id = p_room_id
              AND player.score = v_max_score
              AND player.user_id = profile.id;
        END IF;

        UPDATE public.profiles AS profile
        SET games_played = profile.games_played + 1
        FROM public.players AS player
        WHERE player.room_id = p_room_id AND player.user_id = profile.id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
