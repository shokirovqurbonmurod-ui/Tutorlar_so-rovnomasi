'use client';
import * as React from 'react';
import { ThemeProvider } from 'next-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/lib/auth';
import { TooltipProvider } from '@/components/ui/tooltip';

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors position="top-right" closeButton toastOptions={{ classNames: { toast: 'rounded-xl!' } }} />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
