"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/providers/auth-provider";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { firebaseUser, loading, error } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.replace("/");
    }
  }, [firebaseUser, loading, router]);

  if (loading || !firebaseUser) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="card w-full max-w-md text-center">
          <p className="text-sm uppercase tracking-[0.25em] text-moss">Milau</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Getting things ready</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Loading your groups, balances, and recent activity.</p>
          {error ? (
            <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              We couldn&apos;t load everything right now. Please try again in a moment.
            </p>
          ) : null}
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
