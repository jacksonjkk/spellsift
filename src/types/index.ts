export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  wins: number;
  ties: number;
  games_played: number;
  created_at: string;
}

export type RoomStatus = 'lobby' | 'playing' | 'ended';

export interface Room {
  id: string;
  room_code: string;
  host_id: string;
  base_word: string | null;
  status: RoomStatus;
  timer_duration: number;
  max_players: number;
  round_number: number;
  started_at: string | null;
  finished_at: string | null;
  expires_at: string;
  created_at: string;
  enforce_dictionary: boolean;
}

export interface Player {
  id: string;
  room_id: string;
  user_id: string;
  score: number;
  ready: boolean;
  joined_at: string;
  left_at: string | null;
  // Joined property from the profiles table query:
  profiles?: Profile;
}

export interface Submission {
  id: string;
  room_id: string;
  user_id: string;
  word: string;
  is_valid: boolean;
  created_at: string;
}

export interface GameResult {
  id: string;
  room_id: string;
  round_number: number;
  winner_id: string | null;
  is_tie: boolean;
  tie_score: number | null;
  total_players: number;
  created_at: string;
  winner_profile?: Profile;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  username: string;
  message: string;
  is_hidden: boolean;
  created_at: string;
}

export interface ChatMessageReceipt {
  id: string;
  message_id: string;
  room_id: string;
  user_id: string;
  delivered_at: string | null;
  seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatReport {
  id: string;
  message_id: string;
  room_id: string;
  reporter_id: string;
  reason: string;
  created_at: string;
}

export interface BlockedPlayer {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
  profiles?: Profile;
}

export interface RecentMatch {
  room_id: string;
  score: number;
  joined_at: string;
  rooms: {
    room_code: string;
    status: RoomStatus;
    base_word: string | null;
    host_id: string;
    round_number: number;
    game_results: GameResult[];
  } | null;
}

export interface SubmitWordResult {
  valid: boolean;
  word?: string;
  error?: string;
}

export interface RoomSettings {
  timerDuration: number;
  enforceDictionary: boolean;
  maxPlayers: number;
}
