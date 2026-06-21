import React, { useState, useEffect, useRef } from 'react';
import { Send, Clock, Award, Star, ListFilter } from 'lucide-react';
import { useGame } from '../hooks/useGame';
import { useAuth } from '../hooks/useAuth';
import { useTimer } from '../hooks/useTimer';
import { PageWrapper } from '../components/Layout/PageWrapper';
import { validateWord } from '../utils/validation';

interface GameProps {
  onNavigate: (page: string) => void;
}

export const Game: React.FC<GameProps> = ({ onNavigate }) => {
  const { 
    activeRoom, 
    players, 
    submissions, 
    submitPlayerWord, 
    hostFinishGame,
    leaveActiveRoom
  } = useGame();
  
  const { profile } = useAuth();
  
  const [wordInput, setWordInput] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shakeError, setShakeError] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isHost = activeRoom?.host_id === profile?.id;
  const baseWord = activeRoom?.base_word || '';

  // Timer completion callback
  const handleTimeUp = async () => {
    if (isHost && activeRoom) {
      try {
        await hostFinishGame();
      } catch (err) {
        console.error('Failed to end game:', err);
      }
    }
  };

  const { timeLeft, formattedTime } = useTimer({
    startedAt: activeRoom?.started_at ?? null,
    durationSeconds: activeRoom?.timer_duration ?? 60,
    onTimeUp: handleTimeUp,
  });

  const disableInputs = timeLeft <= 0;

  // Auto-transition when game state is updated to ended
  useEffect(() => {
    if (activeRoom && activeRoom.status === 'ended') {
      onNavigate('results');
    }
  }, [activeRoom?.status, onNavigate]);

  // Handle word form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disableInputs || isSubmitting) return;

    const word = wordInput.trim().toUpperCase();
    setSubmitError(null);
    setShakeError(false);

    if (!word) return;

    // Client-side quick check (includes letter validation and local duplicates check)
    const localExistingWords = submissions.map(s => s.word);
    const clientValidationResult = validateWord(word, baseWord, localExistingWords);
    
    if (!clientValidationResult.isValid) {
      setSubmitError(clientValidationResult.error || 'Invalid word');
      setShakeError(true);
      // Reset shake after animation completes
      setTimeout(() => setShakeError(false), 500);
      setWordInput('');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitPlayerWord(word);
      if (!result.valid) {
        setSubmitError(result.error || 'Invalid word');
        setShakeError(true);
        setTimeout(() => setShakeError(false), 500);
      } else {
        setWordInput('');
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Submission failed');
    } finally {
      setIsSubmitting(false);
      // Keep input focused for quick typing
      inputRef.current?.focus();
    }
  };

  if (!activeRoom || !profile) return null;

  // Sorted leaderboard of other players in room
  const sortedLeaderboard = [...players].sort((a, b) => b.score - a.score);
  
  // Submissions lists split into Valid & Invalid
  const validSubmissions = submissions.filter(s => s.is_valid);
  const invalidSubmissions = submissions.filter(s => !s.is_valid);

  const handleAbort = async () => {
    if (window.confirm('Do you want to abandon this game? You will leave the room.')) {
      await leaveActiveRoom();
      onNavigate('landing');
    }
  };

  return (
    <PageWrapper>
      <div className="page-action-bar flex justify-between items-center mb-6">
        <button onClick={handleAbort} className="btn btn-outline" style={{ color: 'var(--color-danger)' }}>
          Abort Match
        </button>

        <div 
          className={`btn ${timeLeft <= 10 ? 'btn-outline' : 'btn-secondary'}`}
          style={{ 
            display: 'flex', 
            gap: '0.5rem', 
            fontSize: '1.25rem', 
            borderColor: timeLeft <= 10 ? 'var(--color-danger)' : undefined,
            color: timeLeft <= 10 ? 'var(--color-danger)' : undefined,
            animation: timeLeft <= 10 ? 'shake 0.5s infinite' : undefined
          }}
        >
          <Clock size={20} />
          <span style={{ fontWeight: 800 }}>{formattedTime}</span>
        </div>
      </div>

      <div className="game-layout">
        {/* Play Board Area */}
        <div className="flex flex-col gap-6">
          {/* Base Word Letters Displays */}
          <div className="base-word-card card text-center" style={{ padding: '2rem' }}>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>
              Base Word (Sift Letters From Here)
            </p>
            <div className="flex gap-2 justify-center" style={{ flexWrap: 'wrap' }}>
              {baseWord.split('').map((char, idx) => (
                <div 
                  key={idx} 
                  className="letter-tile animate-float"
                  style={{
                    background: 'linear-gradient(135deg, var(--color-primary), var(--color-bg-darker))',
                    border: '2px solid var(--color-accent)',
                    boxShadow: 'var(--shadow-cyan-glow)',
                    borderRadius: '8px',
                    width: '50px',
                    height: '50px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.75rem',
                    fontWeight: 900,
                    textShadow: '0 0 10px rgba(34, 211, 238, 0.5)',
                    animationDelay: `${idx * 0.1}s`,
                    userSelect: 'none'
                  }}
                >
                  {char}
                </div>
              ))}
            </div>
          </div>

          {/* Submission Panel */}
          <div className="card card-glow-primary flex flex-col gap-4">
            <h3 style={{ fontSize: '1.25rem' }}>Submit Formed Words</h3>
            
            <form onSubmit={handleSubmit} className="word-submit-form flex gap-2">
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  ref={inputRef}
                  type="text"
                  className={`input ${shakeError ? 'animate-shake input-error' : ''}`}
                  placeholder={disableInputs ? 'Game locked!' : 'Type your word...'}
                  value={wordInput}
                  onChange={(e) => setWordInput(e.target.value.replace(/[^A-Za-z]/g, ''))}
                  disabled={disableInputs || isSubmitting}
                  style={{ fontSize: '1.25rem', letterSpacing: '0.05em' }}
                  required
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                />
              </div>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={disableInputs || isSubmitting || !wordInput.trim()}
                style={{ padding: '0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Send size={18} /> Submit
              </button>
            </form>

            {submitError && (
              <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem', fontWeight: 500 }}>
                ⚠️ {submitError}
              </p>
            )}
          </div>

          {/* Numbered accepted submissions */}
          <div className="card">
            <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ListFilter size={18} style={{ color: 'var(--color-accent)' }} /> 
              Submitted Words ({validSubmissions.length})
            </h3>
            
            {validSubmissions.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', fontStyle: 'italic', padding: '1rem 0' }}>
                No words found yet. Speed is key!
              </p>
            ) : (
              <ol className="submission-list">
                {validSubmissions.map((submission, index) => (
                  <li key={submission.id} className="submission-list-item animate-fade-in">
                    <span className="submission-number">{index + 1}</span>
                    <span className="submission-word">{submission.word}</span>
                    <span className="badge badge-success">Accepted</span>
                  </li>
                ))}
              </ol>
            )}

            {invalidSubmissions.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                  Invalid Attempts ({invalidSubmissions.length})
                </h4>
                <div className="word-chips-container" style={{ background: 'rgba(239, 68, 68, 0.02)', maxHeight: '100px' }}>
                  {invalidSubmissions.map((s) => (
                    <span key={s.id} className="word-chip invalid">
                      {s.word}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Live Leaderboard Sidebar */}
        <div className="card flex flex-col gap-4" style={{ height: 'max-content' }}>
          <div className="flex items-center gap-2" style={{ borderBottom: '1px solid var(--color-card-border)', paddingBottom: '1rem' }}>
            <Award style={{ color: 'var(--color-warning)' }} />
            <h3 style={{ fontSize: '1.25rem' }}>Live Scoreboard</h3>
          </div>

          <div className="leaderboard-list">
            {sortedLeaderboard.map((player, idx) => {
              const userProfile = player.profiles;
              const isMe = userProfile?.id === profile.id;
              const position = idx + 1;

              return (
                <div 
                  key={player.id} 
                  className={`leaderboard-item ${isMe ? 'active' : ''}`}
                  style={{
                    padding: '0.75rem',
                    borderColor: position === 1 ? 'var(--color-warning)' : undefined
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      style={{ 
                        fontWeight: 800, 
                        color: position === 1 ? 'var(--color-warning)' : 'var(--color-text-muted)',
                        width: '20px' 
                      }}
                    >
                      #{position}
                    </div>
                    <img 
                      src={userProfile?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${userProfile?.username}`} 
                      alt="Avatar" 
                      className="avatar" 
                      style={{ width: '30px', height: '30px' }}
                    />
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '100px' }}>
                      {userProfile?.username}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <span className="animate-pop" key={player.score} style={{ fontWeight: 800, color: 'var(--color-accent)' }}>
                      {player.score}
                    </span>
                    <Star size={12} style={{ color: 'var(--color-accent)', fill: 'var(--color-accent)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};
