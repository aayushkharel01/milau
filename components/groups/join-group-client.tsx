"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/providers/auth-provider";
import { userFacingMessage } from "@/lib/services/firestore-debug";
import { joinGroupByInviteCode } from "@/lib/services/group-service";

export function JoinGroupClient({ code }: { code: string }) {
  const { firebaseUser, loading: authLoading, profile } = useAuth();
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (authLoading || firebaseUser) return;
    window.localStorage.setItem("milau-post-auth-path", `/join/${code}`);
    router.replace("/");
  }, [authLoading, code, firebaseUser, router]);

  const handleJoin = async () => {
    if (!profile) return;
    setJoining(true);
    setMessage("");

    try {
      await joinGroupByInviteCode(code, profile);
      setMessage("You joined the group successfully.");
      router.push("/dashboard");
    } catch (error) {
      setMessage(userFacingMessage(error, "We couldn't join that group right now."));
    } finally {
      setJoining(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-12">
      <div className="card w-full space-y-6">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-moss">Invite Link</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Join a Milau group</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Join this shared expense group with the account you want to keep inside the group.
          </p>
        </div>
        <div className="rounded-3xl bg-slate-950 px-5 py-4 text-sm text-white">
          Code: <span className="font-semibold tracking-[0.16em]">{code}</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-primary" onClick={handleJoin} disabled={joining || !profile}>
            {joining ? "Joining..." : "Join group"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => router.push("/dashboard")}>
            Back to dashboard
          </button>
        </div>
        {message ? <p className="text-sm text-slate-600">{message}</p> : null}
        {!profile && authLoading ? <p className="text-sm text-slate-500">Checking your account...</p> : null}
      </div>
    </main>
  );
}
