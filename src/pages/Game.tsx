import React, { useState, useEffect, useRef } from 'react';
import { Send, Clock, Award, Star, ListFilter } from 'lucide-react';
import { useGame } from '../hooks/useGame';
import { useAuth } from '../hooks/useAuth';
import { useTimer } from '../hooks/useTimer';
import { PageWrapper } from '../components/Layout/PageWrapper';
import { validateWord } from '../utils/validation';
import { ProfileModal } from '../components/Common/ProfileModal';
import type { Profile } from '../types';

interface GameProps {
  onNavigate: (page: string) => void;
}

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

  const isHost = activeRoom?.host_id === profile?.id;
  const baseWord = activeRoom?.base_word || '';

  // Timer completion callback
  const handleTimeUp = async () => {
    if (isSubmittingAll) return;
    
    // 1. Submit all words first
    setIsSubmittingAll(true);
    if (notepadText.trim()) {
      const lines = notepadText.split('\n');
      const wordsToSubmit = lines.map(line => {
        // Strip out numbering like "1. ", "2.", etc. and trim spaces
        return line.replace(/^\d+\.\s*/, '').trim().toUpperCase();
      }).filter(word => word.length > 0);

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
    setIsSubmittingAll(false);

    // 2. Then host finishes the game
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
            <h3 style={{ fontSize: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Notepad</span>
              {isSubmittingAll && <span style={{ fontSize: '0.9rem', color: 'var(--color-warning)', animation: 'pulse 1s infinite' }}>Submitting Answers...</span>}
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
            </div>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Words will auto-submit when the timer runs out! Keep typing.
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
