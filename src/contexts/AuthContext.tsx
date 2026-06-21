import React, { createContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
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

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Load profile for authenticated user
  const fetchUserProfile = async (userId: string) => {
    try {
      const userProfile = await api.getProfile(userId);
      setProfile(userProfile);
    } catch (err) {
      console.error('Error fetching profile in AuthProvider:', err);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchUserProfile(user.id);
    }
  };

  useEffect(() => {
    // If Supabase is not configured, skip auth and just stop loading
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // 1. Check current session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    }).catch(() => {
      // If getSession fails (e.g. network error), stop loading
      setLoading(false);
    });

    // 2. Listen to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      if (currentUser) {
        await fetchUserProfile(currentUser.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Sync profile when user changes
  useEffect(() => {
    if (user && profile && profile.id === user.id) {
      setLoading(false);
    } else if (!user) {
      setLoading(false);
    }
  }, [user, profile]);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setLoading(false);
        if (error.message.toLowerCase().includes('email not confirmed')) {
          throw new Error('Confirm your email address before logging in. Check your inbox for the confirmation link.');
        }
        if (error.message.includes('Invalid login credentials')) {
          throw new Error('Email or password is incorrect. If this account was removed during the database repair, create it again.');
        }
        if (error.status === 429) {
          throw new Error('Too many login attempts. Please wait a few minutes before trying again.');
        }
        throw error;
      }
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const signUp = async (email: string, password: string, username: string, avatarUrl?: string) => {
    setLoading(true);
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
        throw error;
      }

      // With email confirmation enabled, signUp returns a user but no session.
      // Never expose that public profile as an authenticated app session.
      if (!data.session) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return { requiresEmailConfirmation: true };
      }

      setUser(data.session.user);
      await fetchUserProfile(data.session.user.id);
      return { requiresEmailConfirmation: false };
    } finally {
      setLoading(false);
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
