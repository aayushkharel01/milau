export type CurrencyCode = "USD" | "EUR" | "GBP" | "INR" | "NPR";

export type SplitMode = "equal" | "exact" | "percentage" | "shares";

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  defaultCurrency: CurrencyCode;
  createdAt?: string;
  updatedAt?: string;
};

export type Group = {
  id: string;
  name: string;
  description: string;
  currency: CurrencyCode;
  createdBy: string;
  memberIds: string[];
  inviteCode: string;
  inviteUrl: string;
  createdAt?: string;
  updatedAt?: string;
};

export type GroupInvite = {
  code: string;
  groupId: string;
  createdBy: string;
  active: boolean;
  url: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ExpenseParticipant = {
  uid: string;
  value: number;
};

export type Expense = {
  id: string;
  groupId: string;
  description: string;
  amount: number;
  currency: CurrencyCode;
  paidBy: string;
  splitMode: SplitMode;
  participants: ExpenseParticipant[];
  notes?: string;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ActivityType =
  | "group_created"
  | "member_joined"
  | "expense_added"
  | "expense_updated"
  | "expense_deleted";

export type Activity = {
  id: string;
  groupId: string;
  actorId: string;
  type: ActivityType;
  message: string;
  createdAt?: string;
};

export type NotificationItem = {
  id: string;
  userId: string;
  groupId?: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt?: string;
  type: "invite" | "expense" | "group" | "system";
};

export type Transfer = {
  from: string;
  to: string;
  amount: number;
};

export type MemberBalance = {
  uid: string;
  net: number;
};

export type CounterpartyBalance = {
  uid: string;
  net: number;
};

export type ExpenseFormValues = {
  groupId: string;
  description: string;
  amount: number;
  currency: CurrencyCode;
  paidBy: string;
  splitMode: SplitMode;
  participants: ExpenseParticipant[];
  notes?: string;
};

export type GroupFormValues = {
  name: string;
  description: string;
  currency: CurrencyCode;
};
