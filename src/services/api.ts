import supabase from './supabase';
import { ApiError } from '../utils/errors';
import type {
  BlockedPlayer,
  ChatMessage,
  ChatMessageReceipt,
  Player,
  Profile,
  RecentMatch,
  Room,
  RoomSettings,
  Submission,
  SubmitWordResult,
} from '../types';

const PROFILE_FIELDS = 'id, username, avatar_url, wins, ties, games_played, created_at';
const ROOM_FIELDS =
  'id, room_code, host_id, base_word, status, timer_duration, max_players, round_number, started_at, finished_at, expires_at, created_at, enforce_dictionary';
const PLAYER_FIELDS = `id, room_id, user_id, score, ready, joined_at, left_at, profiles(${PROFILE_FIELDS})`;
const SUBMISSION_FIELDS = 'id, room_id, user_id, word, is_valid, created_at';
const CHAT_FIELDS = 'id, room_id, user_id, username, message, is_hidden, created_at';
const RECEIPT_FIELDS =
  'id, message_id, room_id, user_id, delivered_at, seen_at, created_at, updated_at';
const RESULT_FIELDS =
  'id, room_id, round_number, winner_id, is_tie, tie_score, total_players, created_at';

export const api = {
  // Profiles
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_FIELDS)
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return (data as Profile | null) ?? null;
  },

  async updateProfile(username: string, avatarUrl: string | null): Promise<Profile> {
    const { data, error } = await supabase.rpc('update_profile', {
      p_username: username,
      p_avatar_url: avatarUrl,
    });

    if (error) throw error;
    return data as Profile;
  },

  async deleteAccount(): Promise<void> {
    const { error } = await supabase.functions.invoke('delete-account', {
      method: 'POST',
    });

    if (!error) return;

    // Edge Functions return { error } JSON on failure. Surface that safe,
    // user-facing message instead of the generic "non-2xx" wrapper.
    const response = (error as { context?: Response }).context;
    if (response) {
      try {
        const body = (await response.clone().json()) as { error?: unknown };
        if (typeof body.error === 'string') {
          throw new ApiError(body.error, { cause: error });
        }
      } catch (parseError) {
        if (parseError instanceof ApiError) throw parseError;
      }
    }

    throw error;
  },

  // Rooms
  async createRoom(settings: RoomSettings): Promise<Room> {
    const { data, error } = await supabase.rpc('create_room', {
      p_timer_duration: settings.timerDuration,
      p_enforce_dictionary: settings.enforceDictionary,
      p_max_players: settings.maxPlayers,
    });

    if (error) throw error;
    return data as Room;
  },

  async joinRoomByCode(code: string): Promise<Room> {
    const { data, error } = await supabase.rpc('join_room_by_code', {
      p_code: code.toUpperCase().trim(),
    });

    if (error) throw error;
    return data as Room;
  },

  async getRoomById(roomId: string): Promise<Room | null> {
    const { data, error } = await supabase
      .from('rooms')
      .select(ROOM_FIELDS)
      .eq('id', roomId)
      .maybeSingle();

    if (error) throw error;
    return (data as Room | null) ?? null;
  },

  async isPlayerInRoom(roomId: string, userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .is('left_at', null)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  },

  // Players
  async leaveRoom(roomId: string): Promise<void> {
    const { error } = await supabase.rpc('leave_room', {
      p_room_id: roomId,
    });

    if (error) throw error;
  },

  async setReadyStatus(roomId: string, ready: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_ready', {
      p_room_id: roomId,
      p_ready: ready,
    });

    if (error) throw error;
  },

  async getRoomPlayers(roomId: string): Promise<Player[]> {
    const { data, error } = await supabase
      .from('players')
      .select(PLAYER_FIELDS)
      .eq('room_id', roomId)
      .is('left_at', null)
      .order('joined_at', { ascending: true });

    if (error) throw error;
    return (data as unknown as Player[]) ?? [];
  },

  // Game logic
  async startGame(roomId: string, baseWord: string): Promise<Room> {
    const { data, error } = await supabase.rpc('start_game', {
      p_room_id: roomId,
      p_base_word: baseWord.toUpperCase().trim(),
    });

    if (error) throw error;
    return data as Room;
  },

  async submitWord(roomId: string, word: string): Promise<SubmitWordResult> {
    const { data, error } = await supabase.rpc('submit_word', {
      p_room_id: roomId,
      p_word: word,
    });

    if (error) throw error;
    if (!data) return { valid: false, error: 'No response from the server.' };
    return data as SubmitWordResult;
  },

  async finishRoom(roomId: string): Promise<void> {
    const { error } = await supabase.rpc('finish_room', {
      p_room_id: roomId,
    });

    if (error) throw error;
  },

  async resetRoom(roomId: string): Promise<void> {
    const { error } = await supabase.rpc('reset_room', {
      p_room_id: roomId,
    });

    if (error) throw error;
  },

  async getServerTime(): Promise<string> {
    const { data, error } = await supabase.rpc('get_server_time');
    if (error) throw error;
    return data as string;
  },

  async checkWords(words: string[]): Promise<string[]> {
    if (words.length === 0) return [];
    const { data, error } = await supabase.rpc('check_words', {
      p_words: words,
    });
    if (error) throw error;
    return (data as string[] | null) ?? [];
  },

  // Chat
  async sendChatMessage(roomId: string, message: string): Promise<ChatMessage> {
    const { data, error } = await supabase.rpc('send_chat_message', {
      p_room_id: roomId,
      p_message: message,
    });

    if (error) throw error;
    return data as ChatMessage;
  },

  async getChatMessages(roomId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from('chat_messages')
      .select(CHAT_FIELDS)
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;
    return ((data as ChatMessage[]) ?? []).slice().reverse();
  },

  async getChatMessageReceipts(roomId: string): Promise<ChatMessageReceipt[]> {
    const { data, error } = await supabase
      .from('chat_message_receipts')
      .select(RECEIPT_FIELDS)
      .eq('room_id', roomId);

    if (error) throw error;
    return (data as ChatMessageReceipt[]) ?? [];
  },

  async markChatMessagesDelivered(
    roomId: string,
    userId: string,
    messageIds: string[]
  ): Promise<ChatMessageReceipt[]> {
    if (messageIds.length === 0) return [];

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('chat_message_receipts')
      .upsert(
        messageIds.map((messageId) => ({
          room_id: roomId,
          message_id: messageId,
          user_id: userId,
          delivered_at: now,
          updated_at: now,
        })),
        { onConflict: 'message_id,user_id', ignoreDuplicates: true }
      )
      .select(RECEIPT_FIELDS);

    if (error) throw error;
    return (data as ChatMessageReceipt[]) ?? [];
  },

  async markChatMessagesSeen(
    roomId: string,
    userId: string,
    messageIds: string[]
  ): Promise<ChatMessageReceipt[]> {
    if (messageIds.length === 0) return [];

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('chat_message_receipts')
      .upsert(
        messageIds.map((messageId) => ({
          room_id: roomId,
          message_id: messageId,
          user_id: userId,
          delivered_at: now,
          seen_at: now,
          updated_at: now,
        })),
        { onConflict: 'message_id,user_id' }
      )
      .select(RECEIPT_FIELDS);

    if (error) throw error;
    return (data as ChatMessageReceipt[]) ?? [];
  },

  async reportChatMessage(messageId: string, reason = 'Reported from chat'): Promise<void> {
    const { error } = await supabase.rpc('report_chat_message', {
      p_message_id: messageId,
      p_reason: reason,
    });
    if (error) throw error;
  },

  async blockPlayer(userId: string): Promise<void> {
    const { error } = await supabase.rpc('block_player', {
      p_blocked_id: userId,
    });
    if (error) throw error;
  },

  async unblockPlayer(userId: string): Promise<void> {
    const { error } = await supabase.rpc('unblock_player', {
      p_blocked_id: userId,
    });
    if (error) throw error;
  },

  async getBlockedPlayers(): Promise<BlockedPlayer[]> {
    const { data, error } = await supabase
      .from('blocked_players')
      .select(
        `blocker_id, blocked_id, created_at, profiles!blocked_players_blocked_id_fkey(${PROFILE_FIELDS})`
      )
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as unknown as BlockedPlayer[]) ?? [];
  },

  // Statistics and history
  async getRecentMatches(userId: string): Promise<RecentMatch[]> {
    const { data, error } = await supabase
      .from('players')
      .select(
        `room_id, score, joined_at, rooms!inner(room_code, status, base_word, host_id, round_number, game_results(${RESULT_FIELDS}))`
      )
      .eq('user_id', userId)
      .eq('rooms.status', 'ended')
      .order('joined_at', { ascending: false })
      .limit(10);

    if (error) throw error;
    return (data as unknown as RecentMatch[]) ?? [];
  },

  async getUserSubmissions(roomId: string, userId: string): Promise<Submission[]> {
    const { data, error } = await supabase
      .from('submissions')
      .select(SUBMISSION_FIELDS)
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data as Submission[]) ?? [];
  },

  async getRoomSubmissions(roomId: string): Promise<Submission[]> {
    const { data, error } = await supabase
      .from('submissions')
      .select(SUBMISSION_FIELDS)
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data as Submission[]) ?? [];
  },
};

export default api;
