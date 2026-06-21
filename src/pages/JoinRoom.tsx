import React, { useState } from 'react';
import { ArrowLeft, Key } from 'lucide-react';
import { useGame } from '../hooks/useGame';
import { PageWrapper } from '../components/Layout/PageWrapper';

interface JoinRoomProps {
  onNavigate: (page: string) => void;
}

export const JoinRoom: React.FC<JoinRoomProps> = ({ onNavigate }) => {
  const { joinRoomByCode, gameError, clearGameError } = useGame();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length !== 6) return;

    setSubmitting(true);
    clearGameError();

    try {
      await joinRoomByCode(code.trim().toUpperCase());
      onNavigate('lobby');
    } catch (err) {
      console.error('Failed to join room:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageWrapper>
      <div className="form-page" style={{ maxWidth: '500px', margin: '3rem auto' }}>
        <button
          onClick={() => { clearGameError(); onNavigate('landing'); }}
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
            <div style={{ color: 'var(--color-danger)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.75rem', borderRadius: 'var(--border-radius)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              {gameError}
            </div>
          )}

          <form onSubmit={handleJoin} className="flex flex-col gap-6">
            <div className="form-group">
              <label className="label">Room Code</label>
              <div className="flex gap-2 items-center" style={{ position: 'relative' }}>
                <Key size={18} style={{ position: 'absolute', left: '12px', color: 'var(--color-text-muted)' }} />
                <input
                  type="text"
                  className="input room-code-input"
                  placeholder="e.g. AB12XY"
                  style={{ 
                    paddingLeft: '2.5rem', 
                    fontSize: '1.5rem', 
                    letterSpacing: '0.3em', 
                    textTransform: 'uppercase', 
                    textAlign: 'center' 
                  }}
                  value={code}
                  onChange={(e) => setCode(e.target.value.substring(0, 6))}
                  required
                  disabled={submitting}
                  maxLength={6}
                  autoComplete="off"
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-secondary btn-full" 
              style={{ padding: '0.9rem', fontSize: '1.05rem' }}
              disabled={submitting || code.trim().length !== 6}
            >
              {submitting ? 'Entering Lobby...' : 'Join Lobby'}
            </button>
          </form>
        </div>
      </div>
    </PageWrapper>
  );
};
