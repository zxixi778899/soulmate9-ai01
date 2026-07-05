'use client';

import { createBrowserClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import type { SupabaseClient } from '@/lib/supabase';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  supabase: SupabaseClient | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  supabase: null,
  isLoading: true,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // supabase is null when NEXT_PUBLIC_SUPABASE_URL is missing at build time.
  // In that case user/session stay null and we still render children 
  // but protected routes will redirect to /login.
  const [supabase] = useState<SupabaseClient | null>(() => createBrowserClient());
  const router = useRouter();

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }
    const getSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);
      } catch {
        // ignore  supabase init failed
      } finally {
        setIsLoading(false);
      }
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signOut = async () => {
    if (!supabase) {
      router.push('/login');
      return;
    }
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, session, supabase, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}