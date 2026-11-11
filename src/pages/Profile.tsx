import React, { useState } from 'react';
import {
  ArrowLeft,
  Save,
  User,
  RefreshCw,
  Trash2,
  ShieldCheck,
  ShieldOff,
  Undo2,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useGame } from '../hooks/useGame';
import { useNotifications } from '../hooks/useNotifications';
import { PageWrapper } from '../components/Layout/PageWrapper';
import { toUserMessage } from '../utils/errors';

interface ProfileProps {
  onNavigate: (page: string) => void;
}

const AVATAR_SEEDS = [
  'Bolt',
  'Sparky',
  'Rusty',
  'Gizmo',
  'Widget',
  'Zippy',
  'Circuit',
  'Pixel',
  'Chip',
  'Byte',
];

const avatarForSeed = (seed: string) =>
  `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;

export const Profile: React.FC<ProfileProps> = ({ onNavigate }) => {
  const { profile, updateProfile, deleteAccount } = useAuth();
  const { blockedPlayers, unblockPlayer } = useGame();
  const { confirm, toast } = useNotifications();

  const [username, setUsername] = useState(profile?.username || '');
  const [selectedAvatar, setSelectedAvatar] = useState(profile?.avatar_url || '');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!profile) return null;

  const winRate =
    profile.games_played > 0 ? Math.round((profile.wins / profile.games_played) * 100) : 0;

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const cleanUsername = username.trim();
    if (cleanUsername.length < 3 || cleanUsername.length > 20) {
      setError('Username must be 3-20 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await updateProfile({
        username: cleanUsername,
        avatarUrl: selectedAvatar || null,
      });
      toast({
        title: 'Profile updated',
        message: 'Your changes are live.',
        tone: 'success',
      });
    } catch (saveError) {
      const message = toUserMessage(
        saveError,
        'Failed to update profile. That username might already be taken.'
      );
      setError(message);
      toast({ title: 'Could not save profile', message, tone: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRandomizeAvatars = () => {
    setSelectedAvatar(avatarForSeed(Math.random().toString(36).substring(7)));
  };

  const handleDeleteAccount = async () => {
    const shouldDelete = await confirm({
      title: 'Delete your account?',
      message:
        'This permanently removes your profile, stats, submissions, chat messages, reports, and blocks. You will be signed out immediately. This cannot be undone.',
      cancelLabel: 'Keep My Account',
      confirmLabel: 'Delete Account',
      tone: 'danger',
    });

    if (!shouldDelete) return;

    setDeleting(true);
    setError(null);
    try {
      await deleteAccount();
      toast({
        title: 'Account deleted',
        message: 'Your account and game data have been removed.',
        tone: 'info',
      });
      onNavigate('landing');
    } catch (deleteError) {
      const message = toUserMessage(
        deleteError,
        'Account deletion is temporarily unavailable. Contact support and we will remove your account.'
      );
      setError(message);
      toast({ title: 'Could not delete account', message, tone: 'error' });
      setDeleting(false);
    }
  };

  const handleUnblock = async (userId: string, username: string) => {
    setUnblockingId(userId);
    try {
      await unblockPlayer(userId);
      toast({
        title: 'Player unblocked',
        message: `You can see ${username}'s messages again.`,
        tone: 'info',
      });
    } catch (unblockError) {
      toast({
        title: 'Could not unblock player',
        message: toUserMessage(unblockError, 'Please try again.'),
        tone: 'error',
      });
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <PageWrapper>
      <div className="form-page" style={{ maxWidth: '600px', margin: '2rem auto' }}>
        <button
          onClick={() => onNavigate('landing')}
          className="btn btn-outline"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}
          type="button"
        >
          <ArrowLeft size={16} /> Back to Home
        </button>

        <div className="card card-glow-primary">
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem' }}>Edit Player Profile</h2>

          {error && (
            <div
              role="alert"
              style={{
                color: 'var(--color-danger)',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                padding: '0.75rem',
                borderRadius: 'var(--border-radius)',
                marginBottom: '1.5rem',
                fontSize: '0.875rem',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSave} className="flex flex-col gap-6">
            <div className="form-group">
              <span className="label">Select Avatar</span>

              <div className="flex gap-4 items-center mb-4">
                <img
                  src={selectedAvatar || avatarForSeed(profile.username)}
                  alt="Current avatar"
                  loading="lazy"
                  style={{
                    width: '75px',
                    height: '75px',
                    borderRadius: '50%',
                    background: 'var(--color-bg)',
                    border: '3px solid var(--color-primary)',
                    boxShadow: 'var(--shadow-glow)',
                  }}
                />
                <div>
                  <button
                    type="button"
                    onClick={handleRandomizeAvatars}
                    className="btn btn-outline"
                    style={{
                      fontSize: '0.85rem',
                      display: 'flex',
                      gap: '0.4rem',
                      alignItems: 'center',
                    }}
                  >
                    <RefreshCw size={14} /> Randomize Bot
                  </button>
                  <p
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-text-secondary)',
                      marginTop: '0.4rem',
                    }}
                  >
                    Or choose one of the presets below:
                  </p>
                </div>
              </div>

              <div className="avatar-selector">
                {AVATAR_SEEDS.map((seed) => {
                  const url = avatarForSeed(seed);
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
                        border: isSelected
                          ? '3px solid var(--color-accent)'
                          : '3px solid transparent',
                      }}
                      title={seed}
                      aria-label={`Use ${seed} avatar`}
                      aria-pressed={isSelected}
                    >
                      <img
                        src={url}
                        alt=""
                        loading="lazy"
                        style={{ width: '100%', height: '100%' }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="form-group">
              <label className="label" htmlFor="profile-username">
                Username
              </label>
              <div className="flex gap-2 items-center" style={{ position: 'relative' }}>
                <User
                  size={16}
                  style={{ position: 'absolute', left: '12px', color: 'var(--color-text-muted)' }}
                  aria-hidden="true"
                />
                <input
                  id="profile-username"
                  type="text"
                  className="input"
                  placeholder="Enter name..."
                  style={{ paddingLeft: '2.5rem' }}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  minLength={3}
                  maxLength={20}
                  disabled={submitting || deleting}
                  autoComplete="username"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-describedby="profile-username-hint"
                />
              </div>
              <p
                id="profile-username-hint"
                style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.4rem' }}
              >
                3&ndash;20 characters. This name is visible to other players.
              </p>
            </div>

            <div
              style={{
                borderTop: '1px solid var(--color-card-border)',
                paddingTop: '1.5rem',
                marginTop: '1rem',
              }}
            >
              <h3
                style={{
                  fontSize: '1rem',
                  color: 'var(--color-text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '1rem',
                }}
              >
                My Career Records
              </h3>

              <div className="stats-grid grid gap-4">
                <div
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    padding: '1rem 0.5rem',
                    borderRadius: 'var(--border-radius)',
                    border: '1px solid rgba(255,255,255,0.03)',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Wins</p>
                  <p
                    style={{
                      fontSize: '1.75rem',
                      fontWeight: 800,
                      color: 'var(--color-warning)',
                    }}
                  >
                    {profile.wins}
                  </p>
                </div>

                <div
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    padding: '1rem 0.5rem',
                    borderRadius: 'var(--border-radius)',
                    border: '1px solid rgba(255,255,255,0.03)',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Played</p>
                  <p style={{ fontSize: '1.75rem', fontWeight: 800 }}>{profile.games_played}</p>
                </div>

                <div
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    padding: '1rem 0.5rem',
                    borderRadius: 'var(--border-radius)',
                    border: '1px solid rgba(255,255,255,0.03)',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Ties</p>
                  <p
                    style={{
                      fontSize: '1.75rem',
                      fontWeight: 800,
                      color: 'var(--color-accent)',
                    }}
                  >
                    {profile.ties || 0}
                  </p>
                </div>

                <div
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    padding: '1rem 0.5rem',
                    borderRadius: 'var(--border-radius)',
                    border: '1px solid rgba(255,255,255,0.03)',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Win Rate</p>
                  <p
                    style={{
                      fontSize: '1.75rem',
                      fontWeight: 800,
                      color: 'var(--color-accent)',
                    }}
                  >
                    {winRate}%
                  </p>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              style={{ padding: '0.9rem', fontSize: '1.05rem', marginTop: '1.5rem' }}
              disabled={submitting || deleting}
            >
              <Save size={18} /> {submitting ? 'Saving Changes...' : 'Save Profile Changes'}
            </button>
          </form>
        </div>

        <div className="card blocked-players-card">
          <div className="blocked-players-heading">
            <ShieldOff size={20} />
            <h3>Blocked Players</h3>
          </div>
          {blockedPlayers.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              You have not blocked anyone. You can block a player from room chat.
            </p>
          ) : (
            <ul className="blocked-players-list">
              {blockedPlayers.map((entry) => {
                const blockedProfile = entry.profiles;
                const displayName = blockedProfile?.username || 'Blocked player';
                return (
                  <li key={entry.blocked_id}>
                    <div className="blocked-player-identity">
                      <img
                        src={
                          blockedProfile?.avatar_url ||
                          avatarForSeed(blockedProfile?.username || entry.blocked_id)
                        }
                        alt=""
                        loading="lazy"
                        className="avatar"
                        style={{ width: '32px', height: '32px' }}
                      />
                      <span>{displayName}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => void handleUnblock(entry.blocked_id, displayName)}
                      disabled={unblockingId === entry.blocked_id}
                      style={{
                        padding: '0.35rem 0.7rem',
                        fontSize: '0.8rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      <Undo2 size={13} />
                      {unblockingId === entry.blocked_id ? 'Unblocking...' : 'Unblock'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card danger-zone">
          <div className="danger-zone-heading">
            <ShieldCheck size={20} />
            <h3>Account &amp; Privacy</h3>
          </div>
          <p>
            Review the{' '}
            <button type="button" className="link-button" onClick={() => onNavigate('privacy')}>
              Privacy Policy
            </button>{' '}
            and{' '}
            <button type="button" className="link-button" onClick={() => onNavigate('terms')}>
              Terms of Service
            </button>
            . Deleting your account permanently removes your profile, stats, submissions, chat
            messages, reports, and blocks.
          </p>
          <button
            type="button"
            onClick={() => void handleDeleteAccount()}
            className="btn btn-danger btn-full"
            disabled={deleting}
          >
            <Trash2 size={18} /> {deleting ? 'Deleting Account...' : 'Delete My Account'}
          </button>
        </div>
      </div>
    </PageWrapper>
  );
};
