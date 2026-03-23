import {
  Timestamp,
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Group, GroupFormValues, GroupInvite, UserProfile } from "@/types";
import { makeInviteCode } from "@/lib/utils/helpers";
import { createActivity, createNotificationsForUsers } from "@/lib/services/notification-service";
import { logFirestoreDebug, logFirestoreError } from "@/lib/services/firestore-debug";

function serializeTimestamp(value: unknown) {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  return typeof value === "string" ? value : undefined;
}

function mapGroup(id: string, data: Record<string, unknown>) {
  return {
    id,
    name: data.name,
    description: data.description,
    currency: data.currency,
    createdBy: data.createdBy,
    memberIds: data.memberIds,
    inviteCode: data.inviteCode,
    inviteUrl: data.inviteUrl,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt)
  } as Group;
}

function mapInvite(id: string, data: Record<string, unknown>) {
  return {
    code: id,
    groupId: data.groupId,
    createdBy: data.createdBy,
    active: data.active,
    url: data.url,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt)
  } as GroupInvite;
}

function inviteUrlForCode(code: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${appUrl}/join/${code}`;
}

export async function createGroup(input: GroupFormValues, actor: UserProfile) {
  if (!input.name.trim()) {
    throw new Error("Please enter a group name.");
  }

  logFirestoreDebug("createGroup:start", { actor: actor.uid, name: input.name });
  try {
    const groupRef = doc(collection(getFirebaseDb(), "groups"));
    const inviteCode = makeInviteCode(12);
    const inviteUrl = inviteUrlForCode(inviteCode);

    await setDoc(groupRef, {
      name: input.name.trim(),
      description: input.description.trim(),
      currency: input.currency,
      createdBy: actor.uid,
      memberIds: [actor.uid],
      inviteCode,
      inviteUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await setDoc(doc(getFirebaseDb(), "invites", inviteCode), {
      groupId: groupRef.id,
      createdBy: actor.uid,
      active: true,
      url: inviteUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await createActivity({
      groupId: groupRef.id,
      actorId: actor.uid,
      type: "group_created",
      message: `${actor.displayName} created ${input.name.trim()}`
    });

    return groupRef.id;
  } catch (error) {
    logFirestoreError("createGroup", error);
    throw error;
  }
}

export async function joinGroupByInviteCode(code: string, actor: UserProfile) {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) {
    throw new Error("Enter a valid invite code.");
  }

  logFirestoreDebug("joinGroupByInviteCode:start", { actor: actor.uid, code: cleanCode });
  try {
    const inviteRef = doc(getFirebaseDb(), "invites", cleanCode);
    const inviteSnapshot = await getDoc(inviteRef);

    if (!inviteSnapshot.exists()) {
      throw new Error("That invite code does not exist.");
    }

    const invite = mapInvite(inviteSnapshot.id, inviteSnapshot.data());
    if (!invite.active) {
      throw new Error("That invite code is no longer active.");
    }

    const groupRef = doc(getFirebaseDb(), "groups", invite.groupId);
    const groupSnapshot = await getDoc(groupRef);

    if (!groupSnapshot.exists()) {
      throw new Error("The group for this invite could not be found.");
    }

    const group = mapGroup(groupSnapshot.id, groupSnapshot.data());
    if (group.memberIds.includes(actor.uid)) {
      return group.id;
    }

    await updateDoc(groupRef, {
      memberIds: arrayUnion(actor.uid),
      updatedAt: serverTimestamp()
    });

    await createActivity({
      groupId: group.id,
      actorId: actor.uid,
      type: "member_joined",
      message: `${actor.displayName} joined ${group.name}`
    });

    await createNotificationsForUsers(group.memberIds.filter((uid) => uid !== actor.uid), {
      groupId: group.id,
      type: "group",
      title: "New member joined",
      body: `${actor.displayName} joined ${group.name}.`,
      link: "/dashboard"
    });

    return group.id;
  } catch (error) {
    logFirestoreError("joinGroupByInviteCode", error);
    throw error;
  }
}

export function subscribeToGroups(
  uid: string,
  onChange: (groups: Group[]) => void,
  onError?: (error: Error) => void
) {
  logFirestoreDebug("subscribeToGroups:start", { uid });
  return onSnapshot(
    query(collection(getFirebaseDb(), "groups"), where("memberIds", "array-contains", uid), orderBy("updatedAt", "desc")),
    (snapshot) => {
      logFirestoreDebug("subscribeToGroups:update", { uid, groups: snapshot.docs.length });
      const groups = snapshot.docs.map((entry) => mapGroup(entry.id, entry.data()));
      onChange(groups);
    },
    (error) => {
      logFirestoreError("subscribeToGroups", error);
      onError?.(error);
    }
  );
}

export async function refreshGroupInvite(group: Group, actor: UserProfile) {
  if (group.createdBy !== actor.uid) {
    throw new Error("Only the group creator can refresh its invite.");
  }

  const inviteCode = makeInviteCode(12);
  const inviteUrl = inviteUrlForCode(inviteCode);

  logFirestoreDebug("refreshGroupInvite:start", { groupId: group.id, actor: actor.uid });
  try {
    await updateDoc(doc(getFirebaseDb(), "groups", group.id), {
      inviteCode,
      inviteUrl,
      updatedAt: serverTimestamp()
    });

    await setDoc(doc(getFirebaseDb(), "invites", inviteCode), {
      groupId: group.id,
      createdBy: actor.uid,
      active: true,
      url: inviteUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return { inviteCode, inviteUrl };
  } catch (error) {
    logFirestoreError("refreshGroupInvite", error);
    throw error;
  }
}
