import React, { useState } from 'react';
import { ArrowLeft, Key } from 'lucide-react';
import { useGame } from '../hooks/useGame';
import { useNotifications } from '../hooks/useNotifications';
import { PageWrapper } from '../components/Layout/PageWrapper';
import { toUserMessage } from '../utils/errors';

interface JoinRoomProps {
  onNavigate: (page: string) => void;
  initialCode?: string;
}

const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;

export const JoinRoom: React.FC<JoinRoomProps> = ({ onNavigate, initialCode }) => {
  const { joinRoomByCode, gameError, clearGameError } = useGame();
  const { toast } = useNotifications();
  const [code, setCode] = useState(initialCode ?? '');
  const [submitting, setSubmitting] = useState(false);

  const cleanCode = code.trim().toUpperCase();
  const isCodeReady = ROOM_CODE_PATTERN.test(cleanCode);

  const handleJoin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isCodeReady || submitting) return;

    setSubmitting(true);
    clearGameError();

    try {
      await joinRoomByCode(cleanCode);
      toast({ title: 'Joined lobby', message: 'You are in the room.', tone: 'success' });
      onNavigate('lobby');
    } catch (error) {
      toast({
        title: 'Could not join room',
        message: toUserMessage(error, 'Check the room code and try again.'),
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageWrapper>
      <div className="form-page" style={{ maxWidth: '500px', margin: '3rem auto' }}>
        <button
          onClick={() => {
            clearGameError();
            onNavigate('landing');
          }}
          className="btn btn-outline"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}
        >
          <ArrowLeft size={16} /> Back to Home
        </button>

        <div className="card card-glow-secondary">
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Join Game Room</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem' }}>
            Enter the 6-character room code shared by your friend to join the competition.
          </p>

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

          <form onSubmit={handleJoin} className="flex flex-col gap-6">
            <div className="form-group">
              <label className="label" htmlFor="room-code">
                Room Code
              </label>
              <div className="flex gap-2 items-center" style={{ position: 'relative' }}>
                <Key
                  size={18}
                  style={{ position: 'absolute', left: '12px', color: 'var(--color-text-muted)' }}
                  aria-hidden="true"
                />
                <input
                  id="room-code"
                  type="text"
                  className="input room-code-input"
                  placeholder="e.g. AB12XY"
                  style={{
                    paddingLeft: '2.5rem',
                    fontSize: '1.5rem',
                    letterSpacing: '0.3em',
                    textTransform: 'uppercase',
                    textAlign: 'center',
                  }}
                  value={code}
                  onChange={(event) =>
                    setCode(
                      event.target.value
                        .replace(/[^a-zA-Z0-9]/g, '')
                        .toUpperCase()
                        .slice(0, 6)
                    )
                  }
                  required
                  disabled={submitting}
                  maxLength={6}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  inputMode="text"
                  enterKeyHint="go"
                  aria-describedby="room-code-hint"
                />
              </div>
              <p
                id="room-code-hint"
                style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.4rem' }}
              >
                Codes use letters and numbers only.
              </p>
            </div>

            <button
              type="submit"
              className="btn btn-secondary btn-full"
              style={{ padding: '0.9rem', fontSize: '1.05rem' }}
              disabled={submitting || !isCodeReady}
            >
              {submitting ? 'Entering Lobby...' : 'Join Lobby'}
            </button>
          </form>
        </div>
      </div>
    </PageWrapper>
  );
};
