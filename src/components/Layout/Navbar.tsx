import React from 'react';
import { LogOut, BarChart2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useGame } from '../../hooks/useGame';
import { useNotifications } from '../../hooks/useNotifications';
import { VolumeControl } from '../Common/VolumeControl';

interface NavbarProps {
  onNavigate: (page: string) => void;
  currentPage: string;
}

export const Navbar: React.FC<NavbarProps> = ({ onNavigate, currentPage }) => {
  const { profile, signOut } = useAuth();
  const { activeRoom, leaveActiveRoom } = useGame();
  const { confirm, toast } = useNotifications();

  const handleLogoClick = async () => {
    if (activeRoom) {
      const shouldLeave = await confirm({
        title: 'Leave active room?',
        message: 'Going home will remove you from this room. You will lose access to the room chat, and chat is cleared once the room is empty.',
        cancelLabel: 'Stay in Room',
        confirmLabel: 'Leave & Go Home',
        tone: 'warning'
      });

      if (!shouldLeave) {
        return;
      }

      await leaveActiveRoom();
      toast({ title: 'Left room', message: 'You are back on the home screen.', tone: 'info' });
    }
    onNavigate('landing');
  };

  const handleStatsClick = () => {
    onNavigate('statistics');
  };

  const handleProfileClick = () => {
    onNavigate('profile');
  };

  const handleSignOut = async () => {
    if (activeRoom) {
      const shouldSignOut = await confirm({
        title: 'Leave room and sign out?',
        message: 'Signing out will remove you from the active room. You will lose access to room chat and match updates.',
        cancelLabel: 'Cancel',
        confirmLabel: 'Leave Room & Sign Out',
        tone: 'danger'
      });

      if (!shouldSignOut) return;
      await leaveActiveRoom();
    }
    await signOut();
    toast({ title: 'Signed out', tone: 'info' });
    onNavigate('landing');
  };

  return (
    <nav className="navbar" role="navigation" aria-label="Main Navigation">
      <div className="container flex items-center justify-between">
        <button
          onClick={handleLogoClick}
          className="logo"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          aria-label="SpellSift home"
        >
          <img src="/logo_2.png" alt="SpellSift" className="brand-logo-image" />
        </button>

        <div className="nav-links">
          <VolumeControl />

          {profile && (
            <>
              <button
                onClick={handleStatsClick}
                className={`btn btn-outline ${currentPage === 'statistics' ? 'active' : ''}`}
                style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.4rem', border: currentPage === 'statistics' ? '1px solid var(--color-accent)' : undefined }}
                title="View Match Statistics"
              >
                <BarChart2 size={18} />
                <span className="sr-only">Stats</span>
              </button>

              <button
                onClick={handleProfileClick}
                className="flex items-center gap-2"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-primary)'
                }}
                title="Edit Profile"
              >
                <img
                  src={profile.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.username}`}
                  alt={`${profile.username}'s avatar`}
                  className="avatar"
                  style={{ width: '32px', height: '32px', border: currentPage === 'profile' ? '2px solid var(--color-accent)' : '2px solid var(--color-primary)' }}
                />
                <span style={{ fontSize: '0.9rem', fontWeight: 600 }} className="sr-only">
                  {profile.username}
                </span>
              </button>

              <button
                onClick={handleSignOut}
                className="btn btn-outline"
                style={{ padding: '0.5rem', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut size={18} style={{ color: 'var(--color-text-secondary)' }} />
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};
