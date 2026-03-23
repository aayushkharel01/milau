"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useAuth } from "@/lib/providers/auth-provider";
import { userFacingMessage } from "@/lib/services/firestore-debug";
import { joinGroupByInviteCode } from "@/lib/services/group-service";

export function JoinGroupClient({ code }: { code: string }) {
  const { profile } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleJoin = async () => {
    if (!profile) return;
    setLoading(true);
    setMessage("");

    try {
      await joinGroupByInviteCode(code, profile);
      setMessage("You joined the group successfully.");
      router.push("/dashboard");
    } catch (error) {
      setMessage(userFacingMessage(error, "We couldn't join that group right now."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthGuard>
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
            <button type="button" className="btn-primary" onClick={handleJoin} disabled={loading}>
              {loading ? "Joining..." : "Join group"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => router.push("/dashboard")}>
              Back to dashboard
            </button>
          </div>
          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
        </div>
      </main>
    </AuthGuard>
  );
}
