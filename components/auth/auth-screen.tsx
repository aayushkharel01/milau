"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck, Users, Wallet } from "lucide-react";
import { useAuth } from "@/lib/providers/auth-provider";
import { signInWithEmail, signInWithGoogle, signUpWithEmail } from "@/lib/services/auth-service";

export function AuthScreen() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && firebaseUser) {
      router.replace("/dashboard");
    }
  }, [firebaseUser, loading, router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      if (mode === "signup") {
        await signUpWithEmail(name, email, password);
      } else {
        await signInWithEmail(email, password);
      }
      router.replace("/dashboard");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setSubmitting(true);
    setError("");
    try {
      await signInWithGoogle();
      router.replace("/dashboard");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Google sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const jumpToAuth = () => {
    document.getElementById("auth-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="glass overflow-hidden rounded-[36px]">
        <div className="grid gap-10 px-6 py-8 lg:grid-cols-[1.15fr_0.85fr] lg:px-10 lg:py-10">
          <section className="space-y-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-moss">Milau</p>
                <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
                  Shared expense tracking that feels calm, clear, and easy to trust.
                </h1>
              </div>
              <div className="hidden rounded-3xl border border-white/70 bg-white/80 px-4 py-3 text-sm text-slate-600 shadow-soft md:block">
                Keep the math gentle.
              </div>
            </div>

            <p className="max-w-2xl text-base leading-7 text-slate-600">
              Create a group, add expenses, invite friends with a link, and keep balances readable without losing the
              human side of sharing money.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" className="btn-primary" onClick={jumpToAuth}>
                Start with your first group <ArrowRight className="ml-2 h-4 w-4" />
              </button>
              <button type="button" className="btn-secondary" onClick={handleGoogle} disabled={submitting}>
                Continue with Google
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <FeatureCard
                icon={<Wallet className="h-5 w-5" />}
                title="Clear splits"
                text="Split equally, by exact amount, by percentage, or by shares with built-in checks."
              />
              <FeatureCard
                icon={<Users className="h-5 w-5" />}
                title="Invite your people"
                text="Start a group once, share the link, and keep everyone looking at the same balances."
              />
              <FeatureCard
                icon={<ShieldCheck className="h-5 w-5" />}
                title="Private by default"
                text="Your groups stay visible only to the people who belong in them."
              />
            </div>
          </section>

          <section id="auth-card" className="card self-start">
            <div>
              <p className="text-sm uppercase tracking-[0.22em] text-moss">Get Started</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
                Sign in once and pick up where your group left off.
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Use email or Google to create your account, join a group, and keep your balances in one place.
              </p>
            </div>

            <div className="inline-flex rounded-2xl bg-slate-100 p-1">
              <button
                type="button"
                className={`rounded-2xl px-4 py-2 text-sm font-medium ${mode === "login" ? "bg-white text-slate-900 shadow" : "text-slate-600"}`}
                onClick={() => setMode("login")}
              >
                Login
              </button>
              <button
                type="button"
                className={`rounded-2xl px-4 py-2 text-sm font-medium ${mode === "signup" ? "bg-white text-slate-900 shadow" : "text-slate-600"}`}
                onClick={() => setMode("signup")}
              >
                Sign up
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              {mode === "signup" ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="name">
                    Full name
                  </label>
                  <input
                    id="name"
                    className="field"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your name"
                    required={mode === "signup"}
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className="field"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  className="field"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 6 characters"
                  minLength={6}
                  required
                />
              </div>

              {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

              <button type="submit" className="btn-primary w-full" disabled={submitting}>
                {submitting ? "Working..." : mode === "signup" ? "Create account" : "Log in"}
              </button>
            </form>

            <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              or continue with
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <button type="button" className="btn-secondary w-full" onClick={handleGoogle} disabled={submitting}>
              Continue with Google
            </button>

            <p className="mt-6 text-sm leading-6 text-slate-600">
              Milau is built for everyday shared spending: trips, rent, dinners, and all the small moments in between.
            </p>
            <div className="mt-6 flex items-center gap-2 text-sm font-medium text-moss">
              Your groups, ready when you are <ArrowRight className="h-4 w-4" />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  text
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/75 p-5 shadow-soft">
      <div className="mb-4 inline-flex rounded-2xl bg-moss/10 p-3 text-moss">{icon}</div>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}
