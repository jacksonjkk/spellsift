import React, { useState, useEffect } from 'react';
import { Award, RotateCcw, Home, Sparkles, CheckCircle2, XCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useGame } from '../hooks/useGame';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { api } from '../services/api';
import { PageWrapper } from '../components/Layout/PageWrapper';
import { ProfileModal } from '../components/Common/ProfileModal';
import type { Submission, Profile } from '../types';

interface ResultsProps {
  onNavigate: (page: string) => void;
}

export const Results: React.FC<ResultsProps> = ({ onNavigate }) => {
  const { activeRoom, players, hostResetGame, leaveActiveRoom } = useGame();
  const { profile, refreshProfile } = useAuth();
  const { confirm, toast } = useNotifications();
  
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [modalProfile, setModalProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  // finish_room updates career statistics; reload them for the quick stats card.
  useEffect(() => {
    void refreshProfile();
  }, [activeRoom?.id]);

  // Load all submissions for the room to show detailed breakdowns
  useEffect(() => {
    if (!activeRoom) return;

    const loadSubmissions = async () => {
      try {
        const data = await api.getRoomSubmissions(activeRoom.id);
        setAllSubmissions(data);
      } catch (err) {
        console.error('Failed to load room submissions:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSubmissions();
  }, [activeRoom]);

  // Handle activeRoom transitions back to lobby (rematch)
  useEffect(() => {
    if (activeRoom && activeRoom.status === 'lobby') {
      onNavigate('lobby');
    }
  }, [activeRoom?.status, onNavigate]);

  // Determine winners and trigger confetti
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const maxScore = sortedPlayers.length > 0 ? sortedPlayers[0].score : 0;
  const isFullTie = sortedPlayers.length > 1 && sortedPlayers.every(player => player.score === maxScore);
  
  // A complete tie includes everyone, even when every player scored zero.
  const winners = isFullTie
    ? sortedPlayers
    : maxScore > 0
    ? sortedPlayers.filter(p => p.score === maxScore) 
    : [];
  
  const isWinner = profile && winners.some(w => w.user_id === profile.id);

  useEffect(() => {
    if (isWinner && !isFullTie) {
      // Celebrate!
      const duration = 3 * 1000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 5,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#6d28d9', '#06b6d4', '#22d3ee']
        });
        confetti({
          particleCount: 5,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#6d28d9', '#06b6d4', '#22d3ee']
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };

      frame();
    }
  }, [isWinner, isFullTie]);

  if (!activeRoom || !profile) return null;

  const isHost = activeRoom.host_id === profile.id;

  const handleRematch = async () => {
    const shouldRematch = await confirm({
      title: 'Start rematch?',
      message: 'Scores and submitted words will reset for the next round. Room chat stays available.',
      cancelLabel: 'Cancel',
      confirmLabel: 'Start Rematch',
      tone: 'info'
    });

    if (!shouldRematch) return;

    setResetting(true);
    try {
      await hostResetGame();
      toast({ title: 'Rematch starting', message: 'The room is returning to the lobby.', tone: 'success' });
      // Room state sync will automatically trigger Lobby navigation
    } catch (err) {
      console.error('Failed to trigger rematch:', err);
      toast({ title: 'Could not start rematch', message: err instanceof Error ? err.message : 'Please try again.', tone: 'error' });
      setResetting(false);
    }
  };

  const handleGoHome = async () => {
    const shouldLeave = await confirm({
      title: 'Leave results room?',
      message: 'Leaving ends your access to this room and its chat. Stay if you want to chat or wait for a rematch.',
      cancelLabel: 'Stay for Rematch',
      confirmLabel: 'Leave & Go Home',
      tone: 'warning'
    });

    if (!shouldLeave) return;

    await leaveActiveRoom();
    toast({ title: 'Left room', message: 'You are back on the home screen.', tone: 'info' });
    onNavigate('landing');
  };

  // Filter submissions of selected player
  const activeSelectedPlayerId = selectedPlayerId || (sortedPlayers.length > 0 ? sortedPlayers[0].user_id : null);
  const selectedSubmissions = allSubmissions.filter(s => s.user_id === activeSelectedPlayerId);
  const selectedPlayer = players.find(p => p.user_id === activeSelectedPlayerId)?.profiles;

  return (
    <PageWrapper>
      <div className="text-center mb-8">
        <div 
          style={{ 
            display: 'inline-flex', 
            background: 'rgba(245, 158, 11, 0.15)',
            border: '2px solid var(--color-warning)',
            boxShadow: '0 0 15px rgba(245, 158, 11, 0.25)',
            borderRadius: '50%',
            padding: '1rem',
            marginBottom: '1rem'
          }}
        >
          <Award size={36} style={{ color: 'var(--color-warning)' }} />
        </div>
        <h1 className="results-title" style={{ fontSize: '2.5rem' }}>Game Results</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Base word was: <span style={{ color: 'var(--color-accent)', fontWeight: 800, letterSpacing: '0.1em' }}>{activeRoom.base_word}</span>
        </p>
      </div>

      {/* Winner Announcement */}
      {winners.length > 0 && (
        <div 
          className="card card-glow-secondary text-center mb-8 animate-pulse-glow"
          style={{ 
            background: 'linear-gradient(135deg, rgba(109, 40, 217, 0.1), rgba(6, 182, 212, 0.1))',
            padding: '2rem'
          }}
        >
          {isFullTie ? (
            <div className="animated-tie" role="status" aria-label="The game ended in a tie">
              TIE
            </div>
          ) : (
            <div className="flex justify-center gap-1 mb-2">
              <Sparkles style={{ color: 'var(--color-warning)', fill: 'var(--color-warning)' }} />
              <h2 style={{ fontSize: '1.75rem', color: 'var(--color-warning)' }}>
                {winners.length === 1 ? 'Winner!' : 'It\'s a Tie!'}
              </h2>
              <Sparkles style={{ color: 'var(--color-warning)', fill: 'var(--color-warning)' }} />
            </div>
          )}
          
          <div className="flex gap-6 justify-center flex-wrap mt-4">
            {winners.map((winner) => {
              const u = winner.profiles;
              return (
                <div key={winner.id} className="flex flex-col items-center gap-2">
                  <img 
                    src={u?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${u?.username}`} 
                    alt="Winner Avatar" 
                    className="avatar animate-float"
                    style={{ width: '64px', height: '64px', border: '3px solid var(--color-warning)', boxShadow: '0 0 15px rgba(245, 158, 11, 0.4)' }}
                  />
                  <span style={{ fontWeight: 800, fontSize: '1.2rem' }}>{u?.username}</span>
                  <span className="badge badge-warning">{winner.score} words</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Leaderboard and Words Breakdown */}
      <div className="game-layout">
        {/* Leaderboard list */}
        <div className="card flex flex-col gap-4">
          <h3 style={{ fontSize: '1.25rem', borderBottom: '1px solid var(--color-card-border)', paddingBottom: '0.5rem' }}>
            Final Rankings
          </h3>

          <div className="leaderboard-list">
            {sortedPlayers.map((player, idx) => {
              const u = player.profiles;
              const isSelected = u?.id === activeSelectedPlayerId;
              const pos = idx + 1;
              const isWinnerPos = maxScore > 0 && player.score === maxScore;

              return (
                <div
                  key={player.id}
                  onClick={() => u && setSelectedPlayerId(u.id)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && u) {
                      e.preventDefault();
                      setSelectedPlayerId(u.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={`leaderboard-item ${isSelected ? 'active' : ''} ${isWinnerPos ? 'winner' : ''}`}
                  style={{ 
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left',
                    background: isSelected ? 'rgba(109, 40, 217, 0.15)' : undefined
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div style={{ fontWeight: 800, color: 'var(--color-text-muted)', width: '20px' }}>#{pos}</div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); u && setModalProfile(u); }}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      <img 
                        src={u?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${u?.username}`} 
                        alt="Avatar" 
                        className="avatar hover:scale-110 transition-transform" 
                        style={{ width: '32px', height: '32px', objectFit: 'cover' }}
                      />
                    </button>
                    <span style={{ fontWeight: 700 }}>{u?.username}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span style={{ fontWeight: 800, color: 'var(--color-accent)' }}>{player.score} pts</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Player's Submissions Breakdown */}
        <div className="card flex flex-col gap-4">
          <div style={{ borderBottom: '1px solid var(--color-card-border)', paddingBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '1.25rem' }}>Submission Details</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              Showing words for: <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>{selectedPlayer?.username || 'Loading...'}</span>
            </p>
          </div>

          {loading ? (
            <p style={{ color: 'var(--color-text-muted)' }}>Loading words...</p>
          ) : selectedSubmissions.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No words submitted by this player.</p>
          ) : (
            <div className="flex flex-col gap-3" style={{ maxHeight: '350px', overflowY: 'auto', paddingRight: '0.25rem' }}>
              {selectedSubmissions.map((s) => (
                <div 
                  key={s.id} 
                  className="flex items-center justify-between"
                  style={{
                    background: 'rgba(15, 23, 42, 0.4)',
                    padding: '0.6rem 1rem',
                    borderRadius: 'var(--border-radius-sm)',
                    border: '1px solid var(--color-card-border)'
                  }}
                >
                  <span style={{ fontWeight: 600, letterSpacing: '0.02em' }}>{s.word}</span>
                  {s.is_valid ? (
                    <span className="flex items-center gap-1" style={{ color: 'var(--color-success)', fontSize: '0.8rem', fontWeight: 600 }}>
                      <CheckCircle2 size={14} /> Valid (+1)
                    </span>
                  ) : (
                    <span className="flex items-center gap-1" style={{ color: 'var(--color-danger)', fontSize: '0.8rem', fontWeight: 600 }}>
                      <XCircle size={14} /> Invalid
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Control Buttons */}
      <div 
        className="flex flex-col sm:flex-row gap-4 mt-8" 
        style={{ justifyContent: 'center', width: '100%', maxWidth: '500px', margin: '2rem auto 0 auto' }}
      >
        {isHost ? (
          <button 
            onClick={handleRematch} 
            className="btn btn-primary btn-full animate-pulse-glow"
            disabled={resetting}
            style={{ padding: '1rem', fontSize: '1.05rem' }}
          >
            <RotateCcw size={18} /> {resetting ? 'Resetting room...' : 'Rematch (Play Again)'}
          </button>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.9rem', width: '100%', padding: '0.5rem 0' }}>
            ⏳ Waiting for host to initiate a rematch...
          </div>
        )}
        
        <button 
          onClick={handleGoHome} 
          className="btn btn-outline btn-full"
          style={{ padding: '1rem', fontSize: '1.05rem' }}
        >
          <Home size={18} /> Leave & Go Home
        </button>
      </div>

      {modalProfile && (
        <ProfileModal 
          profile={modalProfile} 
          onClose={() => setModalProfile(null)} 
        />
      )}
    </PageWrapper>
  );
};
