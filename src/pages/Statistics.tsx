import React, { useState, useEffect } from 'react';
import { ArrowLeft, BarChart2, Star, Calendar, Swords, Award } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { PageWrapper } from '../components/Layout/PageWrapper';

interface StatisticsProps {
  onNavigate: (page: string) => void;
}

export const Statistics: React.FC<StatisticsProps> = ({ onNavigate }) => {
  const { profile } = useAuth();
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;

    const loadStats = async () => {
      try {
        const data = await api.getRecentMatches(profile.id);
        setMatches(data);
      } catch (err) {
        console.error('Failed to load recent matches:', err);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [profile]);

  if (!profile) return null;

  // Compute Career stats
  const totalGames = profile.games_played;
  const totalWins = profile.wins;
  const totalTies = profile.ties || 0;
  const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;
  
  const avgScore = matches.length > 0 
    ? Math.round(matches.reduce((acc, curr) => acc + (curr.score || 0), 0) / matches.length * 10) / 10
    : 0;

  return (
    <PageWrapper>
      <div style={{ maxWidth: '900px', margin: '1rem auto' }}>
        <button
          onClick={() => onNavigate('landing')}
          className="btn btn-outline"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem' }}
        >
          <ArrowLeft size={16} /> Back to Home
        </button>

        <div className="flex items-center gap-3 mb-8">
          <BarChart2 size={32} style={{ color: 'var(--color-accent)' }} />
          <h1 className="page-title" style={{ fontSize: '2rem' }}>Statistics Dashboard</h1>
        </div>

        {/* Core Stats Cards */}
        <div className="stats-grid grid gap-4 mb-8">
          <div className="card text-center" style={{ padding: '1.25rem' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Total Played</p>
            <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text-primary)', marginTop: '0.25rem' }}>
              {totalGames}
            </p>
          </div>

          <div className="card text-center" style={{ padding: '1.25rem' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Wins</p>
            <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-warning)', marginTop: '0.25rem' }}>
              {totalWins}
            </p>
          </div>

          <div className="card text-center" style={{ padding: '1.25rem' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Ties</p>
            <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-accent)', marginTop: '0.25rem' }}>
              {totalTies}
            </p>
          </div>

          <div className="card text-center" style={{ padding: '1.25rem' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Win Rate</p>
            <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-success)', marginTop: '0.25rem' }}>
              {winRate}%
            </p>
          </div>

          <div className="card text-center" style={{ padding: '1.25rem' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Avg Score</p>
            <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-accent)', marginTop: '0.25rem' }}>
              {avgScore} <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)' }}>words</span>
            </p>
          </div>
        </div>

        {/* Match History */}
        <div className="card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Swords size={20} style={{ color: 'var(--color-accent)' }} /> Match History (Last 10 Games)
          </h2>

          {loading ? (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem 0' }}>
              Loading match logs...
            </p>
          ) : matches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--color-text-muted)' }}>
              <p style={{ marginBottom: '1rem' }}>No matches recorded in your history yet.</p>
              <button onClick={() => onNavigate('landing')} className="btn btn-primary">
                Join a Game Room
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {matches.map((item, idx) => {
                const room = item.rooms;
                const result = room?.game_results?.[0];
                const didWin = result && result.winner_id === profile.id;
                const didTie = result?.is_tie && item.score === result.tie_score;
                
                // Format date
                const date = new Date(item.joined_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div 
                    key={idx}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    style={{
                      background: 'rgba(15, 23, 42, 0.4)',
                      padding: '1rem 1.25rem',
                      borderRadius: 'var(--border-radius)',
                      border: '1px solid var(--color-card-border)',
                      borderLeft: didWin
                        ? '4px solid var(--color-warning)'
                        : didTie
                          ? '4px solid var(--color-accent)'
                          : '4px solid var(--color-card-border)'
                    }}
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ fontWeight: 800, color: 'var(--color-text-primary)' }}>
                          Room {room?.room_code || 'N/A'}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Calendar size={12} /> {date}
                        </span>
                      </div>
                      
                      <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                        Base Word: <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>{room?.base_word || 'N/A'}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-4 sm:text-right" style={{ alignSelf: 'stretch', justifyContent: 'space-between', width: 'auto' }}>
                      <div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Your Score</p>
                        <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                          {item.score} <Star size={14} style={{ fill: 'var(--color-accent)' }} />
                        </p>
                      </div>

                      <div style={{ minWidth: '90px', textAlign: 'right' }}>
                        {didWin ? (
                          <span className="badge badge-warning flex items-center gap-1" style={{ display: 'inline-flex' }}>
                            <Award size={12} /> Winner
                          </span>
                        ) : didTie ? (
                          <span className="badge badge-success" style={{ display: 'inline-flex' }}>
                            Tie
                          </span>
                        ) : (
                          <span className="badge badge-primary" style={{ display: 'inline-flex' }}>
                            Participant
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
};
