import React, { useState, useEffect } from 'react';
import { Award, RotateCcw, Home, Sparkles, CheckCircle2, XCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useGame } from '../hooks/useGame';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { api } from '../services/api';
import { PageWrapper } from '../components/Layout/PageWrapper';
import { ProfileModal } from '../components/Common/ProfileModal';
import { toUserMessage } from '../utils/errors';
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  // finish_room updates career statistics; reload them for the quick stats card.
  useEffect(() => {
    void refreshProfile();
  }, [activeRoom?.id, refreshProfile]);

  // Load all submissions for the room to show detailed breakdowns.
  const roomId = activeRoom?.id;
  const roundNumber = activeRoom?.round_number;

  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;

    void api
      .getRoomSubmissions(roomId)
      .then((data) => {
        if (!cancelled) setAllSubmissions(data);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(toUserMessage(error, 'Could not load submitted words.'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [roomId, roundNumber]);

  // Follow room transitions back to the lobby or into a new round.
  useEffect(() => {
    if (!activeRoom) {
      onNavigate('landing');
      return;
    }

    if (activeRoom.status === 'lobby') {
      onNavigate('lobby');
    } else if (activeRoom.status === 'playing') {
      onNavigate('game');
    }
  }, [activeRoom, activeRoom?.status, onNavigate]);

  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const maxScore = sortedPlayers.length > 0 ? sortedPlayers[0].score : 0;
  const isFullTie =
    sortedPlayers.length > 1 && sortedPlayers.every((player) => player.score === maxScore);

  // A complete tie includes everyone, even when every player scored zero.
  const winners = isFullTie
    ? sortedPlayers
    : maxScore > 0
      ? sortedPlayers.filter((player) => player.score === maxScore)
      : [];

  const isWinner = Boolean(profile && winners.some((winner) => winner.user_id === profile.id));

  useEffect(() => {
    if (isWinner && !isFullTie) {
      const duration = 3000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 5,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#6d28d9', '#06b6d4', '#22d3ee'],
        });
        confetti({
          particleCount: 5,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#6d28d9', '#06b6d4', '#22d3ee'],
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
      tone: 'info',
    });

    if (!shouldRematch) return;

    setResetting(true);
    try {
      await hostResetGame();
      toast({
        title: 'Rematch starting',
        message: 'The room is returning to the lobby.',
        tone: 'success',
      });
      // Room state sync automatically triggers Lobby navigation.
    } catch (error) {
      toast({
        title: 'Could not start rematch',
        message: toUserMessage(error, 'Please try again.'),
        tone: 'error',
      });
      setResetting(false);
    }
  };

  const handleGoHome = async () => {
    const shouldLeave = await confirm({
      title: 'Leave results room?',
      message:
        'Leaving ends your access to this room and its chat. Stay if you want to chat or wait for a rematch.',
      cancelLabel: 'Stay for Rematch',
      confirmLabel: 'Leave & Go Home',
      tone: 'warning',
    });

    if (!shouldLeave) return;

    await leaveActiveRoom();
    toast({ title: 'Left room', message: 'You are back on the home screen.', tone: 'info' });
    onNavigate('landing');
  };

  const activeSelectedPlayerId =
    selectedPlayerId || (sortedPlayers.length > 0 ? sortedPlayers[0].user_id : null);
  const selectedSubmissions = allSubmissions.filter(
    (submission) => submission.user_id === activeSelectedPlayerId
  );
  const selectedPlayer = players.find(
    (player) => player.user_id === activeSelectedPlayerId
  )?.profiles;

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
            marginBottom: '1rem',
          }}
        >
          <Award size={36} style={{ color: 'var(--color-warning)' }} aria-hidden="true" />
        </div>
        <h1 className="results-title" style={{ fontSize: '2.5rem' }}>
          Game Results
        </h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Round {activeRoom.round_number} &middot; Base word was:{' '}
          <span
            style={{
              color: 'var(--color-accent)',
              fontWeight: 800,
              letterSpacing: '0.1em',
            }}
          >
            {activeRoom.base_word}
          </span>
        </p>
      </div>

      {winners.length > 0 && (
        <div
          className="card card-glow-secondary text-center mb-8 animate-pulse-glow"
          style={{
            background:
              'linear-gradient(135deg, rgba(109, 40, 217, 0.1), rgba(6, 182, 212, 0.1))',
            padding: '2rem',
          }}
          aria-live="polite"
        >
          {isFullTie ? (
            <div className="animated-tie" role="status" aria-label="The game ended in a tie">
              TIE
            </div>
          ) : (
            <div className="flex justify-center gap-1 mb-2">
              <Sparkles
                style={{ color: 'var(--color-warning)', fill: 'var(--color-warning)' }}
                aria-hidden="true"
              />
              <h2 style={{ fontSize: '1.75rem', color: 'var(--color-warning)' }}>
                {winners.length === 1 ? 'Winner!' : "It's a Tie!"}
              </h2>
              <Sparkles
                style={{ color: 'var(--color-warning)', fill: 'var(--color-warning)' }}
                aria-hidden="true"
              />
            </div>
          )}

          <div className="flex gap-6 justify-center flex-wrap mt-4">
            {winners.map((winner) => {
              const userProfile = winner.profiles;
              return (
                <div key={winner.id} className="flex flex-col items-center gap-2">
                  <img
                    src={
                      userProfile?.avatar_url ||
                      `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
                        userProfile?.username || winner.user_id
                      )}`
                    }
                    alt={`${userProfile?.username || 'Winner'} avatar`}
                    className="avatar animate-float"
                    loading="lazy"
                    style={{
                      width: '64px',
                      height: '64px',
                      border: '3px solid var(--color-warning)',
                      boxShadow: '0 0 15px rgba(245, 158, 11, 0.4)',
                    }}
                  />
                  <span style={{ fontWeight: 800, fontSize: '1.2rem' }}>
                    {userProfile?.username}
                  </span>
                  <span className="badge badge-warning">{winner.score} words</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="game-layout">
        <div className="card flex flex-col gap-4">
          <h3
            style={{
              fontSize: '1.25rem',
              borderBottom: '1px solid var(--color-card-border)',
              paddingBottom: '0.5rem',
            }}
          >
            Final Rankings
          </h3>

          <div className="leaderboard-list">
            {sortedPlayers.map((player, index) => {
              const userProfile = player.profiles;
              const isSelected = userProfile?.id === activeSelectedPlayerId;
              const position = index + 1;
              const isWinnerPosition = maxScore > 0 && player.score === maxScore;

              return (
                <div
                  key={player.id}
                  className={`leaderboard-item ${isSelected ? 'active' : ''} ${
                    isWinnerPosition ? 'winner' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="leaderboard-avatar"
                    onClick={() => {
                      if (userProfile) setModalProfile(userProfile);
                    }}
                    aria-label={`View ${userProfile?.username || 'player'} profile`}
                    disabled={!userProfile}
                  >
                    <img
                      src={
                        userProfile?.avatar_url ||
                        `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
                          userProfile?.username || player.user_id
                        )}`
                      }
                      alt=""
                      className="avatar hover:scale-110 transition-transform"
                      loading="lazy"
                      style={{ width: '32px', height: '32px', objectFit: 'cover' }}
                    />
                  </button>

                  <button
                    type="button"
                    className="leaderboard-select"
                    onClick={() => {
                      if (userProfile) setSelectedPlayerId(userProfile.id);
                    }}
                    aria-pressed={isSelected}
                  >
                    <span className="leaderboard-position">#{position}</span>
                    <span className="leaderboard-name">
                      {userProfile?.username}
                      {userProfile?.id === profile.id ? ' (you)' : ''}
                    </span>
                    <span className="leaderboard-score">{player.score} pts</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card flex flex-col gap-4">
          <div
            style={{ borderBottom: '1px solid var(--color-card-border)', paddingBottom: '0.5rem' }}
          >
            <h3 style={{ fontSize: '1.25rem' }}>Submission Details</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              Showing words for:{' '}
              <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>
                {selectedPlayer?.username || 'Unknown player'}
              </span>
            </p>
          </div>

          {loading ? (
            <p style={{ color: 'var(--color-text-muted)' }}>Loading words...</p>
          ) : loadError ? (
            <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.9rem' }}>
              {loadError}
            </p>
          ) : selectedSubmissions.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
              No words submitted by this player.
            </p>
          ) : (
            <div
              className="flex flex-col gap-3"
              style={{ maxHeight: '350px', overflowY: 'auto', paddingRight: '0.25rem' }}
            >
              {selectedSubmissions.map((submission) => (
                <div
                  key={submission.id}
                  className="flex items-center justify-between"
                  style={{
                    background: 'rgba(15, 23, 42, 0.4)',
                    padding: '0.6rem 1rem',
                    borderRadius: 'var(--border-radius-sm)',
                    border: '1px solid var(--color-card-border)',
                  }}
                >
                  <span style={{ fontWeight: 600, letterSpacing: '0.02em' }}>
                    {submission.word}
                  </span>
                  {submission.is_valid ? (
                    <span
                      className="flex items-center gap-1"
                      style={{
                        color: 'var(--color-success)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                      }}
                    >
                      <CheckCircle2 size={14} aria-hidden="true" /> Valid (+1)
                    </span>
                  ) : (
                    <span
                      className="flex items-center gap-1"
                      style={{
                        color: 'var(--color-danger)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                      }}
                    >
                      <XCircle size={14} aria-hidden="true" /> Invalid
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        className="flex flex-col sm:flex-row gap-4 mt-8"
        style={{
          justifyContent: 'center',
          width: '100%',
          maxWidth: '500px',
          margin: '2rem auto 0 auto',
        }}
      >
        {isHost ? (
          <button
            onClick={() => void handleRematch()}
            className="btn btn-primary btn-full animate-pulse-glow"
            disabled={resetting}
            style={{ padding: '1rem', fontSize: '1.05rem' }}
            type="button"
          >
            <RotateCcw size={18} /> {resetting ? 'Resetting room...' : 'Rematch (Play Again)'}
          </button>
        ) : (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--color-text-secondary)',
              fontSize: '0.9rem',
              width: '100%',
              padding: '0.5rem 0',
            }}
          >
            Waiting for the host to start a rematch...
          </div>
        )}

        <button
          onClick={() => void handleGoHome()}
          className="btn btn-outline btn-full"
          style={{ padding: '1rem', fontSize: '1.05rem' }}
          type="button"
        >
          <Home size={18} /> Leave &amp; Go Home
        </button>
      </div>

      {modalProfile && (
        <ProfileModal profile={modalProfile} onClose={() => setModalProfile(null)} />
      )}
    </PageWrapper>
  );
};
