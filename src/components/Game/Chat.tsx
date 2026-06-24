import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, CheckCheck, MessageCircle, Send, X } from 'lucide-react';
import { useGame } from '../../hooks/useGame';
import { useAuth } from '../../hooks/useAuth';

export const Chat: React.FC = () => {
  const { chats, players, chatReceipts, sendRoomChat, markRoomChatsSeen } = useGame();
  const { profile } = useAuth();
  const [messageText, setMessageText] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const knownMessageIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const incomingMessages = chats.filter(chat => (
      !knownMessageIds.current.has(chat.id) && chat.user_id !== profile?.id
    ));

    chats.forEach(chat => knownMessageIds.current.add(chat.id));
    if (isOpen) {
      setUnreadCount(0);
    } else if (incomingMessages.length > 0) {
      setUnreadCount(previous => previous + incomingMessages.length);
    }
  }, [chats, isOpen, profile?.id]);

  useEffect(() => {
    const messageBox = messagesRef.current;
    if (messageBox) {
      // Scroll only the chat panel. scrollIntoView() here used to drag the
      // entire lobby page down whenever it mounted.
      messageBox.scrollTo({ top: messageBox.scrollHeight, behavior: chats.length > 0 ? 'smooth' : 'auto' });
    }
  }, [chats, isOpen]);

  useEffect(() => {
    if (isOpen) {
      void markRoomChatsSeen();
    }
  }, [chats, isOpen, markRoomChatsSeen]);

  const getOwnMessageStatus = (messageId: string) => {
    const recipientIds = players
      .map(player => player.user_id)
      .filter(userId => userId !== profile?.id);
    const recipientReceipts = chatReceipts.filter(receipt => (
      receipt.message_id === messageId && recipientIds.includes(receipt.user_id)
    ));

    if (
      recipientIds.length > 0
      && recipientIds.every(userId => recipientReceipts.some(receipt => (
        receipt.user_id === userId && receipt.seen_at
      )))
    ) {
      return 'Seen';
    }

    if (recipientReceipts.length > 0) {
      return 'Received';
    }

    return 'Sent';
  };

  const toggleChat = () => {
    setIsOpen(open => {
      const nextOpen = !open;
      if (nextOpen) setUnreadCount(0);
      return nextOpen;
    });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || sending) return;

    setSending(true);
    setSendError(null);
    try {
      await sendRoomChat(messageText.trim());
      setMessageText('');
    } catch (err: unknown) {
      console.error('Failed to send message:', err);
      setSendError(err instanceof Error ? err.message : 'Could not send the message.');
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <>
      <button
        type="button"
        onClick={toggleChat}
        className={`chat-launcher ${unreadCount > 0 ? 'has-unread' : ''}`}
        aria-label={isOpen ? 'Close room chat' : `Open room chat${unreadCount > 0 ? `, ${unreadCount} unread messages` : ''}`}
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
        <section className="card chat-container chat-drawer flex flex-col gap-3" role="dialog" aria-label="Room chat">
          <div className="chat-drawer-header">
            <div>
              <h3>Room Chat</h3>
              <p>{chats.length} {chats.length === 1 ? 'message' : 'messages'}</p>
            </div>
            <button type="button" onClick={toggleChat} className="chat-close-button" aria-label="Close chat">
              <X size={19} />
            </button>
          </div>
      
          <div ref={messagesRef} className="chat-messages flex flex-col gap-2">
            {chats.length === 0 ? (
              <div className="chat-empty-state">
                <MessageCircle size={30} />
                <span>Start the room conversation</span>
              </div>
            ) : (
              chats.map((c) => {
                const isMe = c.user_id === profile?.id;
                const status = isMe ? getOwnMessageStatus(c.id) : null;
                return (
                  <div key={c.id} className={`chat-msg ${isMe ? 'chat-msg-own' : 'chat-msg-received'}`}>
                    <span className="chat-author">{isMe ? 'You' : c.username}</span>
                    <span className="chat-text">{c.message}</span>
                    {status && (
                      <span className={`chat-receipt chat-receipt-${status.toLowerCase()}`}>
                        {status === 'Sent' ? <Check size={12} /> : <CheckCheck size={12} />}
                        {status}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {sendError && (
            <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{sendError}</p>
          )}

          <form onSubmit={handleSend} className="chat-compose flex gap-2">
            <input
              type="text"
              className="input"
              placeholder="Type a message..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              maxLength={150}
              aria-label="Chat message"
              disabled={sending}
            />
            <button type="submit" className="btn btn-primary chat-send-button" aria-label="Send" disabled={sending || !messageText.trim()}>
              <Send size={18} />
            </button>
          </form>
        </section>
      )}
    </>,
    document.body
  );
};
