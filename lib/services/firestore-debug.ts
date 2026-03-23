export function logFirestoreDebug(scope: string, detail?: unknown) {
  console.info(`[Firestore] ${scope}`, detail ?? "");
}

export function logFirestoreError(scope: string, error: unknown) {
  console.error(`[Firestore] ${scope} failed`, error);
}

export function firestoreMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    if (
      error.message.includes("offline") ||
      error.message.includes("client is offline") ||
      error.message.includes("Failed to get document because the client is offline")
    ) {
      return "We couldn't load the latest data right now. Please check your connection and try again.";
    }

    return fallback;
  }

  return fallback;
}

export function userFacingMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.trim();
  const technicalPattern =
    /firebase|firestore|auth\/|permission-denied|network-request-failed|service is unavailable|client is offline|internal|failed-precondition|unavailable/i;

  if (technicalPattern.test(message)) {
    return firestoreMessage(error, fallback);
  }

  return message || fallback;
}
