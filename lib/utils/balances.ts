import { CounterpartyBalance, Expense, ExpenseParticipant, Group, MemberBalance, Transfer } from "@/types";

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function validateParticipants(amount: number, splitMode: Expense["splitMode"], participants: ExpenseParticipant[]) {
  if (!participants.length) {
    throw new Error("Select at least one participant.");
  }

  if (amount <= 0) {
    throw new Error("Expense amount must be greater than zero.");
  }

  const total = participants.reduce((sum, participant) => sum + Number(participant.value || 0), 0);

  if (splitMode === "equal") {
    return;
  }

  if (splitMode === "exact" && round(total) !== round(amount)) {
    throw new Error("Exact amounts must add up to the full expense.");
  }

  if (splitMode === "percentage" && round(total) !== 100) {
    throw new Error("Percentages must add up to 100.");
  }

  if (splitMode === "shares" && total <= 0) {
    throw new Error("Shares must be greater than zero.");
  }
}

export function normalizedShares(expense: Expense) {
  validateParticipants(expense.amount, expense.splitMode, expense.participants);

  if (expense.splitMode === "equal") {
    const perHead = round(expense.amount / expense.participants.length);
    const adjustment = round(expense.amount - perHead * expense.participants.length);

    return expense.participants.map((participant, index) => ({
      uid: participant.uid,
      share: round(perHead + (index === 0 ? adjustment : 0))
    }));
  }

  if (expense.splitMode === "exact") {
    return expense.participants.map((participant) => ({
      uid: participant.uid,
      share: round(participant.value)
    }));
  }

  if (expense.splitMode === "percentage") {
    return expense.participants.map((participant) => ({
      uid: participant.uid,
      share: round((expense.amount * participant.value) / 100)
    }));
  }

  const totalShares = expense.participants.reduce((sum, participant) => sum + participant.value, 0);
  return expense.participants.map((participant) => ({
    uid: participant.uid,
    share: round((expense.amount * participant.value) / totalShares)
  }));
}

export function calculateGroupBalances(group: Group, expenses: Expense[]) {
  const ledger = new Map<string, number>();

  group.memberIds.forEach((uid) => ledger.set(uid, 0));

  expenses
    .filter((expense) => expense.groupId === group.id)
    .forEach((expense) => {
      const shares = normalizedShares(expense);

      shares.forEach(({ uid, share }) => {
        ledger.set(uid, round((ledger.get(uid) ?? 0) - share));
      });

      ledger.set(expense.paidBy, round((ledger.get(expense.paidBy) ?? 0) + expense.amount));
    });

  return Array.from(ledger.entries()).map(([uid, net]) => ({
    uid,
    net: round(net)
  }));
}

export function simplifyDebts(balances: MemberBalance[]) {
  const creditors = balances
    .filter((entry) => entry.net > 0.01)
    .map((entry) => ({ ...entry }))
    .sort((left, right) => right.net - left.net);

  const debtors = balances
    .filter((entry) => entry.net < -0.01)
    .map((entry) => ({ uid: entry.uid, net: Math.abs(entry.net) }))
    .sort((left, right) => right.net - left.net);

  const transfers: Transfer[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = round(Math.min(creditor.net, debtor.net));

    transfers.push({
      from: debtor.uid,
      to: creditor.uid,
      amount
    });

    creditor.net = round(creditor.net - amount);
    debtor.net = round(debtor.net - amount);

    if (creditor.net <= 0.01) creditorIndex += 1;
    if (debtor.net <= 0.01) debtorIndex += 1;
  }

  return transfers;
}

export function calculateOverallBalances(currentUserId: string, expenses: Expense[]) {
  const counterparties = new Map<string, number>();

  expenses.forEach((expense) => {
    const shares = normalizedShares(expense);

    shares.forEach(({ uid, share }) => {
      if (uid === expense.paidBy) return;

      if (expense.paidBy === currentUserId) {
        counterparties.set(uid, round((counterparties.get(uid) ?? 0) + share));
      }

      if (uid === currentUserId) {
        counterparties.set(expense.paidBy, round((counterparties.get(expense.paidBy) ?? 0) - share));
      }
    });
  });

  return Array.from(counterparties.entries())
    .filter(([, net]) => Math.abs(net) > 0.01)
    .map(([uid, net]) => ({ uid, net }))
    .sort((left, right) => Math.abs(right.net) - Math.abs(left.net)) as CounterpartyBalance[];
}

export function currentUserTotals(currentUserId: string, expenses: Expense[]) {
  let paid = 0;
  let owes = 0;
  let owed = 0;

  expenses.forEach((expense) => {
    const shares = normalizedShares(expense);
    if (expense.paidBy === currentUserId) {
      paid += expense.amount;
    }

    shares.forEach(({ uid, share }) => {
      if (uid === currentUserId && uid !== expense.paidBy) {
        owes += share;
      }

      if (expense.paidBy === currentUserId && uid !== currentUserId) {
        owed += share;
      }
    });
  });

  return {
    paid: round(paid),
    owes: round(owes),
    owed: round(owed),
    net: round(owed - owes)
  };
}
