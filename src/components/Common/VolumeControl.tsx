import React, { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { soundManager } from '../../utils/sound';

export const VolumeControl: React.FC = () => {
  const [muted, setMuted] = useState(soundManager.getIsMuted());

  const handleToggle = () => {
    const isMutedNow = soundManager.toggleMute();
    setMuted(isMutedNow);
  };

  return (
    <button
      onClick={handleToggle}
      className="btn btn-outline"
      style={{
        padding: '0.5rem',
        borderRadius: '50%',
        width: '40px',
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      title={muted ? 'Unmute sounds' : 'Mute sounds'}
      aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
    >
      {muted ? (
        <VolumeX size={20} style={{ color: 'var(--color-danger)' }} />
      ) : (
        <Volume2 size={20} style={{ color: 'var(--color-accent)' }} />
      )}
    </button>
  );
};
