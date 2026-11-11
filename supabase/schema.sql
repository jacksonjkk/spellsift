-- SpellSift — secure schema (fresh install)
--
-- Source of truth for a new Supabase project.
-- Existing projects: run supabase/migrations/009_security_and_integrity.sql.
-- After either path, seed the dictionary:
--   supabase/seed/dictionary.sql
--
-- Security model:
--   * Clients never write scores, stats, results, or game state directly.
--   * Game mutations go through SECURITY DEFINER RPCs with explicit checks.
--   * Profiles expose public fields only; email stays in auth.users.
--   * Room data is readable only by that room's members.
--   * Chat is readable only by active members and hides blocked users.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL
        CHECK (char_length(username) BETWEEN 3 AND 20),
    avatar_url TEXT
        CHECK (avatar_url IS NULL OR avatar_url LIKE 'https://api.dicebear.com/%'),
    wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
    ties INTEGER NOT NULL DEFAULT 0 CHECK (ties >= 0),
    games_played INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code VARCHAR(6) UNIQUE NOT NULL CHECK (room_code ~ '^[A-Z0-9]{6}$'),
    host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    base_word VARCHAR(50) CHECK (base_word IS NULL OR base_word ~ '^[A-Z]{3,25}$'),
    status VARCHAR(20) NOT NULL DEFAULT 'lobby'
        CHECK (status IN ('lobby', 'playing', 'ended')),
    timer_duration INTEGER NOT NULL DEFAULT 60
        CHECK (timer_duration BETWEEN 15 AND 300),
    max_players INTEGER NOT NULL DEFAULT 12
        CHECK (max_players BETWEEN 2 AND 20),
    round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number >= 1),
    enforce_dictionary BOOLEAN NOT NULL DEFAULT true,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
    ready BOOLEAN NOT NULL DEFAULT false,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    left_at TIMESTAMPTZ,
    UNIQUE (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    word VARCHAR(50) NOT NULL CHECK (word = lower(word) AND word ~ '^[a-z]{3,25}$'),
    is_valid BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (room_id, user_id, word)
);

CREATE TABLE IF NOT EXISTS public.game_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL CHECK (round_number >= 1),
    winner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_tie BOOLEAN NOT NULL DEFAULT false,
    tie_score INTEGER,
    total_players INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (room_id, round_number)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 200),
    is_hidden BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_message_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    delivered_at TIMESTAMPTZ,
    seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (message_id, reporter_id)
);

CREATE TABLE IF NOT EXISTS public.blocked_players (
    blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS public.dictionary_words (
    word TEXT PRIMARY KEY CHECK (word = lower(word) AND word ~ '^[a-z]{3,25}$')
);

-- ---------------------------------------------------------------------------
-- 2. INDEXES
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_players_room_active
    ON public.players (room_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_players_user_joined
    ON public.players (user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_room_created
    ON public.submissions (room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_user_room
    ON public.submissions (user_id, room_id);
CREATE INDEX IF NOT EXISTS idx_game_results_room
    ON public.game_results (room_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created
    ON public.chat_messages (room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_receipts_room_user
    ON public.chat_message_receipts (room_id, user_id);
CREATE INDEX IF NOT EXISTS idx_chat_reports_message
    ON public.chat_reports (message_id);
CREATE INDEX IF NOT EXISTS idx_blocked_players_blocker
    ON public.blocked_players (blocker_id);

-- Realtime needs the full row to evaluate RLS on updates/deletes.
ALTER TABLE public.players REPLICA IDENTITY FULL;
ALTER TABLE public.rooms REPLICA IDENTITY FULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
    ON public.profiles (lower(username));

-- ---------------------------------------------------------------------------
-- 3. HELPER FUNCTIONS
-- ---------------------------------------------------------------------------

-- Basic moderation filter. Expand the list to match your community policy.
CREATE OR REPLACE FUNCTION public.is_clean_text(p_text TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
    SELECT regexp_replace(lower(p_text), '[^a-z0-9]+', ' ', 'g')
        !~* '\m(fuck|shit|bitch|asshole|bastard|cunt|dick|pussy|whore|slut|nigger|nigga|faggot|retard)\M';
$$;

CREATE OR REPLACE FUNCTION public.is_room_member(
    p_room_id UUID,
    p_require_active BOOLEAN DEFAULT false
) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.players p
        WHERE p.room_id = p_room_id
          AND p.user_id = auth.uid()
          AND (NOT p_require_active OR p.left_at IS NULL)
    );
$$;

CREATE OR REPLACE FUNCTION public.has_blocked(p_blocker UUID, p_blocked UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.blocked_players b
        WHERE b.blocker_id = p_blocker AND b.blocked_id = p_blocked
    );
$$;

CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT now();
$$;

-- The game allows letters to be reused; it only checks that every letter
-- exists in the base word. Kept IMMUTABLE so it can be unit-tested.
CREATE OR REPLACE FUNCTION public.validate_word_letters(
    p_word TEXT,
    p_base_word TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    v_letter TEXT;
BEGIN
    IF p_word IS NULL OR p_base_word IS NULL THEN
        RETURN false;
    END IF;
    FOREACH v_letter IN ARRAY regexp_split_to_array(lower(p_word), '') LOOP
        IF v_letter = '' THEN
            CONTINUE;
        END IF;
        IF position(v_letter IN lower(p_base_word)) = 0 THEN
            RETURN false;
        END IF;
    END LOOP;
    RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. AUTH TRIGGER
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_username TEXT;
    v_avatar TEXT;
BEGIN
    v_username := coalesce(
        nullif(trim(NEW.raw_user_meta_data ->> 'username'), ''),
        'Player_' || substr(NEW.id::text, 1, 6)
    );
    v_username := left(regexp_replace(v_username, '\s+', ' ', 'g'), 20);
    v_username := trim(regexp_replace(v_username, '[^A-Za-z0-9_ .-]', '', 'g'));
    IF char_length(v_username) < 3 OR NOT public.is_clean_text(v_username) THEN
        v_username := 'Player_' || substr(NEW.id::text, 1, 6);
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE lower(username) = lower(v_username)
    ) THEN
        v_username := left(v_username, 13) || '_' || substr(NEW.id::text, 1, 6);
    END IF;

    v_avatar := NEW.raw_user_meta_data ->> 'avatar_url';
    IF v_avatar IS NULL OR v_avatar NOT LIKE 'https://api.dicebear.com/%' THEN
        v_avatar := NULL;
    END IF;

    INSERT INTO public.profiles (id, username, avatar_url)
    VALUES (NEW.id, v_username, v_avatar)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 5. ROOM LIFECYCLE
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_room(
    p_timer_duration INTEGER,
    p_enforce_dictionary BOOLEAN,
    p_max_players INTEGER DEFAULT 12
) RETURNS public.rooms
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_room public.rooms;
    v_code TEXT;
    v_attempt INTEGER := 0;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'You must be signed in.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user) THEN
        RAISE EXCEPTION 'Profile not found.';
    END IF;
    IF p_timer_duration NOT BETWEEN 15 AND 300 THEN
        RAISE EXCEPTION 'Round duration must be between 15 and 300 seconds.';
    END IF;
    IF p_max_players NOT BETWEEN 2 AND 20 THEN
        RAISE EXCEPTION 'Player limit must be between 2 and 20.';
    END IF;
    IF (
        SELECT count(*) FROM public.rooms
        WHERE host_id = v_user AND status IN ('lobby', 'playing')
    ) >= 3 THEN
        RAISE EXCEPTION 'You already have too many active rooms.';
    END IF;

    LOOP
        v_attempt := v_attempt + 1;
        v_code := upper(substr(
            md5(random()::text || clock_timestamp()::text || v_attempt::text),
            1, 6
        ));
        BEGIN
            INSERT INTO public.rooms (
                room_code, host_id, status, timer_duration,
                max_players, enforce_dictionary, expires_at
            ) VALUES (
                v_code, v_user, 'lobby', p_timer_duration,
                p_max_players, p_enforce_dictionary, now() + interval '24 hours'
            )
            RETURNING * INTO v_room;
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            IF v_attempt >= 10 THEN
                RAISE;
            END IF;
        END;
    END LOOP;

    INSERT INTO public.players (room_id, user_id, score, ready)
    VALUES (v_room.id, v_user, 0, true)
    ON CONFLICT (room_id, user_id)
    DO UPDATE SET left_at = NULL, ready = true;

    RETURN v_room;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_room_by_code(p_code TEXT)
RETURNS public.rooms
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_room public.rooms;
    v_active INTEGER;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'You must be signed in.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user) THEN
        RAISE EXCEPTION 'Profile not found.';
    END IF;

    SELECT * INTO v_room
    FROM public.rooms
    WHERE room_code = upper(trim(p_code))
    FOR UPDATE;

    IF v_room.id IS NULL THEN
        RAISE EXCEPTION 'Room not found.';
    END IF;
    IF v_room.status <> 'lobby' THEN
        RAISE EXCEPTION 'This game has already started.';
    END IF;
    IF v_room.expires_at < now() THEN
        RAISE EXCEPTION 'This room has expired.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.players
        WHERE room_id = v_room.id AND user_id = v_user AND left_at IS NULL
    ) THEN
        RETURN v_room;
    END IF;

    SELECT count(*) INTO v_active
    FROM public.players
    WHERE room_id = v_room.id AND left_at IS NULL;

    IF v_active >= v_room.max_players THEN
        RAISE EXCEPTION 'This room is full.';
    END IF;

    INSERT INTO public.players (room_id, user_id, score, ready)
    VALUES (v_room.id, v_user, 0, false)
    ON CONFLICT (room_id, user_id)
    DO UPDATE SET left_at = NULL, ready = false;

    UPDATE public.rooms
    SET expires_at = greatest(expires_at, now() + interval '24 hours')
    WHERE id = v_room.id;

    RETURN v_room;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_room(p_room_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_room public.rooms;
    v_next_host UUID;
    v_active INTEGER;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'You must be signed in.';
    END IF;

    SELECT * INTO v_room
    FROM public.rooms
    WHERE id = p_room_id
    FOR UPDATE;

    IF v_room.id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.players
    SET left_at = now(), ready = false
    WHERE room_id = p_room_id AND user_id = v_user AND left_at IS NULL;

    SELECT count(*) INTO v_active
    FROM public.players
    WHERE room_id = p_room_id AND left_at IS NULL;

    IF v_room.host_id = v_user AND v_active > 0 THEN
        SELECT user_id INTO v_next_host
        FROM public.players
        WHERE room_id = p_room_id AND left_at IS NULL
        ORDER BY joined_at ASC
        LIMIT 1;
        IF v_next_host IS NOT NULL THEN
            UPDATE public.rooms SET host_id = v_next_host WHERE id = p_room_id;
        END IF;
    END IF;

    IF v_active = 0 AND v_room.status <> 'ended' THEN
        DELETE FROM public.rooms WHERE id = p_room_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_ready(p_room_id UUID, p_ready BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_status TEXT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'You must be signed in.';
    END IF;

    SELECT status INTO v_status FROM public.rooms WHERE id = p_room_id;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Room not found.';
    END IF;
    IF v_status <> 'lobby' THEN
        RAISE EXCEPTION 'The game has already started.';
    END IF;

    UPDATE public.players
    SET ready = p_ready
    WHERE room_id = p_room_id AND user_id = v_user AND left_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'You are not in this room.';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_game(p_room_id UUID, p_base_word TEXT)
RETURNS public.rooms
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_room public.rooms;
    v_word TEXT := upper(trim(p_base_word));
    v_active INTEGER;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'You must be signed in.';
    END IF;

    SELECT * INTO v_room
    FROM public.rooms
    WHERE id = p_room_id
    FOR UPDATE;

    IF v_room.id IS NULL THEN
        RAISE EXCEPTION 'Room not found.';
    END IF;
    IF v_room.host_id <> v_user THEN
        RAISE EXCEPTION 'Only the host can start the game.';
    END IF;
    IF v_room.status <> 'lobby' THEN
        RAISE EXCEPTION 'The game has already started.';
    END IF;
    IF v_word !~ '^[A-Z]{3,25}$' THEN
        RAISE EXCEPTION 'Base word must be 3-25 letters.';
    END IF;

    SELECT count(*) INTO v_active
    FROM public.players
    WHERE room_id = p_room_id AND left_at IS NULL;

    IF v_active < 2 THEN
        RAISE EXCEPTION 'At least two players are required.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.players
        WHERE room_id = p_room_id
          AND left_at IS NULL
          AND user_id <> v_room.host_id
          AND NOT ready
    ) THEN
        RAISE EXCEPTION 'All players must be ready.';
    END IF;

    UPDATE public.rooms
    SET base_word = v_word,
        status = 'playing',
        started_at = now(),
        finished_at = NULL,
        expires_at = now() + interval '2 hours'
    WHERE id = p_room_id
    RETURNING * INTO v_room;

    RETURN v_room;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. GAMEPLAY
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_word(p_room_id UUID, p_word TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_room public.rooms;
    v_word TEXT := lower(trim(p_word));
    v_recent INTEGER;
BEGIN
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'error', 'You must be signed in.');
    END IF;
    IF v_word !~ '^[a-z]{3,25}$' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Words must be 3-25 letters.');
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
    IF v_room.id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Room not found.');
    END IF;
    IF v_room.status <> 'playing' OR v_room.started_at IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'error', 'The game is not active.');
    END IF;
    IF now() > v_room.started_at + make_interval(secs => v_room.timer_duration + 10) THEN
        RETURN jsonb_build_object('valid', false, 'error', 'The submission window has closed.');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.players
        WHERE room_id = p_room_id AND user_id = v_user AND left_at IS NULL
    ) THEN
        RETURN jsonb_build_object('valid', false, 'error', 'You are not in this room.');
    END IF;

    SELECT count(*) INTO v_recent
    FROM public.submissions
    WHERE room_id = p_room_id
      AND user_id = v_user
      AND created_at > now() - interval '1 minute';
    IF v_recent >= 300 THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Too many submissions. Slow down.');
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.submissions
        WHERE room_id = p_room_id AND user_id = v_user AND word = v_word
    ) THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Word already submitted.');
    END IF;

    IF v_room.base_word IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'error', 'The base word is missing.');
    END IF;
    IF NOT public.validate_word_letters(v_word, v_room.base_word) THEN
        INSERT INTO public.submissions (room_id, user_id, word, is_valid)
        VALUES (p_room_id, v_user, v_word, false)
        ON CONFLICT (room_id, user_id, word) DO NOTHING;
        RETURN jsonb_build_object('valid', false, 'error', 'Word uses letters not in the base word.');
    END IF;

    IF v_room.enforce_dictionary THEN
        IF NOT EXISTS (SELECT 1 FROM public.dictionary_words LIMIT 1) THEN
            RETURN jsonb_build_object(
                'valid', false,
                'error', 'Dictionary is not configured on this server. Ask the host to disable dictionary mode.'
            );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.dictionary_words WHERE word = v_word) THEN
            INSERT INTO public.submissions (room_id, user_id, word, is_valid)
            VALUES (p_room_id, v_user, v_word, false)
            ON CONFLICT (room_id, user_id, word) DO NOTHING;
            RETURN jsonb_build_object('valid', false, 'error', 'Not a valid English word.');
        END IF;
    END IF;

    INSERT INTO public.submissions (room_id, user_id, word, is_valid)
    VALUES (p_room_id, v_user, v_word, true);

    UPDATE public.players
    SET score = score + 1
    WHERE room_id = p_room_id AND user_id = v_user AND left_at IS NULL;

    RETURN jsonb_build_object('valid', true, 'word', v_word);
END;
$$;

-- Internal finalizer. No auth check: callers must authorize first.
CREATE OR REPLACE FUNCTION public._finalize_room(p_room_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_room public.rooms;
    v_total INTEGER;
    v_max INTEGER;
    v_winners INTEGER;
    v_winner UUID;
    v_result_id UUID;
BEGIN
    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF v_room.id IS NULL OR v_room.status <> 'playing' THEN
        RETURN;
    END IF;

    SELECT count(*), coalesce(max(score), 0)
    INTO v_total, v_max
    FROM public.players
    WHERE room_id = p_room_id AND left_at IS NULL;

    UPDATE public.rooms
    SET status = 'ended',
        finished_at = now(),
        expires_at = now() + interval '7 days'
    WHERE id = p_room_id;

    IF v_total = 0 THEN
        RETURN;
    END IF;

    SELECT count(*), (array_agg(user_id))[1]
    INTO v_winners, v_winner
    FROM public.players
    WHERE room_id = p_room_id AND left_at IS NULL AND score = v_max;

    INSERT INTO public.game_results (
        room_id, round_number, winner_id, is_tie, tie_score, total_players
    ) VALUES (
        p_room_id,
        v_room.round_number,
        CASE WHEN v_winners = 1 AND v_max > 0 THEN v_winner ELSE NULL END,
        v_winners > 1,
        CASE WHEN v_winners > 1 THEN v_max ELSE NULL END,
        v_total
    )
    ON CONFLICT (room_id, round_number) DO NOTHING
    RETURNING id INTO v_result_id;

    IF v_result_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.profiles p
    SET games_played = p.games_played + 1
    FROM public.players pl
    WHERE pl.room_id = p_room_id
      AND pl.left_at IS NULL
      AND pl.user_id = p.id;

    IF v_winners = 1 AND v_max > 0 THEN
        UPDATE public.profiles SET wins = wins + 1 WHERE id = v_winner;
    ELSIF v_winners > 1 THEN
        UPDATE public.profiles p
        SET ties = p.ties + 1
        FROM public.players pl
        WHERE pl.room_id = p_room_id
          AND pl.left_at IS NULL
          AND pl.score = v_max
          AND pl.user_id = p.id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_room(p_room_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_room public.rooms;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'You must be signed in.';
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF v_room.id IS NULL THEN
        RAISE EXCEPTION 'Room not found.';
    END IF;
    IF v_room.status = 'ended' THEN
        RETURN;
    END IF;
    IF v_room.status <> 'playing' OR v_room.started_at IS NULL THEN
        RAISE EXCEPTION 'The game is not active.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.players
        WHERE room_id = p_room_id AND user_id = v_user AND left_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Only active room members can finalize the game.';
    END IF;
    IF now() < v_room.started_at + make_interval(secs => v_room.timer_duration + 10) THEN
        RAISE EXCEPTION 'The submission window is still open.';
    END IF;

    PERFORM public._finalize_room(p_room_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_stale_rooms()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_id UUID;
BEGIN
    FOR v_id IN
        SELECT id FROM public.rooms
        WHERE status = 'playing'
          AND started_at IS NOT NULL
          AND started_at + make_interval(secs => timer_duration + 70) < now()
    LOOP
        PERFORM public._finalize_room(v_id);
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_stale_rooms()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    DELETE FROM public.rooms AS r
    WHERE r.status IN ('lobby', 'playing')
      AND (
          r.expires_at < now() - interval '1 hour'
          OR NOT EXISTS (
              SELECT 1 FROM public.players p
              WHERE p.room_id = r.id AND p.left_at IS NULL
          )
      );

    DELETE FROM public.rooms
    WHERE status = 'ended'
      AND finished_at < now() - interval '7 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_room(p_room_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_room public.rooms;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'You must be signed in.';
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF v_room.id IS NULL THEN
        RAISE EXCEPTION 'Room not found.';
    END IF;
    IF v_room.host_id <> v_user THEN
        RAISE EXCEPTION 'Only the host can start a rematch.';
    END IF;
    IF v_room.status <> 'ended' THEN
        RAISE EXCEPTION 'The game has not ended yet.';
    END IF;

    DELETE FROM public.submissions WHERE room_id = p_room_id;

    UPDATE public.players
    SET score = 0,
        ready = (user_id = v_room.host_id)
    WHERE room_id = p_room_id AND left_at IS NULL;

    UPDATE public.rooms
    SET status = 'lobby',
        base_word = NULL,
        started_at = NULL,
        finished_at = NULL,
        round_number = round_number + 1,
        expires_at = now() + interval '24 hours'
    WHERE id = p_room_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. CHAT + MODERATION
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.send_chat_message(p_room_id UUID, p_message TEXT)
RETURNS public.chat_messages
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_message TEXT := trim(p_message);
    v_username TEXT;
    v_recent INTEGER;
    v_msg public.chat_messages;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'You must be signed in.';
    END IF;
    IF char_length(v_message) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION 'Messages must be 1-200 characters.';
    END IF;
    IF NOT public.is_clean_text(v_message) THEN
        RAISE EXCEPTION 'Message contains blocked language.';
    END IF;
    IF NOT public.is_room_member(p_room_id, true) THEN
        RAISE EXCEPTION 'You are not in this room.';
    END IF;

    SELECT count(*) INTO v_recent
    FROM public.chat_messages
    WHERE room_id = p_room_id
      AND user_id = v_user
      AND created_at > now() - interval '10 seconds';
    IF v_recent >= 5 THEN
        RAISE EXCEPTION 'You are sending messages too quickly.';
    END IF;

    SELECT username INTO v_username
    FROM public.profiles
    WHERE id = v_user;
    IF v_username IS NULL THEN
        RAISE EXCEPTION 'Profile not found.';
    END IF;

    INSERT INTO public.chat_messages (room_id, user_id, username, message)
    VALUES (p_room_id, v_user, v_username, v_message)
    RETURNING * INTO v_msg;

    RETURN v_msg;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_chat_message(
    p_message_id UUID,
    p_reason TEXT DEFAULT 'Reported from chat'
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_room_id UUID;
    v_author UUID;
    v_reason TEXT := trim(p_reason);
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'You must be signed in.';
    END IF;
    IF char_length(v_reason) NOT BETWEEN 1 AND 500 THEN
        RAISE EXCEPTION 'Report reason must be 1-500 characters.';
    END IF;

    SELECT room_id, user_id INTO v_room_id, v_author
    FROM public.chat_messages
    WHERE id = p_message_id;
    IF v_room_id IS NULL THEN
        RAISE EXCEPTION 'Message not found.';
    END IF;
    IF v_author = v_user THEN
        RAISE EXCEPTION 'You cannot report your own message.';
    END IF;
    IF NOT public.is_room_member(v_room_id, true) THEN
        RAISE EXCEPTION 'You are not in this room.';
    END IF;

    INSERT INTO public.chat_reports (message_id, room_id, reporter_id, reason)
    VALUES (p_message_id, v_room_id, v_user, v_reason)
    ON CONFLICT (message_id, reporter_id) DO NOTHING;

    IF (
        SELECT count(*) FROM public.chat_reports WHERE message_id = p_message_id
    ) >= 3 THEN
        UPDATE public.chat_messages SET is_hidden = true WHERE id = p_message_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.block_player(p_blocked_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'You must be signed in.';
    END IF;
    IF p_blocked_id = v_user THEN
        RAISE EXCEPTION 'You cannot block yourself.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_blocked_id) THEN
        RAISE EXCEPTION 'Player not found.';
    END IF;
    INSERT INTO public.blocked_players (blocker_id, blocked_id)
    VALUES (v_user, p_blocked_id)
    ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.unblock_player(p_blocked_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'You must be signed in.';
    END IF;
    DELETE FROM public.blocked_players
    WHERE blocker_id = auth.uid() AND blocked_id = p_blocked_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. PROFILE + DICTIONARY
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_profile(
    p_username TEXT,
    p_avatar_url TEXT
) RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_username TEXT := trim(p_username);
    v_profile public.profiles;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'You must be signed in.';
    END IF;
    IF char_length(v_username) NOT BETWEEN 3 AND 20 THEN
        RAISE EXCEPTION 'Username must be 3-20 characters.';
    END IF;
    IF v_username !~ '^[A-Za-z0-9_ .-]+$' THEN
        RAISE EXCEPTION 'Username contains unsupported characters.';
    END IF;
    IF NOT public.is_clean_text(v_username) THEN
        RAISE EXCEPTION 'Username contains blocked language.';
    END IF;
    IF p_avatar_url IS NOT NULL AND p_avatar_url NOT LIKE 'https://api.dicebear.com/%' THEN
        RAISE EXCEPTION 'Avatar URL is not allowed.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE lower(username) = lower(v_username) AND id <> v_user
    ) THEN
        RAISE EXCEPTION 'Username is already taken.';
    END IF;

    UPDATE public.profiles
    SET username = v_username,
        avatar_url = p_avatar_url
    WHERE id = v_user
    RETURNING * INTO v_profile;

    IF v_profile.id IS NULL THEN
        RAISE EXCEPTION 'Profile not found.';
    END IF;
    RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_words(p_words TEXT[])
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    WITH input AS (
        SELECT w AS original, lower(trim(w)) AS clean, ord
        FROM unnest(coalesce(p_words, '{}'::text[])) WITH ORDINALITY AS t(w, ord)
        ORDER BY ord
        LIMIT 200
    )
    SELECT coalesce(array_agg(original ORDER BY ord), '{}'::text[])
    FROM input
    WHERE clean !~ '^[a-z]{3,25}$'
       OR NOT EXISTS (
           SELECT 1 FROM public.dictionary_words d WHERE d.word = input.clean
       );
$$;

-- ---------------------------------------------------------------------------
-- 9. TRIGGERS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cleanup_room_chat_when_empty()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.left_at IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.players
        WHERE room_id = NEW.room_id AND left_at IS NULL
    ) THEN
        DELETE FROM public.chat_messages WHERE room_id = NEW.room_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_player_left_cleanup_chat ON public.players;
CREATE TRIGGER on_player_left_cleanup_chat
    AFTER UPDATE OF left_at ON public.players
    FOR EACH ROW EXECUTE FUNCTION public.cleanup_room_chat_when_empty();

-- Service-role helper used by the delete-account Edge Function. It hands off
-- any hosted rooms before the profile cascade removes the departing user.
CREATE OR REPLACE FUNCTION public.prepare_account_deletion(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_room RECORD;
    v_new_host UUID;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'A user id is required.';
    END IF;

    FOR v_room IN
        SELECT id
        FROM public.rooms
        WHERE host_id = p_user_id AND status <> 'ended'
        FOR UPDATE
    LOOP
        SELECT user_id INTO v_new_host
        FROM public.players
        WHERE room_id = v_room.id
          AND user_id <> p_user_id
          AND left_at IS NULL
        ORDER BY joined_at ASC
        LIMIT 1;

        IF v_new_host IS NULL THEN
            DELETE FROM public.rooms WHERE id = v_room.id;
        ELSE
            UPDATE public.rooms
            SET host_id = v_new_host
            WHERE id = v_room.id;

            UPDATE public.players
            SET ready = false
            WHERE room_id = v_room.id AND user_id = v_new_host;
        END IF;
    END LOOP;

    UPDATE public.players
    SET left_at = now()
    WHERE user_id = p_user_id AND left_at IS NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dictionary_words ENABLE ROW LEVEL SECURITY;

-- Replace any policies from older installs.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
              'profiles', 'rooms', 'players', 'submissions', 'game_results',
              'chat_messages', 'chat_message_receipts', 'chat_reports',
              'blocked_players', 'dictionary_words'
          )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END;
$$;

CREATE POLICY profiles_select ON public.profiles
    FOR SELECT TO authenticated USING (true);

CREATE POLICY rooms_select ON public.rooms
    FOR SELECT TO authenticated
    USING (host_id = auth.uid() OR public.is_room_member(id));

CREATE POLICY players_select ON public.players
    FOR SELECT TO authenticated
    USING (public.is_room_member(room_id));

CREATE POLICY submissions_select ON public.submissions
    FOR SELECT TO authenticated
    USING (
        public.is_room_member(room_id)
        AND (
            user_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM public.rooms r
                WHERE r.id = submissions.room_id AND r.status = 'ended'
            )
        )
    );

CREATE POLICY game_results_select ON public.game_results
    FOR SELECT TO authenticated
    USING (public.is_room_member(room_id));

CREATE POLICY chat_messages_select ON public.chat_messages
    FOR SELECT TO authenticated
    USING (
        NOT is_hidden
        AND public.is_room_member(room_id, true)
        AND NOT public.has_blocked(auth.uid(), user_id)
    );

CREATE POLICY chat_receipts_select ON public.chat_message_receipts
    FOR SELECT TO authenticated
    USING (public.is_room_member(room_id, true));

CREATE POLICY chat_receipts_insert ON public.chat_message_receipts
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND public.is_room_member(room_id, true)
        AND EXISTS (
            SELECT 1 FROM public.chat_messages m
            WHERE m.id = chat_message_receipts.message_id
              AND m.room_id = chat_message_receipts.room_id
        )
    );

CREATE POLICY chat_receipts_update ON public.chat_message_receipts
    FOR UPDATE TO authenticated
    USING (
        user_id = auth.uid()
        AND public.is_room_member(room_id, true)
        AND EXISTS (
            SELECT 1 FROM public.chat_messages m
            WHERE m.id = chat_message_receipts.message_id
              AND m.room_id = chat_message_receipts.room_id
        )
    )
    WITH CHECK (
        user_id = auth.uid()
        AND public.is_room_member(room_id, true)
        AND EXISTS (
            SELECT 1 FROM public.chat_messages m
            WHERE m.id = chat_message_receipts.message_id
              AND m.room_id = chat_message_receipts.room_id
        )
    );

CREATE POLICY chat_reports_select ON public.chat_reports
    FOR SELECT TO authenticated
    USING (reporter_id = auth.uid());

CREATE POLICY blocked_players_select ON public.blocked_players
    FOR SELECT TO authenticated
    USING (blocker_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 11. PRIVILEGES
-- ---------------------------------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.rooms TO authenticated;
GRANT SELECT ON public.players TO authenticated;
GRANT SELECT ON public.submissions TO authenticated;
GRANT SELECT ON public.game_results TO authenticated;
GRANT SELECT ON public.chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.chat_message_receipts TO authenticated;
GRANT SELECT ON public.chat_reports TO authenticated;
GRANT SELECT ON public.blocked_players TO authenticated;

-- Revoke the default PUBLIC execute privilege on every public function.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS signature
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
    LOOP
        EXECUTE format(
            'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
            r.signature
        );
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_room_member(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_blocked(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_server_time() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_words(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_profile(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_room(INTEGER, BOOLEAN, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_room_by_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_room(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_ready(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_game(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_word(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_room(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_room(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_chat_message(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_chat_message(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_player(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_player(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 12. REALTIME
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    t TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH t IN ARRAY ARRAY[
            'rooms', 'players', 'submissions', 'chat_messages', 'chat_message_receipts'
        ] LOOP
            BEGIN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            EXCEPTION WHEN duplicate_object THEN
                NULL;
            END;
        END LOOP;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 13. MAINTENANCE (pg_cron is optional)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            PERFORM cron.unschedule('spellsift-finalize-stale-rooms');
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
        BEGIN
            PERFORM cron.unschedule('spellsift-cleanup-rooms');
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
        PERFORM cron.schedule(
            'spellsift-finalize-stale-rooms',
            '* * * * *',
            'SELECT public.finalize_stale_rooms();'
        );
        PERFORM cron.schedule(
            'spellsift-cleanup-rooms',
            '17 * * * *',
            'SELECT public.cleanup_stale_rooms();'
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END;
$$;

NOTIFY pgrst, 'reload schema';
