import React, { useState } from 'react';
import { ArrowLeft, Clock, ShieldCheck, Check, Users } from 'lucide-react';
import { useGame } from '../hooks/useGame';
import { useNotifications } from '../hooks/useNotifications';
import { PageWrapper } from '../components/Layout/PageWrapper';
import { toUserMessage } from '../utils/errors';

interface CreateRoomProps {
  onNavigate: (page: string) => void;
}

const DURATIONS = [30, 60, 90, 120];
const PLAYER_LIMITS = [4, 8, 12];

export const CreateRoom: React.FC<CreateRoomProps> = ({ onNavigate }) => {
  const { createRoom, gameError, clearGameError } = useGame();
  const { toast } = useNotifications();
  const [duration, setDuration] = useState(60);
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [enforceDictionary, setEnforceDictionary] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    clearGameError();

    try {
      await createRoom({
        timerDuration: duration,
        enforceDictionary,
        maxPlayers,
      });
      toast({ title: 'Room created', message: 'You are now in the lobby.', tone: 'success' });
      onNavigate('lobby');
    } catch (error) {
      toast({
        title: 'Could not create room',
        message: toUserMessage(error, 'Please try again.'),
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageWrapper>
      <div className="form-page" style={{ maxWidth: '600px', margin: '2rem auto' }}>
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

        <div className="card card-glow-primary">
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Create Game Room</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem' }}>
            Set up your room options. As the host, you will control when the round starts.
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

          <form onSubmit={handleCreate} className="flex flex-col gap-6">
            <fieldset className="form-group" style={{ border: 0, padding: 0 }}>
              <legend className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Clock size={16} style={{ color: 'var(--color-accent)' }} /> Round Duration (seconds)
              </legend>
              <div
                className="timer-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '0.5rem',
                  marginTop: '0.5rem',
                }}
              >
                {DURATIONS.map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    onClick={() => setDuration(seconds)}
                    className={`btn ${duration === seconds ? 'btn-primary' : 'btn-outline'}`}
                    style={{ padding: '0.75rem 0', width: '100%' }}
                    aria-pressed={duration === seconds}
                  >
                    {seconds}s
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="form-group" style={{ border: 0, padding: 0 }}>
              <legend className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Users size={16} style={{ color: 'var(--color-accent)' }} /> Player Limit
              </legend>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '0.5rem',
                  marginTop: '0.5rem',
                }}
              >
                {PLAYER_LIMITS.map((limit) => (
                  <button
                    key={limit}
                    type="button"
                    onClick={() => setMaxPlayers(limit)}
                    className={`btn ${maxPlayers === limit ? 'btn-primary' : 'btn-outline'}`}
                    style={{ padding: '0.75rem 0', width: '100%' }}
                    aria-pressed={maxPlayers === limit}
                  >
                    {limit} players
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="form-group">
              <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <ShieldCheck size={16} style={{ color: 'var(--color-secondary)' }} /> Word Rules
              </span>

              <button
                type="button"
                role="switch"
                aria-checked={enforceDictionary}
                onClick={() => setEnforceDictionary((previous) => !previous)}
                className="card text-left flex items-center justify-between"
                style={{
                  marginTop: '0.5rem',
                  padding: '1rem',
                  width: '100%',
                  cursor: 'pointer',
                  background: 'rgba(15, 23, 42, 0.4)',
                  borderColor: enforceDictionary
                    ? 'var(--color-secondary)'
                    : 'var(--color-card-border)',
                }}
              >
                <div style={{ paddingRight: '1rem' }}>
                  <p style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Enforce Dictionary Verification
                  </p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                    Only real English words will be accepted. Turn off to allow slang, acronyms, or
                    custom spelling matches.
                  </p>
                </div>
                <div
                  aria-hidden="true"
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '4px',
                    border: '2px solid var(--color-text-muted)',
                    borderColor: enforceDictionary
                      ? 'var(--color-secondary)'
                      : 'var(--color-text-muted)',
                    background: enforceDictionary ? 'var(--color-secondary)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {enforceDictionary && <Check size={16} style={{ color: 'var(--color-bg)' }} />}
                </div>
              </button>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              style={{ padding: '0.9rem', fontSize: '1.05rem', marginTop: '1rem' }}
              disabled={submitting}
            >
              {submitting ? 'Creating Room...' : 'Create Room & Enter Lobby'}
            </button>
          </form>
        </div>
      </div>
    </PageWrapper>
  );
};
