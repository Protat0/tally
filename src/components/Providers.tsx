'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from './AuthContext';
import { AppProvider, useApp } from './AppContext';
import GlobalFAB from './GlobalFAB';

function Splash() {
  return (
    <div className="fixed inset-0 bg-[#0b0f1a] flex flex-col items-center justify-center gap-6">
      <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-xl shadow-blue-900/40">
        <span className="text-2xl font-bold text-white">T</span>
      </div>
      <div className="h-0.5 w-20 rounded-full bg-[#1e2d40] overflow-hidden">
        <div className="h-full w-1/2 bg-blue-500 rounded-full animate-pulse" />
      </div>
    </div>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isAuthPage = pathname === '/auth';

  useEffect(() => {
    if (loading) return;
    if (!user && !isAuthPage) router.replace('/auth');
    if (user && isAuthPage) router.replace('/');
  }, [user, loading, isAuthPage, router]);

  const shouldBlock =
    loading ||
    (!loading && !user && !isAuthPage) ||
    (!loading && user && isAuthPage);

  if (shouldBlock) return <Splash />;
  return <>{children}</>;
}

// Sits inside AppProvider — shows splash while Supabase data loads
function AppShell({ children }: { children: React.ReactNode }) {
  const { dataLoading } = useApp();
  if (dataLoading) return <Splash />;
  return <>{children}<GlobalFAB /></>;
}

function AppContent({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <AppProvider userId={user?.id ?? null}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>
        <AppContent>{children}</AppContent>
      </AuthGuard>
    </AuthProvider>
  );
}
