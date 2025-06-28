import { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useRouter, useSegments } from 'expo-router';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email);
        
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Redirect logic
  useEffect(() => {
    console.log('Redirect useEffect:', { user, segments, loading }); // Debug log
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      console.log('Redirecting to /auth/signin'); // Debug log
      router.replace('/(auth)/signin');
    } else if (user && inAuthGroup) {
      console.log('Redirecting to /tabs'); // Debug log
      router.replace('/(tabs)');
    }
  }, [user, segments, loading]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
  };

  const signOut = async () => {
    try {
      // Clear local state immediately
      setUser(null);
      setSession(null);
      console.log('User and session set to null'); // Debug log
      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      alert('Supabase signOut called, error: ' + (error ? error.message : 'none'));
      console.log('Supabase signOut called, error:', error); // Debug log
      if (error) {
        console.error('Sign out error:', error);
        // Even if there's an error, we still want to navigate to sign in
      }
      // Debug: Alert to confirm navigation attempt
      alert('Attempting to navigate to sign in page');
      // Force navigation to sign in page
      router.replace('/(auth)/signin');
    } catch (error) {
      console.error('Sign out error:', error);
      // Even if there's an error, clear state and navigate
      setUser(null);
      setSession(null);
      alert('Sign out error, navigating to sign in page');
      router.replace('/(auth)/signin');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        signIn,
        signUp,
        signOut,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}