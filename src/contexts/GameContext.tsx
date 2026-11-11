/* eslint-disable react-refresh/only-export-components -- The context object intentionally shares a module with its provider. */
import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import supabase from '../services/supabase';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type {
  BlockedPlayer,
  ChatMessage,
  ChatMessageReceipt,
  Player,
  Room,
  RoomSettings,
  Submission,
  SubmitWordResult,
} from '../types';
import { soundManager } from '../utils/sound';
import { toUserMessage } from '../utils/errors';

const ACTIVE_ROOM_STORAGE_KEY = 'spellsift.activeRoomId';
const ROOM_RESTORE_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_INTERVAL_MS = 30000;

const timeoutAfter = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((resolve) => {
      window.setTimeout(() => resolve(fallback), ms);
    }),
  ]);

const mergeChats = (existing: ChatMessage[], incoming: ChatMessage[]) => {
  const byId = new Map(existing.map((chat) => [chat.id, chat]));
  incoming.forEach((chat) => byId.set(chat.id, chat));
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
};

const mergeChatReceipts = (
  existing: ChatMessageReceipt[],
  incoming: ChatMessageReceipt[]
) => {
  const byMessageAndUser = new Map(
    existing.map((receipt) => [`${receipt.message_id}:${receipt.user_id}`, receipt])
  );
  incoming.forEach((receipt) =>
    byMessageAndUser.set(`${receipt.message_id}:${receipt.user_id}`, receipt)
  );
  return Array.from(byMessageAndUser.values());
};

interface GameContextType {
  activeRoom: Room | null;
  players: Player[];
  submissions: Submission[];
  chats: ChatMessage[];
  chatReceipts: ChatMessageReceipt[];
  blockedPlayers: BlockedPlayer[];
  loadingRoom: boolean;
  gameError: string | null;
  restoreError: string | null;
  realtimeConnected: boolean;
  serverTimeOffsetMs: number;
  createRoom: (settings: RoomSettings) => Promise<Room>;
  joinRoomByCode: (roomCode: string) => Promise<Room>;
  leaveActiveRoom: () => Promise<void>;
  toggleReady: () => Promise<void>;
  hostStartGame: (baseWord: string) => Promise<void>;
  submitPlayerWord: (
    word: string,
    options?: { skipFetch?: boolean }
  ) => Promise<SubmitWordResult>;
  sendRoomChat: (message: string) => Promise<void>;
  markRoomChatsSeen: () => Promise<void>;
  refreshRoomData: () => Promise<void>;
  finishGame: () => Promise<void>;
  hostFinishGame: () => Promise<void>;
  hostResetGame: () => Promise<void>;
  reportChatMessage: (messageId: string, reason?: string) => Promise<void>;
  blockPlayer: (userId: string) => Promise<void>;
  unblockPlayer: (userId: string) => Promise<void>;
  clearGameError: () => void;
  retryRoomRestore: () => void;
  abandonRoomRestore: () => void;
}

export const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, profile, loading: authLoading } = useAuth();
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [chats, setChats] = useState<ChatMessage[]>([]);
  const [chatReceipts, setChatReceipts] = useState<ChatMessageReceipt[]>([]);
  const [blockedPlayers, setBlockedPlayers] = useState<BlockedPlayer[]>([]);
  const [loadingRoom, setLoadingRoom] = useState(() =>
    Boolean(window.localStorage.getItem(ACTIVE_ROOM_STORAGE_KEY))
  );
  const [gameError, setGameError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const [restoreNonce, setRestoreNonce] = useState(0);

  const activeRoomId = activeRoom?.id ?? null;
  const profileId = profile?.id ?? null;
  const victoryKeyRef = useRef<string | null>(null);
  const blockedIdsRef = useRef<Set<string>>(new Set());
  const playersRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    blockedIdsRef.current = new Set(blockedPlayers.map((item) => item.blocked_id));
  }, [blockedPlayers]);

  const clearGameError = useCallback(() => setGameError(null), []);

  const rememberActiveRoom = useCallback((roomId: string) => {
    window.localStorage.setItem(ACTIVE_ROOM_STORAGE_KEY, roomId);
  }, []);

  const forgetActiveRoom = useCallback(() => {
    window.localStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
  }, []);

  const clearRoomState = useCallback(() => {
    setPlayers([]);
    setSubmissions([]);
    setChats([]);
    setChatReceipts([]);
  }, []);

  const playVictoryOnce = useCallback((room: Room) => {
    const key = `${room.id}:${room.round_number}`;
    if (room.status === 'ended' && victoryKeyRef.current !== key) {
      victoryKeyRef.current = key;
      soundManager.playVictory();
    }
  }, []);

  const syncServerTime = useCallback(async () => {
    try {
      const serverTime = await api.getServerTime();
      setServerTimeOffsetMs(new Date(serverTime).getTime() - Date.now());
    } catch (error) {
      console.warn('Could not read the server clock:', error);
    }
  }, []);

  useEffect(() => {
    if (!activeRoom?.started_at) return;
    const timeoutId = window.setTimeout(() => {
      void syncServerTime();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeRoom?.started_at, syncServerTime]);

  const refreshRoomData = useCallback(
    async (roomId: string) => {
      const [playersResult, chatsResult, receiptsResult, submissionsResult] =
        await Promise.allSettled([
          api.getRoomPlayers(roomId),
          api.getChatMessages(roomId),
          api.getChatMessageReceipts(roomId),
          profileId ? api.getUserSubmissions(roomId, profileId) : Promise.resolve([]),
        ]);

      if (playersResult.status === 'fulfilled') setPlayers(playersResult.value);
      if (chatsResult.status === 'fulfilled') {
        setChats((previous) => mergeChats(previous, chatsResult.value));
      }
      if (receiptsResult.status === 'fulfilled') {
        setChatReceipts((previous) =>
          mergeChatReceipts(previous, receiptsResult.value)
        );
      }
      if (submissionsResult.status === 'fulfilled') {
        setSubmissions(submissionsResult.value);
      }
    },
    [profileId]
  );

  const refreshLiveState = useCallback(
    async (roomId: string) => {
      const [roomResult, playersResult, chatsResult, receiptsResult] =
        await Promise.allSettled([
          api.getRoomById(roomId),
          api.getRoomPlayers(roomId),
          api.getChatMessages(roomId),
          api.getChatMessageReceipts(roomId),
        ]);

      if (roomResult.status === 'fulfilled') {
        if (roomResult.value) {
          setActiveRoom(roomResult.value);
          playVictoryOnce(roomResult.value);
        } else {
          setActiveRoom(null);
          forgetActiveRoom();
          clearRoomState();
          setGameError('This room is no longer available.');
        }
      }

      if (playersResult.status === 'fulfilled') setPlayers(playersResult.value);
      if (chatsResult.status === 'fulfilled') {
        setChats((previous) => mergeChats(previous, chatsResult.value));
      }
      if (receiptsResult.status === 'fulfilled') {
        setChatReceipts((previous) =>
          mergeChatReceipts(previous, receiptsResult.value)
        );
      }

      return [roomResult, playersResult, chatsResult, receiptsResult].every(
        (result) => result.status === 'fulfilled'
      );
    },
    [clearRoomState, forgetActiveRoom, playVictoryOnce]
  );

  const loadBlockedPlayers = useCallback(async () => {
    if (!profileId) {
      setBlockedPlayers([]);
      return;
    }
    try {
      setBlockedPlayers(await api.getBlockedPlayers());
    } catch (error) {
      console.warn('Could not load blocked players:', error);
    }
  }, [profileId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadBlockedPlayers();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadBlockedPlayers]);

  // Restore a saved room, but keep the saved id if the network is unavailable so
  // the player can retry instead of silently losing their match.
  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      if (authLoading) return;

      if (!user) {
        forgetActiveRoom();
        setLoadingRoom(false);
        setRestoreError(null);
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

      setLoadingRoom(true);
      setRestoreError(null);

      try {
        const restored = await timeoutAfter(
          Promise.all([
            api.getRoomById(savedRoomId),
            api.isPlayerInRoom(savedRoomId, user.id),
          ]),
          ROOM_RESTORE_TIMEOUT_MS,
          null as [Room | null, boolean] | null
        );

        if (cancelled) return;

        if (!restored) {
          setRestoreError(
            'Could not reconnect to your room. Check your connection and try again.'
          );
          setLoadingRoom(false);
          return;
        }

        const [room, isMember] = restored;
        if (!room || !isMember) {
          forgetActiveRoom();
          clearRoomState();
          setLoadingRoom(false);
          return;
        }

        setActiveRoom(room);
        setLoadingRoom(false);
        await refreshRoomData(room.id);
      } catch (error) {
        if (cancelled) return;
        setRestoreError(toUserMessage(error, 'Could not restore your room.'));
        setLoadingRoom(false);
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
  }, [
    activeRoom,
    authLoading,
    clearRoomState,
    forgetActiveRoom,
    refreshRoomData,
    restoreNonce,
    user,
  ]);

  const retryRoomRestore = useCallback(() => {
    setRestoreError(null);
    setLoadingRoom(true);
    setRestoreNonce((value) => value + 1);
  }, []);

  const abandonRoomRestore = useCallback(() => {
    forgetActiveRoom();
    clearRoomState();
    setRestoreError(null);
    setLoadingRoom(false);
    setActiveRoom(null);
  }, [clearRoomState, forgetActiveRoom]);

  // Realtime is the primary transport. Polling is only a fallback.
  useEffect(() => {
    if (!activeRoomId || !profileId) return;

    const roomId = activeRoomId;
    const resetConnectionTimeout = window.setTimeout(() => {
      setRealtimeConnected(false);
      void refreshRoomData(roomId);
    }, 0);

    const schedulePlayersRefresh = () => {
      if (playersRefreshRef.current) clearTimeout(playersRefreshRef.current);
      playersRefreshRef.current = setTimeout(() => {
        void api
          .getRoomPlayers(roomId)
          .then(setPlayers)
          .catch((error) => console.warn('Could not refresh players:', error));
      }, 250);
    };

    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          const updatedRoom = payload.new as Room;
          setActiveRoom(updatedRoom);
          playVictoryOnce(updatedRoom);
          if (updatedRoom.status === 'playing') void syncServerTime();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        schedulePlayersRefresh
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'submissions',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newSubmission = payload.new as Submission;
          if (newSubmission.user_id !== profileId) return;
          setSubmissions((previous) => {
            if (previous.some((item) => item.id === newSubmission.id)) return previous;
            return [...previous, newSubmission];
          });
          if (newSubmission.is_valid) soundManager.playSuccess();
          else soundManager.playError();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newChat = payload.new as ChatMessage;
          if (blockedIdsRef.current.has(newChat.user_id)) return;
          setChats((previous) => {
            if (previous.some((chat) => chat.id === newChat.id)) return previous;
            return [...previous, newChat];
          });
          if (newChat.user_id !== profileId) soundManager.playJoin();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_message_receipts',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldReceipt = payload.old as { id?: string };
            if (!oldReceipt.id) return;
            setChatReceipts((previous) =>
              previous.filter((receipt) => receipt.id !== oldReceipt.id)
            );
            return;
          }
          const receipt = payload.new as ChatMessageReceipt;
          setChatReceipts((previous) => mergeChatReceipts(previous, [receipt]));
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`Realtime channel is ${status}; polling fallback enabled.`);
        }
      });

    return () => {
      window.clearTimeout(resetConnectionTimeout);
      if (playersRefreshRef.current) clearTimeout(playersRefreshRef.current);
      void supabase.removeChannel(channel);
      setRealtimeConnected(false);
    };
  }, [activeRoomId, playVictoryOnce, profileId, refreshRoomData, syncServerTime]);

  // Poll only while realtime is unhealthy, and never while the tab is hidden.
  // The delay backs off when polling fails and resets after a successful poll.
  useEffect(() => {
    if (!activeRoomId || realtimeConnected) return;

    let timeoutId: number | undefined;
    let delay = POLL_INTERVAL_MS;
    let inFlight = false;
    let cancelled = false;

    const schedule = (nextDelay: number) => {
      if (cancelled) return;
      timeoutId = window.setTimeout(() => {
        void run();
      }, nextDelay);
    };

    const run = async () => {
      if (cancelled || inFlight) return;
      window.clearTimeout(timeoutId);

      if (document.hidden) {
        schedule(POLL_INTERVAL_MS);
        return;
      }

      inFlight = true;
      const succeeded = await refreshLiveState(activeRoomId);
      inFlight = false;
      delay = succeeded ? POLL_INTERVAL_MS : Math.min(delay * 2, POLL_MAX_INTERVAL_MS);
      schedule(delay);
    };

    const resetAndRun = () => {
      delay = POLL_INTERVAL_MS;
      void run();
    };
    const handleVisibility = () => {
      if (!document.hidden) resetAndRun();
    };

    void run();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', resetAndRun);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', resetAndRun);
    };
  }, [activeRoomId, realtimeConnected, refreshLiveState]);

  // Refresh immediately when the app returns to the foreground or reconnects.
  useEffect(() => {
    if (!activeRoomId) return;

    const handleVisibility = () => {
      if (!document.hidden) void refreshLiveState(activeRoomId);
    };
    const handleOnline = () => void refreshLiveState(activeRoomId);

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
    };
  }, [activeRoomId, refreshLiveState]);

  useEffect(() => {
    if (!activeRoomId || !profileId) return;

    const delivered = new Set(
      chatReceipts
        .filter((receipt) => receipt.user_id === profileId)
        .map((receipt) => receipt.message_id)
    );
    const undelivered = chats
      .filter((chat) => chat.user_id !== profileId && !delivered.has(chat.id))
      .map((chat) => chat.id);

    if (undelivered.length === 0) return;

    void api
      .markChatMessagesDelivered(activeRoomId, profileId, undelivered)
      .then((receipts) =>
        setChatReceipts((previous) => mergeChatReceipts(previous, receipts))
      )
      .catch((error) => console.warn('Could not mark chat delivered:', error));
  }, [activeRoomId, chatReceipts, chats, profileId]);

  const createRoom = async (settings: RoomSettings): Promise<Room> => {
    if (!user || !profile || user.id !== profile.id) {
      throw new Error('Your session is not active. Please sign in again.');
    }

    setLoadingRoom(true);
    setGameError(null);
    try {
      const room = await api.createRoom(settings);
      clearRoomState();
      const roomPlayers = await api.getRoomPlayers(room.id);
      setPlayers(roomPlayers);
      setActiveRoom(room);
      rememberActiveRoom(room.id);
      await syncServerTime();
      return room;
    } catch (error) {
      const message = toUserMessage(error, 'Failed to create room.');
      setGameError(message);
      throw new Error(message, { cause: error });
    } finally {
      setLoadingRoom(false);
    }
  };

  const joinRoomByCode = async (roomCode: string): Promise<Room> => {
    if (!user || !profile || user.id !== profile.id) {
      throw new Error('Your session is not active. Please sign in again.');
    }

    setLoadingRoom(true);
    setGameError(null);
    try {
      const room = await api.joinRoomByCode(roomCode);
      clearRoomState();
      const roomPlayers = await api.getRoomPlayers(room.id);
      setPlayers(roomPlayers);
      setActiveRoom(room);
      rememberActiveRoom(room.id);
      await syncServerTime();
      return room;
    } catch (error) {
      const message = toUserMessage(error, 'Failed to join room.');
      setGameError(message);
      throw new Error(message, { cause: error });
    } finally {
      setLoadingRoom(false);
    }
  };

  const leaveActiveRoom = async () => {
    if (!activeRoom) return;
    const roomId = activeRoom.id;
    setActiveRoom(null);
    clearRoomState();
    forgetActiveRoom();
    try {
      await api.leaveRoom(roomId);
    } catch (error) {
      console.error('Error leaving room:', error);
    }
  };

  const toggleReady = async () => {
    if (!activeRoom || !profile) return;
    const currentPlayer = players.find((player) => player.user_id === profile.id);
    if (!currentPlayer) return;

    try {
      await api.setReadyStatus(activeRoom.id, !currentPlayer.ready);
      await refreshLiveState(activeRoom.id);
    } catch (error) {
      setGameError(toUserMessage(error, 'Could not update ready status.'));
    }
  };

  const hostStartGame = async (baseWord: string) => {
    if (!activeRoom || !profile || activeRoom.host_id !== profile.id) return;
    setGameError(null);
    try {
      const updatedRoom = await api.startGame(activeRoom.id, baseWord);
      setSubmissions([]);
      setActiveRoom(updatedRoom);
      await syncServerTime();
      await refreshLiveState(updatedRoom.id);
    } catch (error) {
      const message = toUserMessage(error, 'Failed to start the game.');
      setGameError(message);
      throw new Error(message, { cause: error });
    }
  };

  const submitPlayerWord = async (
    word: string,
    { skipFetch = false } = {}
  ): Promise<SubmitWordResult> => {
    if (!activeRoom || !profile) {
      return { valid: false, error: 'No active room.' };
    }

    try {
      const result = await api.submitWord(activeRoom.id, word);
      if (result.valid && !skipFetch) {
        const latest = await api.getUserSubmissions(activeRoom.id, profile.id);
        setSubmissions(latest);
      }
      return result;
    } catch (error) {
      return { valid: false, error: toUserMessage(error, 'Submission failed.') };
    }
  };

  const sendRoomChat = async (message: string) => {
    if (!activeRoom) throw new Error('You are not in an active room.');
    const newMessage = await api.sendChatMessage(activeRoom.id, message);
    setChats((previous) =>
      previous.some((chat) => chat.id === newMessage.id)
        ? previous
        : [...previous, newMessage]
    );
  };

  const markRoomChatsSeen = useCallback(async () => {
    if (!activeRoomId || !profileId) return;

    const seen = new Set(
      chatReceipts
        .filter((receipt) => receipt.user_id === profileId && receipt.seen_at)
        .map((receipt) => receipt.message_id)
    );
    const unseen = chats
      .filter((chat) => chat.user_id !== profileId && !seen.has(chat.id))
      .map((chat) => chat.id);

    if (unseen.length === 0) return;

    const receipts = await api.markChatMessagesSeen(activeRoomId, profileId, unseen);
    setChatReceipts((previous) => mergeChatReceipts(previous, receipts));
  }, [activeRoomId, chatReceipts, chats, profileId]);

  const finishGame = useCallback(async () => {
    if (!activeRoom) return;
    try {
      await api.finishRoom(activeRoom.id);
      await refreshLiveState(activeRoom.id);
    } catch (error) {
      const message = toUserMessage(error, 'Could not finalize the game.');
      const lower = message.toLowerCase();
      // Another client may have finalized it first, or this player left.
      if (
        lower.includes('not active') ||
        lower.includes('already ended') ||
        lower.includes('only active room members')
      ) {
        await refreshLiveState(activeRoom.id);
        return;
      }
      throw new Error(message, { cause: error });
    }
  }, [activeRoom, refreshLiveState]);

  const hostResetGame = async () => {
    if (!activeRoom || !profile || activeRoom.host_id !== profile.id) return;
    setGameError(null);
    try {
      await api.resetRoom(activeRoom.id);
      setSubmissions([]);
      await refreshLiveState(activeRoom.id);
    } catch (error) {
      const message = toUserMessage(error, 'Could not start a rematch.');
      setGameError(message);
      throw new Error(message, { cause: error });
    }
  };

  const reportChatMessage = async (
    messageId: string,
    reason = 'Reported from chat'
  ) => {
    await api.reportChatMessage(messageId, reason);
    if (activeRoomId) await refreshRoomData(activeRoomId);
  };

  const blockPlayer = async (userId: string) => {
    await api.blockPlayer(userId);
    await loadBlockedPlayers();
    setChats((previous) => previous.filter((chat) => chat.user_id !== userId));
  };

  const unblockPlayer = async (userId: string) => {
    await api.unblockPlayer(userId);
    await loadBlockedPlayers();
    if (activeRoomId) await refreshRoomData(activeRoomId);
  };

  return (
    <GameContext.Provider
      value={{
        activeRoom,
        players,
        submissions,
        chats,
        chatReceipts,
        blockedPlayers,
        loadingRoom,
        gameError,
        restoreError,
        realtimeConnected,
        serverTimeOffsetMs,
        createRoom,
        joinRoomByCode,
        leaveActiveRoom,
        toggleReady,
        hostStartGame,
        submitPlayerWord,
        sendRoomChat,
        markRoomChatsSeen,
        refreshRoomData: async () => {
          if (activeRoom) await refreshRoomData(activeRoom.id);
        },
        finishGame,
        hostFinishGame: finishGame,
        hostResetGame,
        reportChatMessage,
        blockPlayer,
        unblockPlayer,
        clearGameError,
        retryRoomRestore,
        abandonRoomRestore,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};
