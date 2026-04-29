"use client";
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import { useMemo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export function ConvexClientProvider({ children }: Props) {
  // useMemo prevents SSR/hydration mismatch by ensuring consistent
  // initialization on both server and client renders.
  const convex = useMemo(() => {
    const raw = import.meta.env.PUBLIC_CONVEX_URL as string | undefined;
    if (!raw) {
      throw new Error(
        "PUBLIC_CONVEX_URL is not configured. Check your .env.local file."
      );
    }
    const convexUrl = raw.replace(/\/+$/, '');
    return new ConvexReactClient(convexUrl);
  }, []);

  return (
    <ConvexAuthProvider client={convex}>
      {children}
    </ConvexAuthProvider>
  );
}

export default ConvexClientProvider;
