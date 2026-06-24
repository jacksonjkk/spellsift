export interface Profile {
  id: string;
  username: string;
  email: string | null;
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
  started_at: string | null;
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
  // Joined property from profiles table query:
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
  created_at: string;
}

export interface ChatMessageReceipt {
  id: string;
  message_id: string;
  room_id: string;
  user_id: string;
  delivered_at: string;
  seen_at: string | null;
  created_at: string;
  updated_at: string;
}
