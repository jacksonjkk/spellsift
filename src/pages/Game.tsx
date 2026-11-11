import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, Award, Star, AlertTriangle } from 'lucide-react';
import { useGame } from '../hooks/useGame';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { useTimer } from '../hooks/useTimer';
import { useDictionaryCheck } from '../hooks/useDictionaryCheck';
import { PageWrapper } from '../components/Layout/PageWrapper';
import { ProfileModal } from '../components/Common/ProfileModal';
import { parseNotepadWords, currentLineWord } from '../utils/notepad';
import { validateWord } from '../utils/validation';
import { haptic } from '../utils/haptics';
import type { Profile } from '../types';

interface GameProps {
  onNavigate: (page: string) => void;
}

const SUBMISSION_GRACE_SECONDS = 10;
const FINISH_BUFFER_MS = 1200;
const SUBMISSION_CHUNK_SIZE = 8;
const FINISH_MAX_ATTEMPTS = 5;
const FINISH_RETRY_BASE_MS = 1500;

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

export const Game: React.FC<GameProps> = ({ onNavigate }) => {
  const {
    activeRoom,
    players,
    submitPlayerWord,
    finishGame,
    leaveActiveRoom,
    refreshRoomData,
    serverTimeOffsetMs,
  } = useGame();

  const { profile } = useAuth();
  const { confirm, toast } = useNotifications();

  const [notepadText, setNotepadText] = useState('1. ');
  const [isSubmittingAll, setIsSubmittingAll] = useState(false);
  const [savedWordCount, setSavedWordCount] = useState(0);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const timeUpHandledRef = useRef(false);
  const notepadTextRef = useRef(notepadText);
  const submittedWordsRef = useRef<Set<string>>(new Set());
  const inFlightWordsRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const submitPlayerWordRef = useRef(submitPlayerWord);

  // Keep the ref in sync so the timer callback never reads stale text.
  useEffect(() => {
    notepadTextRef.current = notepadText;
  }, [notepadText]);

  useEffect(() => {
    submitPlayerWordRef.current = submitPlayerWord;
  }, [submitPlayerWord]);

  const baseWord = activeRoom?.base_word || '';

  useEffect(() => {
    timeUpHandledRef.current = false;
  }, [activeRoom?.id, activeRoom?.started_at]);

  const handleTimeUp = async () => {
    if (timeUpHandledRef.current) return;
    timeUpHandledRef.current = true;
    setIsSubmittingAll(true);

    try {
      // Wait for any word saved as the player pressed Enter, then submit only
      // the words that have not been confirmed yet.
      if (inFlightWordsRef.current.size > 0) {
        await Promise.allSettled(Array.from(inFlightWordsRef.current.values()));
      }

      const words = parseNotepadWords(notepadTextRef.current).filter(
        (word) => /^[A-Z]{3,25}$/.test(word) && !submittedWordsRef.current.has(word)
      );

      if (words.length > 0) {
        let rejected = 0;

        // Send in small chunks so a large notepad does not flood the network
        // or trip the per-minute submission limit.
        for (let index = 0; index < words.length; index += SUBMISSION_CHUNK_SIZE) {
          const chunk = words.slice(index, index + SUBMISSION_CHUNK_SIZE);
          const results = await Promise.all(
            chunk.map((word) => submitPlayerWord(word, { skipFetch: true }))
          );

          rejected += results.filter((result) => !result.valid && Boolean(result.error)).length;

          if (index + SUBMISSION_CHUNK_SIZE < words.length) {
            await sleep(150);
          }
        }

        if (rejected > 0) {
          toast({
            title: 'Some words were not counted',
            message: `${rejected} of ${words.length} submissions were rejected. Check the results breakdown.`,
            tone: 'warning',
          });
        }

        await refreshRoomData();
      }

      if (!activeRoom) return;

      // Every client waits out the server submission grace window and then
      // tries to finalize. The first request wins; the rest become no-ops.
      const startedAt = activeRoom.started_at
        ? new Date(activeRoom.started_at).getTime()
        : Date.now();
      const finishAt =
        startedAt +
        (activeRoom.timer_duration + SUBMISSION_GRACE_SECONDS) * 1000 +
        FINISH_BUFFER_MS;
      const waitMs = Math.max(0, finishAt - (Date.now() + serverTimeOffsetMs));

      if (waitMs > 0) {
        await sleep(waitMs);
      }

      let lastError: unknown = null;

      for (let attempt = 0; attempt < FINISH_MAX_ATTEMPTS; attempt += 1) {
        try {
          await finishGame();
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < FINISH_MAX_ATTEMPTS - 1) {
            await sleep(FINISH_RETRY_BASE_MS * (attempt + 1));
          }
        }
      }

      if (lastError) {
        console.warn('Could not finalize the game yet:', lastError);
        toast({
          title: 'Finalizing the round',
          message: 'The server is still processing results. They will appear automatically.',
          tone: 'info',
        });
        await refreshRoomData();
      }
    } catch (error) {
      console.error('Failed to finish the time-up submission flow:', error);
      toast({
        title: 'Submission problem',
        message: 'Your words may not all have been saved. Check the results screen.',
        tone: 'error',
      });
    } finally {
      setIsSubmittingAll(false);
    }
  };

  const { timeLeft, formattedTime } = useTimer({
    startedAt: activeRoom?.started_at ?? null,
    durationSeconds: activeRoom?.timer_duration ?? 60,
    onTimeUp: handleTimeUp,
    serverTimeOffsetMs,
  });

  const disableInputs = timeLeft <= 0;
  const isWaitingForResults = activeRoom?.status === 'playing' && timeLeft <= 0;

  const { invalidWords } = useDictionaryCheck(
    notepadText,
    activeRoom?.enforce_dictionary ?? false
  );

  // Follow the server into the results screen once submissions have flushed.
  useEffect(() => {
    if (activeRoom && activeRoom.status === 'ended' && !isSubmittingAll) {
      onNavigate('results');
    }
  }, [activeRoom, activeRoom?.status, isSubmittingAll, onNavigate]);

  const submitWordIncrementally = useCallback((rawWord: string) => {
    const word = rawWord.trim().toUpperCase();
    if (!/^[A-Z]{3,25}$/.test(word)) return;
    if (submittedWordsRef.current.has(word) || inFlightWordsRef.current.has(word)) return;

    const preflight = validateWord(word, baseWord, Array.from(submittedWordsRef.current));
    if (!preflight.isValid) return;

    const request = submitPlayerWordRef.current(word, { skipFetch: true })
      .then((result) => {
        if (result.valid) {
          submittedWordsRef.current.add(word);
          setSavedWordCount((count) => count + 1);
          haptic(10);
        } else if (result.error === 'Not a valid English word.') {
          haptic([8, 30, 8]);
        }
        return result.valid;
      })
      .catch(() => false)
      .finally(() => {
        inFlightWordsRef.current.delete(word);
      });

    inFlightWordsRef.current.set(word, request);
  }, [baseWord]);

  // Flush unsaved lines when the app is backgrounded or closed, so a mobile
  // network interruption does not lose words that were never submitted.
  useEffect(() => {
    if (!activeRoom || activeRoom.status !== 'playing') return;

    const flush = () => {
      parseNotepadWords(notepadTextRef.current)
        .filter((word) => /^[A-Z]{3,25}$/.test(word))
        .forEach(submitWordIncrementally);
    };
    const handleVisibilityChange = () => {
      if (document.hidden) flush();
    };

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeRoom, submitWordIncrementally]);

  const handleBlur = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    submitWordIncrementally(currentLineWord(textarea.value, textarea.selectionStart));
  };

  // Handle auto-numbering.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    const textarea = event.currentTarget;
    const text = textarea.value;
    const cursorPosition = textarea.selectionStart;
    const textBefore = text.substring(0, cursorPosition);
    const textAfter = text.substring(cursorPosition);

    const lines = textBefore.split('\n');
    const currentLine = lines[lines.length - 1];
    const hasWord = currentLine.replace(/^\d+\.\s*/, '').trim().length > 0;

    if (!hasWord) return;

    submitWordIncrementally(currentLineWord(text, cursorPosition));

    const nextLineNumber = lines.length + 1;
    const insertText = `\n${nextLineNumber}. `;

    setNotepadText(textBefore + insertText + textAfter);

    window.setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = cursorPosition + insertText.length;
        textareaRef.current.selectionEnd = cursorPosition + insertText.length;
        textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
      }
    }, 0);
  };

  if (!activeRoom || !profile) return null;

  const sortedLeaderboard = [...players].sort((a, b) => b.score - a.score);

  const handleAbort = async () => {
    const shouldAbort = await confirm({
      title: 'Abort this match?',
      message:
        'You will leave the room immediately. Your room chat access ends, and your current round progress may not count.',
      cancelLabel: 'Keep Playing',
      confirmLabel: 'Abort & Leave',
      tone: 'danger',
    });

    if (!shouldAbort) return;

    await leaveActiveRoom();
    toast({ title: 'Match aborted', message: 'You left the room.', tone: 'warning' });
    onNavigate('landing');
  };

  return (
    <PageWrapper>
      <div className="page-action-bar flex justify-between items-center mb-6">
        <button
          onClick={handleAbort}
          className="btn btn-outline"
          style={{ color: 'var(--color-danger)' }}
          type="button"
        >
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
            animation: timeLeft <= 10 ? 'shake 0.5s infinite' : undefined,
          }}
          role="timer"
          aria-label={`Time remaining: ${formattedTime}`}
        >
          <Clock size={20} aria-hidden="true" />
          <span style={{ fontWeight: 800 }}>{formattedTime}</span>
        </div>
      </div>

      <div className="game-layout">
        <div className="flex flex-col gap-6">
          <div className="base-word-card card text-center" style={{ padding: '2rem' }}>
            <p
              style={{
                color: 'var(--color-text-secondary)',
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '1rem',
              }}
            >
              Base Word (Sift Letters From Here)
            </p>
            <div className="flex gap-2 justify-center" style={{ flexWrap: 'wrap' }}>
              {baseWord.split('').map((character, index) => (
                <div
                  key={`${character}-${index}`}
                  className="letter-tile animate-float"
                  aria-hidden="true"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--color-primary), var(--color-bg-darker))',
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
                    animationDelay: `${index * 0.1}s`,
                    userSelect: 'none',
                  }}
                >
                  {character}
                </div>
              ))}
            </div>
          </div>

          <div className="card card-glow-primary flex flex-col gap-4">
            <h3 className="notepad-heading">
              {!isWaitingForResults && timeLeft > 0 && (
                <span
                  className={`notepad-mobile-timer ${
                    timeLeft <= 10 ? 'notepad-mobile-timer-danger' : ''
                  }`}
                  aria-hidden="true"
                >
                  <Clock size={15} />
                  <span>{formattedTime}</span>
                </span>
              )}
              <span className="notepad-heading-base" aria-label={`Base word: ${baseWord}`}>
                <span>Base word</span>
                <strong>{baseWord}</strong>
              </span>
              {isWaitingForResults && (
                <span className="notepad-submitting-label">Submitting Answers...</span>
              )}
              {!isWaitingForResults && savedWordCount > 0 && (
                <span className="notepad-saved-label" role="status" aria-live="polite">
                  {savedWordCount} saved
                </span>
              )}
            </h3>

            <div style={{ flex: 1, position: 'relative' }}>
              <textarea
                ref={textareaRef}
                className="input"
                placeholder="1. Type word here..."
                value={notepadText}
                onChange={(event) => {
                  let newValue = event.target.value.replace(/[^A-Za-z0-9.\s\n]/g, '');
                  // Normalize line endings (iOS may insert \r\n).
                  newValue = newValue.replace(/\r\n?/g, '\n');

                  // iOS fallback: auto-number lines that bypassed handleKeyDown.
                  const lines = newValue.split('\n');
                  let fixApplied = false;
                  const fixedLines = lines.map((line, index) => {
                    if (index === 0) return line;
                    if (line.length > 0 && !/^\d+\./.test(line)) {
                      fixApplied = true;
                      return `${index + 1}. ${line}`;
                    }
                    return line;
                  });

                  setNotepadText(fixApplied ? fixedLines.join('\n') : newValue);
                }}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                disabled={disableInputs || isSubmittingAll}
                style={{
                  fontSize: '1.25rem',
                  letterSpacing: '0.05em',
                  width: '100%',
                  minHeight: '250px',
                  resize: 'vertical',
                  fontFamily: 'monospace',
                  padding: '1rem',
                  lineHeight: '1.5',
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
                enterKeyHint="enter"
                aria-label="Word notepad"
                aria-describedby="notepad-hint"
              />
              {isWaitingForResults && (
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
                    zIndex: 1,
                  }}
                >
                  <div className="spinner" aria-hidden="true" />
                  <div>
                    <p
                      style={{
                        fontSize: '1.1rem',
                        fontWeight: 800,
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      Submitting your words...
                    </p>
                    <p
                      style={{
                        marginTop: '0.35rem',
                        fontSize: '0.9rem',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      Checking scores and preparing results
                    </p>
                  </div>
                </div>
              )}
            </div>

            {activeRoom.enforce_dictionary && invalidWords.size > 0 && (
              <div className="invalid-words-panel" aria-live="polite">
                <div className="invalid-words-header">
                  <AlertTriangle size={14} aria-hidden="true" />
                  <span>Possible invalid words:</span>
                </div>
                <div className="invalid-words-list">
                  {[...invalidWords].map((word) => (
                    <span key={word} className="invalid-word-tag">
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <p id="notepad-hint" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              {isWaitingForResults
                ? 'Round ended. Please wait while results are finalized.'
                : 'Words auto-submit when the timer runs out. Keep typing!'}
            </p>
          </div>
        </div>

        <div className="card flex flex-col gap-4" style={{ height: 'max-content' }}>
          <div
            className="flex items-center gap-2"
            style={{ borderBottom: '1px solid var(--color-card-border)', paddingBottom: '1rem' }}
          >
            <Award style={{ color: 'var(--color-warning)' }} aria-hidden="true" />
            <h3 style={{ fontSize: '1.25rem' }}>Live Scoreboard</h3>
          </div>

          <div className="leaderboard-list">
            {sortedLeaderboard.map((player, index) => {
              const userProfile = player.profiles;
              const isMe = userProfile?.id === profile.id;
              const position = index + 1;

              return (
                <div
                  key={player.id}
                  className={`leaderboard-item ${isMe ? 'active' : ''}`}
                  style={{
                    padding: '0.75rem',
                    borderColor: position === 1 ? 'var(--color-warning)' : undefined,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      style={{
                        fontWeight: 800,
                        color:
                          position === 1 ? 'var(--color-warning)' : 'var(--color-text-muted)',
                        width: '20px',
                      }}
                    >
                      #{position}
                    </div>
                    <button
                      type="button"
                      onClick={() => userProfile && setSelectedProfile(userProfile)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
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
                        style={{ width: '30px', height: '30px', objectFit: 'cover' }}
                      />
                    </button>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '0.95rem',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        maxWidth: '100px',
                      }}
                    >
                      {userProfile?.username}
                      {isMe ? ' (you)' : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <span
                      className="animate-pop"
                      key={player.score}
                      style={{ fontWeight: 800, color: 'var(--color-accent)' }}
                    >
                      {player.score}
                    </span>
                    <Star
                      size={12}
                      style={{ color: 'var(--color-accent)', fill: 'var(--color-accent)' }}
                      aria-hidden="true"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selectedProfile && (
        <ProfileModal profile={selectedProfile} onClose={() => setSelectedProfile(null)} />
      )}
    </PageWrapper>
  );
};
