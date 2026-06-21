-- Migration: Fix RLS Policies to Support Anonymous Users
-- This migration drops existing RLS policies and recreates them to allow both authenticated and anonymous users

-- Drop existing policies
DROP POLICY IF EXISTS "Allow public read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated read rooms" ON public.rooms;
DROP POLICY IF EXISTS "Allow authenticated insert rooms" ON public.rooms;
DROP POLICY IF EXISTS "Allow host update rooms" ON public.rooms;
DROP POLICY IF EXISTS "Allow authenticated read players" ON public.players;
DROP POLICY IF EXISTS "Allow authenticated insert players" ON public.players;
DROP POLICY IF EXISTS "Allow user update own player state" ON public.players;
DROP POLICY IF EXISTS "Allow host update players" ON public.players;
DROP POLICY IF EXISTS "Allow player delete self" ON public.players;
DROP POLICY IF EXISTS "Allow read submissions" ON public.submissions;
DROP POLICY IF EXISTS "Allow insert own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Allow select game results" ON public.game_results;
DROP POLICY IF EXISTS "Allow system insert game results" ON public.game_results;
DROP POLICY IF EXISTS "Allow read chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Allow insert chat messages" ON public.chat_messages;

-- Recreate policies with support for both authenticated and anonymous users

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
    auth.role() IN ('authenticated', 'anon') AND
    user_id IN (SELECT user_id FROM public.players WHERE room_id = chat_messages.room_id)
);
CREATE POLICY "Allow insert chat messages" ON public.chat_messages FOR INSERT WITH CHECK (
    auth.role() IN ('authenticated', 'anon') AND user_id = auth.uid()
);
