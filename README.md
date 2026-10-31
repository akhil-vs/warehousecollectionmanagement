# FreightFetch

Live warehouse dock app: departments mark pallets ready, the dock alerts the owning department when a driver arrives, and the department confirms handover. Every action is stamped with the operator name and time.

**Stack:** React + Vite (hosted on **Vercel**) · **Firebase** Anonymous Auth + Firestore (live reads) + **Cloud Functions** callables (all writes, region `europe-west2`).

**Departments:** Configurable in Admin (defaults: B2B · Therabody). Stored in `config/settings`.

## Roles

| | Department | Dock / Gate | Admin |
|---|---|---|---|
| Sees | Own department | Ready pallets (collected hidden) | Everything |
| Mark ready | Own dept | No | Any dept |
| Driver collection | No | Yes | Yes |
| Confirm handover | Yes (after Acknowledge) | No | Exception only, with a reason + PIN |
| Undo driver collection | No | Yes | Yes |
| History | Own dept | Hidden | Full |

Device role is chosen once with the admin PIN and stored in `localStorage` on that computer. Reassigning any PC (department, admin, or dock / gate) requires the PIN again. Operator names must be confirmed every 8 hours.

## Security model

- Clients **read** Firestore while signed in anonymously.
- Clients **cannot write** orders, events, lookups, or PIN docs (`firestore.rules`).
- Mutations go through HTTPS callables that enforce the state machine and (for admin corrections) verify the PIN server-side.
- Demo mode (no Firebase env) still mutates an in-browser store only.

## Local development

```bash
npm install
cp .env.example .env   # fill in Firebase web config
npm run dev
```

Without Firebase env vars the app runs in **demo mode** (in-browser only — not shared across machines).

```bash
npm test                 # Vitest (order state / lookups)
npm run lint
npm run build
npm run functions:build  # compile Cloud Functions
```

## Firebase setup

1. Create a Firebase project (Blaze required for callable Functions).
2. Enable **Authentication → Anonymous**.
3. Create a **Firestore** database.
4. Register a Web app and copy the config into `.env` / Vercel env:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
5. Deploy rules **and** functions:

```bash
cd functions && npm install && cd ..
npx firebase deploy --only firestore:rules,functions
```

(Requires the Firebase CLI logged into the same project. Callables are deployed to **europe-west2**.)

## Vercel deploy

1. Import this GitHub repo into Vercel.
2. Framework preset: Vite (build `npm run build`, output `dist`).
3. Deploy. The public Firebase web config lives in `src/lib/firebaseWebConfig.ts` (safe to ship — security is Auth + Firestore rules + callables, not hiding these values). Optional: set `VITE_FIREBASE_*` in the Vercel dashboard or a local `.env` to override without a code change.
4. In Firebase Console → Authentication → Settings → **Authorized domains**, add your Vercel hostname(s).

Without a usable Firebase web config the SPA shows **Demo mode** (in-browser only).

`vercel.json` rewrites all routes to `index.html` for the SPA.

## Rollout checklist (SOP)

1. Manager opens the live URL first, assigns **Admin**, creates the PIN.
2. Assign each department PC and the dock PC with the PIN (department names come from Admin → Departments).
3. On each computer, complete the start-of-shift checklist:
   - Type the operator name
   - **Confirm shift**
   - **Unlock sound** (tap once — browsers block audio until a gesture)
   - **Enable alerts**
4. Test a dummy order: ready → driver collection → acknowledge → confirm handover.
5. Confirm handover is blocked until Acknowledge. From Admin, test **Exception handover** with a reason + PIN (department PC down).
6. From Dock, undo a mistaken Driver collection, then collect again.
7. Test a dock search with no match → **Send to all departments** → department **It is ours** / **Not ours** (answers are shared).
8. Cancel a ready order from the department list (stays in History). Delete leftover test orders from the Admin tab (PIN required).

## Limits

- Device roles are still client-side UX; the PIN gates admin mutations on the server, but anyone with the URL + PIN can reassign a machine’s role.
- Operator names are typed and must be reconfirmed every 8 hours (and whenever the name changes).
- Browser sound may stay silent on locked tablets until the page is tapped.
- Collected orders stay in history; the dock only hides them from its ready list.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local Vite server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Serve `dist` locally |
| `npm run lint` | Oxlint |
| `npm test` | Vitest unit tests |
| `npm run functions:build` | Compile Cloud Functions |
