# Warehouse Collections

Live warehouse dock app: departments mark pallets ready, the dock alerts the owning department when a driver arrives, and the department confirms handover. Every action is stamped with the operator name and time.

**Stack:** React + Vite (hosted on **Vercel**) · **Firebase** Anonymous Auth + Firestore for live multi-computer data.

**Departments:** B2B · Therabody

## Roles

| | Department | Dock / Gate | Admin |
|---|---|---|---|
| Sees | Own department | Ready pallets (collected hidden) | Everything |
| Mark ready | Own dept | No | Any dept |
| Driver collection | No | Yes | Yes |
| Confirm handover | Yes | No | No |
| History | Own dept | Hidden | Full |

Device role is chosen once with the admin PIN and stored in `localStorage` on that computer.

## Local development

```bash
npm install
cp .env.example .env   # fill in Firebase web config
npm run dev
```

Without Firebase env vars the app runs in **demo mode** (in-browser only — not shared across machines).

## Firebase setup

1. Create a Firebase project.
2. Enable **Authentication → Anonymous**.
3. Create a **Firestore** database.
4. Register a Web app and copy the config into `.env` / Vercel env:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
5. Deploy rules:

```bash
npx firebase deploy --only firestore:rules
```

(Requires the Firebase CLI logged into the same project. `firestore.rules` and `firebase.json` are in this repo.)

## Vercel deploy

1. Import this GitHub repo into Vercel.
2. Framework preset: Vite (build `npm run build`, output `dist`).
3. Add the same `VITE_FIREBASE_*` variables for Production and Preview.
4. Deploy.
5. In Firebase Console → Authentication → Settings → **Authorized domains**, add your Vercel hostname(s).

`vercel.json` rewrites all routes to `index.html` for the SPA.

## Rollout checklist

1. Manager opens the live URL first, assigns **Admin**, creates the PIN.
2. Assign each department PC (B2B / Therabody) and the dock PC with the PIN.
3. On each computer: type the operator name → **Enable alerts** → tap once to unlock sound.
4. Test a dummy order: ready → driver collection → acknowledge → confirm handover.
5. Test a dock search with no match → **Send to all departments**.
6. Delete test orders from the Admin tab.

## Limits

- Device roles are not strong security; anyone with the URL and PIN can reassign a machine.
- Operator names are typed (change them at shift change).
- Browser sound may stay silent on locked tablets until the page is tapped.
- Collected orders stay in history; the dock only hides them from its ready list.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local Vite server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Serve `dist` locally |
| `npm run lint` | Oxlint |
