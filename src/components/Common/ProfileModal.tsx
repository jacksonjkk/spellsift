import React from 'react';
import { X, Trophy, Swords, Hash } from 'lucide-react';
import type { Profile } from '../../types';

interface ProfileModalProps {
  profile: Profile;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ profile, onClose }) => {
  return (
    <div 
      className="modal-backdrop animate-fade-in" 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem'
      }}
    >
      <div 
        className="card card-glow-secondary animate-float"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '400px',
          position: 'relative',
          padding: '2rem'
        }}
      >
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'none',
            border: 'none',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            padding: '0.5rem'
          }}
          aria-label="Close modal"
        >
          <X size={24} />
        </button>

        <div className="flex flex-col items-center gap-4">
          <img 
            src={profile.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.username}`}
            alt={`${profile.username}'s avatar`}
            style={{ 
              width: '100px', 
              height: '100px', 
              borderRadius: '50%', 
              border: '3px solid var(--color-accent)',
              boxShadow: 'var(--shadow-cyan-glow)',
              objectFit: 'cover'
            }}
          />
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>{profile.username}</h2>
          
          <div className="grid grid-cols-3 gap-4 w-full mt-4">
            <div className="text-center" style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
              <Hash size={20} style={{ margin: '0 auto 0.5rem', color: 'var(--color-text-secondary)' }} />
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{profile.games_played || 0}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Played</div>
            </div>
            <div className="text-center" style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
              <Trophy size={20} style={{ margin: '0 auto 0.5rem', color: 'var(--color-warning)' }} />
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-warning)' }}>{profile.wins || 0}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Wins</div>
            </div>
            <div className="text-center" style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
              <Swords size={20} style={{ margin: '0 auto 0.5rem', color: 'var(--color-accent)' }} />
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-accent)' }}>{profile.ties || 0}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Ties</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
