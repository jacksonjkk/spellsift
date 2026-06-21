import React, { useState } from 'react';
import { Shield, Zap, Award, User, Mail, Lock, Plus, LogIn } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { PageWrapper } from '../components/Layout/PageWrapper';

interface LandingProps {
  onNavigate: (page: string) => void;
}

export const Landing: React.FC<LandingProps> = ({ onNavigate }) => {
  const { profile, signIn, signUp, supabaseReady } = useAuth();
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  
  // Auth Form State
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatarSeed] = useState(() => Math.random().toString(36).substring(7));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent duplicate submissions
    if (submitting) return;
    
    setError(null);
    setNotice(null);
    setSubmitting(true);

    if (!supabaseReady) {
      setError('Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file and restart the dev server.');
      setSubmitting(false);
      return;
    }

    try {
      if (authTab === 'login') {
        if (!email || !password) {
          throw new Error('Please enter email and password');
        }
        await signIn(email, password);
      } else {
        if (username.trim().length < 3) {
          throw new Error('Username must be at least 3 characters');
        }
        if (!email || !password) {
          throw new Error('Please fill in all fields');
        }
        const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${avatarSeed}`;
        const result = await signUp(email, password, username.trim(), avatarUrl);
        if (result.requiresEmailConfirmation) {
          setNotice('Account created. Check your email and confirm the account, then log in to create a room.');
          setAuthTab('login');
          setPassword('');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateRoomClick = () => {
    onNavigate('create-room');
  };

  const handleJoinRoomClick = () => {
    onNavigate('join-room');
  };

  return (
    <PageWrapper>
      {/* Supabase Setup Banner */}
      {!supabaseReady && (
        <div 
          className="animate-fade-in"
          style={{ 
            background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.05))',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            borderRadius: 'var(--border-radius)',
            padding: '1.25rem 1.5rem',
            marginBottom: '2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem' }}>⚙️</span>
            <div>
              <h3 style={{ color: 'var(--color-warning)', fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                Supabase Setup Required
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', lineHeight: '1.5' }}>
                To play SpellSift, you need a Supabase project. Create one at{' '}
                <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>supabase.com</a>
                , then:
              </p>
            </div>
          </div>
          <div style={{ 
            background: 'rgba(0,0,0,0.3)', 
            padding: '1rem', 
            borderRadius: '8px', 
            fontFamily: 'monospace', 
            fontSize: '0.8rem', 
            lineHeight: '1.8',
            color: 'var(--color-text-secondary)'
          }}>
            <div><span style={{ color: 'var(--color-accent)' }}>1.</span> Run the SQL from <span style={{ color: 'var(--color-warning)' }}>supabase/schema.sql</span> in your Supabase SQL Editor</div>
            <div><span style={{ color: 'var(--color-accent)' }}>2.</span> Create a <span style={{ color: 'var(--color-warning)' }}>.env</span> file in the project root:</div>
            <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', borderRadius: '4px' }}>
              <div>VITE_SUPABASE_URL=<span style={{ color: 'var(--color-success)' }}>your-project-url</span></div>
              <div>VITE_SUPABASE_ANON_KEY=<span style={{ color: 'var(--color-success)' }}>your-anon-key</span></div>
            </div>
            <div style={{ marginTop: '0.5rem' }}><span style={{ color: 'var(--color-accent)' }}>3.</span> Restart the dev server (<span style={{ color: 'var(--color-warning)' }}>npm run dev</span>)</div>
          </div>
        </div>
      )}
      {/* Hero Section */}
      <section className="text-center py-12 animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div 
          className="animate-float"
          style={{ 
            background: 'linear-gradient(135deg, rgba(109, 40, 217, 0.2), rgba(6, 182, 212, 0.2))',
            borderRadius: '50%',
            padding: '0.35rem',
            width: '90px',
            height: '90px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid var(--color-accent)',
            boxShadow: 'var(--shadow-cyan-glow)',
            marginBottom: '1.5rem'
          }}
        >
          <img
            src="/logo1.png"
            alt="SpellSift"
            style={{ width: '74px', height: '74px', objectFit: 'contain', borderRadius: '50%' }}
          />
        </div>
        
        <h1 className="landing-title" style={{ fontSize: '3.5rem', fontWeight: 900, marginBottom: '0.5rem', background: 'linear-gradient(135deg, #f8fafc 40%, var(--color-accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          SpellSift
        </h1>
        <p className="landing-subtitle" style={{ fontSize: '1.25rem', color: 'var(--color-text-secondary)', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '3rem' }}>
          Find. Form. Win.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8" style={{ width: '100%', maxWidth: '1000px', alignItems: 'start' }}>
          {/* Main call to actions */}
          <div className="landing-intro flex flex-col gap-6 text-left" style={{ justifyContent: 'center', height: '100%' }}>
            <h2 style={{ fontSize: '2rem', lineHeight: '1.3' }}>
              Form Words. Compete Live. <span style={{ color: 'var(--color-accent)' }}>Outsmart Everyone.</span>
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem' }}>
              SpellSift is a fast-paced, real-time word creation competition. Join or create a room, 
              sift through letters of the base word, and form as many words as you can in 60 seconds.
            </p>
            
            {profile ? (
              <div className="flex flex-col sm:flex-row gap-4 mt-4" style={{ flexWrap: 'wrap' }}>
                <button onClick={handleCreateRoomClick} className="btn btn-primary btn-full sm:btn-auto" style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}>
                  <Plus size={20} /> Create Room
                </button>
                <button onClick={handleJoinRoomClick} className="btn btn-secondary btn-full sm:btn-auto" style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}>
                  <LogIn size={20} /> Join Room
                </button>
              </div>
            ) : (
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem 1.5rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--color-card-border)', color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
                💡 Register an account or sign in on the right to start playing.
              </div>
            )}
          </div>

          {/* Authentication Card */}
          {!profile ? (
            <div className="card card-glow-primary text-left animate-fade-in delay-1">
              <div className="auth-tabs flex gap-2" style={{ borderBottom: '1px solid var(--color-card-border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <button 
                  onClick={() => { setAuthTab('login'); setError(null); }}
                  className={`btn ${authTab === 'login' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ flex: 1, padding: '0.5rem' }}
                >
                  Log In
                </button>
                <button 
                  onClick={() => { setAuthTab('register'); setError(null); }}
                  className={`btn ${authTab === 'register' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ flex: 1, padding: '0.5rem' }}
                >
                  Register
                </button>
              </div>

              {error && (
                <div style={{ color: 'var(--color-danger)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.75rem', borderRadius: 'var(--border-radius)', marginBottom: '1rem', fontSize: '0.875rem' }}>
                  {error}
                </div>
              )}

              {notice && (
                <div style={{ color: 'var(--color-success)', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.25)', padding: '0.75rem', borderRadius: 'var(--border-radius)', marginBottom: '1rem', fontSize: '0.875rem' }}>
                  {notice}
                </div>
              )}

              <form onSubmit={handleAuthSubmit} className="flex flex-col gap-4">
                {authTab === 'register' && (
                  <div className="form-group">
                    <label className="label">Username</label>
                    <div className="flex gap-2 items-center" style={{ position: 'relative' }}>
                      <User size={16} style={{ position: 'absolute', left: '12px', color: 'var(--color-text-muted)' }} />
                      <input
                        type="text"
                        className="input"
                        placeholder="Choose username..."
                        style={{ paddingLeft: '2.5rem' }}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        disabled={submitting}
                        maxLength={15}
                      />
                    </div>
                  </div>
                )}

                <div className="form-group">
                    <label className="label">Email Address</label>
                    <div className="flex gap-2 items-center" style={{ position: 'relative' }}>
                      <Mail size={16} style={{ position: 'absolute', left: '12px', color: 'var(--color-text-muted)' }} />
                      <input
                        type="email"
                        className="input"
                        placeholder="your@email.com"
                        style={{ paddingLeft: '2.5rem' }}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={submitting}
                      />
                    </div>
                  </div>

                <div className="form-group">
                    <label className="label">Password</label>
                    <div className="flex gap-2 items-center" style={{ position: 'relative' }}>
                      <Lock size={16} style={{ position: 'absolute', left: '12px', color: 'var(--color-text-muted)' }} />
                      <input
                        type="password"
                        className="input"
                        placeholder="••••••••"
                        style={{ paddingLeft: '2.5rem' }}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={submitting}
                        minLength={6}
                      />
                    </div>
                  </div>

                <button type="submit" className="btn btn-primary btn-full" style={{ padding: '0.85rem', marginTop: '0.5rem' }} disabled={submitting}>
                  {submitting ? (authTab === 'login' ? 'Signing in...' : 'Creating account...') : authTab === 'login' ? 'Log In' : 'Create Account'}
                </button>
              </form>
            </div>
          ) : (
            <div className="card card-glow-secondary text-left animate-fade-in delay-1 flex flex-col gap-6" style={{ alignSelf: 'stretch', justifyContent: 'center' }}>
              <div className="flex items-center gap-4">
                <img 
                  src={profile?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${profile?.username}`}
                  alt="Profile"
                  style={{ width: '70px', height: '70px', borderRadius: '50%', background: 'var(--color-bg)', border: '3px solid var(--color-secondary)' }}
                />
                <div>
                  <h3 style={{ fontSize: '1.25rem' }}>Welcome back,</h3>
                  <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-accent)' }}>{profile?.username}</p>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--color-card-border)', paddingTop: '1.5rem' }}>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                  Quick Player Stats
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Games Played</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 800 }}>{profile?.games_played || 0}</p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Wins</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-warning)' }}>{profile?.wins || 0}</p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Ties</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-accent)' }}>{profile?.ties || 0}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <button onClick={handleCreateRoomClick} className="btn btn-primary btn-full">
                  Create Game Room
                </button>
                <button onClick={handleJoinRoomClick} className="btn btn-outline btn-full">
                  Join Game Room
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12" style={{ borderTop: '1px solid var(--color-card-border)', marginTop: '2rem' }}>
        <h2 className="text-center" style={{ fontSize: '2rem', marginBottom: '3rem' }}>
          Game Features
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card text-center flex flex-col items-center gap-4">
            <Zap size={36} style={{ color: 'var(--color-accent)' }} />
            <h3 style={{ fontSize: '1.25rem' }}>Real-time Multiplayer</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
              Powered by Supabase Realtime replication. Watch scores, players ready statuses, and chat updates sync instantly.
            </p>
          </div>

          <div className="card text-center flex flex-col items-center gap-4">
            <Shield size={36} style={{ color: 'var(--color-primary-hover)' }} />
            <h3 style={{ fontSize: '1.25rem' }}>Server-side Verification</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
              Cheat prevention with secure SQL procedures. Submissions are processed in database transactions to protect the game state.
            </p>
          </div>

          <div className="card text-center flex flex-col items-center gap-4">
            <Award size={36} style={{ color: 'var(--color-warning)' }} />
            <h3 style={{ fontSize: '1.25rem' }}>Global Leaderboards</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
              Track wins, matches played, win rate, and average score. Prove your linguistic supremacy.
            </p>
          </div>
        </div>
      </section>

      {/* How to Play Section */}
      <section className="py-12" style={{ borderTop: '1px solid var(--color-card-border)' }}>
        <h2 className="text-center" style={{ fontSize: '2rem', marginBottom: '3.5rem' }}>
          How It Works
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6" style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div className="text-center flex flex-col items-center gap-2">
            <div style={{ background: 'var(--color-primary)', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 800 }}>1</div>
            <h3 style={{ fontSize: '1.1rem', marginTop: '0.5rem' }}>Host a Room</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>Create a lobby and share the code or URL with friends.</p>
          </div>

          <div className="text-center flex flex-col items-center gap-2">
            <div style={{ background: 'var(--color-secondary)', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 800 }}>2</div>
            <h3 style={{ fontSize: '1.1rem', marginTop: '0.5rem' }}>Choose Base Word</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>The host inputs a base word and starts the countdown.</p>
          </div>

          <div className="text-center flex flex-col items-center gap-2">
            <div style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 800 }}>3</div>
            <h3 style={{ fontSize: '1.1rem', marginTop: '0.5rem' }}>Form Words</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>Find as many words as possible using letters from the base word in 60s.</p>
          </div>

          <div className="text-center flex flex-col items-center gap-2">
            <div style={{ background: 'var(--color-warning)', color: 'var(--color-bg)', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 800 }}>4</div>
            <h3 style={{ fontSize: '1.1rem', marginTop: '0.5rem' }}>Win the Round</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>The player with the most validated submissions wins!</p>
          </div>
        </div>
      </section>
    </PageWrapper>
  );
};
