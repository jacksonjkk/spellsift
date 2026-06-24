import React, { createContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import supabase from '../services/supabase';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { Room, Player, Submission, ChatMessage, ChatMessageReceipt } from '../types';
import { soundManager } from '../utils/sound';

const ACTIVE_ROOM_STORAGE_KEY = 'spellsift.activeRoomId';
const ROOM_RESTORE_TIMEOUT_MS = 12000;

const timeoutAfter = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      window.setTimeout(() => resolve(fallback), ms);
    })
  ]);
};

const mergeChats = (existing: ChatMessage[], incoming: ChatMessage[]) => {
  const byId = new Map(existing.map(chat => [chat.id, chat]));
  incoming.forEach(chat => byId.set(chat.id, chat));
  return Array.from(byId.values()).sort((a, b) => (
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  ));
};

const mergeChatReceipts = (existing: ChatMessageReceipt[], incoming: ChatMessageReceipt[]) => {
  const byMessageAndUser = new Map(existing.map(receipt => [`${receipt.message_id}:${receipt.user_id}`, receipt]));
  incoming.forEach(receipt => byMessageAndUser.set(`${receipt.message_id}:${receipt.user_id}`, receipt));
  return Array.from(byMessageAndUser.values());
};

interface GameContextType {
  activeRoom: Room | null;
  players: Player[];
  submissions: Submission[];
  chats: ChatMessage[];
  chatReceipts: ChatMessageReceipt[];
  loadingRoom: boolean;
  gameError: string | null;
  createRoom: (timerDuration: number, enforceDictionary: boolean) => Promise<Room>;
  joinRoomByCode: (roomCode: string) => Promise<Room>;
  leaveActiveRoom: () => Promise<void>;
  toggleReady: () => Promise<void>;
  hostStartGame: (baseWord: string) => Promise<void>;
  submitPlayerWord: (word: string) => Promise<{ valid: boolean; word?: string; error?: string }>;
  sendRoomChat: (message: string) => Promise<void>;
  markRoomChatsSeen: () => Promise<void>;
  refreshRoomData: () => Promise<void>;
  hostFinishGame: () => Promise<void>;
  hostResetGame: () => Promise<void>;
  clearGameError: () => void;
}

export const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, profile, loading: authLoading } = useAuth();
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [chats, setChats] = useState<ChatMessage[]>([]);
  const [chatReceipts, setChatReceipts] = useState<ChatMessageReceipt[]>([]);
  const [loadingRoom, setLoadingRoom] = useState(() => !!window.localStorage.getItem(ACTIVE_ROOM_STORAGE_KEY));
  const [gameError, setGameError] = useState<string | null>(null);
  const activeRoomId = activeRoom?.id ?? null;
  const profileId = profile?.id ?? null;

  const clearGameError = () => setGameError(null);

  const rememberActiveRoom = (roomId: string) => {
    window.localStorage.setItem(ACTIVE_ROOM_STORAGE_KEY, roomId);
  };

  const forgetActiveRoom = () => {
    window.localStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
  };

  // Load all data for the active room (players, chat, and user submissions)
  const refreshRoomData = useCallback(async (roomId: string) => {
    try {
      const fetchedPlayers = await api.getRoomPlayers(roomId);
      setPlayers(fetchedPlayers);

      const fetchedChats = await api.getChatMessages(roomId);
      setChats(previous => mergeChats(previous, fetchedChats));

      const fetchedChatReceipts = await api.getChatMessageReceipts(roomId);
      setChatReceipts(previous => mergeChatReceipts(previous, fetchedChatReceipts));

      if (profile) {
        const fetchedSubmissions = await api.getUserSubmissions(roomId, profile.id);
        setSubmissions(fetchedSubmissions);
      }
    } catch (err) {
      console.error('Error refreshing room data:', err);
    }
  }, [profile]);

  const refreshLiveState = useCallback(async (roomId: string) => {
    const [roomResult, playersResult, chatsResult, chatReceiptsResult] = await Promise.allSettled([
      api.getRoomById(roomId),
      api.getRoomPlayers(roomId),
      api.getChatMessages(roomId),
      api.getChatMessageReceipts(roomId)
    ]);

    if (roomResult.status === 'fulfilled' && roomResult.value) setActiveRoom(roomResult.value);
    if (playersResult.status === 'fulfilled') setPlayers(playersResult.value);
    if (chatsResult.status === 'fulfilled') {
      setChats(previous => mergeChats(previous, chatsResult.value));
    }
    if (chatReceiptsResult.status === 'fulfilled') {
      setChatReceipts(previous => mergeChatReceipts(previous, chatReceiptsResult.value));
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      forgetActiveRoom();
      setLoadingRoom(false);
      return;
    }

    if (activeRoom) {
      setLoadingRoom(false);
      return;
    }

    const savedRoomId = window.localStorage.getItem(ACTIVE_ROOM_STORAGE_KEY);
    if (!savedRoomId) {
      setLoadingRoom(false);
      return;
    }

    let cancelled = false;
    setLoadingRoom(true);

    const restoreActiveRoom = async () => {
      try {
        const restoredRoomState = await timeoutAfter(
          Promise.all([
            api.getRoomById(savedRoomId),
            api.isPlayerInRoom(savedRoomId, user.id)
          ]),
          ROOM_RESTORE_TIMEOUT_MS,
          null
        );

        if (cancelled) return;

        if (!restoredRoomState) {
          console.warn('Timed out restoring active room. Clearing saved room.');
          forgetActiveRoom();
          setPlayers([]);
          setSubmissions([]);
          setChats([]);
          setChatReceipts([]);
          return;
        }

        const [room, isMember] = restoredRoomState;

        if (!room || !isMember) {
          forgetActiveRoom();
          setPlayers([]);
          setSubmissions([]);
          setChats([]);
          setChatReceipts([]);
          return;
        }

        setActiveRoom(room);
        setLoadingRoom(false);
        await timeoutAfter(refreshRoomData(room.id), ROOM_RESTORE_TIMEOUT_MS, undefined);
      } catch (err) {
        console.error('Error restoring active room:', err);
        if (!cancelled) {
          forgetActiveRoom();
        }
      } finally {
        if (!cancelled) {
          setLoadingRoom(false);
        }
      }
    };

    void restoreActiveRoom();

    return () => {
      cancelled = true;
    };
  }, [activeRoom, authLoading, profile, refreshRoomData, user]);

  // Handle cleanup of subscriptions
  useEffect(() => {
    if (!activeRoomId || !profileId) return;

    const roomId = activeRoomId;
    refreshRoomData(roomId);

    // Subscribe to Room updates
    const roomChannel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          const updatedRoom = payload.new as Room;
          setActiveRoom(updatedRoom);
          
          if (updatedRoom.status === 'ended') {
            soundManager.playVictory();
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`Room realtime channel is ${status}; polling will keep the lobby synchronized.`);
        }
      });

    // Subscribe to Players list changes
    const playersChannel = supabase
      .channel(`players:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        async () => {
          // Re-fetch players with profile details on any change
          const updatedPlayers = await api.getRoomPlayers(roomId);
          setPlayers(updatedPlayers);
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`Players realtime channel is ${status}; polling will keep the player list synchronized.`);
        }
      });

    // Subscribe to Submissions (to sync active player list scores and live scoreboard)
    const submissionsChannel = supabase
      .channel(`submissions:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'submissions', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const newSubmission = payload.new as Submission;
          
          // If this submission belongs to the current user, add to local submissions
          if (newSubmission.user_id === profileId) {
            setSubmissions(prev => {
              if (prev.some(s => s.id === newSubmission.id)) return prev;
              return [...prev, newSubmission];
            });
            
            if (newSubmission.is_valid) {
              soundManager.playSuccess();
            } else {
              soundManager.playError();
            }
          }
        }
      )
      .subscribe();

    // Subscribe to Chat Messages
    const chatChannel = supabase
      .channel(`chat:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const newChat = payload.new as ChatMessage;
          setChats(prev => {
            if (prev.some(c => c.id === newChat.id)) return prev;
            return [...prev, newChat];
          });
          
          // Sound effect if chat was from another user
          if (newChat.user_id !== profileId) {
            soundManager.playJoin();
          }
        }
      )
      .subscribe();

    const chatReceiptsChannel = supabase
      .channel(`chat-receipts:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_message_receipts', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const receipt = payload.new as ChatMessageReceipt;
          setChatReceipts(previous => mergeChatReceipts(previous, [receipt]));
        }
      )
      .subscribe();

    // Realtime can be disabled or briefly disconnected. Polling is a deliberate
    // fallback so joined players, ready states, scores, and room transitions are
    // still visible to every client.
    const liveStatePoll = window.setInterval(() => {
      void refreshLiveState(roomId);
    }, 3000);

    // Clean up connections on leave/unload
    return () => {
      supabase.removeChannel(roomChannel);
      supabase.removeChannel(playersChannel);
      supabase.removeChannel(submissionsChannel);
      supabase.removeChannel(chatChannel);
      supabase.removeChannel(chatReceiptsChannel);
      window.clearInterval(liveStatePoll);
    };
  }, [activeRoomId, profileId, refreshLiveState, refreshRoomData]);

  useEffect(() => {
    if (!activeRoomId || !profileId) return;

    const deliveredMessageIds = new Set(
      chatReceipts
        .filter(receipt => receipt.user_id === profileId)
        .map(receipt => receipt.message_id)
    );
    const incomingUndeliveredIds = chats
      .filter(chat => chat.user_id !== profileId && !deliveredMessageIds.has(chat.id))
      .map(chat => chat.id);

    if (incomingUndeliveredIds.length === 0) return;

    void api.markChatMessagesDelivered(activeRoomId, profileId, incomingUndeliveredIds)
      .then(receipts => {
        setChatReceipts(previous => mergeChatReceipts(previous, receipts));
      })
      .catch(err => {
        console.error('Error marking chat delivered:', err);
      });
  }, [activeRoomId, chats, chatReceipts, profileId]);

  const createRoom = async (timerDuration: number, enforceDictionary: boolean): Promise<Room> => {
    if (!user || !profile || user.id !== profile.id) {
      throw new Error('Your session is not active. Please confirm your email or sign in again.');
    }
    setLoadingRoom(true);
    setGameError(null);
    try {
      // Ensure profile exists before creating room (retry for async trigger)
      let attempts = 0;
      const maxAttempts = 5;
      let profileExists = false;
      
      while (!profileExists && attempts < maxAttempts) {
        const existingProfile = await api.getProfile(profile.id);
        if (existingProfile) {
          profileExists = true;
        } else {
          attempts++;
          if (attempts < maxAttempts) {
            // Wait 200ms before retrying
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }
      
      if (!profileExists) {
        throw new Error('Profile could not be created. Please try signing in again.');
      }
      
      const room = await api.createRoom(user.id, timerDuration, enforceDictionary);
      await api.joinRoom(room.id, user.id);
      const roomPlayers = await api.getRoomPlayers(room.id);
      setPlayers(roomPlayers);
      setActiveRoom(room);
      rememberActiveRoom(room.id);
      setLoadingRoom(false);
      return room;
    } catch (err: any) {
      setLoadingRoom(false);
      setGameError(err.message || 'Failed to create room');
      throw err;
    }
  };

  const joinRoomByCode = async (roomCode: string): Promise<Room> => {
    if (!user || !profile || user.id !== profile.id) {
      throw new Error('Your session is not active. Please confirm your email or sign in again.');
    }
    setLoadingRoom(true);
    setGameError(null);
    try {
      // Ensure profile exists before joining room (retry for async trigger)
      let attempts = 0;
      const maxAttempts = 5;
      let profileExists = false;
      
      while (!profileExists && attempts < maxAttempts) {
        const existingProfile = await api.getProfile(profile.id);
        if (existingProfile) {
          profileExists = true;
        } else {
          attempts++;
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }
      
      if (!profileExists) {
        throw new Error('Profile could not be created. Please try signing in again.');
      }
      
      const room = await api.getRoomByCode(roomCode);
      if (!room) {
        throw new Error('Room not found');
      }
      if (room.status !== 'lobby') {
        throw new Error('Game has already started in this room');
      }
      
      await api.joinRoom(room.id, user.id);
      const roomPlayers = await api.getRoomPlayers(room.id);
      setPlayers(roomPlayers);
      setActiveRoom(room);
      rememberActiveRoom(room.id);
      setLoadingRoom(false);
      return room;
    } catch (err: any) {
      setLoadingRoom(false);
      setGameError(err.message || 'Failed to join room');
      throw err;
    }
  };

  const leaveActiveRoom = async () => {
    if (activeRoom && profile) {
      const roomId = activeRoom.id;
      const userId = profile.id;
      setActiveRoom(null);
      setPlayers([]);
      setSubmissions([]);
      setChats([]);
      setChatReceipts([]);
      forgetActiveRoom();
      try {
        await api.leaveRoom(roomId, userId);
      } catch (err) {
        console.error('Error leaving room:', err);
      }
    }
  };

  const toggleReady = async () => {
    if (!activeRoom || !profile) return;
    const currentPlayer = players.find(p => p.user_id === profile.id);
    if (!currentPlayer) return;
    
    try {
      await api.setReadyStatus(activeRoom.id, profile.id, !currentPlayer.ready);
      await refreshLiveState(activeRoom.id);
    } catch (err: any) {
      console.error('Error toggling ready status:', err);
    }
  };

  const hostStartGame = async (baseWord: string) => {
    if (!activeRoom || !profile || activeRoom.host_id !== profile.id) return;
    try {
      const updatedRoom = await api.startGame(activeRoom.id, baseWord);
      setActiveRoom(updatedRoom);
    } catch (err: any) {
      setGameError(err.message || 'Failed to start game');
      throw err;
    }
  };

  const submitPlayerWord = async (word: string) => {
    if (!activeRoom || !profile) throw new Error('No active room');
    try {
      const res = await api.submitWord(activeRoom.id, word);
      if (res.valid) {
        // Do not depend solely on Realtime to show the player's accepted word.
        // Fetch the authoritative list immediately after the RPC succeeds.
        const latestSubmissions = await api.getUserSubmissions(activeRoom.id, profile.id);
        setSubmissions(latestSubmissions);
      }
      return res;
    } catch (err: any) {
      console.error('Error submitting word:', err);
      return { valid: false, error: err.message || 'Submission failed' };
    }
  };

  const sendRoomChat = async (message: string) => {
    if (!activeRoom || !profile) throw new Error('You are not in an active room.');
    const newMessage = await api.sendChatMessage(activeRoom.id, profile.id, profile.username, message);
    setChats(previous => previous.some(chat => chat.id === newMessage.id)
      ? previous
      : [...previous, newMessage]);
  };

  const markRoomChatsSeen = useCallback(async () => {
    if (!activeRoomId || !profileId) return;

    const seenMessageIds = new Set(
      chatReceipts
        .filter(receipt => receipt.user_id === profileId && receipt.seen_at)
        .map(receipt => receipt.message_id)
    );
    const incomingUnseenIds = chats
      .filter(chat => chat.user_id !== profileId && !seenMessageIds.has(chat.id))
      .map(chat => chat.id);

    if (incomingUnseenIds.length === 0) return;

    const receipts = await api.markChatMessagesSeen(activeRoomId, profileId, incomingUnseenIds);
    setChatReceipts(previous => mergeChatReceipts(previous, receipts));
  }, [activeRoomId, chatReceipts, chats, profileId]);

  const hostFinishGame = async () => {
    if (!activeRoom || !profile || activeRoom.host_id !== profile.id) return;
    try {
      await api.finishRoom(activeRoom.id);
      await refreshLiveState(activeRoom.id);
    } catch (err: any) {
      console.error('Error finalizing game:', err);
      throw err;
    }
  };

  const hostResetGame = async () => {
    if (!activeRoom || !profile || activeRoom.host_id !== profile.id) return;
    try {
      await api.resetRoom(activeRoom.id);
      setSubmissions([]);
      await refreshLiveState(activeRoom.id);
    } catch (err: any) {
      console.error('Error resetting game:', err);
    }
  };

  return (
    <GameContext.Provider
      value={{
        activeRoom,
        players,
        submissions,
        chats,
        chatReceipts,
        loadingRoom,
        gameError,
        createRoom,
        joinRoomByCode,
        leaveActiveRoom,
        toggleReady,
        hostStartGame,
        submitPlayerWord,
        sendRoomChat,
        markRoomChatsSeen,
        refreshRoomData: async () => {
          if (activeRoom) {
            await refreshRoomData(activeRoom.id);
          }
        },
        hostFinishGame,
        hostResetGame,
        clearGameError
      }}
    >
      {children}
    </GameContext.Provider>
  );
};
