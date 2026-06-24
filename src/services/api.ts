import supabase from './supabase';
import type { Room, Player, Profile, Submission, ChatMessage } from '../types';

// Helper to generate a random 6-character room code
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const api = {
  // Profiles
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    return data;
  },

  async updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
    return data;
  },

  // Rooms
  async createRoom(
    hostId: string, 
    timerDuration: number, 
    enforceDictionary: boolean
  ): Promise<Room> {
    const code = generateRoomCode();
    const { data, error } = await supabase
      .from('rooms')
      .insert({
        room_code: code,
        host_id: hostId,
        status: 'lobby',
        timer_duration: timerDuration,
        enforce_dictionary: enforceDictionary
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating room:', error);
      throw error;
    }
    return data;
  },

  async getRoomByCode(code: string): Promise<Room | null> {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('room_code', code.toUpperCase().trim())
      .single();

    if (error) {
      console.warn('Error fetching room by code:', error);
      return null;
    }
    return data;
  },

  async getRoomById(roomId: string): Promise<Room | null> {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (error) {
      console.warn('Error fetching room:', error);
      return null;
    }
    return data;
  },

  async isPlayerInRoom(roomId: string, userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error checking room membership:', error);
      return false;
    }
    return !!data;
  },

  async updateRoomStatus(roomId: string, updates: Partial<Room>): Promise<Room> {
    const { data, error } = await supabase
      .from('rooms')
      .update(updates)
      .eq('id', roomId)
      .select()
      .single();

    if (error) {
      console.error('Error updating room status:', error);
      throw error;
    }
    return data;
  },

  // Players
  async joinRoom(roomId: string, userId: string): Promise<Player> {
    const { data, error } = await supabase
      .from('players')
      .upsert(
        { room_id: roomId, user_id: userId, score: 0, ready: false },
        { onConflict: 'room_id,user_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error joining room:', error);
      throw error;
    }
    return data;
  },

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('players')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error leaving room:', error);
      throw error;
    }
  },

  async setReadyStatus(roomId: string, userId: string, ready: boolean): Promise<Player> {
    const { data, error } = await supabase
      .from('players')
      .update({ ready })
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error setting ready status:', error);
      throw error;
    }
    return data;
  },

  async getRoomPlayers(roomId: string): Promise<Player[]> {
    const { data, error } = await supabase
      .from('players')
      .select('*, profiles(*)')
      .eq('room_id', roomId);

    if (error) {
      console.error('Error fetching room players:', error);
      throw error;
    }
    return data as Player[];
  },

  // Game Logic
  async startGame(roomId: string, baseWord: string): Promise<Room> {
    const { data, error } = await supabase
      .from('rooms')
      .update({
        base_word: baseWord.toUpperCase().trim(),
        status: 'playing',
        started_at: new Date().toISOString()
      })
      .eq('id', roomId)
      .select()
      .single();

    if (error) {
      console.error('Error starting game:', error);
      throw error;
    }
    return data;
  },

  // Word submission RPC
  async submitWord(roomId: string, word: string): Promise<{ valid: boolean; word?: string; error?: string }> {
    const { data, error } = await supabase.rpc('submit_word', {
      p_room_id: roomId,
      p_word: word
    });

    if (error) {
      console.error('Error calling submit_word RPC:', error);
      return { valid: false, error: error.message };
    }

    return data as { valid: boolean; word?: string; error?: string };
  },

  // Finish room RPC
  async finishRoom(roomId: string): Promise<void> {
    const { error } = await supabase.rpc('finish_room', {
      p_room_id: roomId
    });

    if (error) {
      console.error('Error calling finish_room RPC:', error);
      throw error;
    }
  },

  // Reset room RPC
  async resetRoom(roomId: string): Promise<void> {
    const { error } = await supabase.rpc('reset_room', {
      p_room_id: roomId
    });

    if (error) {
      console.error('Error calling reset_room RPC:', error);
      throw error;
    }
  },

  // Chat Messages
  async sendChatMessage(roomId: string, userId: string, username: string, message: string): Promise<ChatMessage> {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        room_id: roomId,
        user_id: userId,
        username,
        message
      })
      .select()
      .single();

    if (error) {
      console.error('Error sending chat message:', error);
      throw error;
    }
    return data;
  },

  async getChatMessages(roomId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error getting chat messages:', error);
      throw error;
    }
    return data;
  },

  // Statistics & History
  async getRecentMatches(userId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('players')
      .select('room_id, score, joined_at, rooms(room_code, status, base_word, host_id, game_results(winner_id, is_tie, tie_score, total_players))')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching recent matches:', error);
      return [];
    }
    return data || [];
  },

  async getUserSubmissions(roomId: string, userId: string): Promise<Submission[]> {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching submissions:', error);
      return [];
    }
    return data || [];
  },

  async getRoomSubmissions(roomId: string): Promise<Submission[]> {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('room_id', roomId);

    if (error) {
      console.error('Error fetching room submissions:', error);
      return [];
    }
    return data || [];
  }
};
