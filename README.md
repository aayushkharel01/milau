# Milau

Milau is a Firebase-backed Splitwise-style app built with Next.js, Tailwind, Firebase Authentication, and Firestore.

## Stack

- `Next.js` for the app shell, routing, and deployment
- `Firebase Authentication` for Google OAuth and email/password login
- `Cloud Firestore` for users, groups, invites, expenses, activity, and notifications
- `Tailwind CSS` for the responsive product UI

## Firebase services to enable

You need these Firebase products enabled:

- `Authentication`
- `Firestore Database`

Important:

- You must create the Firestore Database in Firebase Console before Milau can load profile, groups, expenses, activity, or notifications after login.
- If Firestore is not created yet, post-login screens will fail because all dashboard data is read from Cloud Firestore.

Inside Authentication, enable:

- `Email/Password`
- `Google`

Add these Authorized domains in `Authentication > Settings`:

- `localhost`
- `127.0.0.1`
- `milau-ef52e.firebaseapp.com`
- your Vercel production domain
- your custom domain if you use one

## Firestore structure

Milau now uses these collections:

- `users`
  - one document per authenticated user
  - fields: `uid`, `email`, `displayName`, `photoURL`, `defaultCurrency`, timestamps
- `groups`
  - one document per expense group
  - fields: `name`, `description`, `currency`, `createdBy`, `memberIds`, `inviteCode`, `inviteUrl`, timestamps
- `invites`
  - one document per invite code
  - doc id is the invite code
  - fields: `groupId`, `createdBy`, `active`, `url`, timestamps
- `expenses`
  - one document per expense
  - fields: `groupId`, `description`, `amount`, `currency`, `paidBy`, `splitMode`, `participants`, `notes`, `createdBy`, timestamps
- `activities`
  - group-scoped event feed
  - fields: `groupId`, `actorId`, `type`, `message`, timestamp
- `notifications`
  - per-user alert documents
  - fields: `userId`, `groupId`, `title`, `body`, `type`, `link`, `read`, timestamp

Balances are computed from expenses in the client and are not stored as separate documents.

## Local setup

1. Create a Firebase project.
2. Add a Web App and copy the web config.
3. Copy `.env.example` to `.env.local`.
4. Fill in all `NEXT_PUBLIC_FIREBASE_*` values.
5. Install dependencies:

```bash
npm install
```

6. Start the app:

```bash
npm run dev
```

7. Open `http://localhost:3000`.

## Firestore rules and indexes

Deploy the included rules and indexes after changing Firebase config:

```bash
firebase login
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules,firestore:indexes
```

Files:

- [firestore.rules](/Users/aayushkharel/Documents/milau/firestore.rules)
- [firestore.indexes.json](/Users/aayushkharel/Documents/milau/firestore.indexes.json)

## Feature checklist

Milau currently supports:

- signup/login with email/password
- login with Google
- create group
- join group by invite code
- invite link page
- member list per group
- add expense
- edit expense
- delete expense
- equal splits
- exact amount splits
- percentage splits
- share-based splits
- group balances
- overall balances across groups
- debt simplification
- activity feed
- notifications
- profile editing

## How to test each feature

1. Authentication
   - sign up with email/password
   - sign out
   - sign back in
   - try Google sign-in

2. Profile
   - open `Profile`
   - change display name and default currency
   - save
   - confirm the new name updates in the sidebar and member lists

3. Group creation
   - open `Groups`
   - create a group with a name, description, and currency
   - confirm it appears in your group list
   - copy the invite code and invite link

4. Join group
   - sign in with a second account in another browser or private window
   - use the invite code in the `Join by invite code` form
   - or open `/join/<inviteCode>`
   - confirm the new member appears in the group member list

5. Expense creation
   - open `Expenses`
   - choose a group
   - add an expense
   - test `equal`, `exact`, `percentage`, and `shares`
   - confirm validation errors appear for invalid totals

6. Expense editing and deleting
   - edit one of your own expenses
   - save it
   - confirm balances and activity update
   - delete it
   - confirm it disappears from the list

7. Balances and simplification
   - add expenses from different payers
   - open `Groups`
   - confirm member balances update
   - confirm simplified transfers appear
   - open `Overview`
   - confirm overall cross-group balances update

8. Activity and notifications
   - create a group
   - join the group with another account
   - add or edit expenses
   - confirm the activity feed updates
   - confirm notifications appear for affected users

## Deployment

1. Push the repo to GitHub.
2. Import it into Vercel.
3. Add the same `.env.local` values as Vercel environment variables.
4. Set `NEXT_PUBLIC_APP_URL` to your live domain.
5. Deploy.
6. Add your live domain to Firebase Authentication Authorized domains.
7. Deploy Firestore rules and indexes to the same Firebase project.
