import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Expense, Group, Settlement, SettlementFormValues, UserProfile } from "@/types";
import { chunk } from "@/lib/utils/helpers";
import { maxSettlementAmountForPair, validateSettlement } from "@/lib/utils/balances";
import { createActivity, createNotificationsForUsers } from "@/lib/services/notification-service";
import { logFirestoreDebug, logFirestoreError } from "@/lib/services/firestore-debug";

function serializeTimestamp(value: unknown) {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  return typeof value === "string" ? value : undefined;
}

function mapSettlement(id: string, data: Record<string, unknown>) {
  return {
    id,
    groupId: typeof data.groupId === "string" ? data.groupId : "",
    fromUserId: typeof data.fromUserId === "string" ? data.fromUserId : "",
    toUserId: typeof data.toUserId === "string" ? data.toUserId : "",
    amount: Number(data.amount),
    currency: typeof data.currency === "string" ? data.currency : "USD",
    note: typeof data.note === "string" ? data.note : "",
    createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt)
  } as Settlement;
}

function sortSettlements(items: Settlement[]) {
  return [...items].sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""));
}

export async function createSettlement(
  input: SettlementFormValues,
  actor: UserProfile,
  memberNames: Record<string, string>,
  group: Group,
  expenses: Expense[],
  settlements: Settlement[]
) {
  validateSettlement(group, input);

  const maxAmount = maxSettlementAmountForPair(group, expenses, settlements, input.fromUserId, input.toUserId);
  if (maxAmount <= 0) {
    throw new Error("That settlement pair does not currently have an outstanding balance.");
  }

  if (input.amount - maxAmount > 0.01) {
    throw new Error(`That amount is too high. The largest valid settlement right now is ${maxAmount.toFixed(2)} ${group.currency}.`);
  }

  const ref = doc(collection(getFirebaseDb(), "settlements"));
  logFirestoreDebug("createSettlement:start", { groupId: group.id, actor: actor.uid });

  try {
    await setDoc(ref, {
      groupId: group.id,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      amount: input.amount,
      currency: group.currency,
      note: input.note?.trim() || "",
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await createActivity({
      groupId: group.id,
      actorId: actor.uid,
      type: "settlement_added",
      message: `${memberNames[input.fromUserId] || input.fromUserId} settled ${group.currency} ${input.amount.toFixed(2)} with ${memberNames[input.toUserId] || input.toUserId} in ${group.name}`
    });

    await createNotificationsForUsers(
      [input.fromUserId, input.toUserId].filter((uid) => uid !== actor.uid),
      {
        groupId: group.id,
        type: "expense",
        title: "Settlement recorded",
        body: `${memberNames[input.fromUserId] || input.fromUserId} paid ${memberNames[input.toUserId] || input.toUserId} ${group.currency} ${input.amount.toFixed(2)}.`,
        link: "/dashboard"
      }
    );

    return ref.id;
  } catch (error) {
    logFirestoreError("createSettlement", error);
    throw error;
  }
}

export async function deleteSettlement(settlement: Settlement, actor: UserProfile, groupName: string) {
  logFirestoreDebug("deleteSettlement:start", { settlementId: settlement.id, actor: actor.uid });

  try {
    await deleteDoc(doc(getFirebaseDb(), "settlements", settlement.id));
    await createActivity({
      groupId: settlement.groupId,
      actorId: actor.uid,
      type: "settlement_deleted",
      message: `${actor.displayName} deleted a settlement from ${groupName}`
    });
  } catch (error) {
    logFirestoreError("deleteSettlement", error);
    throw error;
  }
}

export async function fetchSettlementsForGroupIds(groupIds: string[]) {
  if (!groupIds.length) return [];
  logFirestoreDebug("fetchSettlementsForGroupIds:start", { groupIds });

  try {
    const snapshots = await Promise.all(
      chunk(groupIds, 10).map((groupChunk) =>
        getDocs(query(collection(getFirebaseDb(), "settlements"), where("groupId", "in", groupChunk)))
      )
    );

    return sortSettlements(snapshots.flatMap((snapshot) => snapshot.docs.map((entry) => mapSettlement(entry.id, entry.data()))));
  } catch (error) {
    logFirestoreError("fetchSettlementsForGroupIds", error);
    throw error;
  }
}

export function subscribeToSettlements(
  groupIds: string[],
  onChange: (items: Settlement[]) => void,
  onError?: (error: Error) => void
) {
  if (!groupIds.length) {
    onChange([]);
    return () => undefined;
  }

  const unsubscribers = chunk(groupIds, 10).map((groupChunk) =>
    onSnapshot(
      query(collection(getFirebaseDb(), "settlements"), where("groupId", "in", groupChunk)),
      () => {
        fetchSettlementsForGroupIds(groupIds).then(onChange).catch(() => onChange([]));
      },
      (error) => {
        logFirestoreError("subscribeToSettlements", error);
        onError?.(error);
      }
    )
  );

  fetchSettlementsForGroupIds(groupIds)
    .then(onChange)
    .catch((error) => {
      onChange([]);
      onError?.(error instanceof Error ? error : new Error("Could not load settlements."));
    });

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}
