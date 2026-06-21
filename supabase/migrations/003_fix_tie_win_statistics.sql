-- A tie is a game played, not a win. winner_id remains NULL unless exactly
-- one player has the highest positive score.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ties INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.game_results
  ADD COLUMN IF NOT EXISTS is_tie BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tie_score INTEGER;

CREATE OR REPLACE FUNCTION public.finish_room(p_room_id UUID)
RETURNS VOID AS $$
DECLARE
    v_host_id UUID;
    v_room_status TEXT;
    v_winner_id UUID := NULL;
    v_total_players INT;
    v_max_score INT := 0;
    v_players_at_max INT := 0;
    v_is_tie BOOLEAN := false;
BEGIN
    SELECT host_id, status INTO v_host_id, v_room_status
    FROM public.rooms WHERE id = p_room_id FOR UPDATE;

    IF v_host_id IS NULL THEN
        RAISE EXCEPTION 'Room not found.';
    END IF;

    IF auth.uid() IS DISTINCT FROM v_host_id THEN
        RAISE EXCEPTION 'Only the host can finalize the game.';
    END IF;

    -- Prevent repeated timer calls from incrementing statistics twice.
    IF v_room_status = 'ended' THEN
        RETURN;
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

-- Repair a wrongly awarded win for the latest match of any currently-ended
-- room. Scores are still intact in ended rooms, so this correction is safe.
WITH latest_result AS (
    SELECT DISTINCT ON (room_id) id, room_id, winner_id, is_tie
    FROM public.game_results
    ORDER BY room_id, created_at DESC
),
room_max AS (
    SELECT player.room_id, max(player.score) AS max_score
    FROM public.players AS player
    JOIN public.rooms AS room ON room.id = player.room_id
    WHERE room.status = 'ended'
    GROUP BY player.room_id
),
incorrect_tie_result AS (
    SELECT result.id, result.winner_id
    FROM latest_result AS result
    JOIN room_max ON room_max.room_id = result.room_id
    JOIN public.players AS player
      ON player.room_id = result.room_id
     AND player.score = room_max.max_score
    WHERE result.winner_id IS NOT NULL
    GROUP BY result.id, result.winner_id
    HAVING count(*) > 1
),
win_deduction AS (
    SELECT winner_id, count(*)::int AS amount
    FROM incorrect_tie_result
    GROUP BY winner_id
)
UPDATE public.profiles AS profile
SET wins = greatest(0, profile.wins - win_deduction.amount)
FROM win_deduction
WHERE profile.id = win_deduction.winner_id;

WITH latest_result AS (
    SELECT DISTINCT ON (room_id) id, room_id, winner_id, is_tie
    FROM public.game_results
    ORDER BY room_id, created_at DESC
),
room_max AS (
    SELECT player.room_id, max(player.score) AS max_score
    FROM public.players AS player
    JOIN public.rooms AS room ON room.id = player.room_id
    WHERE room.status = 'ended'
    GROUP BY player.room_id
),
tied_result AS (
    SELECT result.id, result.room_id, room_max.max_score
    FROM latest_result AS result
    JOIN room_max ON room_max.room_id = result.room_id
    JOIN public.players AS player
      ON player.room_id = result.room_id
     AND player.score = room_max.max_score
    WHERE result.is_tie = false
    GROUP BY result.id, result.room_id, room_max.max_score
    HAVING count(*) > 1
),
marked_tie AS (
    UPDATE public.game_results AS result
    SET winner_id = NULL,
        is_tie = true,
        tie_score = tied_result.max_score
    FROM tied_result
    WHERE result.id = tied_result.id
    RETURNING result.room_id, result.tie_score AS max_score
)
UPDATE public.profiles AS profile
SET ties = profile.ties + 1
FROM public.players AS player
JOIN marked_tie
  ON marked_tie.room_id = player.room_id
 AND marked_tie.max_score = player.score
WHERE profile.id = player.user_id;
