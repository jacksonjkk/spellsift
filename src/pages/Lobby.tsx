import React, { useState, useEffect } from 'react';
import { Copy, Check, Users, Shield, Play, LogOut, CheckCircle } from 'lucide-react';
import { useGame } from '../hooks/useGame';
import { useAuth } from '../hooks/useAuth';
import { PageWrapper } from '../components/Layout/PageWrapper';

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
    clearGameError 
  } = useGame();
  
  const { profile } = useAuth();
  
  const [copied, setCopied] = useState(false);
  const [baseWordInput, setBaseWordInput] = useState('');
  const [showStartModal, setShowStartModal] = useState(false);
  const [wordError, setWordError] = useState<string | null>(null);

  // If room is destroyed or status changes
  useEffect(() => {
    if (!activeRoom) {
      onNavigate('landing');
      return;
    }
    
    // Auto-transition when game starts
    if (activeRoom.status === 'playing') {
      onNavigate('game');
    }
  }, [activeRoom, onNavigate]);

  if (!activeRoom || !profile) return null;

  const isHost = activeRoom.host_id === profile.id;
  const currentPlayer = players.find(p => p.user_id === profile.id);
  const allPlayersReady = players.length > 0 && players.every(p => p.ready || p.user_id === activeRoom.host_id);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(activeRoom.room_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = async () => {
    if (window.confirm('Are you sure you want to leave this game room?')) {
      await leaveActiveRoom();
      onNavigate('landing');
    }
  };

  const handleStartGameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWordError(null);

    const cleanWord = baseWordInput.trim().toUpperCase();
    if (!cleanWord) {
      setWordError('Base word cannot be empty');
      return;
    }

    if (!/^[A-Z]+$/.test(cleanWord)) {
      setWordError('Base word must contain only letters (A-Z)');
      return;
    }

    if (cleanWord.length < 4) {
      setWordError('Base word should be at least 4 letters long');
      return;
    }

    try {
      await hostStartGame(cleanWord);
      setShowStartModal(false);
      onNavigate('game');
    } catch (err: any) {
      setWordError(err.message || 'Failed to start game');
    }
  };

  return (
    <PageWrapper>
      <div className="page-action-bar flex justify-between items-center mb-6">
        <button onClick={handleLeave} className="btn btn-outline flex items-center gap-2">
          <LogOut size={16} /> Leave Room
        </button>
      </div>

      {gameError && (
        <div style={{ color: 'var(--color-danger)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.75rem', borderRadius: 'var(--border-radius)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
          {gameError}
        </div>
      )}

      <div className="lobby-layout lobby-layout-single">
        {/* Players List Card */}
        <div className="card flex flex-col gap-4">
          <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-card-border)', paddingBottom: '1rem' }}>
            <div className="flex items-center gap-2">
              <Users style={{ color: 'var(--color-accent)' }} />
              <h2 style={{ fontSize: '1.5rem' }}>Players ({players.length})</h2>
            </div>
            <span className="badge badge-primary">Lobby</span>
          </div>

          <div className="flex flex-col gap-3">
            {players.map((player) => {
              const userProfile = player.profiles;
              const isPlayerHost = userProfile?.id === activeRoom.host_id;
              const isMe = userProfile?.id === profile.id;

              return (
                <div 
                  key={player.id} 
                  className={`leaderboard-item ${isMe ? 'active' : ''}`}
                  style={{ padding: '1rem' }}
                >
                  <div className="flex items-center gap-3">
                    <img 
                      src={userProfile?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${userProfile?.username}`} 
                      alt="Avatar" 
                      className="avatar"
                      style={{ width: '40px', height: '40px' }}
                    />
                    <div>
                      <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                        {userProfile?.username || 'Player'}
                      </span>
                      {isPlayerHost && (
                        <span className="flex items-center gap-1" style={{ fontSize: '0.75rem', color: 'var(--color-warning)', marginTop: '0.1rem' }}>
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
            onClick={handleCopyCode}
            className="btn btn-secondary btn-full flex items-center gap-2"
            style={{ marginTop: '0.5rem', padding: '0.9rem 1rem' }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied Room Code:' : 'Room Code:'}
            <span style={{ fontWeight: 900, letterSpacing: '0.12em' }}>{activeRoom.room_code}</span>
          </button>

          {/* Action Buttons */}
          <div style={{ marginTop: '2rem', borderTop: '1px solid var(--color-card-border)', paddingTop: '1.5rem' }}>
            {isHost ? (
              <div className="flex flex-col gap-3">
                {!allPlayersReady && (
                  <p style={{ color: 'var(--color-warning)', fontSize: '0.85rem', textAlign: 'center' }}>
                    ⚠️ Waiting for all players to click "Ready"
                  </p>
                )}
                <button
                  onClick={() => { clearGameError(); setShowStartModal(true); }}
                  className="btn btn-primary btn-full animate-pulse-glow"
                  style={{ padding: '1rem', fontSize: '1.1rem' }}
                >
                  <Play size={20} /> Setup Base Word & Start
                </button>
              </div>
            ) : (
              <button
                onClick={toggleReady}
                className={`btn btn-full ${currentPlayer?.ready ? 'btn-outline' : 'btn-secondary'}`}
                style={{ padding: '1rem', fontSize: '1.1rem' }}
              >
                {currentPlayer?.ready ? 'Unready' : 'Ready to Sift'}
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Start Game Modal (Host Only) */}
      {showStartModal && (
        <div className="game-modal"
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
            zIndex: 999
          }}
        >
          <div className="card card-glow-primary animate-fade-in" style={{ width: '100%', maxWidth: '450px', margin: '0 1rem' }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Enter Base Word</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Select a long, compound word to give players plenty of letters to sift from. 
              (e.g., NEIGHBORHOOD, INDEPENDENCE, SUPERHERO).
            </p>

            {wordError && (
              <div style={{ color: 'var(--color-danger)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.75rem', borderRadius: 'var(--border-radius)', marginBottom: '1rem', fontSize: '0.875rem' }}>
                {wordError}
              </div>
            )}

            <form onSubmit={handleStartGameSubmit} className="flex flex-col gap-4">
              <div className="form-group">
                <label className="label">Base Word</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. EXTRAVAGANZA"
                  value={baseWordInput}
                  onChange={(e) => setBaseWordInput(e.target.value)}
                  style={{ textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '1.25rem', textAlign: 'center' }}
                  required
                  autoFocus
                  maxLength={25}
                />
              </div>

              <div className="flex gap-2 justify-between" style={{ marginTop: '1rem' }}>
                <button 
                  type="button" 
                  onClick={() => { setShowStartModal(false); setWordError(null); }} 
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                >
                  <Play size={16} /> Start Game
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageWrapper>
  );
};
