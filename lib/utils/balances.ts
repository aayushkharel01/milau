import {
  CounterpartyBalance,
  CurrencyCode,
  Expense,
  ExpenseParticipant,
  Group,
  MemberBalance,
  Settlement,
  Transfer
} from "@/types";

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function toCents(value: number) {
  return Math.round(value * 100);
}

function fromCents(value: number) {
  return round(value / 100);
}

function isFiniteAmount(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function uniqueParticipantIds(participants: ExpenseParticipant[]) {
  return new Set(participants.map((participant) => participant.uid));
}

export function validateParticipants(amount: number, splitMode: Expense["splitMode"], participants: ExpenseParticipant[]) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Expense amount must be greater than zero.");
  }

  if (!participants.length) {
    throw new Error("Select at least one participant.");
  }

  if (uniqueParticipantIds(participants).size !== participants.length) {
    throw new Error("A member was included more than once in this split.");
  }

  participants.forEach((participant) => {
    if (!participant.uid) {
      throw new Error("Each participant must have a valid member.");
    }

    if (!Number.isFinite(participant.value)) {
      throw new Error("Split values must be valid numbers.");
    }

    if (participant.value < 0) {
      throw new Error("Split values cannot be negative.");
    }

    if (splitMode === "shares" && participant.value <= 0) {
      throw new Error("Every included share must be greater than zero.");
    }
  });

  const total = participants.reduce((sum, participant) => sum + Number(participant.value || 0), 0);

  if (splitMode === "equal") {
    return;
  }

  if (splitMode === "exact" && toCents(total) !== toCents(amount)) {
    throw new Error("Exact amounts must add up to the full expense.");
  }

  if (splitMode === "percentage" && round(total) !== 100) {
    throw new Error("Percentages must add up to 100.");
  }

  if (splitMode === "shares" && total <= 0) {
    throw new Error("Shares must add up to more than zero.");
  }
}

function allocateByWeights(expenseAmount: number, weights: Array<{ uid: string; weight: number }>) {
  const totalWeight = weights.reduce((sum, entry) => sum + entry.weight, 0);
  const totalCents = toCents(expenseAmount);

  if (totalWeight <= 0) {
    throw new Error("Split weights must add up to more than zero.");
  }

  const preliminary = weights.map((entry) => {
    const exactCents = (entry.weight / totalWeight) * totalCents;
    const floorCents = Math.floor(exactCents);
    return {
      uid: entry.uid,
      cents: floorCents,
      remainder: exactCents - floorCents
    };
  });

  let centsLeft = totalCents - preliminary.reduce((sum, entry) => sum + entry.cents, 0);
  preliminary
    .sort((left, right) => right.remainder - left.remainder)
    .forEach((entry) => {
      if (centsLeft <= 0) return;
      entry.cents += 1;
      centsLeft -= 1;
    });

  return preliminary
    .sort((left, right) => weights.findIndex((item) => item.uid === left.uid) - weights.findIndex((item) => item.uid === right.uid))
    .map((entry) => ({
      uid: entry.uid,
      share: fromCents(entry.cents)
    }));
}

export function normalizedShares(expense: Expense) {
  validateParticipants(expense.amount, expense.splitMode, expense.participants);

  if (expense.splitMode === "equal") {
    return allocateByWeights(
      expense.amount,
      expense.participants.map((participant) => ({
        uid: participant.uid,
        weight: 1
      }))
    );
  }

  if (expense.splitMode === "exact") {
    return expense.participants.map((participant) => ({
      uid: participant.uid,
      share: round(participant.value)
    }));
  }

  if (expense.splitMode === "percentage") {
    return allocateByWeights(
      expense.amount,
      expense.participants.map((participant) => ({
        uid: participant.uid,
        weight: participant.value
      }))
    );
  }

  return allocateByWeights(
    expense.amount,
    expense.participants.map((participant) => ({
      uid: participant.uid,
      weight: participant.value
    }))
  );
}

export function validateSettlement(
  group: Group,
  settlement: Pick<Settlement, "fromUserId" | "toUserId" | "amount" | "currency">
) {
  if (!Number.isFinite(settlement.amount) || settlement.amount <= 0) {
    throw new Error("Settlement amount must be greater than zero.");
  }

  if (settlement.fromUserId === settlement.toUserId) {
    throw new Error("Choose two different members for a settlement.");
  }

  if (!group.memberIds.includes(settlement.fromUserId) || !group.memberIds.includes(settlement.toUserId)) {
    throw new Error("Both settlement members must belong to the group.");
  }

  if (settlement.currency !== group.currency) {
    throw new Error("Settlements must use the group's currency.");
  }
}

export function calculateGroupBalances(group: Group, expenses: Expense[], settlements: Settlement[] = []) {
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

  settlements
    .filter((settlement) => settlement.groupId === group.id)
    .forEach((settlement) => {
      ledger.set(settlement.fromUserId, round((ledger.get(settlement.fromUserId) ?? 0) + settlement.amount));
      ledger.set(settlement.toUserId, round((ledger.get(settlement.toUserId) ?? 0) - settlement.amount));
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

    if (amount <= 0) {
      break;
    }

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

function applyDelta(
  ledger: Map<string, number>,
  key: string,
  delta: number
) {
  ledger.set(key, round((ledger.get(key) ?? 0) + delta));
}

export function calculateOverallBalances(
  currentUserId: string,
  expenses: Expense[],
  settlements: Settlement[] = []
) {
  const counterparties = new Map<string, number>();

  expenses.forEach((expense) => {
    const shares = normalizedShares(expense);

    shares.forEach(({ uid, share }) => {
      if (uid === expense.paidBy) return;

      const keyFor = (otherUid: string) => `${otherUid}:${expense.currency}`;

      if (expense.paidBy === currentUserId) {
        applyDelta(counterparties, keyFor(uid), share);
      }

      if (uid === currentUserId) {
        applyDelta(counterparties, keyFor(expense.paidBy), -share);
      }
    });
  });

  settlements.forEach((settlement) => {
    const keyFor = (otherUid: string) => `${otherUid}:${settlement.currency}`;

    if (settlement.fromUserId === currentUserId) {
      applyDelta(counterparties, keyFor(settlement.toUserId), settlement.amount);
    }

    if (settlement.toUserId === currentUserId) {
      applyDelta(counterparties, keyFor(settlement.fromUserId), -settlement.amount);
    }
  });

  return Array.from(counterparties.entries())
    .map(([key, net]) => {
      const [uid, currency] = key.split(":");
      return {
        uid,
        currency: currency as CurrencyCode,
        net
      };
    })
    .filter((entry) => Math.abs(entry.net) > 0.01)
    .sort((left, right) => Math.abs(right.net) - Math.abs(left.net)) as CounterpartyBalance[];
}

export function currentUserTotals(
  currentUserId: string,
  expenses: Expense[],
  settlements: Settlement[] = []
) {
  const totals = new Map<
    CurrencyCode,
    {
      paid: number;
      owes: number;
      owed: number;
      net: number;
    }
  >();

  const ensureCurrency = (currency: CurrencyCode) => {
    if (!totals.has(currency)) {
      totals.set(currency, { paid: 0, owes: 0, owed: 0, net: 0 });
    }
    return totals.get(currency)!;
  };

  expenses.forEach((expense) => {
    const bucket = ensureCurrency(expense.currency);
    const shares = normalizedShares(expense);

    if (expense.paidBy === currentUserId) {
      bucket.paid += expense.amount;
    }

    shares.forEach(({ uid, share }) => {
      if (uid === currentUserId && uid !== expense.paidBy) {
        bucket.owes += share;
      }

      if (expense.paidBy === currentUserId && uid !== currentUserId) {
        bucket.owed += share;
      }
    });
  });

  settlements.forEach((settlement) => {
    const bucket = ensureCurrency(settlement.currency);

    if (settlement.fromUserId === currentUserId) {
      bucket.owes -= settlement.amount;
    }

    if (settlement.toUserId === currentUserId) {
      bucket.owed -= settlement.amount;
    }
  });

  return Array.from(totals.entries())
    .map(([currency, values]) => ({
      currency,
      paid: round(values.paid),
      owes: round(Math.max(values.owes, 0)),
      owed: round(Math.max(values.owed, 0)),
      net: round(values.owed - values.owes)
    }))
    .filter((entry) => entry.paid || entry.owes || entry.owed || entry.net);
}

export function settlementBoundsForGroup(
  group: Group,
  expenses: Expense[],
  settlements: Settlement[] = []
) {
  const balances = calculateGroupBalances(group, expenses, settlements);
  const debtors = balances.filter((entry) => entry.net < -0.01);
  const creditors = balances.filter((entry) => entry.net > 0.01);

  return {
    balances,
    debtors,
    creditors
  };
}

export function maxSettlementAmountForPair(
  group: Group,
  expenses: Expense[],
  settlements: Settlement[],
  fromUserId: string,
  toUserId: string
) {
  const balances = calculateGroupBalances(group, expenses, settlements);
  const debtor = balances.find((entry) => entry.uid === fromUserId);
  const creditor = balances.find((entry) => entry.uid === toUserId);

  if (!debtor || !creditor || debtor.net >= -0.01 || creditor.net <= 0.01) {
    return 0;
  }

  return round(Math.min(Math.abs(debtor.net), creditor.net));
}

export function isSupportedCurrency(value: string): value is CurrencyCode {
  return ["USD", "EUR", "GBP", "INR", "NPR"].includes(value);
}

export function sanitizeAmount(value: number) {
  return isFiniteAmount(value) ? round(value) : 0;
}
