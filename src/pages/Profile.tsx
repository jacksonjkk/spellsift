import React, { useState } from 'react';
import { ArrowLeft, Save, User, RefreshCw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { PageWrapper } from '../components/Layout/PageWrapper';

interface ProfileProps {
  onNavigate: (page: string) => void;
}

const AVATAR_SEEDS = ['Bolt', 'Sparky', 'Rusty', 'Gizmo', 'Widget', 'Zippy', 'Circuit', 'Pixel', 'Chip', 'Byte'];

export const Profile: React.FC<ProfileProps> = ({ onNavigate }) => {
  const { profile, updateProfile } = useAuth();
  
  const [username, setUsername] = useState(profile?.username || '');
  const [selectedAvatar, setSelectedAvatar] = useState(profile?.avatar_url || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!profile) return null;

  // Compute stats
  const winRate = profile.games_played > 0 
    ? Math.round((profile.wins / profile.games_played) * 100) 
    : 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    
    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    setSubmitting(true);
    try {
      await updateProfile({
        username: username.trim(),
        avatar_url: selectedAvatar
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile. Username might be taken.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRandomizeAvatars = () => {
    const randomSeed = Math.random().toString(36).substring(7);
    setSelectedAvatar(`https://api.dicebear.com/7.x/bottts/svg?seed=${randomSeed}`);
  };

  return (
    <PageWrapper>
      <div className="form-page" style={{ maxWidth: '600px', margin: '2rem auto' }}>
        <button
          onClick={() => onNavigate('landing')}
          className="btn btn-outline"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}
        >
          <ArrowLeft size={16} /> Back to Home
        </button>

        <div className="card card-glow-primary">
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem' }}>Edit Player Profile</h2>

          {error && (
            <div style={{ color: 'var(--color-danger)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.75rem', borderRadius: 'var(--border-radius)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{ color: 'var(--color-success)', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.75rem', borderRadius: 'var(--border-radius)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              ✨ Profile updated successfully!
            </div>
          )}

          <form onSubmit={handleSave} className="flex flex-col gap-6">
            {/* Avatar Selector */}
            <div className="form-group">
              <label className="label">Select Avatar</label>
              
              <div className="flex gap-4 items-center mb-4">
                <img 
                  src={selectedAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.username}`}
                  alt="Current Avatar" 
                  style={{ 
                    width: '75px', 
                    height: '75px', 
                    borderRadius: '50%', 
                    background: 'var(--color-bg)', 
                    border: '3px solid var(--color-primary)',
                    boxShadow: 'var(--shadow-glow)'
                  }}
                />
                <div>
                  <button 
                    type="button" 
                    onClick={handleRandomizeAvatars}
                    className="btn btn-outline"
                    style={{ fontSize: '0.85rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}
                  >
                    <RefreshCw size={14} /> Randomize Bot
                  </button>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.4rem' }}>
                    Or click one of the presets below:
                  </p>
                </div>
              </div>

              <div className="avatar-selector">
                {AVATAR_SEEDS.map((seed) => {
                  const url = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
                  const isSelected = selectedAvatar === url;
                  return (
                    <button
                      key={seed}
                      type="button"
                      onClick={() => setSelectedAvatar(url)}
                      className={`avatar-option ${isSelected ? 'selected' : ''}`}
                      style={{
                        background: 'var(--color-bg)',
                        padding: 0,
                        overflow: 'hidden',
                        borderRadius: '50%',
                        border: isSelected ? '3px solid var(--color-accent)' : '3px solid transparent'
                      }}
                      title={seed}
                    >
                      <img src={url} alt={seed} style={{ width: '100%', height: '100%' }} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Username Input */}
            <div className="form-group">
              <label className="label">Username</label>
              <div className="flex gap-2 items-center" style={{ position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: '12px', color: 'var(--color-text-muted)' }} />
                <input
                  type="text"
                  className="input"
                  placeholder="Enter name..."
                  style={{ paddingLeft: '2.5rem' }}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  maxLength={15}
                  disabled={submitting}
                />
              </div>
            </div>

            {/* Statistics Review */}
            <div style={{ borderTop: '1px solid var(--color-card-border)', paddingTop: '1.5rem', marginTop: '1rem' }}>
              <h3 style={{ fontSize: '1rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
                My Career Records
              </h3>
              
              <div className="stats-grid grid gap-4">
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem 0.5rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(255,255,255,0.03)', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Wins</p>
                  <p style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-warning)' }}>{profile.wins}</p>
                </div>
                
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem 0.5rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(255,255,255,0.03)', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Played</p>
                  <p style={{ fontSize: '1.75rem', fontWeight: 800 }}>{profile.games_played}</p>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem 0.5rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(255,255,255,0.03)', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Ties</p>
                  <p style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-accent)' }}>{profile.ties || 0}</p>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem 0.5rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(255,255,255,0.03)', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Win Rate</p>
                  <p style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-accent)' }}>{winRate}%</p>
                </div>
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary btn-full" 
              style={{ padding: '0.9rem', fontSize: '1.05rem', marginTop: '1.5rem' }}
              disabled={submitting}
            >
              <Save size={18} /> {submitting ? 'Saving Changes...' : 'Save Profile Changes'}
            </button>
          </form>
        </div>
      </div>
    </PageWrapper>
  );
};
