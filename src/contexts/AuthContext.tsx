/* eslint-disable react-refresh/only-export-components -- The context object intentionally shares a module with its provider. */
import React, { createContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import supabase, { isSupabaseConfigured } from '../services/supabase';
import { api } from '../services/api';
import { toUserMessage } from '../utils/errors';
import type { Profile } from '../types';

interface ProfileUpdate {
  username?: string;
  avatarUrl?: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  supabaseReady: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    username: string,
    avatarUrl?: string
  ) => Promise<{ requiresEmailConfirmation: boolean }>;
  updateProfile: (updates: ProfileUpdate) => Promise<void>;
  deleteAccount: () => Promise<void>;
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
    }),
  ]);
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  const fetchUserProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    try {
      return await timeoutAfter(api.getProfile(userId), PROFILE_LOAD_TIMEOUT_MS, null);
    } catch (err) {
      console.error('Error fetching profile in AuthProvider:', err);
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    setProfile(await fetchUserProfile(user.id));
  }, [fetchUserProfile, user]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    let mounted = true;

    const applySession = (session: Session | null) => {
      const currentUser = session?.user ?? null;
      if (!mounted) return;
      setUser(currentUser);
      if (!currentUser) setProfile(null);
    };

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
        if (mounted) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
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

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    void fetchUserProfile(user.id).then((userProfile) => {
      if (!cancelled) setProfile(userProfile);
    });

    return () => {
      cancelled = true;
    };
  }, [fetchUserProfile, user]);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
          throw new Error(
            'Confirm your email address before logging in. Check your inbox for the confirmation link.'
          );
        }
        if (error.message.includes('Invalid login credentials')) {
          throw new Error(
            "We couldn't sign you in. Check your email and password, then try again."
          );
        }
        if (error.status === 429) {
          throw new Error(
            'Too many login attempts. Please wait a few minutes before trying again.'
          );
        }
        throw error;
      }

      const signedInUser = data.session?.user ?? data.user ?? null;
      setUser(signedInUser);
      if (!signedInUser) setProfile(null);
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const signUp = async (
    email: string,
    password: string,
    username: string,
    avatarUrl?: string
  ) => {
    try {
      const cleanUsername = username.trim();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            username: cleanUsername,
            avatar_url:
              avatarUrl ||
              `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanUsername)}`,
          },
        },
      });

      if (error) {
        if (error.status === 429) {
          throw new Error(
            'Supabase has temporarily limited signup emails. Wait for the limit to reset, or configure custom SMTP in Supabase.'
          );
        }
        if (error.message.toLowerCase().includes('already registered')) {
          throw new Error('This email is already registered. Please log in instead.');
        }
        if (error.status === 422) {
          throw new Error(
            'Signup could not create your profile. Make sure the latest database migration has been applied, then try again.'
          );
        }
        throw error;
      }

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

  const updateProfile = async (updates: ProfileUpdate) => {
    if (!user || !profile) throw new Error('Not authenticated');

    const username = (updates.username ?? profile.username).trim();
    if (username.length < 3 || username.length > 20) {
      throw new Error('Username must be 3-20 characters.');
    }

    const avatarUrl =
      updates.avatarUrl === undefined ? profile.avatar_url : updates.avatarUrl;

    const updated = await api.updateProfile(username, avatarUrl);
    setProfile(updated);
  };

  const deleteAccount = async () => {
    if (!user) throw new Error('Not authenticated');
    try {
      await api.deleteAccount();
    } catch (err) {
      throw new Error(
        toUserMessage(
          err,
          'Account deletion is temporarily unavailable. Contact support and we will remove your account.'
        ),
        { cause: err }
      );
    }
    try {
      await supabase.auth.signOut();
    } catch {
      // The auth user is already gone; a failed local sign-out must not make
      // the successful deletion look like an error.
    }
    setUser(null);
    setProfile(null);
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await timeoutAfter(supabase.auth.signOut(), AUTH_SESSION_TIMEOUT_MS, { error: null });
    } finally {
      setUser(null);
      setProfile(null);
      setLoading(false);
    }
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
        deleteAccount,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
