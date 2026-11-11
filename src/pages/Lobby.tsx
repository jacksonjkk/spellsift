import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Users,
  Shield,
  Play,
  LogOut,
  CheckCircle,
  Clock,
  BookOpen,
  Share2,
} from 'lucide-react';
import { useGame } from '../hooks/useGame';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { useDialog } from '../hooks/useDialog';
import { PageWrapper } from '../components/Layout/PageWrapper';
import { toUserMessage } from '../utils/errors';

interface LobbyProps {
  onNavigate: (page: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({ onNavigate }) => {
  const {
    activeRoom,
    players,
    toggleReady,
    leaveActiveRoom,
    hostStartGame,
    gameError,
    clearGameError,
  } = useGame();

  const { profile } = useAuth();
  const { confirm, toast } = useNotifications();

  const [copied, setCopied] = useState(false);
  const [baseWordInput, setBaseWordInput] = useState('');
  const [showStartModal, setShowStartModal] = useState(false);
  const [wordError, setWordError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [togglingReady, setTogglingReady] = useState(false);

  const closeStartModal = () => {
    setShowStartModal(false);
    setWordError(null);
  };

  const startModalRef = useDialog<HTMLDivElement>(showStartModal, closeStartModal);

  // If the room is destroyed or the status changes, follow the server state.
  useEffect(() => {
    if (!activeRoom) {
      onNavigate('landing');
      return;
    }

    if (activeRoom.status === 'playing') {
      onNavigate('game');
    } else if (activeRoom.status === 'ended') {
      onNavigate('results');
    }
  }, [activeRoom, onNavigate]);

  if (!activeRoom || !profile) return null;

  const isHost = activeRoom.host_id === profile.id;
  const currentPlayer = players.find((player) => player.user_id === profile.id);
  const allPlayersReady =
    players.length > 0 &&
    players.every((player) => player.ready || player.user_id === activeRoom.host_id);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(activeRoom.room_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Could not copy code',
        message: `Share this code manually: ${activeRoom.room_code}`,
        tone: 'warning',
      });
    }
  };

  const handleShare = async () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}#/join/${activeRoom.room_code}`;
    const shareData = {
      title: 'Join my SpellSift game',
      text: `Room code: ${activeRoom.room_code}`,
      url: inviteUrl,
    };

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        // The user dismissed the native share sheet; no fallback needed.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast({
        title: 'Invite link copied',
        message: 'Send it to a friend so they can join this room.',
        tone: 'success',
      });
    } catch {
      toast({
        title: 'Could not copy invite link',
        message: `Share this code manually: ${activeRoom.room_code}`,
        tone: 'warning',
      });
    }
  };

  const handleLeave = async () => {
    const shouldLeave = await confirm({
      title: 'Leave this room?',
      message:
        'You will be removed from the room and lose access to its chat. If everyone leaves, the room chat is cleared.',
      cancelLabel: 'Stay in Room',
      confirmLabel: 'Leave Room',
      tone: 'warning',
    });

    if (!shouldLeave) return;

    await leaveActiveRoom();
    toast({ title: 'Left room', message: 'Room chat is no longer available.', tone: 'info' });
    onNavigate('landing');
  };

  const handleReady = async () => {
    setTogglingReady(true);
    clearGameError();
    try {
      await toggleReady();
    } finally {
      setTogglingReady(false);
    }
  };

  const handleStartGameSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setWordError(null);

    const cleanWord = baseWordInput.trim().toUpperCase();
    if (!cleanWord) {
      setWordError('Base word cannot be empty.');
      return;
    }

    if (!/^[A-Z]+$/.test(cleanWord)) {
      setWordError('Base word must contain only letters (A-Z).');
      return;
    }

    if (cleanWord.length < 4) {
      setWordError('Base word should be at least 4 letters long.');
      return;
    }

    if (cleanWord.length > 25) {
      setWordError('Base word must be 25 letters or fewer.');
      return;
    }

    setStarting(true);
    try {
      await hostStartGame(cleanWord);
      toast({
        title: 'Game starting',
        message: `${cleanWord} is locked in as the base word.`,
        tone: 'success',
      });
      closeStartModal();
      onNavigate('game');
    } catch (error) {
      const message = toUserMessage(error, 'Please try again.');
      setWordError(message);
      toast({ title: 'Could not start game', message, tone: 'error' });
    } finally {
      setStarting(false);
    }
  };

  return (
    <PageWrapper>
      <div className="page-action-bar flex justify-between items-center mb-6">
        <button
          onClick={handleLeave}
          className="btn btn-outline flex items-center gap-2"
          type="button"
        >
          <LogOut size={16} /> Leave Room
        </button>
        <span className="badge badge-primary" style={{ display: 'inline-flex', gap: '0.35rem' }}>
          <Users size={13} /> {players.length}/{activeRoom.max_players}
        </span>
      </div>

      {gameError && (
        <div
          role="alert"
          style={{
            color: 'var(--color-danger)',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            padding: '0.75rem',
            borderRadius: 'var(--border-radius)',
            marginBottom: '1.5rem',
            fontSize: '0.875rem',
          }}
        >
          {gameError}
        </div>
      )}

      <div className="lobby-layout lobby-layout-single">
        <div className="card flex flex-col gap-4">
          <div
            className="flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--color-card-border)', paddingBottom: '1rem' }}
          >
            <div className="flex items-center gap-2">
              <Users style={{ color: 'var(--color-accent)' }} />
              <h2 style={{ fontSize: '1.5rem' }}>Players ({players.length})</h2>
            </div>
            <span className="badge badge-primary">Lobby</span>
          </div>

          <div className="lobby-settings" aria-label="Room settings">
            <span>
              <Clock size={13} /> {activeRoom.timer_duration}s
            </span>
            <span>
              <Users size={13} /> Max {activeRoom.max_players}
            </span>
            <span>
              <BookOpen size={13} />{' '}
              {activeRoom.enforce_dictionary ? 'Dictionary on' : 'Dictionary off'}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {players.map((player) => {
              const userProfile = player.profiles;
              const isPlayerHost = player.user_id === activeRoom.host_id;
              const isMe = player.user_id === profile.id;

              return (
                <div
                  key={player.id}
                  className={`leaderboard-item ${isMe ? 'active' : ''}`}
                  style={{ padding: '1rem' }}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={
                        userProfile?.avatar_url ||
                        `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
                          userProfile?.username || player.user_id
                        )}`
                      }
                      alt={`${userProfile?.username || 'Player'} avatar`}
                      className="avatar"
                      loading="lazy"
                      style={{ width: '40px', height: '40px' }}
                    />
                    <div>
                      <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                        {userProfile?.username || 'Player'}
                        {isMe ? ' (you)' : ''}
                      </span>
                      {isPlayerHost && (
                        <span
                          className="flex items-center gap-1"
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--color-warning)',
                            marginTop: '0.1rem',
                          }}
                        >
                          <Shield size={10} /> Room Host
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    {isPlayerHost ? (
                      <span className="badge badge-primary">Host</span>
                    ) : player.ready ? (
                      <span className="badge badge-success flex items-center gap-1">
                        <CheckCircle size={12} /> Ready
                      </span>
                    ) : (
                      <span className="badge badge-danger">Not Ready</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => void handleCopyCode()}
            className="btn btn-secondary btn-full flex items-center gap-2"
            style={{ marginTop: '0.5rem', padding: '0.9rem 1rem' }}
            type="button"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied Room Code:' : 'Room Code:'}
            <span style={{ fontWeight: 900, letterSpacing: '0.12em' }}>
              {activeRoom.room_code}
            </span>
          </button>

          <button
            onClick={() => void handleShare()}
            className="btn btn-outline btn-full flex items-center gap-2"
            style={{ marginTop: '0.5rem', padding: '0.9rem 1rem' }}
            type="button"
          >
            <Share2 size={16} /> Share Invite Link
          </button>

          <div
            style={{
              marginTop: '2rem',
              borderTop: '1px solid var(--color-card-border)',
              paddingTop: '1.5rem',
            }}
          >
            {isHost ? (
              <div className="flex flex-col gap-3">
                {!allPlayersReady && (
                  <p
                    style={{
                      color: 'var(--color-warning)',
                      fontSize: '0.85rem',
                      textAlign: 'center',
                    }}
                  >
                    Waiting for every other player to click &ldquo;Ready&rdquo; before you can
                    start.
                  </p>
                )}
                <button
                  onClick={() => {
                    clearGameError();
                    setShowStartModal(true);
                  }}
                  className="btn btn-primary btn-full animate-pulse-glow"
                  style={{ padding: '1rem', fontSize: '1.1rem' }}
                  type="button"
                  disabled={!allPlayersReady}
                >
                  <Play size={20} /> Setup Base Word &amp; Start
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => void handleReady()}
                  className={`btn btn-full ${currentPlayer?.ready ? 'btn-outline' : 'btn-secondary'}`}
                  style={{ padding: '1rem', fontSize: '1.1rem' }}
                  type="button"
                  disabled={togglingReady}
                  aria-pressed={Boolean(currentPlayer?.ready)}
                >
                  {togglingReady
                    ? 'Updating...'
                    : currentPlayer?.ready
                      ? 'Unready'
                      : 'Ready to Sift'}
                </button>
                <p
                  style={{
                    color: 'var(--color-text-muted)',
                    fontSize: '0.8rem',
                    textAlign: 'center',
                  }}
                >
                  {allPlayersReady
                    ? 'Everyone is ready. Waiting for the host to start.'
                    : 'The host can start once everyone is ready.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showStartModal && (
        <div
          className="game-modal"
          role="presentation"
          onClick={closeStartModal}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(11, 15, 25, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
          }}
        >
          <div
            ref={startModalRef}
            className="card card-glow-primary animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-game-title"
            onClick={(event) => event.stopPropagation()}
            style={{ width: '100%', maxWidth: '450px', margin: '0 1rem' }}
          >
            <h3 id="start-game-title" style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
              Enter Base Word
            </h3>
            <p
              style={{
                color: 'var(--color-text-secondary)',
                fontSize: '0.9rem',
                marginBottom: '1.5rem',
              }}
            >
              Choose a long word to give players plenty of letters to sift from (for example,
              NEIGHBORHOOD, INDEPENDENCE, or SUPERHERO).
            </p>

            {wordError && (
              <div
                id="base-word-error"
                role="alert"
                style={{
                  color: 'var(--color-danger)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  padding: '0.75rem',
                  borderRadius: 'var(--border-radius)',
                  marginBottom: '1rem',
                  fontSize: '0.875rem',
                }}
              >
                {wordError}
              </div>
            )}

            <form onSubmit={handleStartGameSubmit} className="flex flex-col gap-4">
              <div className="form-group">
                <label className="label" htmlFor="base-word">
                  Base Word
                </label>
                <input
                  id="base-word"
                  type="text"
                  className="input"
                  placeholder="e.g. EXTRAVAGANZA"
                  value={baseWordInput}
                  onChange={(event) =>
                    setBaseWordInput(
                      event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 25)
                    )
                  }
                  style={{
                    textTransform: 'uppercase',
                    letterSpacing: '0.15em',
                    fontSize: '1.25rem',
                    textAlign: 'center',
                  }}
                  required
                  minLength={4}
                  maxLength={25}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-invalid={Boolean(wordError)}
                  aria-describedby={wordError ? 'base-word-error' : 'base-word-hint'}
                />
                <p
                  id="base-word-hint"
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-text-muted)',
                    marginTop: '0.4rem',
                  }}
                >
                  4&ndash;25 letters. Longer words give players more options.
                </p>
              </div>

              <div className="flex gap-2 justify-between" style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={closeStartModal}
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                  disabled={starting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                  disabled={starting}
                >
                  <Play size={16} /> {starting ? 'Starting...' : 'Start Game'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageWrapper>
  );
};
