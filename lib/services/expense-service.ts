import {
  Timestamp,
  collection,
  deleteDoc,
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
import { Expense, ExpenseFormValues, Group, UserProfile } from "@/types";
import { validateParticipants } from "@/lib/utils/balances";
import { chunk } from "@/lib/utils/helpers";
import { createActivity, createNotificationsForUsers } from "@/lib/services/notification-service";
import { logFirestoreDebug, logFirestoreError } from "@/lib/services/firestore-debug";

function serializeTimestamp(value: unknown) {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  return typeof value === "string" ? value : undefined;
}

function mapExpense(id: string, data: Record<string, unknown>) {
  return {
    id,
    groupId: data.groupId,
    description: data.description,
    amount: Number(data.amount),
    currency: data.currency,
    paidBy: data.paidBy,
    splitMode: data.splitMode,
    participants: data.participants,
    notes: data.notes,
    createdBy: data.createdBy,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt)
  } as Expense;
}

function ensureExpenseInput(input: ExpenseFormValues, group: Group) {
  if (!input.description.trim()) {
    throw new Error("Please enter an expense description.");
  }

  if (!group.memberIds.includes(input.paidBy)) {
    throw new Error("The payer must be a member of the selected group.");
  }

  input.participants.forEach((participant) => {
    if (!group.memberIds.includes(participant.uid)) {
      throw new Error("Every participant must belong to the selected group.");
    }
  });

  validateParticipants(input.amount, input.splitMode, input.participants);
}

async function notifyExpenseMembers(
  actor: UserProfile,
  input: ExpenseFormValues,
  memberNames: Record<string, string>,
  titlePrefix: "New expense" | "Expense updated"
) {
  const participantNames = input.participants.map((participant) => memberNames[participant.uid]).filter(Boolean);

  await createNotificationsForUsers(
    input.participants.map((participant) => participant.uid).filter((uid) => uid !== actor.uid),
    {
      groupId: input.groupId,
      type: "expense",
      title: titlePrefix,
      body: `${actor.displayName} ${titlePrefix === "New expense" ? "added" : "updated"} ${input.description} for ${participantNames.join(", ")}.`,
      link: "/dashboard"
    }
  );
}

export async function createExpense(
  input: ExpenseFormValues,
  actor: UserProfile,
  memberNames: Record<string, string>,
  group: Group
) {
  ensureExpenseInput(input, group);
  logFirestoreDebug("createExpense:start", { groupId: input.groupId, actor: actor.uid, description: input.description });
  const ref = doc(collection(getFirebaseDb(), "expenses"));

  try {
    await setDoc(ref, {
      ...input,
      description: input.description.trim(),
      notes: input.notes?.trim() || "",
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await createActivity({
      groupId: input.groupId,
      actorId: actor.uid,
      type: "expense_added",
      message: `${actor.displayName} added ${input.description.trim()} in ${group.name}`
    });

    await notifyExpenseMembers(actor, input, memberNames, "New expense");
    return ref.id;
  } catch (error) {
    logFirestoreError("createExpense", error);
    throw error;
  }
}

export async function updateExpense(
  expenseId: string,
  input: ExpenseFormValues,
  actor: UserProfile,
  memberNames: Record<string, string>,
  group: Group
) {
  ensureExpenseInput(input, group);
  logFirestoreDebug("updateExpense:start", { expenseId, groupId: input.groupId, actor: actor.uid });
  try {
    await updateDoc(doc(getFirebaseDb(), "expenses", expenseId), {
      ...input,
      description: input.description.trim(),
      notes: input.notes?.trim() || "",
      updatedAt: serverTimestamp()
    });

    await createActivity({
      groupId: input.groupId,
      actorId: actor.uid,
      type: "expense_updated",
      message: `${actor.displayName} updated ${input.description.trim()} in ${group.name}`
    });

    await notifyExpenseMembers(actor, input, memberNames, "Expense updated");
  } catch (error) {
    logFirestoreError("updateExpense", error);
    throw error;
  }
}

export async function deleteExpense(expense: Expense, actor: UserProfile, groupName: string) {
  logFirestoreDebug("deleteExpense:start", { expenseId: expense.id, actor: actor.uid });
  try {
    await deleteDoc(doc(getFirebaseDb(), "expenses", expense.id));
    await createActivity({
      groupId: expense.groupId,
      actorId: actor.uid,
      type: "expense_deleted",
      message: `${actor.displayName} deleted ${expense.description} from ${groupName}`
    });
  } catch (error) {
    logFirestoreError("deleteExpense", error);
    throw error;
  }
}

export async function fetchExpensesForGroupIds(groupIds: string[]) {
  if (!groupIds.length) return [];
  logFirestoreDebug("fetchExpensesForGroupIds:start", { groupIds });

  try {
    const snapshots = await Promise.all(
      chunk(groupIds, 10).map((groupChunk) =>
        getDocs(query(collection(getFirebaseDb(), "expenses"), where("groupId", "in", groupChunk), orderBy("createdAt", "desc")))
      )
    );

    return snapshots
      .flatMap((snapshot) => snapshot.docs.map((entry) => mapExpense(entry.id, entry.data())))
      .sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""));
  } catch (error) {
    logFirestoreError("fetchExpensesForGroupIds", error);
    throw error;
  }
}

export function subscribeToExpenses(
  groupIds: string[],
  onChange: (expenses: Expense[]) => void,
  onError?: (error: Error) => void
) {
  if (!groupIds.length) {
    onChange([]);
    return () => undefined;
  }

  logFirestoreDebug("subscribeToExpenses:start", { groupIds });
  const unsubscribers = chunk(groupIds, 10).map((groupChunk) =>
    onSnapshot(
      query(collection(getFirebaseDb(), "expenses"), where("groupId", "in", groupChunk), orderBy("createdAt", "desc")),
      () => {
        fetchExpensesForGroupIds(groupIds).then(onChange).catch(() => onChange([]));
      },
      (error) => {
        logFirestoreError("subscribeToExpenses", error);
        onError?.(error);
      }
    )
  );

  fetchExpensesForGroupIds(groupIds)
    .then(onChange)
    .catch((error) => {
      onChange([]);
      onError?.(error instanceof Error ? error : new Error("Could not load expenses."));
    });

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}
