import React, { createContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import supabase, { isSupabaseConfigured } from '../services/supabase';
import { api } from '../services/api';
import type { Profile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  supabaseReady: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string, avatarUrl?: string) => Promise<{ requiresEmailConfirmation: boolean }>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_SESSION_TIMEOUT_MS = 10000;
const PROFILE_LOAD_TIMEOUT_MS = 12000;

const timeoutAfter = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      window.setTimeout(() => resolve(fallback), ms);
    })
  ]);
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Load profile for authenticated user
  const fetchUserProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    try {
      return await timeoutAfter(api.getProfile(userId), PROFILE_LOAD_TIMEOUT_MS, null);
    } catch (err) {
      console.error('Error fetching profile in AuthProvider:', err);
      return null;
    }
  }, []);

  const refreshProfile = async () => {
    if (user) {
      setProfile(await fetchUserProfile(user.id));
    }
  };

  useEffect(() => {
    // If Supabase is not configured, skip auth and just stop loading
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const applySession = (session: Session | null) => {
      const currentUser = session?.user ?? null;
      if (!mounted) return;

      setUser(currentUser);

      if (!currentUser) {
        setProfile(null);
      }
    };

    // 1. Check current session
    timeoutAfter(supabase.auth.getSession(), AUTH_SESSION_TIMEOUT_MS, null)
      .then((result) => {
        applySession(result?.data.session ?? null);
      })
      .catch((err) => {
        console.error('Error loading auth session:', err);
        if (mounted) {
          setUser(null);
          setProfile(null);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    // 2. Listen to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        if (mounted) {
          applySession(session);
          setLoading(false);
        }
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Load the profile from a normal React effect, not inside Supabase's auth
  // callback. Supabase warns that issuing Supabase calls from the callback can
  // deadlock the client on some browsers.
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    let cancelled = false;

    const loadProfile = async () => {
      const userProfile = await fetchUserProfile(user.id);
      if (!cancelled) {
        setProfile(userProfile);
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [fetchUserProfile, user]);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
          throw new Error('Confirm your email address before logging in. Check your inbox for the confirmation link.');
        }
        if (error.message.includes('Invalid login credentials')) {
          throw new Error("We couldn't sign you in. Check your email and password, then try again.");
        }
        if (error.status === 429) {
          throw new Error('Too many login attempts. Please wait a few minutes before trying again.');
        }
        throw error;
      }

      const signedInUser = data.session?.user ?? data.user ?? null;
      setUser(signedInUser);

      if (!signedInUser) {
        setProfile(null);
      }
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const signUp = async (email: string, password: string, username: string, avatarUrl?: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            username,
            avatar_url: avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`
          }
        }
      });

      if (error) {
        if (error.status === 429) {
          throw new Error('Supabase has temporarily limited signup emails. Do not retry repeatedly—wait for the email limit to reset, or configure custom SMTP in Supabase.');
        }
        if (error.message.toLowerCase().includes('already registered')) {
          throw new Error('This email is already registered. Please log in instead.');
        }
        if (error.status === 422) {
          throw new Error('Signup could not create your account profile. Run supabase/migrations/006_fix_signup_profile_trigger.sql in the Supabase SQL Editor, then try again.');
        }
        throw error;
      }

      // With email confirmation enabled, signUp returns a user but no session.
      // Never expose that public profile as an authenticated app session.
      if (!data.session) {
        setUser(null);
        setProfile(null);
        return { requiresEmailConfirmation: true };
      }

      setUser(data.session.user);
      return { requiresEmailConfirmation: false };
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) throw new Error('Not authenticated');
    
    // Check username length
    if (updates.username && updates.username.trim().length < 3) {
      throw new Error('Username must be at least 3 characters');
    }

    const updated = await api.updateProfile(user.id, updates);
    if (updated) {
      setProfile(updated);
    }
  };

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        supabaseReady: isSupabaseConfigured,
        signIn,
        signUp,
        updateProfile,
        signOut,
        refreshProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
