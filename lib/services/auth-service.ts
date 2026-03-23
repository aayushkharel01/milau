import { FirebaseError } from "firebase/app";
import {
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from "firebase/auth";
import { firebaseAuthDomain, firebaseProjectId, getFirebaseAuth, getGoogleProvider } from "@/lib/firebase/client";
import { ensureUserProfile } from "@/lib/services/user-service";

function friendlyAuthError(error: unknown, provider: "email" | "google") {
  if (!(error instanceof FirebaseError)) {
    return error instanceof Error ? error : new Error("Authentication failed. Please try again.");
  }

  if (error.code === "auth/configuration-not-found" || error.code === "auth/operation-not-allowed") {
    const providerLabel = provider === "google" ? "Google" : "Email/Password";
    return new Error(
      `${providerLabel} sign-in is not enabled in Firebase Authentication for project "${firebaseProjectId || "unknown"}". Open Firebase Console > Authentication > Sign-in method, enable ${providerLabel}, and make sure "${firebaseAuthDomain || "your auth domain"}", "localhost", and "127.0.0.1" are in Authorized domains.`
    );
  }

  if (error.code === "auth/popup-closed-by-user") {
    return new Error("The Google sign-in popup was closed before completion.");
  }

  if (error.code === "auth/popup-blocked") {
    return new Error("The Google sign-in popup was blocked by the browser. Allow popups and try again.");
  }

  if (error.code === "auth/invalid-email") {
    return new Error("That email address is invalid.");
  }

  if (error.code === "auth/email-already-in-use") {
    return new Error("That email is already registered. Try logging in instead.");
  }

  if (
    error.code === "auth/invalid-credential" ||
    error.code === "auth/wrong-password" ||
    error.code === "auth/user-not-found"
  ) {
    return new Error("Incorrect email or password.");
  }

  if (error.code === "auth/weak-password") {
    return new Error("Password should be at least 6 characters long.");
  }

  return new Error(error.message || "Authentication failed. Please try again.");
}

export async function signUpWithEmail(name: string, email: string, password: string) {
  try {
    const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    await updateProfile(credential.user, { displayName: name });
    await ensureUserProfile(credential.user);
  } catch (error) {
    throw friendlyAuthError(error, "email");
  }
}

export async function signInWithEmail(email: string, password: string) {
  try {
    const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    await ensureUserProfile(credential.user);
  } catch (error) {
    throw friendlyAuthError(error, "email");
  }
}

export async function signInWithGoogle() {
  try {
    const credential = await signInWithPopup(getFirebaseAuth(), getGoogleProvider());
    await ensureUserProfile(credential.user);
  } catch (error) {
    throw friendlyAuthError(error, "google");
  }
}

export async function signOutUser() {
  await signOut(getFirebaseAuth());
}

export function profileName(user: User) {
  return user.displayName?.trim() || user.email?.split("@")[0] || "Milau User";
}
