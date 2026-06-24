import React, { useState, useEffect, useRef } from 'react';
import { Clock, Award, Star } from 'lucide-react';
import { useGame } from '../hooks/useGame';
import { useAuth } from '../hooks/useAuth';
import { useTimer } from '../hooks/useTimer';
import { PageWrapper } from '../components/Layout/PageWrapper';
import { ProfileModal } from '../components/Common/ProfileModal';
import type { Profile } from '../types';

interface GameProps {
  onNavigate: (page: string) => void;
}

const SUBMISSION_GRACE_SECONDS = 10;
const HOST_FINISH_BUFFER_MS = 1000;

export const Game: React.FC<GameProps> = ({ onNavigate }) => {
  const { 
    activeRoom, 
    players, 
    submitPlayerWord, 
    hostFinishGame,
    leaveActiveRoom
  } = useGame();
  
  const { profile } = useAuth();
  
  const [notepadText, setNotepadText] = useState('1. ');
  const [isSubmittingAll, setIsSubmittingAll] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const timeUpHandledRef = useRef(false);

  const isHost = activeRoom?.host_id === profile?.id;
  const baseWord = activeRoom?.base_word || '';

  useEffect(() => {
    timeUpHandledRef.current = false;
  }, [activeRoom?.id, activeRoom?.started_at]);

  // Timer completion callback
  const handleTimeUp = async () => {
    if (timeUpHandledRef.current) return;
    timeUpHandledRef.current = true;
    
    // 1. Submit all words first
    setIsSubmittingAll(true);
    try {
      if (notepadText.trim()) {
        const lines = notepadText.split('\n');
        const wordsToSubmit = Array.from(new Set(lines.map(line => {
          // Strip out numbering like "1. ", "2.", etc. and trim spaces
          return line.replace(/^\d+\.\s*/, '').trim().toUpperCase();
        }).filter(word => word.length > 0)));

        // Submit all valid words one by one
        for (const word of wordsToSubmit) {
          try {
            // We can skip client-side validation here since backend does it, 
            // or we can just send it. The backend RPC handles validation.
            await submitPlayerWord(word);
          } catch (err) {
            console.error('Submission failed for', word, err);
          }
        }
      }

      // 2. Then host finishes the game after everyone has had a short sync window.
      if (isHost && activeRoom) {
        const startedAt = activeRoom.started_at ? new Date(activeRoom.started_at).getTime() : Date.now();
        const finishAt = startedAt
          + (activeRoom.timer_duration + SUBMISSION_GRACE_SECONDS) * 1000
          + HOST_FINISH_BUFFER_MS;
        const waitMs = Math.max(0, finishAt - Date.now());

        if (waitMs > 0) {
          await new Promise(resolve => window.setTimeout(resolve, waitMs));
        }

        let finishAttempts = 0;
        while (finishAttempts < 3) {
          try {
            await hostFinishGame();
            break;
          } catch (err) {
            finishAttempts += 1;
            if (finishAttempts >= 3) throw err;
            await new Promise(resolve => window.setTimeout(resolve, 1500));
          }
        }
      }
    } catch (err) {
      console.error('Failed to finish time-up submission flow:', err);
    } finally {
      setIsSubmittingAll(false);
    }
  };

  const { timeLeft, formattedTime } = useTimer({
    startedAt: activeRoom?.started_at ?? null,
    durationSeconds: activeRoom?.timer_duration ?? 60,
    onTimeUp: handleTimeUp,
  });

  const disableInputs = timeLeft <= 0;

  // Auto-transition when game state is updated to ended, but ONLY if we have finished submitting
  useEffect(() => {
    if (activeRoom && activeRoom.status === 'ended' && !isSubmittingAll) {
      onNavigate('results');
    }
  }, [activeRoom?.status, isSubmittingAll, onNavigate]);

  // Handle auto-numbering
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const cursorPosition = textarea.selectionStart;
      const textBefore = notepadText.substring(0, cursorPosition);
      const textAfter = notepadText.substring(cursorPosition);
      
      const lines = textBefore.split('\n');
      const currentLine = lines[lines.length - 1];
      const hasWord = currentLine.replace(/^\d+\.\s*/, '').trim().length > 0;
      
      if (!hasWord) {
        // Do nothing if they haven't typed a word
        return;
      }
      
      const nextLineNum = lines.length + 1;
      
      const insertText = `\n${nextLineNum}. `;
      
      setNotepadText(textBefore + insertText + textAfter);
      
      // We need to set cursor position after render, so a small timeout is needed
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = cursorPosition + insertText.length;
          textareaRef.current.selectionEnd = cursorPosition + insertText.length;
          textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
        }
      }, 0);
    }
  };

  if (!activeRoom || !profile) return null;

  // Sorted leaderboard of other players in room
  const sortedLeaderboard = [...players].sort((a, b) => b.score - a.score);

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

          {/* Notepad Panel */}
          <div className="card card-glow-primary flex flex-col gap-4">
            <h3 className="notepad-heading">
              {!isSubmittingAll && timeLeft > 0 && (
                <span
                  className={`notepad-mobile-timer ${timeLeft <= 10 ? 'notepad-mobile-timer-danger' : ''}`}
                  aria-label={`Time remaining: ${formattedTime}`}
                >
                  <Clock size={15} />
                  <span>{formattedTime}</span>
                </span>
              )}
              <span className="notepad-heading-base" aria-label={`Base word: ${baseWord}`}>
                <span>Base word</span>
                <strong>{baseWord}</strong>
              </span>
              {isSubmittingAll && <span className="notepad-submitting-label">Submitting Answers...</span>}
            </h3>
            
            <div style={{ flex: 1, position: 'relative' }}>
              <textarea
                ref={textareaRef}
                className="input"
                placeholder="1. Type word here..."
                value={notepadText}
                onChange={(e) => setNotepadText(e.target.value.replace(/[^A-Za-z0-9.\s\n]/g, ''))}
                onKeyDown={handleKeyDown}
                disabled={disableInputs || isSubmittingAll}
                style={{ 
                  fontSize: '1.25rem', 
                  letterSpacing: '0.05em',
                  width: '100%',
                  minHeight: '250px',
                  resize: 'vertical',
                  fontFamily: 'monospace',
                  padding: '1rem',
                  lineHeight: '1.5'
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
              />
              {isSubmittingAll && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    minHeight: '250px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '1rem',
                    padding: '1.5rem',
                    borderRadius: 'var(--border-radius-sm)',
                    background: 'rgba(15, 23, 42, 0.92)',
                    border: '1px solid var(--color-card-border)',
                    textAlign: 'center',
                    zIndex: 1
                  }}
                >
                  <div className="spinner" aria-hidden="true" />
                  <div>
                    <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                      Submitting your words...
                    </p>
                    <p style={{ marginTop: '0.35rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                      Checking scores and preparing results
                    </p>
                  </div>
                </div>
              )}
            </div>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              {isSubmittingAll ? 'Round ended. Please wait while results are finalized.' : 'Words will auto-submit when the timer runs out! Keep typing.'}
            </p>
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
                    <button 
                      onClick={() => userProfile && setSelectedProfile(userProfile)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      <img 
                        src={userProfile?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${userProfile?.username}`} 
                        alt="Avatar" 
                        className="avatar hover:scale-110 transition-transform" 
                        style={{ width: '30px', height: '30px', objectFit: 'cover' }}
                      />
                    </button>
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

      {selectedProfile && (
        <ProfileModal 
          profile={selectedProfile} 
          onClose={() => setSelectedProfile(null)} 
        />
      )}
    </PageWrapper>
  );
};
