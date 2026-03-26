"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Copy,
  FolderKanban,
  Loader2,
  LogOut,
  Menu,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCcw,
  Send,
  Trash2,
  UserCircle2,
  UserMinus,
  UserPlus,
  Users
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/providers/auth-provider";
import { signOutUser } from "@/lib/services/auth-service";
import { createExpense, deleteExpense, subscribeToExpenses, updateExpense } from "@/lib/services/expense-service";
import { createGroup, fetchGroupsForUser, joinGroupByInviteCode, leaveGroup, refreshGroupInvite, subscribeToGroups } from "@/lib/services/group-service";
import {
  markNotificationAsRead,
  subscribeToActivities,
  subscribeToNotifications
} from "@/lib/services/notification-service";
import {
  createSettlement,
  deleteSettlement,
  subscribeToSettlements
} from "@/lib/services/settlement-service";
import { subscribeToUserProfiles, updateUserProfile } from "@/lib/services/user-service";
import {
  calculateGroupBalances,
  calculateOverallBalances,
  currentUserTotals,
  maxSettlementAmountForPair,
  normalizedShares,
  sanitizeAmount,
  settlementBoundsForGroup,
  simplifyDebts
} from "@/lib/utils/balances";
import { currencyLabels, currencyOptions, formatCurrency } from "@/lib/utils/currency";
import { cn, dateTimeLabel, initials } from "@/lib/utils/helpers";
import { firestoreMessage, userFacingMessage } from "@/lib/services/firestore-debug";
import {
  Activity,
  CounterpartyBalance,
  CurrencyCode,
  Expense,
  ExpenseFormValues,
  Group,
  GroupFormValues,
  NotificationItem,
  Settlement,
  SettlementFormValues,
  UserProfile
} from "@/types";

type TabKey = "overview" | "groups" | "expenses" | "activity" | "notifications" | "profile";
type Flash = { tone: "success" | "error"; text: string } | null;
type FlashTone = NonNullable<Flash>["tone"];

function buildParticipants(memberIds: string[], splitMode: ExpenseFormValues["splitMode"]) {
  const count = memberIds.length || 1;
  return memberIds.map((uid) => ({
    uid,
    value: splitMode === "percentage" ? Number((100 / count).toFixed(2)) : 1
  }));
}

function emptyExpenseDraft(currency: CurrencyCode): ExpenseFormValues {
  return {
    groupId: "",
    description: "",
    amount: 0,
    currency,
    paidBy: "",
    splitMode: "equal",
    participants: [],
    notes: ""
  };
}

function emptySettlementDraft(currency: CurrencyCode): SettlementFormValues {
  return {
    groupId: "",
    fromUserId: "",
    toUserId: "",
    amount: 0,
    currency,
    note: ""
  };
}

export function DashboardShell() {
  const { profile, error: authError } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [memberProfiles, setMemberProfiles] = useState<UserProfile[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [flash, setFlash] = useState<Flash>(null);
  const [submittingGroup, setSubmittingGroup] = useState(false);
  const [joiningGroup, setJoiningGroup] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [savingSettlement, setSavingSettlement] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [refreshingInviteId, setRefreshingInviteId] = useState("");
  const [leavingGroupId, setLeavingGroupId] = useState("");
  const [groupForm, setGroupForm] = useState<GroupFormValues>({
    name: "",
    description: "",
    currency: profile?.defaultCurrency || "USD"
  });
  const [joinCode, setJoinCode] = useState("");
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expenseDraft, setExpenseDraft] = useState<ExpenseFormValues>(emptyExpenseDraft(profile?.defaultCurrency || "USD"));
  const [settlementDraft, setSettlementDraft] = useState<SettlementFormValues>(emptySettlementDraft(profile?.defaultCurrency || "USD"));
  const [profileForm, setProfileForm] = useState({
    displayName: profile?.displayName || "",
    defaultCurrency: profile?.defaultCurrency || "USD"
  });

  const showFlash = (tone: FlashTone, text: string) => {
    setFlash({ tone, text });
  };

  useEffect(() => {
    if (!profile) return;
    return subscribeToGroups(
      profile.uid,
      setGroups,
      (error) => showFlash("error", firestoreMessage(error, "We couldn't load your groups right now."))
    );
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    return subscribeToNotifications(profile.uid, setNotifications);
  }, [profile]);

  useEffect(() => {
    const groupIds = groups.map((group) => group.id);
    return subscribeToExpenses(
      groupIds,
      setExpenses,
      (error) => showFlash("error", firestoreMessage(error, "We couldn't load your expenses right now."))
    );
  }, [groups]);

  useEffect(() => {
    const groupIds = groups.map((group) => group.id);
    return subscribeToSettlements(
      groupIds,
      setSettlements,
      (error) => showFlash("error", firestoreMessage(error, "We couldn't load your settlements right now."))
    );
  }, [groups]);

  useEffect(() => {
    const groupIds = groups.map((group) => group.id);
    return subscribeToActivities(
      groupIds,
      setActivities,
      (error) => showFlash("error", firestoreMessage(error, "We couldn't load your recent activity right now."))
    );
  }, [groups]);

  useEffect(() => {
    const memberIds = Array.from(new Set(groups.flatMap((group) => group.memberIds)));
    return subscribeToUserProfiles(
      memberIds,
      setMemberProfiles,
      (error) => showFlash("error", firestoreMessage(error, "We couldn't load group members right now."))
    );
  }, [groups]);

  useEffect(() => {
    if (authError) {
      setFlash({ tone: "error", text: authError });
    }
  }, [authError]);

  useEffect(() => {
    if (!groups.length) {
      setSelectedGroupId("");
      return;
    }

    setSelectedGroupId((current) => (current && groups.some((group) => group.id === current) ? current : groups[0].id));
  }, [groups]);

  useEffect(() => {
    if (!profile) return;
    setProfileForm({
      displayName: profile.displayName,
      defaultCurrency: profile.defaultCurrency
    });
    setGroupForm((current) => ({
      ...current,
      currency: current.name.trim() ? current.currency : profile.defaultCurrency
    }));
  }, [profile]);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || null;

  useEffect(() => {
    if (!selectedGroup || editingExpenseId) return;

    setExpenseDraft({
      groupId: selectedGroup.id,
      description: "",
      amount: 0,
      currency: selectedGroup.currency,
      paidBy: selectedGroup.memberIds[0] || "",
      splitMode: "equal",
      participants: buildParticipants(selectedGroup.memberIds, "equal"),
      notes: ""
    });
  }, [editingExpenseId, selectedGroup]);

  const memberMap = useMemo(() => {
    const map = new Map<string, UserProfile>();
    memberProfiles.forEach((member) => map.set(member.uid, member));
    if (profile) {
      map.set(profile.uid, profile);
    }
    return map;
  }, [memberProfiles, profile]);

  const memberNameMap = useMemo(() => {
    const result: Record<string, string> = {};
    memberMap.forEach((member, uid) => {
      result[uid] = member.displayName || member.email || uid;
    });
    return result;
  }, [memberMap]);

  const groupSummaries = useMemo(
    () =>
      groups.map((group) => {
        const groupExpenses = expenses.filter((expense) => expense.groupId === group.id);
        const groupSettlements = settlements.filter((settlement) => settlement.groupId === group.id);
        const balances = calculateGroupBalances(group, groupExpenses, groupSettlements);
        return {
          group,
          expenses: groupExpenses,
          settlements: groupSettlements,
          balances,
          transfers: simplifyDebts(balances),
          totalSpent: groupExpenses.reduce((sum, expense) => sum + expense.amount, 0)
        };
      }),
    [expenses, groups, settlements]
  );

  const selectedGroupSummary = selectedGroup
    ? groupSummaries.find((entry) => entry.group.id === selectedGroup.id) || null
    : null;

  const totals = useMemo(() => {
    if (!profile) return [];
    return currentUserTotals(profile.uid, expenses, settlements);
  }, [expenses, profile, settlements]);

  const counterpartBalances = useMemo<CounterpartyBalance[]>(() => {
    if (!profile) return [];
    return calculateOverallBalances(profile.uid, expenses, settlements);
  }, [expenses, profile, settlements]);

  const selectedGroupNetForCurrentUser = useMemo(() => {
    if (!selectedGroupSummary || !profile) return 0;
    return selectedGroupSummary.balances.find((entry) => entry.uid === profile.uid)?.net || 0;
  }, [profile, selectedGroupSummary]);

  const settlementOptions = useMemo(() => {
    if (!selectedGroupSummary) {
      return { debtors: [], creditors: [] as Array<{ uid: string; net: number }> };
    }
    return settlementBoundsForGroup(selectedGroupSummary.group, selectedGroupSummary.expenses, selectedGroupSummary.settlements);
  }, [selectedGroupSummary]);

  useEffect(() => {
    if (!selectedGroupSummary) {
      setSettlementDraft(emptySettlementDraft(profile?.defaultCurrency || "USD"));
      return;
    }

    const defaultTransfer = selectedGroupSummary.transfers[0];
    setSettlementDraft((current) => ({
      groupId: selectedGroupSummary.group.id,
      currency: selectedGroupSummary.group.currency,
      fromUserId:
        current.groupId === selectedGroupSummary.group.id && current.fromUserId
          ? current.fromUserId
          : defaultTransfer?.from || settlementOptions.debtors[0]?.uid || "",
      toUserId:
        current.groupId === selectedGroupSummary.group.id && current.toUserId
          ? current.toUserId
          : defaultTransfer?.to || settlementOptions.creditors[0]?.uid || "",
      amount: current.groupId === selectedGroupSummary.group.id ? current.amount : defaultTransfer?.amount || 0,
      note: current.groupId === selectedGroupSummary.group.id ? current.note || "" : ""
    }));
  }, [profile, selectedGroupSummary, settlementOptions.creditors, settlementOptions.debtors]);

  const unreadNotifications = notifications.filter((item) => !item.read).length;

  const upsertGroup = (group: Group) => {
    setGroups((current) =>
      [group, ...current.filter((entry) => entry.id !== group.id)].sort((left, right) =>
        (right.updatedAt || "").localeCompare(left.updatedAt || "")
      )
    );
  };

  const resetExpenseDraft = (group: Group | null) => {
    if (!group) {
      setExpenseDraft(emptyExpenseDraft(profile?.defaultCurrency || "USD"));
      setEditingExpenseId(null);
      return;
    }

    setExpenseDraft({
      groupId: group.id,
      description: "",
      amount: 0,
      currency: group.currency,
      paidBy: group.memberIds[0] || "",
      splitMode: "equal",
      participants: buildParticipants(group.memberIds, "equal"),
      notes: ""
    });
    setEditingExpenseId(null);
  };

  const handleLogout = async () => {
    await signOutUser();
    router.replace("/");
  };

  const handleCreateGroup = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;

    setSubmittingGroup(true);
    setFlash(null);

    try {
      const group = await createGroup(groupForm, profile);
      const refreshedGroups = await fetchGroupsForUser(profile.uid);
      upsertGroup(refreshedGroups.find((entry) => entry.id === group.id) || group);
      setGroupForm({
        name: "",
        description: "",
        currency: profile.defaultCurrency
      });
      setSelectedGroupId(group.id);
      setTab("groups");
      showFlash(
        "success",
        group.inviteCode && group.inviteUrl
          ? "Group created. Your invite code and share link are ready."
          : "Group created."
      );
    } catch (error) {
      showFlash("error", userFacingMessage(error, "We couldn't create the group right now."));
    } finally {
      setSubmittingGroup(false);
    }
  };

  const handleJoinGroup = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;

    setJoiningGroup(true);
    setFlash(null);

    try {
      const groupId = await joinGroupByInviteCode(joinCode, profile);
      setJoinCode("");
      setSelectedGroupId(groupId);
      setTab("groups");
      showFlash("success", "You joined the group successfully.");
    } catch (error) {
      showFlash("error", userFacingMessage(error, "We couldn't join that group right now."));
    } finally {
      setJoiningGroup(false);
    }
  };

  const handleRefreshInvite = async (group: Group) => {
    if (!profile) return;

    setRefreshingInviteId(group.id);
    setFlash(null);

    try {
      await refreshGroupInvite(group, profile);
      showFlash("success", `New invite generated for ${group.name}.`);
    } catch (error) {
      showFlash("error", userFacingMessage(error, "We couldn't refresh the invite right now."));
    } finally {
      setRefreshingInviteId("");
    }
  };

  const handleLeaveGroup = async (group: Group) => {
    if (!profile || !selectedGroupSummary) return;
    const confirmed = window.confirm(`Leave "${group.name}"? You will need a fresh invite to rejoin.`);
    if (!confirmed) return;

    setLeavingGroupId(group.id);
    setFlash(null);

    try {
      await leaveGroup(group, profile, selectedGroupNetForCurrentUser);
      showFlash("success", `You left ${group.name}.`);
      setSelectedGroupId("");
      setTab("groups");
    } catch (error) {
      showFlash("error", userFacingMessage(error, "We couldn't leave that group right now."));
    } finally {
      setLeavingGroupId("");
    }
  };

  const handleExpenseGroupChange = (groupId: string) => {
    const group = groups.find((entry) => entry.id === groupId);
    if (!group) return;

    setSelectedGroupId(group.id);
    setExpenseDraft((current) => ({
      ...current,
      groupId: group.id,
      currency: group.currency,
      paidBy: group.memberIds.includes(current.paidBy) ? current.paidBy : group.memberIds[0] || "",
      participants: buildParticipants(group.memberIds, current.splitMode)
    }));
  };

  const handleExpenseSplitModeChange = (splitMode: ExpenseFormValues["splitMode"]) => {
    setExpenseDraft((current) => ({
      ...current,
      splitMode,
      participants:
        splitMode === "equal"
          ? current.participants.map((participant) => ({ ...participant, value: 1 }))
          : splitMode === "percentage"
            ? buildParticipants(
                current.participants.map((participant) => participant.uid),
                splitMode
              )
            : current.participants
    }));
  };

  const toggleExpenseParticipant = (uid: string) => {
    setExpenseDraft((current) => {
      const exists = current.participants.some((participant) => participant.uid === uid);
      const nextParticipants = exists
        ? current.participants.filter((participant) => participant.uid !== uid)
        : [...current.participants, { uid, value: current.splitMode === "percentage" ? 0 : 1 }];

      return {
        ...current,
        participants:
          current.splitMode === "percentage"
            ? buildParticipants(
                nextParticipants.map((participant) => participant.uid),
                current.splitMode
              )
            : nextParticipants
      };
    });
  };

  const handleSaveExpense = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;

    const group = groups.find((entry) => entry.id === expenseDraft.groupId);
    if (!group) {
      showFlash("error", "Select a valid group before saving the expense.");
      return;
    }

    setSavingExpense(true);
    setFlash(null);

    try {
      const payload: ExpenseFormValues = {
        ...expenseDraft,
        amount: sanitizeAmount(Number(expenseDraft.amount)),
        currency: group.currency,
        description: expenseDraft.description.trim(),
        notes: expenseDraft.notes?.trim() || "",
        participants: expenseDraft.participants.map((participant) => ({
          ...participant,
          value: Number(participant.value)
        }))
      };

      if (editingExpenseId) {
        await updateExpense(editingExpenseId, payload, profile, memberNameMap, group);
        showFlash("success", "Expense updated.");
      } else {
        await createExpense(payload, profile, memberNameMap, group);
        showFlash("success", "Expense added.");
      }

      resetExpenseDraft(group);
      setTab("expenses");
    } catch (error) {
      showFlash("error", userFacingMessage(error, "We couldn't save that expense right now."));
    } finally {
      setSavingExpense(false);
    }
  };

  const startEditExpense = (expense: Expense) => {
    setEditingExpenseId(expense.id);
    setSelectedGroupId(expense.groupId);
    setExpenseDraft({
      groupId: expense.groupId,
      description: expense.description,
      amount: expense.amount,
      currency: expense.currency,
      paidBy: expense.paidBy,
      splitMode: expense.splitMode,
      participants: expense.participants,
      notes: expense.notes || ""
    });
    setTab("expenses");
  };

  const handleDeleteExpense = async (expense: Expense) => {
    if (!profile) return;
    const group = groups.find((entry) => entry.id === expense.groupId);
    if (!group) return;

    const confirmed = window.confirm(`Delete "${expense.description}"? This cannot be undone.`);
    if (!confirmed) return;

    setFlash(null);

    try {
      await deleteExpense(expense, profile, group.name);
      if (editingExpenseId === expense.id) {
        resetExpenseDraft(group);
      }
      showFlash("success", "Expense deleted.");
    } catch (error) {
      showFlash("error", userFacingMessage(error, "We couldn't delete that expense right now."));
    }
  };

  const handleSaveSettlement = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile || !selectedGroupSummary) return;

    setSavingSettlement(true);
    setFlash(null);

    try {
      await createSettlement(
        {
          ...settlementDraft,
          amount: sanitizeAmount(Number(settlementDraft.amount)),
          currency: selectedGroupSummary.group.currency,
          note: settlementDraft.note?.trim() || ""
        },
        profile,
        memberNameMap,
        selectedGroupSummary.group,
        selectedGroupSummary.expenses,
        selectedGroupSummary.settlements
      );

      const nextTransfer = selectedGroupSummary.transfers[0];
      setSettlementDraft({
        groupId: selectedGroupSummary.group.id,
        fromUserId: nextTransfer?.from || "",
        toUserId: nextTransfer?.to || "",
        amount: nextTransfer?.amount || 0,
        currency: selectedGroupSummary.group.currency,
        note: ""
      });
      showFlash("success", "Settlement recorded.");
    } catch (error) {
      showFlash("error", userFacingMessage(error, "We couldn't record that settlement right now."));
    } finally {
      setSavingSettlement(false);
    }
  };

  const handleDeleteSettlement = async (settlement: Settlement) => {
    if (!profile) return;
    const group = groups.find((entry) => entry.id === settlement.groupId);
    if (!group) return;

    const confirmed = window.confirm("Delete this settlement record?");
    if (!confirmed) return;

    try {
      await deleteSettlement(settlement, profile, group.name);
      showFlash("success", "Settlement deleted.");
    } catch (error) {
      showFlash("error", userFacingMessage(error, "We couldn't delete that settlement right now."));
    }
  };

  const handleSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;

    setSavingProfile(true);
    setFlash(null);

    try {
      await updateUserProfile(profile.uid, {
        displayName: profileForm.displayName,
        defaultCurrency: profileForm.defaultCurrency as CurrencyCode
      });
      showFlash("success", "Profile updated.");
    } catch (error) {
      showFlash("error", userFacingMessage(error, "We couldn't update your profile right now."));
    } finally {
      setSavingProfile(false);
    }
  };

  const navigation: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: "overview", label: "Overview", icon: <FolderKanban className="h-4 w-4" /> },
    { key: "groups", label: "Groups", icon: <Users className="h-4 w-4" /> },
    { key: "expenses", label: "Expenses", icon: <ReceiptText className="h-4 w-4" /> },
    { key: "activity", label: "Activity", icon: <RefreshCcw className="h-4 w-4" /> },
    { key: "notifications", label: "Updates", icon: <Bell className="h-4 w-4" /> },
    { key: "profile", label: "Profile", icon: <UserCircle2 className="h-4 w-4" /> }
  ];

  const currentSettlementMax =
    selectedGroupSummary && settlementDraft.fromUserId && settlementDraft.toUserId
      ? maxSettlementAmountForPair(
          selectedGroupSummary.group,
          selectedGroupSummary.expenses,
          selectedGroupSummary.settlements,
          settlementDraft.fromUserId,
          settlementDraft.toUserId
        )
      : 0;

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
          <aside
            className={cn(
              "glass fixed inset-y-4 left-4 z-20 w-[min(290px,calc(100vw-2rem))] rounded-[34px] p-5 transition lg:sticky lg:top-4 lg:block",
              sidebarOpen ? "translate-x-0" : "-translate-x-[120%] lg:translate-x-0"
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.28em] text-moss">Milau</p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">Shared expenses</h1>
              </div>
              <button type="button" className="btn-secondary lg:hidden" onClick={() => setSidebarOpen(false)}>
                Close
              </button>
            </div>

            {profile ? (
              <div className="mt-6 rounded-[28px] bg-slate-950 p-5 text-white">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-lg font-semibold">
                    {initials(profile.displayName)}
                  </div>
                  <div>
                    <p className="font-medium">{profile.displayName}</p>
                    <p className="text-sm text-white/70">{profile.email}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  {totals.length ? (
                    totals.map((entry) => (
                      <div key={entry.currency} className="rounded-2xl bg-white/10 px-3 py-3">
                        <div className="text-white/60">{entry.currency}</div>
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <span>You owe</span>
                          <span className="font-semibold">{formatCurrency(entry.owes, entry.currency)}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <span>You are owed</span>
                          <span className="font-semibold">{formatCurrency(entry.owed, entry.currency)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl bg-white/10 px-3 py-3 text-white/70">No balances yet</div>
                  )}
                </div>
              </div>
            ) : null}

            <nav className="mt-6 space-y-2">
              {navigation.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition",
                    tab === item.key ? "bg-moss text-white" : "bg-white/70 text-slate-700 hover:bg-white"
                  )}
                  onClick={() => {
                    setTab(item.key);
                    setSidebarOpen(false);
                  }}
                >
                  <span className="flex items-center gap-2">
                    {item.icon}
                    {item.label}
                  </span>
                  {item.key === "notifications" && unreadNotifications > 0 ? (
                    <span className="rounded-full bg-white/20 px-2 py-1 text-xs">{unreadNotifications}</span>
                  ) : null}
                </button>
              ))}
            </nav>

            <button type="button" className="btn-secondary mt-6 w-full justify-start gap-2" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </aside>

          <section className="space-y-4 lg:pl-2">
            <div className="glass rounded-[34px] px-5 py-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <button type="button" className="btn-secondary mb-4 lg:hidden" onClick={() => setSidebarOpen(true)}>
                    <Menu className="mr-2 h-4 w-4" />
                    Menu
                  </button>
                  <p className="text-sm uppercase tracking-[0.28em] text-moss">Overview</p>
                  <h2 className="mt-2 text-4xl font-semibold tracking-tight text-ink">
                    Track groups, expenses, and balances in one place
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                    Group balances stay in each group&apos;s own currency, and settlements update the numbers right away.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" className="btn-secondary" onClick={() => setTab("groups")}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Join group
                  </button>
                  <button type="button" className="btn-primary" onClick={() => setTab("expenses")}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add expense
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-4">
                <StatCard label="Groups" value={String(groups.length)} />
                <StatCard label="Expenses" value={String(expenses.length)} />
                <StatCard label="Settlements" value={String(settlements.length)} />
                <StatCard label="Unread updates" value={String(unreadNotifications)} />
              </div>

              {flash ? (
                <div
                  className={cn(
                    "mt-5 rounded-3xl px-4 py-3 text-sm",
                    flash.tone === "success" ? "bg-moss text-white" : "bg-red-50 text-red-700"
                  )}
                >
                  {flash.text}
                </div>
              ) : null}
            </div>

            {tab === "overview" ? (
              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4">
                  <SectionCard
                    title="Overall balances"
                    subtitle="Because Milau does not guess exchange rates, balances stay separated by currency."
                  >
                    <div className="space-y-3">
                      {counterpartBalances.length ? (
                        counterpartBalances.map((entry) => (
                          <div key={`${entry.uid}-${entry.currency}`} className="rounded-[24px] border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <div className="font-medium text-slate-900">{memberNameMap[entry.uid] || entry.uid}</div>
                                <div className="mt-1 text-sm text-slate-500">
                                  {entry.net >= 0 ? "Owes you overall" : "You owe them overall"} in {entry.currency}
                                </div>
                              </div>
                              <div className={cn("text-lg font-semibold", entry.net >= 0 ? "text-moss" : "text-coral")}>
                                {formatCurrency(Math.abs(entry.net), entry.currency)}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyState title="No balances yet" text="Create a group and add an expense to start tracking balances." />
                      )}
                    </div>
                  </SectionCard>

                  <SectionCard title="Your groups" subtitle="The places where your shared spending lives.">
                    <div className="grid gap-4 md:grid-cols-2">
                      {groupSummaries.length ? (
                        groupSummaries.map((summary) => (
                          <button
                            key={summary.group.id}
                            type="button"
                            className={cn(
                              "rounded-[28px] border p-5 text-left transition",
                              selectedGroupId === summary.group.id
                                ? "border-moss bg-moss/5"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            )}
                            onClick={() => {
                              setSelectedGroupId(summary.group.id);
                              setTab("groups");
                            }}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xl font-semibold text-slate-900">{summary.group.name}</div>
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                {summary.group.memberIds.length} members
                              </span>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-slate-600">
                              {summary.group.description || "Shared spending, all in one place."}
                            </p>
                            <div className="mt-4 flex items-center justify-between gap-3">
                              <div className="text-sm text-slate-500">Total spent</div>
                              <div className="font-semibold text-slate-900">
                                {formatCurrency(summary.totalSpent, summary.group.currency)}
                              </div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <EmptyState title="No groups yet" text="Head to the Groups tab to create your first shared space." />
                      )}
                    </div>
                  </SectionCard>
                </div>

                <div className="space-y-4">
                  <SectionCard title="Recent activity" subtitle="Every important change across your groups.">
                    <div className="space-y-3">
                      {activities.length ? (
                        activities.slice(0, 8).map((activity) => (
                          <div key={activity.id} className="rounded-[24px] border border-slate-200 bg-white p-4">
                            <div className="font-medium text-slate-900">{activity.message}</div>
                            <div className="mt-1 text-sm text-slate-500">{dateTimeLabel(activity.createdAt)}</div>
                          </div>
                        ))
                      ) : (
                        <EmptyState title="No activity yet" text="Your feed will fill up as soon as you create a group or add expenses." />
                      )}
                    </div>
                  </SectionCard>

                  <SectionCard title="Personal totals" subtitle="A quick breakdown of what you paid, owe, and are owed per currency.">
                    <div className="space-y-3">
                      {totals.length ? (
                        totals.map((entry) => (
                          <div key={entry.currency} className="rounded-[24px] border border-slate-200 bg-white p-4">
                            <div className="font-medium text-slate-900">{entry.currency}</div>
                            <div className="mt-2 grid gap-2 text-sm text-slate-600">
                              <div className="flex items-center justify-between gap-3">
                                <span>Paid by you</span>
                                <span className="font-semibold text-slate-900">{formatCurrency(entry.paid, entry.currency)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span>You owe</span>
                                <span className="font-semibold text-slate-900">{formatCurrency(entry.owes, entry.currency)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span>You are owed</span>
                                <span className="font-semibold text-slate-900">{formatCurrency(entry.owed, entry.currency)}</span>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyState title="Nothing to show yet" text="Your personal totals will appear after your first shared expense." />
                      )}
                    </div>
                  </SectionCard>
                </div>
              </div>
            ) : null}

            {tab === "groups" ? (
              <div className="grid gap-4 xl:grid-cols-[0.88fr_1.12fr]">
                <div className="space-y-4">
                  <SectionCard title="Create a group" subtitle="Trips, apartments, projects, dinners, or anything else shared.">
                    <form className="space-y-4" onSubmit={handleCreateGroup}>
                      <input
                        className="field"
                        placeholder="Group name"
                        value={groupForm.name}
                        onChange={(event) => setGroupForm((current) => ({ ...current, name: event.target.value }))}
                      />
                      <textarea
                        className="field min-h-28"
                        placeholder="Description"
                        value={groupForm.description}
                        onChange={(event) => setGroupForm((current) => ({ ...current, description: event.target.value }))}
                      />
                      <select
                        className="field"
                        value={groupForm.currency}
                        onChange={(event) =>
                          setGroupForm((current) => ({ ...current, currency: event.target.value as CurrencyCode }))
                        }
                      >
                        {currencyOptions.map((currency) => (
                          <option key={currency} value={currency}>
                            {currencyLabels[currency]}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="btn-primary w-full" disabled={submittingGroup}>
                        {submittingGroup ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                        {submittingGroup ? "Creating..." : "Create group"}
                      </button>
                    </form>
                  </SectionCard>

                  <SectionCard title="Join by invite code" subtitle="Paste a code from a friend to join the right group quickly.">
                    <form className="space-y-4" onSubmit={handleJoinGroup}>
                      <input
                        className="field uppercase"
                        placeholder="Enter invite code"
                        value={joinCode}
                        onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                      />
                      <button type="submit" className="btn-secondary w-full" disabled={joiningGroup}>
                        {joiningGroup ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                        {joiningGroup ? "Joining..." : "Join group"}
                      </button>
                    </form>
                  </SectionCard>

                  <SectionCard title="Your groups" subtitle="Select a group to view members, balances, invite details, and settlements.">
                    <div className="space-y-3">
                      {groups.length ? (
                        groups.map((group) => (
                          <button
                            key={group.id}
                            type="button"
                            className={cn(
                              "block w-full rounded-[24px] border p-4 text-left transition",
                              selectedGroupId === group.id ? "border-moss bg-moss/5" : "border-slate-200 bg-white"
                            )}
                            onClick={() => setSelectedGroupId(group.id)}
                          >
                            <div className="font-medium text-slate-900">{group.name}</div>
                            <div className="mt-1 text-sm text-slate-500">
                              {group.memberIds.length} members • {group.currency}
                            </div>
                          </button>
                        ))
                      ) : (
                        <EmptyState title="Nothing here yet" text="Your groups will appear here as soon as you create or join one." />
                      )}
                    </div>
                  </SectionCard>
                </div>

                <div className="space-y-4">
                  {selectedGroup && selectedGroupSummary ? (
                    <>
                      <SectionCard title={selectedGroup.name} subtitle={selectedGroup.description || "Everything this group is tracking together."}>
                        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                          <div className="rounded-[28px] bg-slate-950 p-5 text-white">
                            <div className="text-xs uppercase tracking-[0.2em] text-white/60">Group currency</div>
                            <div className="mt-2 text-xl font-semibold">{selectedGroup.currency}</div>
                            <div className="mt-4 text-xs uppercase tracking-[0.2em] text-white/60">Invite code</div>
                            <div className="mt-2 text-2xl font-semibold tracking-[0.16em]">{selectedGroup.inviteCode || "Pending"}</div>
                            <div className="mt-4 break-all rounded-2xl bg-white/10 px-4 py-3 text-sm">
                              {selectedGroup.inviteUrl || "Invite link not ready yet."}
                            </div>
                          </div>
                          <div className="flex flex-col gap-3">
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={!selectedGroup.inviteCode}
                              onClick={async () => {
                                await navigator.clipboard.writeText(selectedGroup.inviteCode);
                                showFlash("success", "Invite code copied.");
                              }}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Copy code
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={!selectedGroup.inviteUrl}
                              onClick={async () => {
                                await navigator.clipboard.writeText(selectedGroup.inviteUrl);
                                showFlash("success", "Invite link copied.");
                              }}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Copy link
                            </button>
                            {selectedGroup.createdBy === profile?.uid ? (
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => handleRefreshInvite(selectedGroup)}
                                disabled={refreshingInviteId === selectedGroup.id}
                              >
                                {refreshingInviteId === selectedGroup.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCcw className="mr-2 h-4 w-4" />
                                )}
                                Refresh invite
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => handleLeaveGroup(selectedGroup)}
                                disabled={leavingGroupId === selectedGroup.id}
                              >
                                {leavingGroupId === selectedGroup.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <UserMinus className="mr-2 h-4 w-4" />
                                )}
                                Leave group
                              </button>
                            )}
                          </div>
                        </div>
                        {selectedGroup.createdBy !== profile?.uid ? (
                          <p className="mt-4 text-sm text-slate-500">
                            You can leave once your balance is exactly settled. Current net:{" "}
                            {formatCurrency(selectedGroupNetForCurrentUser, selectedGroup.currency)}
                          </p>
                        ) : (
                          <p className="mt-4 text-sm text-slate-500">
                            Group owners keep invite access. Ownership transfer and deletion are not part of this MVP yet.
                          </p>
                        )}
                      </SectionCard>

                      <SectionCard title="Members" subtitle="Everyone currently part of this group.">
                        <div className="grid gap-3 md:grid-cols-2">
                          {selectedGroup.memberIds.map((uid) => {
                            const member = memberMap.get(uid);
                            return (
                              <div key={uid} className="rounded-[24px] border border-slate-200 bg-white p-4">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-moss/10 font-semibold text-moss">
                                    {initials(member?.displayName || uid)}
                                  </div>
                                  <div>
                                    <div className="font-medium text-slate-900">
                                      {member?.displayName || uid}
                                      {uid === selectedGroup.createdBy ? " • Owner" : ""}
                                    </div>
                                    <div className="text-sm text-slate-500">{member?.email || "Member"}</div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </SectionCard>

                      <SectionCard title="Group balances" subtitle="Each member’s running net position in this group, after expenses and settlements.">
                        <div className="grid gap-3 md:grid-cols-2">
                          {selectedGroupSummary.balances.map((balance) => (
                            <div key={balance.uid} className="rounded-[24px] border border-slate-200 bg-white p-4">
                              <div className="font-medium text-slate-900">{memberNameMap[balance.uid] || balance.uid}</div>
                              <div className={cn("mt-2 text-lg font-semibold", balance.net >= 0 ? "text-moss" : "text-coral")}>
                                {formatCurrency(balance.net, selectedGroup.currency)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </SectionCard>

                      <SectionCard title="Suggested settle up" subtitle="The fewest transfers needed to settle this group right now.">
                        <div className="space-y-3">
                          {selectedGroupSummary.transfers.length ? (
                            selectedGroupSummary.transfers.map((transfer) => (
                              <button
                                key={`${transfer.from}-${transfer.to}`}
                                type="button"
                                className="block w-full rounded-[24px] border border-slate-200 bg-white p-4 text-left"
                                onClick={() =>
                                  setSettlementDraft({
                                    groupId: selectedGroup.id,
                                    fromUserId: transfer.from,
                                    toUserId: transfer.to,
                                    amount: transfer.amount,
                                    currency: selectedGroup.currency,
                                    note: ""
                                  })
                                }
                              >
                                <div className="font-medium text-slate-900">
                                  {memberNameMap[transfer.from] || transfer.from} pays {memberNameMap[transfer.to] || transfer.to}
                                </div>
                                <div className="mt-1 text-sm text-slate-500">
                                  {formatCurrency(transfer.amount, selectedGroup.currency)}
                                </div>
                              </button>
                            ))
                          ) : (
                            <EmptyState title="Already balanced" text="No simplified transfers are needed right now." />
                          )}
                        </div>
                      </SectionCard>

                      <SectionCard title="Settle up" subtitle="Record a manual payment so balances update immediately.">
                        {selectedGroupSummary.transfers.length || settlementOptions.debtors.length ? (
                          <form className="space-y-4" onSubmit={handleSaveSettlement}>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <select
                                className="field"
                                value={settlementDraft.fromUserId}
                                onChange={(event) =>
                                  setSettlementDraft((current) => ({ ...current, fromUserId: event.target.value }))
                                }
                              >
                                <option value="">Who paid?</option>
                                {settlementOptions.debtors.map((entry) => (
                                  <option key={entry.uid} value={entry.uid}>
                                    {memberNameMap[entry.uid] || entry.uid}
                                  </option>
                                ))}
                              </select>
                              <select
                                className="field"
                                value={settlementDraft.toUserId}
                                onChange={(event) =>
                                  setSettlementDraft((current) => ({ ...current, toUserId: event.target.value }))
                                }
                              >
                                <option value="">Who received it?</option>
                                {settlementOptions.creditors.map((entry) => (
                                  <option key={entry.uid} value={entry.uid}>
                                    {memberNameMap[entry.uid] || entry.uid}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                              <input
                                className="field"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder={`Amount in ${selectedGroup.currency}`}
                                value={settlementDraft.amount || ""}
                                onChange={(event) =>
                                  setSettlementDraft((current) => ({ ...current, amount: Number(event.target.value) }))
                                }
                              />
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                Max valid:{" "}
                                <span className="font-semibold text-slate-900">
                                  {formatCurrency(currentSettlementMax, selectedGroup.currency)}
                                </span>
                              </div>
                            </div>
                            <textarea
                              className="field min-h-24"
                              placeholder="Optional note"
                              value={settlementDraft.note}
                              onChange={(event) => setSettlementDraft((current) => ({ ...current, note: event.target.value }))}
                            />
                            <button type="submit" className="btn-primary" disabled={savingSettlement}>
                              {savingSettlement ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                              Record settlement
                            </button>
                          </form>
                        ) : (
                          <EmptyState title="Nothing to settle right now" text="As soon as the group has open balances, you can record a partial or full payment here." />
                        )}
                      </SectionCard>

                      <SectionCard title="Settlement history" subtitle="Manual payments that have already been recorded for this group.">
                        <div className="space-y-4">
                          {selectedGroupSummary.settlements.length ? (
                            selectedGroupSummary.settlements.map((settlement) => (
                              <div key={settlement.id} className="rounded-[28px] border border-slate-200 bg-white p-5">
                                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                  <div>
                                    <div className="text-xl font-semibold text-slate-900">
                                      {memberNameMap[settlement.fromUserId] || settlement.fromUserId} paid{" "}
                                      {memberNameMap[settlement.toUserId] || settlement.toUserId}
                                    </div>
                                    <div className="mt-2 text-sm text-slate-500">{dateTimeLabel(settlement.createdAt)}</div>
                                    {settlement.note ? <div className="mt-2 text-sm text-slate-600">{settlement.note}</div> : null}
                                  </div>
                                  <div className="text-right">
                                    <div className="rounded-full bg-moss/10 px-4 py-2 text-sm font-semibold text-moss">
                                      {formatCurrency(settlement.amount, settlement.currency)}
                                    </div>
                                    {settlement.createdBy === profile?.uid ? (
                                      <div className="mt-2 flex justify-end gap-2">
                                        <button type="button" className="btn-secondary" onClick={() => handleDeleteSettlement(settlement)}>
                                          <Trash2 className="mr-2 h-4 w-4" />
                                          Delete
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <EmptyState title="No settlements yet" text="Recorded payments will appear here once someone settles part or all of a balance." />
                          )}
                        </div>
                      </SectionCard>
                    </>
                  ) : (
                    <SectionCard title="Group detail" subtitle="Select a group from the left to inspect it.">
                      <EmptyState title="No group selected" text="Create or join a group to see members, invite links, balances, and settle-up tools." />
                    </SectionCard>
                  )}
                </div>
              </div>
            ) : null}

            {tab === "expenses" ? (
              <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <SectionCard
                  title={editingExpenseId ? "Edit expense" : "Add expense"}
                  subtitle="Every expense uses its group&apos;s currency and validates splits before saving."
                >
                  {groups.length ? (
                    <form className="space-y-4" onSubmit={handleSaveExpense}>
                      <select className="field" value={expenseDraft.groupId} onChange={(event) => handleExpenseGroupChange(event.target.value)}>
                        {groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className="field"
                        placeholder="Description"
                        value={expenseDraft.description}
                        onChange={(event) => setExpenseDraft((current) => ({ ...current, description: event.target.value }))}
                      />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <input
                          className="field"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Amount"
                          value={expenseDraft.amount || ""}
                          onChange={(event) => setExpenseDraft((current) => ({ ...current, amount: Number(event.target.value) }))}
                        />
                        <select
                          className="field"
                          value={expenseDraft.paidBy}
                          onChange={(event) => setExpenseDraft((current) => ({ ...current, paidBy: event.target.value }))}
                        >
                          {(groups.find((group) => group.id === expenseDraft.groupId)?.memberIds || []).map((uid) => (
                            <option key={uid} value={uid}>
                              {memberNameMap[uid] || uid}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        Currency:{" "}
                        <span className="font-semibold text-slate-900">
                          {groups.find((group) => group.id === expenseDraft.groupId)?.currency || expenseDraft.currency}
                        </span>
                      </div>
                      <select
                        className="field"
                        value={expenseDraft.splitMode}
                        onChange={(event) => handleExpenseSplitModeChange(event.target.value as ExpenseFormValues["splitMode"])}
                      >
                        <option value="equal">Split equally</option>
                        <option value="exact">Split by exact amounts</option>
                        <option value="percentage">Split by percentages</option>
                        <option value="shares">Split by shares</option>
                      </select>

                      <div className="space-y-3 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                        {(groups.find((group) => group.id === expenseDraft.groupId)?.memberIds || []).map((uid) => {
                          const participant = expenseDraft.participants.find((entry) => entry.uid === uid);
                          const included = Boolean(participant);
                          return (
                            <div key={uid} className="grid gap-3 sm:grid-cols-[1fr_160px]">
                              <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-medium text-slate-800">
                                <input type="checkbox" checked={included} onChange={() => toggleExpenseParticipant(uid)} />
                                <span>{memberNameMap[uid] || uid}</span>
                              </label>
                              {expenseDraft.splitMode === "equal" ? (
                                <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">
                                  {included ? "Equal share" : "Excluded"}
                                </div>
                              ) : (
                                <input
                                  className="field"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  disabled={!included}
                                  value={participant?.value ?? 0}
                                  onChange={(event) => {
                                    const value = Number(event.target.value);
                                    setExpenseDraft((current) => ({
                                      ...current,
                                      participants: current.participants.map((entry) =>
                                        entry.uid === uid ? { ...entry, value } : entry
                                      )
                                    }));
                                  }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <textarea
                        className="field min-h-24"
                        placeholder="Notes"
                        value={expenseDraft.notes}
                        onChange={(event) => setExpenseDraft((current) => ({ ...current, notes: event.target.value }))}
                      />

                      <div className="flex flex-wrap gap-3">
                        <button type="submit" className="btn-primary" disabled={savingExpense}>
                          {savingExpense ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                          {editingExpenseId ? "Update expense" : "Save expense"}
                        </button>
                        {editingExpenseId ? (
                          <button type="button" className="btn-secondary" onClick={() => resetExpenseDraft(selectedGroup)}>
                            Cancel edit
                          </button>
                        ) : null}
                      </div>
                    </form>
                  ) : (
                    <EmptyState title="Create a group first" text="Expenses need a group so balances stay scoped and usable." />
                  )}
                </SectionCard>

                <SectionCard title="Expense history" subtitle="Every saved expense shows its split and stays editable by its creator.">
                  <div className="space-y-4">
                    {expenses.length ? (
                      expenses.map((expense) => {
                        const group = groups.find((entry) => entry.id === expense.groupId);
                        const shares = normalizedShares(expense);
                        return (
                          <div key={expense.id} className="rounded-[28px] border border-slate-200 bg-white p-5">
                            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                              <div>
                                <div className="text-xl font-semibold text-slate-900">{expense.description}</div>
                                <div className="mt-2 text-sm text-slate-500">
                                  {group?.name || "Shared group"} • paid by {memberNameMap[expense.paidBy] || expense.paidBy} • {dateTimeLabel(expense.createdAt)}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="rounded-full bg-moss/10 px-4 py-2 text-sm font-semibold text-moss">
                                  {formatCurrency(expense.amount, expense.currency)}
                                </div>
                                <div className="mt-2 flex justify-end gap-2">
                                  {expense.createdBy === profile?.uid ? (
                                    <>
                                      <button type="button" className="btn-secondary" onClick={() => startEditExpense(expense)}>
                                        <Pencil className="mr-2 h-4 w-4" />
                                        Edit
                                      </button>
                                      <button type="button" className="btn-secondary" onClick={() => handleDeleteExpense(expense)}>
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                      </button>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              {shares.map((share) => (
                                <div key={share.uid} className="rounded-[22px] bg-slate-50 px-4 py-3">
                                  <div className="text-sm font-medium text-slate-800">{memberNameMap[share.uid] || share.uid}</div>
                                  <div className="mt-1 text-sm text-slate-500">
                                    Share: {formatCurrency(share.share, expense.currency)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <EmptyState title="No expenses yet" text="Once an expense is added, it will appear here with split details." />
                    )}
                  </div>
                </SectionCard>
              </div>
            ) : null}

            {tab === "activity" ? (
              <SectionCard title="Activity feed" subtitle="A clear history of group joins, expenses, and settlements.">
                <div className="space-y-4">
                  {activities.length ? (
                    activities.map((activity) => (
                      <div key={activity.id} className="rounded-[28px] border border-slate-200 bg-white p-5">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="font-medium text-slate-900">{activity.message}</div>
                            <div className="mt-1 text-sm text-slate-500">{dateTimeLabel(activity.createdAt)}</div>
                          </div>
                          <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {activity.type.replaceAll("_", " ")}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyState title="No activity yet" text="Group creation, joins, expense changes, and settlements will appear here." />
                  )}
                </div>
              </SectionCard>
            ) : null}

            {tab === "notifications" ? (
              <SectionCard title="Updates" subtitle="A lightweight feed for group, expense, and settlement changes.">
                <div className="space-y-4">
                  {notifications.length ? (
                    notifications.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        className={cn(
                          "block w-full rounded-[28px] border p-5 text-left transition",
                          notification.read ? "border-slate-200 bg-white" : "border-moss/20 bg-moss/5"
                        )}
                        onClick={() => markNotificationAsRead(notification.id)}
                      >
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="font-medium text-slate-900">{notification.title}</div>
                            <div className="mt-1 text-sm text-slate-600">{notification.body}</div>
                          </div>
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                            {dateTimeLabel(notification.createdAt)}
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <EmptyState title="Nothing new yet" text="New group and expense updates will appear here when they are available." />
                  )}
                </div>
              </SectionCard>
            ) : null}

            {tab === "profile" ? (
              <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
                <SectionCard title="Profile" subtitle="Keep your name and preferred default currency up to date.">
                  <form className="space-y-4" onSubmit={handleSaveProfile}>
                    <input
                      className="field"
                      placeholder="Display name"
                      value={profileForm.displayName}
                      onChange={(event) => setProfileForm((current) => ({ ...current, displayName: event.target.value }))}
                    />
                    <select
                      className="field"
                      value={profileForm.defaultCurrency}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          defaultCurrency: event.target.value as CurrencyCode
                        }))
                      }
                    >
                      {currencyOptions.map((currency) => (
                        <option key={currency} value={currency}>
                          {currencyLabels[currency]}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="btn-primary" disabled={savingProfile}>
                      {savingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      Save profile
                    </button>
                  </form>
                </SectionCard>

                <SectionCard title="Account details" subtitle="The details your groups see and the currency you prefer when creating new groups.">
                  <div className="grid gap-4 md:grid-cols-2">
                    <DetailCard label="Display name" value={profile?.displayName || "Not set"} />
                    <DetailCard label="Email" value={profile?.email || "Not available"} />
                    <DetailCard label="Default currency" value={profile?.defaultCurrency || "USD"} />
                    <DetailCard label="Member status" value="Active" />
                  </div>
                </SectionCard>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[28px] border border-white/80 bg-white/70 p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-ink">{value}</div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <div className="mb-5">
        <h3 className="section-title">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-200 bg-white px-5 py-10 text-center">
      <div className="text-lg font-semibold text-slate-900">{title}</div>
      <div className="mt-2 text-sm leading-6 text-slate-500">{text}</div>
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 break-all font-medium text-slate-900">{value}</div>
    </div>
  );
}
