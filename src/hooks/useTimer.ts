import { useEffect, useState, useRef } from 'react';
import { soundManager } from '../utils/sound';

interface UseTimerProps {
  startedAt: string | null;
  durationSeconds: number;
  onTimeUp?: () => void;
}

export function useTimer({ startedAt, durationSeconds, onTimeUp }: UseTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(durationSeconds);
  const [isTimeUp, setIsTimeUp] = useState<boolean>(false);
  const onTimeUpRef = useRef(onTimeUp);
  const tickedSeconds = useRef<Record<number, boolean>>({});

  // Maintain reference to callback to avoid effect cycles
  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  useEffect(() => {
    if (!startedAt) {
      setTimeLeft(durationSeconds);
      setIsTimeUp(false);
      tickedSeconds.current = {};
      return;
    }

    const calculateTimeLeft = () => {
      const startTime = new Date(startedAt).getTime();
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000);
      const remaining = durationSeconds - elapsed;
      
      return Math.max(0, remaining);
    };

    // Initial check
    const initialRemaining = calculateTimeLeft();
    setTimeLeft(initialRemaining);
    
    if (initialRemaining <= 0) {
      setIsTimeUp(true);
      if (onTimeUpRef.current) {
        onTimeUpRef.current();
      }
      return;
    }

    const intervalId = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);

      // Play tick sound for final 10 seconds
      if (remaining <= 10 && remaining > 0) {
        if (!tickedSeconds.current[remaining]) {
          soundManager.playTick();
          tickedSeconds.current[remaining] = true;
        }
      }

      if (remaining <= 0) {
        clearInterval(intervalId);
        setIsTimeUp(true);
        if (onTimeUpRef.current) {
          onTimeUpRef.current();
        }
      }
    }, 250); // High precision polling to check time

    // Sync on page focus / visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const remaining = calculateTimeLeft();
        setTimeLeft(remaining);
        if (remaining <= 0) {
          setIsTimeUp(true);
          if (onTimeUpRef.current) {
            onTimeUpRef.current();
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [startedAt, durationSeconds]);

  return {
    timeLeft,
    isTimeUp,
    formattedTime: `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`
  };
}
