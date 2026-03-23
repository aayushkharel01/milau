import {
  Timestamp,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Activity, NotificationItem } from "@/types";
import { chunk } from "@/lib/utils/helpers";
import { logFirestoreDebug, logFirestoreError } from "@/lib/services/firestore-debug";

function serializeTimestamp(value: unknown) {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  return typeof value === "string" ? value : undefined;
}

function mapNotification(id: string, data: Record<string, unknown>) {
  return {
    id,
    userId: data.userId,
    groupId: data.groupId,
    title: data.title,
    body: data.body,
    read: data.read,
    link: data.link,
    type: data.type,
    createdAt: serializeTimestamp(data.createdAt)
  } as NotificationItem;
}

function mapActivity(id: string, data: Record<string, unknown>) {
  return {
    id,
    groupId: data.groupId,
    actorId: data.actorId,
    type: data.type,
    message: data.message,
    createdAt: serializeTimestamp(data.createdAt)
  } as Activity;
}

export async function createActivity(activity: Omit<Activity, "id" | "createdAt">) {
  logFirestoreDebug("createActivity:start", { groupId: activity.groupId, type: activity.type });
  try {
    const ref = doc(collection(getFirebaseDb(), "activities"));
    await setDoc(ref, {
      ...activity,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    logFirestoreError("createActivity", error);
    throw error;
  }
}

export async function createNotificationsForUsers(
  userIds: string[],
  input: Pick<NotificationItem, "title" | "body" | "type" | "link" | "groupId">
) {
  logFirestoreDebug("createNotificationsForUsers:start", { userIds, groupId: input.groupId, type: input.type });
  try {
    await Promise.all(
      userIds.map(async (userId) => {
        const ref = doc(collection(getFirebaseDb(), "notifications"));
        await setDoc(ref, {
          userId,
          groupId: input.groupId,
          title: input.title,
          body: input.body,
          type: input.type,
          link: input.link || "/dashboard",
          read: false,
          createdAt: serverTimestamp()
        });
      })
    );
  } catch (error) {
    logFirestoreError("createNotificationsForUsers", error);
    throw error;
  }
}

export function subscribeToNotifications(
  uid: string,
  onChange: (items: NotificationItem[]) => void,
  onError?: (error: Error) => void
) {
  logFirestoreDebug("subscribeToNotifications:start", { uid });
  return onSnapshot(
    query(collection(getFirebaseDb(), "notifications"), where("userId", "==", uid), orderBy("createdAt", "desc")),
    (snapshot) => {
      logFirestoreDebug("subscribeToNotifications:update", { uid, docs: snapshot.docs.length });
      onChange(snapshot.docs.map((entry) => mapNotification(entry.id, entry.data())));
    },
    (error) => {
      logFirestoreError("subscribeToNotifications", error);
      onError?.(error);
    }
  );
}

export async function markNotificationAsRead(id: string) {
  logFirestoreDebug("markNotificationAsRead:start", { id });
  try {
    await updateDoc(doc(getFirebaseDb(), "notifications", id), {
      read: true
    });
  } catch (error) {
    logFirestoreError("markNotificationAsRead", error);
    throw error;
  }
}

export function subscribeToActivities(
  groupIds: string[],
  onChange: (items: Activity[]) => void,
  onError?: (error: Error) => void
) {
  if (!groupIds.length) {
    onChange([]);
    return () => undefined;
  }

  logFirestoreDebug("subscribeToActivities:start", { groupIds });
  const fetchActivities = async () => {
    try {
      const snapshots = await Promise.all(
        chunk(groupIds, 10).map((groupChunk) =>
          getDocs(query(collection(getFirebaseDb(), "activities"), where("groupId", "in", groupChunk), orderBy("createdAt", "desc")))
        )
      );

      return snapshots
        .flatMap((snapshot) => snapshot.docs.map((entry) => mapActivity(entry.id, entry.data())))
        .sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""));
    } catch (error) {
      logFirestoreError("fetchActivities", error);
      throw error;
    }
  };

  const unsubscribers = chunk(groupIds, 10).map((groupChunk) =>
    onSnapshot(
      query(collection(getFirebaseDb(), "activities"), where("groupId", "in", groupChunk), orderBy("createdAt", "desc")),
      () => {
        fetchActivities().then(onChange).catch(() => onChange([]));
      },
      (error) => {
        logFirestoreError("subscribeToActivities", error);
        onError?.(error);
      }
    )
  );

  fetchActivities()
    .then(onChange)
    .catch((error) => {
      onChange([]);
      onError?.(error instanceof Error ? error : new Error("Could not load activity."));
    });

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}
