"use client";

import { onAuthStateChanged, User } from "firebase/auth";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import { ensureUserProfile, subscribeToCurrentUserProfile } from "@/lib/services/user-service";
import { UserProfile } from "@/types";
import { firestoreMessage, logFirestoreDebug, logFirestoreError } from "@/lib/services/firestore-debug";

type AuthContextValue = {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
};

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
  profile: null,
  loading: true,
  error: null
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return () => {};
    }

    let unsubscribeProfile: () => void = () => {};

    const unsubscribeAuth = onAuthStateChanged(getFirebaseAuth(), async (user) => {
      logFirestoreDebug("authProvider:onAuthStateChanged", { uid: user?.uid || null });
      setFirebaseUser(user);
      setError(null);

      unsubscribeProfile();
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        await ensureUserProfile(user);
      } catch (firestoreError) {
        logFirestoreError("authProvider:ensureUserProfile", firestoreError);
        setProfile({
          uid: user.uid,
          email: user.email || "",
          displayName: user.displayName || user.email?.split("@")[0] || "Milau User",
          photoURL: user.photoURL || "",
          defaultCurrency: "USD"
        });
        setError(firestoreMessage(firestoreError, "We couldn't load your profile right now."));
        setLoading(false);
        return;
      }

      unsubscribeProfile = subscribeToCurrentUserProfile(
        user.uid,
        (nextProfile) => {
          setProfile(
            nextProfile || {
              uid: user.uid,
              email: user.email || "",
              displayName: user.displayName || user.email?.split("@")[0] || "Milau User",
              photoURL: user.photoURL || "",
              defaultCurrency: "USD"
            }
          );
          setLoading(false);
        },
        (firestoreError) => {
          logFirestoreError("authProvider:subscribeToCurrentUserProfile", firestoreError);
          setProfile({
            uid: user.uid,
            email: user.email || "",
            displayName: user.displayName || user.email?.split("@")[0] || "Milau User",
            photoURL: user.photoURL || "",
            defaultCurrency: "USD"
          });
          setError(firestoreMessage(firestoreError, "We couldn't refresh your profile right now."));
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeProfile();
      unsubscribeAuth();
    };
  }, []);

  const value = useMemo(
    () => ({
      firebaseUser,
      profile,
      loading,
      error
    }),
    [firebaseUser, profile, loading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
