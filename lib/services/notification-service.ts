import {
  Timestamp,
  collection,
  doc,
  getDocs,
  onSnapshot,
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
    userId: typeof data.userId === "string" ? data.userId : "",
    groupId: typeof data.groupId === "string" ? data.groupId : undefined,
    title: typeof data.title === "string" ? data.title : "",
    body: typeof data.body === "string" ? data.body : "",
    read: data.read,
    link: typeof data.link === "string" ? data.link : undefined,
    type: data.type as NotificationItem["type"],
    createdAt: serializeTimestamp(data.createdAt)
  } as NotificationItem;
}

function mapActivity(id: string, data: Record<string, unknown>) {
  return {
    id,
    groupId: typeof data.groupId === "string" ? data.groupId : "",
    actorId: typeof data.actorId === "string" ? data.actorId : "",
    type: data.type as Activity["type"],
    message: typeof data.message === "string" ? data.message : "",
    createdAt: serializeTimestamp(data.createdAt)
  } as Activity;
}

function sortByCreatedAtDesc<T extends { createdAt?: string }>(items: T[]) {
  return [...items].sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""));
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
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (!uniqueUserIds.length) {
    return;
  }

  logFirestoreDebug("createNotificationsForUsers:start", { userIds: uniqueUserIds, groupId: input.groupId, type: input.type });
  try {
    await Promise.all(
      uniqueUserIds.map(async (userId) => {
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
  logFirestoreDebug("subscribeToNotifications:start", {
    uid,
    collection: "notifications",
    field: "userId",
    operator: "=="
  });
  return onSnapshot(
    query(collection(getFirebaseDb(), "notifications"), where("userId", "==", uid)),
    (snapshot) => {
      const items = sortByCreatedAtDesc(snapshot.docs.map((entry) => mapNotification(entry.id, entry.data())));
      logFirestoreDebug("subscribeToNotifications:update", { uid, docs: items.length });
      onChange(items);
    },
    (error) => {
      logFirestoreError("subscribeToNotifications", error);
      onChange([]);
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
          getDocs(query(collection(getFirebaseDb(), "activities"), where("groupId", "in", groupChunk)))
        )
      );

      return sortByCreatedAtDesc(snapshots.flatMap((snapshot) => snapshot.docs.map((entry) => mapActivity(entry.id, entry.data()))));
    } catch (error) {
      logFirestoreError("fetchActivities", error);
      throw error;
    }
  };

  const unsubscribers = chunk(groupIds, 10).map((groupChunk) =>
    onSnapshot(
      query(collection(getFirebaseDb(), "activities"), where("groupId", "in", groupChunk)),
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
