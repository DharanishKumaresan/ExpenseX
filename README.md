# ExpenseX

A financial operating system for one person — and for two.

Track your own income, spending, budgets and savings goals privately, and open
one **shared workspace** with another person where you both manage a joint
budget, log who paid for what, and save towards the same goals. The two sides
never mix: a personal expense can never touch a shared budget, and a shared
expense never appears in your private ledger.

---

## Contents

1. [What was built](#1-what-was-built)
2. [Tech stack](#2-tech-stack)
3. [Database architecture](#3-database-architecture)
4. [Authentication](#4-authentication)
5. [Shared workspace architecture](#5-shared-workspace-architecture)
6. [Running locally](#6-running-locally)
7. [Environment variables](#7-environment-variables)
8. [Database setup & migrations](#8-database-setup--migrations)
9. [Seed data](#9-seed-data)
10. [Testing](#10-testing)
11. [Progressive web app](#11-progressive-web-app)
12. [Deploying to production](#12-deploying-to-production)
13. [Security considerations](#13-security-considerations)
14. [Known limitations](#14-known-limitations)
15. [Recommended next steps](#15-recommended-next-steps)

---

## 1. What was built

### Personal finance

| Area | What it does |
| --- | --- |
| **Overview** | Month-scoped dashboard: available / income / spent / remaining, a radial spending visualisation drawn from real transactions, budget status, recent transactions, goals, upcoming commitments, and deterministic insights. |
| **Transactions** | Full ledger with search, filters (type, category, payment method, account, date range), four sort orders, server-side pagination, and create / edit / delete / duplicate. |
| **Quick add** | One-thumb bottom sheet from a floating button: amount, category rail, merchant, done. Hands off to the full form without losing input. |
| **Budgets** | Monthly totals with per-category allocations, live allocation feedback, 80% warning / 100% reached / over-budget states, and a category ranking. |
| **Goals** | Targets with deadlines, contribution history, progress, days remaining, and a projected completion date — shown only when the contribution history justifies one. |
| **Recurring** | Weekly/monthly/quarterly/yearly commitments, monthly and yearly totals, pause/resume, and an explicit "record paid" that writes a real transaction. |
| **Analytics** | 7d / 30d / 3m / 6m / 1y / all ranges, spending over time, income vs expenses, category distribution, budget vs actual, and headline statistics. |
| **Settings** | Profile, currency, light/dark/system theme, accounts with balances, custom categories, notification preferences, password change. |

### Shared finance

| Area | What it does |
| --- | --- |
| **Our Finances** | The shared dashboard: joint totals, who paid what this month, shared spending visualisation, shared budget, shared goals and recent activity. |
| **Shared transactions** | A separate ledger. Every row records **who entered it** and **who actually paid** — two different facts. |
| **Shared budget** | A joint monthly budget either person can change, with per-category overruns broken down by who spent. |
| **Shared goals** | Joint targets with per-contributor totals, contribution history, and the ability to credit a contribution to either person. |
| **Activity** | A durable, paginated audit trail of every change either person made. |
| **Settings** | Rename the space, change currency, invite, remove a member, leave, or delete the space — gated by role. |
| **Invitations** | Create → invite by email → the recipient explicitly accepts. Pending / accepted / declined / expired / revoked are all handled. |

### Cross-cutting

Global search scoped to the current workspace · in-app notifications with
per-type preferences · live updates over SSE · light and dark palettes ·
keyboard-accessible charts with table fallbacks · intentional empty, loading
and error states throughout.

---

## 2. Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js 15.5** (App Router) | Server Components keep financial aggregation on the server; Server Actions give a typed mutation surface with no hand-written API layer. |
| Language | **TypeScript**, `strict` + `noUncheckedIndexedAccess` | |
| Styling | **Tailwind CSS v4** with CSS-first `@theme` tokens | Every colour, radius and motion value is a token in `src/app/globals.css`. No component hardcodes a hex. |
| Database | **PostgreSQL 18** | |
| ORM | **Prisma 6** | |
| Validation | **Zod** | The same schemas run on the client for feedback and on the server as the authority. |
| Auth | Hand-rolled DB-backed sessions + **bcrypt** | See [§4](#4-authentication). |
| Charts | **Hand-built SVG** (no chart library) | The visual language — thin radiating rules, hatched bars, hairline axes — is specific enough that theming a general-purpose library would have cost more than the ~120 lines of geometry in `src/components/charts/geometry.ts`, and every mark would still have fought the defaults. |
| Realtime | **Server-Sent Events** | Traffic is one-way (server → client change notices); SSE reconnects on its own and needs no extra server. |

**Runtime dependencies: 5** (`next`, `react`, `react-dom`, `@prisma/client`,
`bcryptjs`, `zod`). Small helpers — `cn`, `debounce`, initials — are a few lines
in `src/lib/utils.ts` rather than packages.

---

## 3. Database architecture

### Money is never a float

Every monetary column is an `Int` of **minor units** (paise for INR, cents for
USD). No column is a float, and no value is ever produced by multiplying a
decimal by 100 in floating point — user input is parsed from the *string* they
typed, digit by digit (`src/lib/money.ts`).

```
"1234.56"  →  whole "1234" + fraction "56"  →  123456
```

`0.1 + 0.2 !== 0.3` is not a rounding curiosity in a ledger; it is corruption.
`tests/money.test.ts` pins this behaviour.

### Personal vs shared scope

Scoped entities (`Transaction`, `Budget`, `Goal`, `RecurringTransaction`) carry
both `userId` and `workspaceId`:

```
personal → workspaceId = NULL,        userId = owner
shared   → workspaceId = <workspace>, userId = creator
```

They also carry **`scopeKey`**, a NOT NULL discriminator — `"u:<userId>"` or
`"w:<workspaceId>"`. It exists because PostgreSQL treats NULLs as *distinct* in
unique indexes, so `UNIQUE(userId, workspaceId, year, month)` would happily let
one user create two personal budgets for September. Uniqueness is enforced on
`scopeKey` instead, and every read filters on it.

### Constraints the schema language cannot express

The initial migration adds 18 `CHECK` constraints as the last line of defence:

- **Scope integrity** — `scopeKey` must match the row's actual scope; `Budget`
  and `Goal` must have exactly one of `userId`/`workspaceId` (XOR).
- **Payer sanity** — `paidByUserId` may only be set on a shared row.
- **Money bounds** — amounts are positive and capped well below `int4` overflow,
  so a lifetime of `SUM()` stays safe.
- **Calendar sanity** — budget months are 1–12, years 2000–2200.

A later migration adds a **partial unique index** (`slug WHERE userId IS NULL`)
after the same NULL-distinctness rule allowed duplicate system categories to be
created by re-running the seed.

Application code enforces the same rules; these make a bug there fail loudly
instead of silently mixing one person's spending into a shared workspace.

### Entities

`User` · `Session` · `Workspace` · `WorkspaceMember` · `Invitation` ·
`Account` · `Category` · `Transaction` · `TransactionTag` · `Tag` · `Budget` ·
`BudgetCategory` · `Goal` · `GoalContribution` · `RecurringTransaction` ·
`Activity` · `Notification` · `NotificationPreference`

Indexed on `scopeKey + date`, `workspaceId`, `userId`, `categoryId`,
`paidByUserId`, `createdAt`, and `lower(merchant)` for search.

---

## 4. Authentication

Sessions are **server-side and revocable**:

- The browser holds an opaque 256-bit random token in an `httpOnly`, `SameSite=Lax`,
  `Secure`-in-production cookie.
- The database stores only an **HMAC-SHA-256 of that token**, so a dump of the
  `Session` table cannot be replayed as a login.
- Deleting the row ends the session immediately — something a stateless JWT
  cannot offer, which matters for "sign out everywhere" after a password change.

Passwords use **bcrypt at cost 12**. Sign-in is deliberately indistinguishable
between "no such account" and "wrong password", and burns a comparable amount of
time either way so response timing cannot enumerate registered addresses. Login
and sign-up are rate limited per IP.

> **Why not NextAuth/Auth.js?** Credentials-only auth with DB sessions is a
> small, auditable surface, and the app needs no OAuth providers. If social
> login is added later, Auth.js with the Prisma adapter is the natural swap —
> `src/server/auth/session.ts` is the only module that would change.

---

## 5. Shared workspace architecture

### One gate

Every read and write passes through `resolveScope()` in `src/server/scope.ts`.
A caller **never** supplies a `userId`. It supplies at most a `workspaceId`, and
the server decides — from the session cookie plus a membership lookup — whether
that workspace is theirs:

```ts
const workspace = await db.workspace.findFirst({
  where: { id, members: { some: { userId, status: 'ACTIVE' } } },
});
```

The membership predicate is in the `WHERE` clause, so a non-member's query
returns **no row at all** rather than a row that is then checked. Tampering with
a workspace id in a form field produces a 403 that is deliberately
indistinguishable from "does not exist".

### createdBy vs paidBy

A shared transaction records both. You can enter an expense your partner paid
for:

```
userId       = you        (who typed it in)
paidByUserId = your partner  (whose money left)
```

This is what "WHO PAID" on the budget screen reads, and it is the schema
foundation a future settlement feature would use — see [§14](#14-recommended-next-steps).

### Activity and notifications

Activity rows are written **inside the same database transaction** as the change
they describe, so the feed can never drift from reality. Notifications fan out
to the *other* member only, respecting their per-type preferences, and are sent
*after* the write commits — a failed notification must never roll back a saved
transaction.

### Concurrency

`Transaction`, `Budget` and `Goal` carry a `version`. Edits send the version the
form was opened with, and the update predicate includes it:

```ts
await tx.budget.updateMany({ where: { id, scopeKey, version }, data: { …, version: { increment: 1 } } });
```

Two simultaneous saves cannot both succeed; the loser gets a readable
"someone else changed this" message instead of silently overwriting. Goal
contributions use `{ increment }` so concurrent contributions are additive at
the database level rather than read-modify-write.

### Member limit

The UX is designed for exactly two people (`Workspace.memberLimit`, default 2),
but `Workspace` + `WorkspaceMember` + `role` is a general model — raising the
limit does not require a migration.

---

## 6. Running locally

**Requirements:** Node 20.6+ (developed on 24), and either the bundled portable
PostgreSQL (default) or Docker.

```bash
npm install
```

> If npm reports blocked install scripts, run
> `npm approve-scripts prisma @prisma/client @prisma/engines` — Prisma needs its
> postinstall to download query engines.

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# paste that into SESSION_SECRET in .env
```

Then:

```bash
npm run db:start     # portable PostgreSQL 18 on port 55432 — no Docker needed
npm run db:deploy    # apply migrations
npm run db:seed      # realistic demo data
npm run dev
```

Open <http://localhost:3000> and sign in with either seeded account:

| Email | Password |
| --- | --- |
| `demo@expensex.app` | `expensex-demo-2026` |
| `alex@expensex.app` | `expensex-demo-2026` |

They share the "Our Finances" workspace — sign in as each in two browsers to see
the collaboration and live updates.

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Full test suite (needs the database) |
| `npm run test:unit` | Money + analytics tests only (no database) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:start` / `db:stop` / `db:status` | Local PostgreSQL lifecycle |
| `npm run db:deploy` / `db:migrate` / `db:seed` / `db:studio` | Database tasks |
| `npm run package` | Build `dist/expensex-deploy.zip` for a server |
| `npm run icons` | Regenerate the PWA icon set from `scripts/icons.mjs` |

### About the local database

`npm run db:start` drives the portable PostgreSQL binaries from
`@embedded-postgres/*` via `initdb`/`pg_ctl`. It is a **real PostgreSQL 18
server**, just one that needs no installation or Docker.

The cluster deliberately lives **outside the project directory**
(`%LOCALAPPDATA%/expensex/` or `~/.local/share/expensex/`): this repository may
sit inside a synced folder, and letting a sync client touch a live PostgreSQL
data directory causes churn and corruption.

Prefer Docker? `docker compose up -d db`, then point `DATABASE_URL` at it.

---

## 7. Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string. |
| `SESSION_SECRET` | ✅ | 32+ chars of high-entropy random data. Keys the session-token HMAC — **rotating it signs everyone out**. |
| `APP_URL` | — | Public origin, used to build invitation links. |
| `NEXT_PUBLIC_TIME_ZONE` | — | Display time zone, default `Asia/Kolkata`. See [§13](#13-known-limitations). |

`src/server/env.ts` validates these with Zod **at boot** and refuses to start on
a missing or weak `SESSION_SECRET`. A finance app that starts misconfigured is
worse than one that will not start.

---

## 8. Database setup & migrations

```bash
npm run db:deploy                     # production / CI: apply pending migrations
npm run db:migrate -- --name <name>   # development: create + apply a new one
npx prisma migrate status             # check drift
```

Two migrations ship:

1. `…_init` — the full schema, indexes, and the 18 `CHECK` constraints.
2. `…_category_slug_uniqueness` — de-duplicates system categories and adds the
   partial unique index that prevents recurrence.

The raw-SQL constraints and the partial index are invisible to Prisma's schema
language but survive `prisma migrate diff` cleanly (verified — no drift).

---

## 9. Seed data

```bash
npm run db:seed
```

Idempotent: it clears **only** the two demo accounts first, then creates five
months of realistic personal history (~210 transactions), budgets for two
months, goals with contribution history, recurring commitments, and a shared
workspace with ~47 transactions, a joint budget, two shared goals with
contributions from both people, an activity feed and notifications.

Amounts use a seeded PRNG, so every run produces the same dashboard. The
September budget is tuned so the **shopping category overruns** while the month
overall stays healthy — the warning states are visible on first load without
the demo looking broken.

---

## 10. Testing

```bash
npm test
```

**58 tests, all passing.**

- `tests/money.test.ts` — exact parsing, Indian/Western grouping, zero-decimal
  currencies, rejection of excess precision, and the float traps the design avoids.
- `tests/analytics.test.ts` — cash flow, transfer exclusion, category
  breakdown, budget thresholds, per-member spend, goal projection (including the
  cases where it correctly **refuses** to project), recurring normalisation, and
  insight suppression when there is no baseline.
- `tests/isolation.test.ts` — runs against the real database: non-members
  resolve nothing, removed members lose access immediately, personal and shared
  ledgers never appear in each other's scope, all `CHECK` constraints reject the
  rows they should, and cascades delete shared data without touching personal data.

Manually verified in-browser: sign-up/sign-in/sign-out, quick add, full
transaction form, edit/duplicate/delete, filters and pagination, budget create
and edit with over-allocation blocking, goal creation and contribution, shared
expense with payer attribution (confirmed in the database), activity and
notification fan-out, workspace switching, theme switching, and the
unauthenticated redirect and 401 paths against the production build.

---

## 11. Progressive web app

ExpenseX installs to a home screen or a dock and runs without browser chrome.

| Piece | Where |
| --- | --- |
| Manifest | `public/manifest.webmanifest` — standalone display, four long-press shortcuts, maskable icons |
| Icons | `public/icons/*`, generated by `npm run icons` from a single vector source |
| Service worker | `public/sw.js`, registered by `src/components/pwa/service-worker.tsx` |
| Offline page | `public/offline.html` — self-contained, no webfont or build asset |
| Install control | `src/components/pwa/install-prompt.tsx`, surfaced in Settings |

### What the service worker caches, and what it refuses to

It caches **build output only**: hashed chunks under `/_next/static`, fonts and
icons. Those are immutable and contain no personal data.

It never caches an HTML document, an API response or a server action. Every
page here is rendered against the signed-in session and is full of one person's
money; a cached page would outlive sign-out and be served to whoever opens the
browser next. On a shared device that is one user handing another their ledger.
Navigations are therefore network-only, with `offline.html` as the fallback, and
signing out posts `CLEAR_CACHES` to the worker so nothing is left behind.

The practical consequence: **the app does not work offline**, by design. It
loads instantly on a repeat visit and explains itself when the network is gone.

In development the registrar does the opposite job and unregisters any worker
it finds, so a stale cache never masquerades as an application bug.

---

## 12. Deploying to production

1. **Database** — provision managed PostgreSQL (Neon, Supabase, RDS). Set
   `DATABASE_URL`; add `?sslmode=require` and consider `?pgbouncer=true` behind
   a pooler.
2. **Secrets** — generate a fresh `SESSION_SECRET`. Never reuse the dev value.
3. **Migrate** — run `npx prisma migrate deploy` in your release step, before
   the new build serves traffic.
4. **Build** — `npm run build` (runs `prisma generate` first).
5. **Run** — `npm start` behind TLS. `Secure` cookies require HTTPS.
6. **Headers** — CSP, `X-Frame-Options: DENY`, `Referrer-Policy` and
   `Permissions-Policy` ship in `next.config.ts`; verify no proxy strips them.
7. **Proxy** — pass `X-Forwarded-Proto` through, and disable response buffering
   on `/api/realtime` or the Server-Sent Events feed will never deliver.

### Hostinger

`npm run package` produces `dist/expensex-deploy.zip`, and
**[DEPLOY-HOSTINGER.md](DEPLOY-HOSTINGER.md)** walks a Hostinger VPS from a bare
Ubuntu image to a running HTTPS site. `deploy/` holds the pieces it uses: a
provisioning script, a systemd unit, a PM2 config and an Nginx site.

Hostinger's **shared** Web Hosting cannot run this app — it is PHP/LiteSpeed
with MySQL, and ExpenseX needs a persistent Node process and PostgreSQL. A VPS
(KVM 1 or larger) is the supported target.

The bundle ships **source, not a build**: Prisma's query engine is
platform-specific, so a `.next` produced on Windows will not start on a Linux
server. The build runs once on the server.

**Before calling it production-ready, read [§14](#14-known-limitations).** Two
items there — realtime and rate limiting — are single-instance assumptions that
need addressing before horizontal scaling, and there is no email transport yet.

---

## 13. Security considerations

**Implemented**

- Server-side sessions; only a keyed hash of the token is stored.
- bcrypt cost 12; plaintext never stored, logged or returned.
- Every mutation re-derives the acting user from the session cookie. `userId`,
  `workspaceId`, `memberId` and `paidByUserId` from the client are treated as
  *inputs to a check*, never as assertions.
- Membership enforced inside the SQL `WHERE`, so unauthorised queries return
  nothing rather than being filtered afterwards.
- Zod validation on every action; amounts re-parsed against the **server's**
  resolved currency, not one the client claimed.
- Database `CHECK` constraints backstopping every scope and money invariant.
- Rate limiting on login, sign-up and invitations.
- Errors sanitised — unexpected faults log server-side with a reference id and
  return a generic message. No stack traces, SQL or Prisma internals cross the wire.
- CSP, `X-Frame-Options: DENY`, no `X-Powered-By`.
- Invitation tokens stored as SHA-256; accepting requires being signed in as the
  invited address.
- `?next=` redirects restricted to relative in-app paths.
- Password change revokes every other session.

**CSRF.** Next.js Server Actions verify `Origin` against `Host` and are
POST-only, which covers the standard cross-site form attack, and session cookies
are `SameSite=Lax`. If you put the app behind a proxy that rewrites `Host`,
verify this still holds.

---

## 14. Known limitations

These are honest gaps, not oversights:

1. **Realtime is single-instance.** The SSE bus is in-process. Correct and
   complete for one instance; across several, a change published on instance A
   will not reach a listener on instance B. `RealtimeBus` in
   `src/server/realtime.ts` is an interface with one seam — swap in PostgreSQL
   `LISTEN/NOTIFY` or Redis pub/sub and every call site keeps working.
2. **Rate limiting is in-process** for the same reason. Enough to stop
   credential stuffing from one client per instance; move to Redis or an edge
   limiter for a multi-instance deployment.
3. **No email transport.** Invitations are created and the link is shown to the
   inviter to pass on manually. Wiring Resend/SES means one call in
   `inviteToWorkspace`.
4. **Single display time zone.** All dates render in `NEXT_PUBLIC_TIME_ZONE`
   (default IST). This is deliberate — it keeps server and client output
   identical and stops a late-night expense landing in a different month than
   the budget counted it in — but two people in different zones both see IST.
5. **No currency conversion.** Changing a workspace's currency re-displays
   existing amounts in the new symbol; it does not convert them. The UI says so.
6. **Recurring items do not post themselves.** They are projections until you
   press "record paid". A scheduled job could automate this; the deliberate
   choice was never to invent spending that has not happened.
7. **No password reset flow** — it needs email (see 3). Password *change* while
   signed in works.
8. **No CSV import/export.**
9. **Avatars are monograms only** — no upload pipeline.
10. **`package.json#prisma`** still holds the seed config; Prisma 7 will want a
    `prisma.config.ts`. Harmless today, emits a deprecation warning.

---

## 15. Recommended next steps

**Before scaling out**

1. Swap the realtime bus to PostgreSQL `LISTEN/NOTIFY` (the seam exists).
2. Move rate limiting to Redis.
3. Add email (Resend/SES) — unblocks real invitations and password reset.

**Highest product value**

4. **Settlement.** Every shared expense already stores `amount`, `createdBy`,
   `paidBy` and `workspaceId`, so "Alex owes you ₹2,125" is a query away — the
   schema was designed for it and deliberately left unbuilt.
5. **Split ratios** on shared expenses (50/50, 70/30, exact amounts) — a
   `TransactionSplit` table hanging off `Transaction`, which settlement would
   then read instead of assuming equal shares.
6. **Bank/UPI import** — the biggest reduction in manual entry.
7. **Budget rollover** — carry unspent allocation into the next month.

**Engineering**

8. End-to-end tests (Playwright) over the flows currently verified by hand.
9. Real error tracking (Sentry) — `actionFailure` already generates correlation
   ids to attach.
10. `SELECT` narrowing and a `LIMIT` audit on the analytics queries once real
    accounts pass a few thousand transactions.

---

## Project structure

```
prisma/
  schema.prisma          # models, indexes, scope discriminators
  migrations/            # SQL, including the CHECK constraints
  seed.ts                # deterministic demo data
public/
  manifest.webmanifest   # PWA manifest, shortcuts, maskable icons
  sw.js                  # service worker — build output only, never pages
  offline.html           # self-contained offline fallback
  icons/                 # generated by `npm run icons`
deploy/
  setup-vps.sh           # one-shot Ubuntu provisioning
  expensex.service       # systemd unit
  ecosystem.config.cjs   # PM2 alternative
  nginx/expensex.conf    # reverse proxy: TLS, SSE, immutable assets
scripts/
  pg.mjs                 # portable PostgreSQL lifecycle
  icons.mjs              # PWA icon generation
  package.mjs            # dist/expensex-deploy.zip
src/
  app/
    (auth)/              # sign in / sign up
    (app)/
      (personal)/        # /overview, /transactions, /budgets, /goals, …
      shared/            # /shared, /shared/transactions, /shared/budget, …
    api/{realtime,search}/
    invite/[token]/
  components/
    charts/              # hand-built SVG: radial, series, geometry
    dashboard/ transactions/ budgets/ goals/ recurring/ shared/ settings/
    ui/                  # tokens-only primitives
    pwa/                 # service worker registration, install prompt
  lib/                   # money, date, analytics, validation — pure, testable
  server/
    scope.ts             # THE authorisation gate
    actions/             # Server Actions (all mutations)
    queries/             # data loading
    auth/                # sessions, passwords
tests/                   # money, analytics, isolation
```

The rule the layout encodes: **pure logic in `src/lib` (no database, no
framework), authorisation in `src/server/scope.ts`, and nothing else decides who
can see what.**
