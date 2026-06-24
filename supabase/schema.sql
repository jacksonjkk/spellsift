-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS PROFILE TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    avatar_url TEXT,
    wins INTEGER DEFAULT 0,
    ties INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. ROOMS TABLE
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code VARCHAR(6) UNIQUE NOT NULL,
    host_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    base_word VARCHAR(50),
    status VARCHAR(20) DEFAULT 'lobby' NOT NULL, -- 'lobby', 'playing', 'ended'
    timer_duration INTEGER DEFAULT 60 NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    enforce_dictionary BOOLEAN DEFAULT false NOT NULL
);

-- Enable RLS for rooms
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- 3. PLAYERS TABLE
CREATE TABLE IF NOT EXISTS public.players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    score INTEGER DEFAULT 0 NOT NULL,
    ready BOOLEAN DEFAULT false NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(room_id, user_id)
);

-- Enable RLS for players
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- 4. SUBMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    word VARCHAR(50) NOT NULL,
    is_valid BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(room_id, user_id, word)
);

-- Enable RLS for submissions
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- 5. GAME RESULTS TABLE
CREATE TABLE IF NOT EXISTS public.game_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
    winner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_tie BOOLEAN DEFAULT false NOT NULL,
    tie_score INTEGER,
    total_players INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for game_results
ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;

-- 6. CHAT MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for chat messages
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_rooms_code ON public.rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_players_room ON public.players(room_id);
CREATE INDEX IF NOT EXISTS idx_submissions_room_user ON public.submissions(room_id, user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON public.chat_messages(room_id);

-- RLS POLICIES
-- Profiles: Users can read all profiles (to see leaderboards), but only update their own.
CREATE POLICY "Allow public read profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Allow update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Rooms: Anyone authenticated or anonymous can read rooms, create rooms, and host can update rooms.
CREATE POLICY "Allow read rooms" ON public.rooms FOR SELECT USING (auth.role() IN ('authenticated', 'anon'));
CREATE POLICY "Allow insert rooms" ON public.rooms FOR INSERT WITH CHECK (auth.role() IN ('authenticated', 'anon') AND host_id = auth.uid());
CREATE POLICY "Allow host update rooms" ON public.rooms FOR UPDATE USING (auth.uid() = host_id);

-- Players: Anyone authenticated or anonymous can read players, insert themselves, and update their own player state.
CREATE POLICY "Allow read players" ON public.players FOR SELECT USING (auth.role() IN ('authenticated', 'anon'));
CREATE POLICY "Allow insert players" ON public.players FOR INSERT WITH CHECK (auth.role() IN ('authenticated', 'anon') AND user_id = auth.uid());
CREATE POLICY "Allow user update own player state" ON public.players FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Allow host update players" ON public.players FOR UPDATE USING (
    auth.uid() IN (SELECT host_id FROM public.rooms WHERE id = room_id)
);
CREATE POLICY "Allow player delete self" ON public.players FOR DELETE USING (auth.uid() = user_id);

-- Submissions: Players can read all submissions in their rooms, but only insert their own.
CREATE POLICY "Allow read submissions" ON public.submissions FOR SELECT USING (
    auth.role() IN ('authenticated', 'anon') AND 
    user_id IN (SELECT user_id FROM public.players WHERE room_id = submissions.room_id)
);
CREATE POLICY "Allow insert own submissions" ON public.submissions FOR INSERT WITH CHECK (
    auth.role() IN ('authenticated', 'anon') AND user_id = auth.uid()
);

-- Game Results: Anyone can select game results.
CREATE POLICY "Allow select game results" ON public.game_results FOR SELECT USING (true);
CREATE POLICY "Allow insert game results" ON public.game_results FOR INSERT WITH CHECK (auth.role() IN ('authenticated', 'anon'));

-- Chat Messages: Anyone in the room can select and insert messages.
CREATE POLICY "Allow read chat messages" ON public.chat_messages FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.players
        WHERE room_id = chat_messages.room_id AND user_id = auth.uid()
    )
);
CREATE POLICY "Allow insert chat messages" ON public.chat_messages FOR INSERT WITH CHECK (
    user_id = auth.uid() AND EXISTS (
        SELECT 1 FROM public.players
        WHERE room_id = chat_messages.room_id AND user_id = auth.uid()
    )
);

-- AUTOMATIC PROFILE CREATION TRIGGER
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
  VALUES (
    new.id,
    available_username,
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- DATABASE FUNCTIONS (RPC)

-- 1. Check if word uses only letters from base word
CREATE OR REPLACE FUNCTION public.validate_word_letters(submitted_word TEXT, base_word TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    word_len INT := length(submitted_word);
    i INT;
    char TEXT;
BEGIN
    FOR i IN 1..word_len LOOP
        char := substr(submitted_word, i, 1);
        IF position(char IN base_word) = 0 THEN
            RETURN FALSE;
        END IF;
    END LOOP;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Submit Word RPC (Validates server-side and increments score)
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
    -- Sanitize input
    v_word_clean := lower(trim(p_word));
    
    -- Get room details
    SELECT status, base_word, started_at, timer_duration 
    INTO v_room_status, v_base_word, v_started_at, v_duration
    FROM public.rooms
    WHERE id = p_room_id;
    
    v_base_clean := lower(trim(v_base_word));
    
    -- Validation checks
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
    
    -- Check duplicates first so we don't save multiple invalid duplicates
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
    
    -- Insert valid submission
    INSERT INTO public.submissions (room_id, user_id, word, is_valid)
    VALUES (p_room_id, v_user_id, trim(p_word), true);
    
    -- Update Player Score (+1 point for valid word)
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

-- 3. Finish Room RPC (Calculates winner, saves results, updates stats)
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
    -- Lock the room so the same match cannot be finalized twice.
    SELECT host_id, status, started_at, timer_duration
    INTO v_host_id, v_room_status, v_started_at, v_duration
    FROM public.rooms WHERE id = p_room_id FOR UPDATE;

    IF v_host_id IS NULL THEN
        RAISE EXCEPTION 'Room not found.';
    END IF;
    
    -- Verify caller is host
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

    -- Only one unique leader with a positive score earns a win.
    IF v_max_score > 0 AND v_players_at_max = 1 THEN
        SELECT user_id INTO v_winner_id
        FROM public.players
        WHERE room_id = p_room_id AND score = v_max_score
        LIMIT 1;
    ELSIF v_players_at_max > 1 THEN
        v_is_tie := true;
    END IF;
    
    -- Update room status
    UPDATE public.rooms SET status = 'ended' WHERE id = p_room_id;
    
    -- Insert into game_results
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

        -- Ties still count as games played for every participant.
        UPDATE public.profiles AS profile
        SET games_played = profile.games_played + 1
        FROM public.players AS player
        WHERE player.room_id = p_room_id AND player.user_id = profile.id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Reset Room RPC (Clears score, deletes submissions, moves status to lobby)
CREATE OR REPLACE FUNCTION public.reset_room(p_room_id UUID)
RETURNS VOID AS $$
DECLARE
    v_host_id UUID;
BEGIN
    -- Get host
    SELECT host_id INTO v_host_id FROM public.rooms WHERE id = p_room_id;
    
    -- Verify caller is host
    IF auth.uid() != v_host_id THEN
        RAISE EXCEPTION 'Only the host can reset the game.';
    END IF;
    
    -- Delete submissions
    DELETE FROM public.submissions WHERE room_id = p_room_id;
    
    -- Reset players
    UPDATE public.players 
    SET score = 0, ready = false 
    WHERE room_id = p_room_id;
    
    -- Update room status
    UPDATE public.rooms 
    SET status = 'lobby', base_word = NULL, started_at = NULL 
    WHERE id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
