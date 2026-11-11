import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, CheckCheck, Flag, MessageCircle, Send, ShieldOff, X } from 'lucide-react';
import { useGame } from '../../hooks/useGame';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { toUserMessage } from '../../utils/errors';

const MAX_CHAT_LENGTH = 200;

export const Chat: React.FC = () => {
  const {
    chats,
    players,
    chatReceipts,
    blockedPlayers,
    sendRoomChat,
    markRoomChatsSeen,
    reportChatMessage,
    blockPlayer,
  } = useGame();
  const { profile } = useAuth();
  const { confirm, toast } = useNotifications();

  const [messageText, setMessageText] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [seenMessageIds, setSeenMessageIds] = useState<Set<string>>(new Set());
  const [busyMessageId, setBusyMessageId] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = isOpen
    ? 0
    : chats.filter(
        (chat) => chat.user_id !== profile?.id && !seenMessageIds.has(chat.id)
      ).length;

  useEffect(() => {
    const messageBox = messagesRef.current;
    if (messageBox) {
      // Scroll only the chat panel. scrollIntoView() here used to drag the
      // entire lobby page down whenever it mounted.
      messageBox.scrollTo({
        top: messageBox.scrollHeight,
        behavior: chats.length > 0 ? 'smooth' : 'auto',
      });
    }
  }, [chats, isOpen]);

  useEffect(() => {
    if (isOpen) {
      void markRoomChatsSeen().catch((error) => {
        console.warn('Could not mark chat messages as seen:', error);
      });
    }
  }, [chats, isOpen, markRoomChatsSeen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const blockedIds = new Set(blockedPlayers.map((entry) => entry.blocked_id));

  const getOwnMessageStatus = (messageId: string) => {
    const recipientIds = players
      .map((player) => player.user_id)
      .filter((userId) => userId !== profile?.id && !blockedIds.has(userId));
    const recipientReceipts = chatReceipts.filter(
      (receipt) => receipt.message_id === messageId && recipientIds.includes(receipt.user_id)
    );

    if (
      recipientIds.length > 0 &&
      recipientIds.every((userId) =>
        recipientReceipts.some((receipt) => receipt.user_id === userId && receipt.seen_at)
      )
    ) {
      return 'Seen';
    }

    if (recipientReceipts.length > 0) {
      return 'Received';
    }

    return 'Sent';
  };

  const toggleChat = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    setSeenMessageIds(new Set(chats.map((chat) => chat.id)));
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!messageText.trim() || sending) return;

    setSending(true);
    setSendError(null);
    try {
      await sendRoomChat(messageText.trim());
      setMessageText('');
    } catch (error) {
      setSendError(toUserMessage(error, 'Could not send the message.'));
    } finally {
      setSending(false);
    }
  };

  const handleReport = async (messageId: string) => {
    setBusyMessageId(messageId);
    try {
      await reportChatMessage(messageId, 'Reported from chat');
      toast({
        title: 'Report submitted',
        message: 'Thanks. Moderators will review the message.',
        tone: 'info',
      });
    } catch (error) {
      toast({
        title: 'Could not report message',
        message: toUserMessage(error, 'Please try again.'),
        tone: 'error',
      });
    } finally {
      setBusyMessageId(null);
    }
  };

  const handleBlock = async (userId: string, username: string) => {
    const shouldBlock = await confirm({
      title: `Block ${username}?`,
      message:
        'You will no longer see their chat messages. They can still play in the same room. You can unblock them from your profile.',
      cancelLabel: 'Cancel',
      confirmLabel: 'Block Player',
      tone: 'danger',
    });

    if (!shouldBlock) return;

    setBusyMessageId(userId);
    try {
      await blockPlayer(userId);
      toast({
        title: 'Player blocked',
        message: `${username}'s messages are hidden.`,
        tone: 'info',
      });
    } catch (error) {
      toast({
        title: 'Could not block player',
        message: toUserMessage(error, 'Please try again.'),
        tone: 'error',
      });
    } finally {
      setBusyMessageId(null);
    }
  };

  return createPortal(
    <>
      <button
        type="button"
        onClick={toggleChat}
        className={`chat-launcher ${unreadCount > 0 ? 'has-unread' : ''}`}
        aria-label={
          isOpen
            ? 'Close room chat'
            : `Open room chat${unreadCount > 0 ? `, ${unreadCount} unread messages` : ''}`
        }
        aria-expanded={isOpen}
      >
        {isOpen ? <X size={25} /> : <MessageCircle size={25} />}
        {unreadCount > 0 && !isOpen && (
          <span className="chat-unread-badge" aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <section
          className="card chat-container chat-drawer flex flex-col gap-3"
          role="dialog"
          aria-label="Room chat"
        >
          <div className="chat-drawer-header">
            <div>
              <h3>Room Chat</h3>
              <p>
                {chats.length} {chats.length === 1 ? 'message' : 'messages'} &middot; visible to
                everyone in this room
              </p>
            </div>
            <button
              type="button"
              onClick={toggleChat}
              className="chat-close-button"
              aria-label="Close chat"
            >
              <X size={19} />
            </button>
          </div>

          <div
            ref={messagesRef}
            className="chat-messages flex flex-col gap-2"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {chats.length === 0 ? (
              <div className="chat-empty-state">
                <MessageCircle size={30} aria-hidden="true" />
                <span>Start the room conversation</span>
              </div>
            ) : (
              chats.map((chat) => {
                const isMe = chat.user_id === profile?.id;
                const status = isMe ? getOwnMessageStatus(chat.id) : null;
                const isBusy = busyMessageId === chat.id || busyMessageId === chat.user_id;

                return (
                  <div
                    key={chat.id}
                    className={`chat-msg ${isMe ? 'chat-msg-own' : 'chat-msg-received'}`}
                  >
                    <span className="chat-author">{isMe ? 'You' : chat.username}</span>
                    <span className="chat-text">{chat.message}</span>
                    {status && (
                      <span className={`chat-receipt chat-receipt-${status.toLowerCase()}`}>
                        {status === 'Sent' ? <Check size={12} /> : <CheckCheck size={12} />}
                        {status}
                      </span>
                    )}
                    {!isMe && (
                      <div className="chat-msg-actions">
                        <button
                          type="button"
                          onClick={() => void handleReport(chat.id)}
                          disabled={isBusy}
                          aria-label={`Report message from ${chat.username}`}
                          title="Report message"
                        >
                          <Flag size={12} /> Report
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleBlock(chat.user_id, chat.username)}
                          disabled={isBusy}
                          aria-label={`Block ${chat.username}`}
                          title={`Block ${chat.username}`}
                        >
                          <ShieldOff size={12} /> Block
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {sendError && (
            <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>
              {sendError}
            </p>
          )}

          <form onSubmit={handleSend} className="chat-compose flex gap-2">
            <input
              type="text"
              className="input"
              placeholder="Type a message..."
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              maxLength={MAX_CHAT_LENGTH}
              aria-label="Chat message"
              disabled={sending}
              autoComplete="off"
              autoCorrect="off"
              enterKeyHint="send"
            />
            <button
              type="submit"
              className="btn btn-primary chat-send-button"
              aria-label="Send message"
              disabled={sending || !messageText.trim()}
            >
              <Send size={18} />
            </button>
          </form>
        </section>
      )}
    </>,
    document.body
  );
};
