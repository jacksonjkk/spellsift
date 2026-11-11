/* eslint-disable react-hooks/set-state-in-effect -- The countdown synchronizes React state with the wall clock, timers, and visibility changes. */
import { useEffect, useState, useRef } from 'react';
import { soundManager } from '../utils/sound';
import { formatTime } from '../utils/time';

interface UseTimerProps {
  startedAt: string | null;
  durationSeconds: number;
  onTimeUp?: () => void;
  serverTimeOffsetMs?: number;
}

export function useTimer({
  startedAt,
  durationSeconds,
  onTimeUp,
  serverTimeOffsetMs = 0,
}: UseTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(durationSeconds);
  const [isTimeUp, setIsTimeUp] = useState<boolean>(false);
  const onTimeUpRef = useRef(onTimeUp);
  const firedRef = useRef(false);
  const tickedSeconds = useRef<Record<number, boolean>>({});

  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  useEffect(() => {
    firedRef.current = false;
    tickedSeconds.current = {};

    if (!startedAt) {
      setTimeLeft(durationSeconds);
      setIsTimeUp(false);
      return;
    }

    const calculateTimeLeft = () => {
      const startTime = new Date(startedAt).getTime();
      const now = Date.now() + serverTimeOffsetMs;
      const elapsed = Math.floor((now - startTime) / 1000);
      return Math.max(0, durationSeconds - elapsed);
    };

    const fireTimeUp = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      setIsTimeUp(true);
      onTimeUpRef.current?.();
    };

    const initialRemaining = calculateTimeLeft();
    setTimeLeft(initialRemaining);
    if (initialRemaining <= 0) {
      fireTimeUp();
      return;
    }

    const intervalId = window.setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);

      if (remaining <= 10 && remaining > 0 && !tickedSeconds.current[remaining]) {
        soundManager.playTick();
        tickedSeconds.current[remaining] = true;
      }

      if (remaining <= 0) {
        window.clearInterval(intervalId);
        fireTimeUp();
      }
    }, 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);
      if (remaining <= 0) {
        fireTimeUp();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [startedAt, durationSeconds, serverTimeOffsetMs]);

  return {
    timeLeft,
    isTimeUp,
    formattedTime: formatTime(timeLeft),
  };
}
