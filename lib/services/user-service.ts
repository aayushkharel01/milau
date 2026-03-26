import {
  Timestamp,
  collection,
  documentId,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { updateProfile as updateFirebaseAuthProfile, User } from "firebase/auth";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import { CurrencyCode, UserProfile } from "@/types";
import { chunk } from "@/lib/utils/helpers";
import { logFirestoreDebug, logFirestoreError } from "@/lib/services/firestore-debug";

function serializeTimestamp(value: unknown) {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  return typeof value === "string" ? value : undefined;
}

function mapUserProfile(data: Record<string, unknown>) {
  return {
    uid: data.uid,
    email: data.email,
    displayName: data.displayName,
    photoURL: data.photoURL,
    defaultCurrency: (data.defaultCurrency || "USD") as CurrencyCode,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt)
  } as UserProfile;
}

export async function ensureUserProfile(user: User) {
  logFirestoreDebug("ensureUserProfile:start", { uid: user.uid });
  const ref = doc(getFirebaseDb(), "users", user.uid);

  const payload = {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || user.email?.split("@")[0] || "Milau User",
    photoURL: user.photoURL || "",
    updatedAt: serverTimestamp()
  };

  try {
    const existing = await getDoc(ref);

    if (!existing.exists()) {
      logFirestoreDebug("ensureUserProfile:create", { uid: user.uid });
      await setDoc(ref, {
        ...payload,
        defaultCurrency: "USD" as CurrencyCode,
        createdAt: serverTimestamp()
      });
      return;
    }

    logFirestoreDebug("ensureUserProfile:update", { uid: user.uid });
    await updateDoc(ref, payload);
  } catch (error) {
    logFirestoreError("ensureUserProfile", error);
    throw error;
  }
}

export async function getUserProfile(uid: string) {
  logFirestoreDebug("getUserProfile:start", { uid });
  try {
    const snapshot = await getDoc(doc(getFirebaseDb(), "users", uid));
    if (!snapshot.exists()) return null;
    return mapUserProfile(snapshot.data());
  } catch (error) {
    logFirestoreError("getUserProfile", error);
    throw error;
  }
}

export async function updateUserProfile(uid: string, updates: Pick<UserProfile, "displayName" | "defaultCurrency">) {
  if (!updates.displayName.trim()) {
    throw new Error("Please enter a display name.");
  }

  logFirestoreDebug("updateUserProfile:start", { uid });

  try {
    await updateDoc(doc(getFirebaseDb(), "users", uid), {
      displayName: updates.displayName.trim(),
      defaultCurrency: updates.defaultCurrency,
      updatedAt: serverTimestamp()
    });

    const currentUser = getFirebaseAuth().currentUser;
    if (currentUser && currentUser.uid === uid && currentUser.displayName !== updates.displayName.trim()) {
      await updateFirebaseAuthProfile(currentUser, {
        displayName: updates.displayName.trim()
      });
    }
  } catch (error) {
    logFirestoreError("updateUserProfile", error);
    throw error;
  }
}

export function subscribeToCurrentUserProfile(
  uid: string,
  onChange: (profile: UserProfile | null) => void,
  onError?: (error: Error) => void
) {
  logFirestoreDebug("subscribeToCurrentUserProfile:start", { uid });
  return onSnapshot(
    doc(getFirebaseDb(), "users", uid),
    (snapshot) => {
      logFirestoreDebug("subscribeToCurrentUserProfile:update", {
        uid,
        exists: snapshot.exists()
      });
      onChange(snapshot.exists() ? mapUserProfile(snapshot.data()) : null);
    },
    (error) => {
      logFirestoreError("subscribeToCurrentUserProfile", error);
      onError?.(error);
    }
  );
}

export function subscribeToUserProfiles(
  uids: string[],
  onChange: (profiles: UserProfile[]) => void,
  onError?: (error: Error) => void
) {
  if (!uids.length) {
    onChange([]);
    return () => undefined;
  }

  logFirestoreDebug("subscribeToUserProfiles:start", { count: uids.length, uids });
  const cache = new Map<string, UserProfile>();
  const unsubscribers = chunk(uids, 10).map((uidChunk) =>
    onSnapshot(
      query(collection(getFirebaseDb(), "users"), where(documentId(), "in", uidChunk)),
      (snapshot) => {
        logFirestoreDebug("subscribeToUserProfiles:update", { chunk: uidChunk, docs: snapshot.docs.length });
        snapshot.docs.forEach((entry) => {
          cache.set(entry.id, mapUserProfile(entry.data()));
        });
        onChange(Array.from(cache.values()));
      },
      (error) => {
        logFirestoreError("subscribeToUserProfiles", error);
        onError?.(error);
      }
    )
  );

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}
