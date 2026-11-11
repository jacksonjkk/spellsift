# SpellSift — System Audit

**Date:** 2026-11-11
**Scope:** React/Vite client, Supabase schema + RLS + RPCs, realtime/game flow, mobile readiness, release compliance.
**Method:** Static review of the repository plus `npm run build`, `npm run lint`, `npm test`, `npm audit`.
**Caveat:** RLS/RPC findings are from the SQL in this repo. Verify them against the deployed Supabase project, because `schema.sql` and the numbered migrations disagree in places.

---

## 1. Executive summary

SpellSift is a functional web prototype with a clean component structure and a genuinely good mobile CSS foundation. The build passes and the core loop works.

It is **not ready to ship as a mobile app yet**. There are five blockers:

1. **RLS lets players edit their own score and career stats.** The "server-side verification" claim is not currently true.
2. **Every user's email is readable by every other user** (and potentially by the public anon key).
3. **Dictionary enforcement is cosmetic.** The server accepts any string, including one-letter words, so scores can be farmed trivially.
4. **A game can get permanently stuck** if the host backgrounds the app, loses connection, or leaves. On mobile this is a normal event, not an edge case.
5. **No account deletion, privacy policy, or UGC moderation/reporting.** This alone will block App Store review.

**Verdict: No-go for mobile release.** Recommended path: 2–3 week hardening sprint focused on P0 items, then package with Capacitor (fastest path) and ship a PWA build in parallel.

### Verification snapshot

| Check | Result |
|---|---|
| `npm run build` | ✅ Passes (505 KB JS / 140 KB gzip — over Vite's 500 KB warning) |
| `npm run lint` | ❌ 26 errors, 3 warnings |
| `npm test` | ✅ 5 tests pass (only one pure function; see §8) |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| TypeScript strict mode | ❌ Not enabled (`tsconfig.app.json`) |
| CI pipeline | ❌ None |
| Error boundary | ❌ None |
| PWA manifest / service worker | ❌ None |

---

## 2. Findings by severity

### P0 — Blockers (fix before any public/mobile release)

#### P0-1. Players can overwrite their own score
**Evidence:** `supabase/schema.sql:109`, `supabase/migrations/001_fix_rls_anonymous.sql:36`

```sql
CREATE POLICY "Allow user update own player state"
  ON public.players FOR UPDATE USING (auth.uid() = user_id);
```

There is no column restriction and no `WITH CHECK` limiting the new score. Any player can call the Supabase REST API directly (the anon key ships in the app) and run:

```ts
supabase.from('players').update({ score: 9999 }).eq('user_id', myId)
```

**Impact:** Leaderboard, winner calculation, and career stats are all forgeable. This invalidates the core competitive promise.
**Fix:** Remove the direct `UPDATE` policy. Expose `set_ready(p_room_id, p_ready)` as a `SECURITY DEFINER` RPC. Only `submit_word` may touch `score`. Revoke `UPDATE` on `players` from `authenticated`.

#### P0-2. All profile emails are public
**Evidence:** `supabase/schema.sql:98`, `supabase/migrations/001_fix_rls_anonymous.sql:25`

```sql
CREATE POLICY "Allow public read profiles" ON public.profiles FOR SELECT USING (true);
```

`api.getProfile` and `api.getRoomPlayers` both `select('*')` / `profiles(*)`, so the email column is returned to every client.

**Impact:** Anyone with the anon key can dump every user's email address. Privacy/GDPR problem and a store-review problem.
**Fix:**
- Stop storing `email` in `public.profiles` (it already lives in `auth.users`).
- Create a `public_profiles` view exposing only `id, username, avatar_url, wins, ties, games_played, created_at`.
- Point the client at the view. Restrict full-profile `SELECT` to `auth.uid() = id`.
- Add a migration to drop/clear the column if it is not needed.

#### P0-3. `.env` with a live project is committed
**Evidence:** `.env` is tracked by git (`git ls-files`), added in commit `ecaaefa`. It contains `VITE_SUPABASE_URL` and the anon JWT for project `xibgavcsrgsheuhwaadf`.

The anon key is *designed* to be public, so this is not a service-role leak. But combined with P0-1/P0-2 it hands anyone the API surface, and committing environment files is a bad habit that eventually leaks a real secret.
**Fix:** Add `.env` to `.gitignore`, keep `.env.example`, remove the file from the index (`git rm --cached .env`), and purge it from history if the repo is public. Rotate the anon key only if the repo is public or the key was ever reused.

#### P0-4. "Enforce Dictionary" is client-side only
**Evidence:** `src/pages/Game.tsx:122-125, 343-355`, `src/services/dictionary.ts`, `supabase/schema.sql:205-283`

The dictionary check only renders a "Possible invalid words" warning. `submit_word` never reads `rooms.enforce_dictionary` and never validates against a dictionary. It also has **no minimum length**:

```sql
IF length(v_word_clean) = 0 THEN ...
```

So `A`, `I`, `ZZ`, and arbitrary strings built from the base word all score +1.
**Impact:** A player can brute-force every 1–2 letter combination and win without knowing a word. This is the single biggest gameplay-integrity bug.
**Fix:**
- Add `length(v_word_clean) >= 3` (or the chosen rule).
- Enforce the dictionary **server-side**: a `public.words` table + index, or an Edge Function backed by a bundled word list. Do not call `dictionaryapi.dev` per keystroke.
- Reject invalid words, do not just warn.
- Decide and document the letter-reuse rule. The current "reuse letters unlimited times" rule is intentional (`src/utils/validation.ts:12`, test at `validation.test.ts:26`), but it makes short-word farming worse. With reuse allowed, minimum length + dictionary are mandatory.

#### P0-5. Host-only finish + client-only timer = stuck games
**Evidence:** `src/pages/Game.tsx:50-111`, `src/contexts/GameContext.tsx:522-531`, `supabase/schema.sql:286-379`

Only the host can call `finish_room`, and the host calls it from `handleTimeUp` after the local timer fires. If the host:
- backgrounds the app at time-up,
- loses connection,
- closes the tab,
- leaves the room,

…the room stays `playing` forever. Every other player is stuck on "Submitting your words…" and can never reach Results. On mobile, backgrounding at the wrong moment is routine.

**Impact:** Lost rounds, lost words, support burden, bad reviews.
**Fix:**
- Make `finish_room` idempotent and callable by **any room member** once the submission window has closed.
- Add a server-side finalizer: `pg_cron` job or Edge Function that ends stale `playing` rooms.
- On the client, call finish from any player after the window, not only the host.
- Add a host-migration rule (oldest remaining player becomes host) or auto-close the room when the host leaves.

#### P0-6. Round start time comes from the host's device clock
**Evidence:** `src/services/api.ts:190-207` sets `started_at: new Date().toISOString()`; `supabase/schema.sql:237` compares it to the server's `now()`.

The host's clock defines `started_at`, but the server validates submissions and finishing against its own clock. A host whose device is 2 minutes fast makes everyone's words expire 2 minutes early; a slow clock lets submissions in after the visible timer.

**Impact:** Unfair rounds, "my words didn't count" bugs, results that disagree with the timer.
**Fix:** Move game start into a `SECURITY DEFINER` RPC `start_game(p_room_id, p_base_word)` that sets `started_at = now()` and returns the server time. Use that returned timestamp for the client timer. Optionally return a `server_time` offset and use it in `useTimer`.

#### P0-7. No account deletion, privacy policy, or UGC moderation
**Evidence:** No deletion flow in `Profile.tsx`/`AuthContext.tsx`; no privacy/terms pages; chat and usernames are unmoderated (`src/components/Game/Chat.tsx`, `schema.sql:78-85`).

Apple App Store:
- **5.1.1(v):** apps that create accounts must let users delete their account in-app.
- **5.1.1:** privacy policy link required.
- **1.2:** user-generated content requires filtering, reporting, blocking, and a support contact.

Google Play has equivalent UGC and Data safety requirements.
**Impact:** Guaranteed rejection or removal.
**Fix:** Add in-app account deletion (Edge Function with service role), a privacy policy + ToS, a report/block flow for chat, a profanity filter, and a support contact. Add age gating/rating questionnaire.

---

### P1 — High (fix before or during mobile packaging)

#### P1-1. Always-on 3-second polling of four queries
**Evidence:** `src/contexts/GameContext.tsx:307-309`

```ts
const liveStatePoll = window.setInterval(() => {
  void refreshLiveState(roomId);
}, 3000);
```

`refreshLiveState` runs 4 requests (`room`, `players`, `chat`, `receipts`) every 3 s for every client, even when realtime is healthy. That is ~1.3 requests/second/player and constant radio wake-ups.
**Impact:** Battery drain, mobile data use, Supabase egress, slow rooms on 3G.
**Fix:** Poll only when the realtime channel reports `CHANNEL_ERROR`/`TIMED_OUT`, pause when `document.hidden`, back off exponentially, and merge the 4 queries into one RPC. Also fetch sequentially in `refreshRoomData` (`GameContext.tsx:82-100`) — use `Promise.all`.

#### P1-2. No URL routing, deep links, or back-button support
**Evidence:** `src/App.tsx:30-63` — navigation is a `useState` page name persisted in `localStorage`.

There is no URL for a room, so:
- Android hardware back exits the app instead of going back.
- iOS edge-swipe does nothing.
- A reload on `/game` depends on `localStorage` + room restore.
- "Share the code or URL with friends" (`Landing.tsx:449`) is not actually supported.
**Impact:** Feels broken on mobile; no invite links; no analytics; no store deep links.
**Fix:** Introduce React Router (or TanStack Router) with routes such as `/`, `/join`, `/room/:code`, `/room/:roomId/game`, `/room/:roomId/results`, `/profile`, `/stats`. Add a 404/redirect guard. Add `navigator.share` for room invites.

#### P1-3. Word submission is a single all-or-nothing burst at time-up
**Evidence:** `src/pages/Game.tsx:62-79`

All words are submitted in parallel only when the timer reaches zero. There is no retry, no queue, no incremental save. On a flaky mobile network, any failed RPC silently loses those words (`Promise.allSettled` logs only).
**Impact:** Players lose rounds through no fault of their own — the top mobile complaint for realtime games.
**Fix:** Submit each word as the player finishes a line (or debounce 1–2 s), keep an offline queue with retry/backoff, and flush on `visibilitychange`/`pagehide`. Show a per-word status (pending/saved/rejected) in the notepad. Add a longer, server-defined grace window.

#### P1-4. `finish_room` / `reset_room` / `submit_word` are `SECURITY DEFINER` without `search_path`
**Evidence:** `supabase/schema.sql:283, 379, 408`; `supabase/migrations/003_...sql:87`, `005_...sql:76`.

Migration `002` and `004` correctly use `SET search_path = ''`, but the core game functions do not. Table references are schema-qualified, so exploitability is limited, but this is a known privilege-escalation footgun and should be consistent.
**Fix:** Add `SET search_path = ''` to every `SECURITY DEFINER` function and fully qualify all objects. Add a lint check in CI.

#### P1-5. Direct writes bypass the intended game flow
**Evidence:** `schema.sql:120-122` (anyone can insert submissions), `schema.sql:126` (anyone can insert game results), `schema.sql:104` (host can update any room column), `schema.sql:110-112` (host can update any player).

- A player can insert `is_valid = true` submissions directly (doesn't change score, but pollutes Results).
- Anyone can forge `game_results` rows.
- A host can set `status = 'playing'` or move `started_at` forward to extend a round.

**Fix:** Remove direct `INSERT` on `submissions` and `game_results`; only RPCs write them. Remove direct `UPDATE` on `rooms`; use `start_game`, `finish_room`, `reset_room` RPCs with explicit allowed transitions. Add `CHECK` constraints on `status`, `timer_duration`, and word/message lengths.

#### P1-6. Any authenticated user can enumerate every room
**Evidence:** `schema.sql:102`, `migrations/002_...sql:78-80` (`USING (true)`).

Room codes are 6 characters but the table itself is readable, so "private" rooms are not private. Anyone can list active rooms, read `base_word`, and join any lobby.
**Fix:** Restrict `rooms SELECT` to rooms where the user is host or a player. Add a `SECURITY DEFINER` `get_room_by_code(p_code)` RPC for the join flow, returning only the matching room. Add a max-player check and a join RPC.

#### P1-7. Host can leave, leaving an unstartable/unfinishable room
**Evidence:** `GameContext.tsx:439-455` deletes the player row but leaves `rooms.host_id`; Lobby only shows the start button to `isHost` (`Lobby.tsx:187-201`).

**Fix:** Host migration, room deletion when empty, and a room TTL (`expires_at`). Add a `DELETE` policy/trigger for abandoned rooms.

#### P1-8. Chat receipts and history scale poorly
**Evidence:** `GameContext.tsx:322-343, 504-520`, `api.ts:268-344`

- Every delivered message upserts one receipt per recipient, and every receipt is broadcast over realtime.
- `getChatMessages` loads the entire room history with no limit.
- Chat messages have no server-side length or rate limit.

**Impact:** Room with N players and M messages creates N×M receipt rows and events; mobile clients fetch all history on restore.
**Fix:** Batch receipts, cap history (e.g. last 200), paginate older messages, add `CHECK (length(message) <= 200)` and a per-user rate limit, and consider dropping "seen" receipts if not essential.

#### P1-9. User-controlled avatar URLs enable IP tracking
**Evidence:** `AuthContext.tsx:204-216` updates `avatar_url` from the client; `schema.sql:99` allows the user to update their own profile row; avatars are rendered as `<img src={profile.avatar_url}>` in lobby/game/results.

A user can set their avatar to a unique tracking URL and collect the IP/user-agent of everyone who sees them.
**Fix:** Store only an avatar seed/ID, generate the DiceBear URL client-side from an allowlist, or proxy avatars through your own domain.

#### P1-10. Room restore timeout can eject players on slow networks
**Evidence:** `AuthContext.tsx:22-32`, `GameContext.tsx:10, 145-190`

A 12-second timeout clears the saved room and shows the player as "not in a room". On a slow 3G/4G connection this is likely.
**Fix:** Distinguish timeout from "not a member", show a retry state instead of silently forgetting the room, and make restore cancellable. `timeoutAfter` does not cancel the underlying request, so late responses can still race.

---

### P2 — Medium (mobile quality and scale)

| # | Finding | Evidence | Recommendation |
|---|---|---|---|
| P2-1 | No max/min players; host can start with 1 player and ignoring "not ready" | `Lobby.tsx:48, 189-200` | Enforce 2+ players and ready state server-side; show why the button is disabled |
| P2-2 | `joinRoom` upsert resets `score` and `ready` | `api.ts:130-145` | Only reset on first join; use `ON CONFLICT DO NOTHING` or update only `ready` |
| P2-3 | Stats take `game_results[0]` with no ordering and include non-ended rooms | `Statistics.tsx:118-122`, `api.ts:347-359` | Filter `rooms.status = 'ended'`, order results by `created_at desc`, add `round_number` |
| P2-4 | "Avg Score" is computed over the last 10 matches only | `Statistics.tsx:41-43` | Rename to "Avg (last 10)" or compute server-side over all matches |
| P2-5 | Room code collision is not retried | `api.ts:46-69` | Retry on unique violation (36^6 space, but avoid user-facing failures) |
| P2-6 | Dictionary API is called per word on a 400 ms debounce; no timeout/abort; errors return "valid" | `dictionary.ts:4-21`, `useDictionaryCheck.ts:26-39` | Replace with a bundled/server-side word list; abort stale requests; dedupe in-flight words |
| P2-7 | No error boundary; a render error blanks the app | `src/main.tsx`, `src/App.tsx` | Add an error boundary with reload/report |
| P2-8 | Errors are swallowed; offline shows empty states | `api.ts` (many `return []`/`null`), `GameContext.tsx` catch blocks | Surface retryable errors, add an offline banner, distinguish 404 from network failure |
| P2-9 | No CI, lint fails, no strict TypeScript | `package.json`, `tsconfig.app.json` | Add `strict: true`, fix lint, run typecheck/lint/test/build in CI |
| P2-10 | No generated Supabase types; 9+ `any`s | `src/types/index.ts`, lint output | `supabase gen types typescript`; type all queries/RPC results |
| P2-11 | No rate limiting or profanity filter on chat/usernames | `Chat.tsx`, `schema.sql` | Add server-side limits and moderation (also required for store review) |
| P2-12 | Bundle is 505 KB; Google Fonts `@import`; 966 KB unused `logo_3.png` | `globals.css:1`, `public/` | Lazy-load pages, self-host fonts, remove unused assets, set a bundle budget |
| P2-13 | Heavy mobile CSS: `100vh`, `background-attachment: fixed`, many `backdrop-filter` layers | `globals.css:11-27`, `components.css` | Use `100dvh`/`100svh`, drop fixed backgrounds, reduce blur on low-end devices |
| P2-14 | No `viewport-fit=cover` or safe-area padding on navbar/footer | `index.html:7`, `components.css:336-345, 806-813` | Add `viewport-fit=cover`; pad top/bottom with `env(safe-area-inset-*)` |
| P2-15 | Modals/chat lack focus trap, Escape, and focus restore | `ProfileModal.tsx`, `Chat.tsx`, `Lobby.tsx:217-282`, `NotificationContext.tsx` | Add an accessible dialog primitive (`aria-modal`, focus trap, Escape, restore) |
| P2-16 | Nested interactive elements in Results | `Results.tsx:230-262` (`div role=button` containing a `button`) | Use a single button row with a separate avatar action |
| P2-17 | Sound state is not persisted; iOS audio unlock is implicit | `sound.ts`, `VolumeControl.tsx` | Persist mute in `localStorage`; unlock AudioContext on first user gesture; add a "sound on" prompt |
| P2-18 | No PWA/install metadata | `index.html`, `public/` | Add manifest, theme-color, icons, splash screens, service worker (if PWA) |
| P2-19 | No monitoring/crash reporting/analytics | repo-wide | Add Sentry (or equivalent) + privacy-safe analytics |
| P2-20 | Schema and migrations disagree; README only says run `schema.sql` + `002` | `README.md:27-39`, `supabase/` | Adopt Supabase CLI migrations, consolidate into one ordered history, document `supabase db push` |

---

### P3 — Low / cleanup

- `src/utils/validation.ts` is dead code (only the test imports it); the Game submits without client validation.
- `src/App.css`, `src/assets/react.svg`, `src/assets/vite.svg`, `public/logo_3.png`, `public/logo3.png`, `public/icons.svg` appear unused.
- `navigator.clipboard.writeText` is not awaited/caught; "Copied" is shown even on failure (`Lobby.tsx:50-54`).
- `signOut` has no timeout (`AuthContext.tsx:218-224`).
- Timer re-renders 4×/second (`useTimer.ts:69`); 1 s is enough.
- `autoFocus` on the base-word modal can summon the keyboard immediately on mobile (`Lobby.tsx:257`).
- No `inputmode`/`enterkeyhint` hints on the room code and notepad.
- No haptics on valid/invalid submissions.
- No `prefers-reduced-motion` handling for the float/shake/pulse animations.
- `navigator.share` not used for invites.
- No app version/build number surfaced in the UI.

---

## 3. What is already good

- Clear separation of pages, contexts, services, hooks, and styles.
- RLS is enabled on every table (the policies need work, but the foundation is there).
- Scoring goes through a database RPC instead of a client-side increment.
- `finish_room` locks the room with `FOR UPDATE` and is idempotent for `ended`.
- Auth and profile loads have timeouts, and profile loading is kept out of the Supabase auth callback (avoids a known deadlock).
- The timer is based on absolute timestamps, not a decrementing counter, and re-syncs on visibility change.
- Mobile CSS already covers 44 px touch targets, 16 px inputs, dense game layout, safe-area insets for chat/toasts, and reduced landing typography.
- Chat renders as text (no `dangerouslySetInnerHTML`), and React escapes user content.
- No production dependency vulnerabilities.
- The build and existing tests pass.

---

## 4. Mobile packaging decision

| Option | Effort | Fit for SpellSift | Notes |
|---|---|---|---|
| **PWA** | Low | Good first step | Installable, no store review, but iOS limits push/background behavior; no App Store presence |
| **Capacitor wrapper** (recommended) | Medium | Best short-term | Reuses the React app; gives native shell, back button, push, haptics, share, status bar, store distribution. Must add native value to pass App Store 4.2 |
| **React Native / Expo rewrite** | High | Long-term | Best native feel and background reliability, but a UI/state rewrite; not justified before the P0 fixes |

Whichever path is chosen, the P0 security/game-integrity fixes must land first. A mobile binary embeds the anon key, so every RLS hole becomes a public API.

---

## 5. Recommended remediation plan

### Phase 1 — Security & game integrity (3–5 days)
1. Rewrite RLS: remove direct `UPDATE` on `players`, restrict `profiles`, add `public_profiles` view, remove direct writes to `submissions`/`game_results`, restrict `rooms` reads.
2. Add `SET search_path = ''` to all `SECURITY DEFINER` functions.
3. Server-side word rules: minimum length, dictionary, membership check, room-status check, length cap.
4. Move `start_game` to an RPC with `now()`; return server time.
5. Add `CHECK` constraints on status, timer, word length, chat length.
6. Add pgTAP/RLS tests proving a player cannot change score/stats or read another user's email.

### Phase 2 — Reliability & mobile UX (1–2 weeks)
1. Make `finish_room` callable by any member and add a stale-room finalizer.
2. Incremental word submission with retry/offline queue and lifecycle flush.
3. Replace polling with realtime + backoff fallback; pause when hidden.
4. Introduce URL routing, deep links, back-button handling, and share-sheet invites.
5. Add error boundary, offline banner, retry states, and better error mapping.
6. Add PWA/Capacitor shell: manifest, safe areas, `100dvh`, status bar, haptics, app lifecycle.

### Phase 3 — Store readiness (1 week + review)
1. Account deletion, privacy policy, ToS, support contact.
2. UGC moderation: report/block, profanity filter, rate limits.
3. Crash reporting, analytics, and a staging environment.
4. Store assets, screenshots, age rating, Data safety form.
5. E2E tests for create → join → play → results → rematch on two clients, plus mobile viewport tests.

---

## 6. Go/No-Go checklist

| Gate | Status |
|---|---|
| Build passes | ✅ |
| Lint passes | ❌ |
| Tests cover game flow / RLS | ❌ |
| Score cannot be forged | ❌ |
| Email not exposed | ❌ |
| Dictionary/min-length enforced server-side | ❌ |
| Game cannot get stuck if host leaves | ❌ |
| Round time uses server clock | ❌ |
| Back button / deep links work | ❌ |
| Account deletion + privacy policy | ❌ |
| UGC moderation/reporting | ❌ |
| Offline/slow-network handling | ❌ |
| PWA/Capacitor shell + safe areas | ❌ |
| Crash reporting / monitoring | ❌ |

**Recommendation:** complete Phase 1 before starting mobile packaging, then Phase 2 in parallel with the Capacitor/PWA shell. Do not submit to either store until the Phase 3 gates pass.

---

## 7. Remediation status (post-hardening)

This section records what changed after the audit. The original findings above are
kept for history.

| Gate | Status | Evidence |
|---|---|---|
| Build passes | ✅ | `npm run build` |
| Lint passes | ✅ | `npm run lint` |
| TypeScript strict mode | ✅ | `tsconfig.app.json` |
| CI pipeline | ✅ | `.github/workflows/ci.yml` |
| Unit tests | ✅ | `npm test` (4 files, 17 tests) |
| SQL game-flow test | ✅ | `supabase/tests/flow.sql` |
| SQL RLS/direct-write test | ✅ | `supabase/tests/rls.sql` |
| Migration `009` upgrades the previous schema | ✅ | Validated against `git show HEAD:supabase/schema.sql` |
| Score cannot be forged | ✅ | Direct `players` updates blocked; only `submit_word` changes score |
| Email not exposed | ✅ | `profiles.email` removed; email stays in `auth.users` |
| Dictionary/min-length enforced server-side | ✅ | `dictionary_words` + `submit_word`; seed in `supabase/seed/dictionary.sql` |
| Game cannot get stuck if host leaves | ✅ | Any active member can finish after the grace window; host migration; `pg_cron` finalizer |
| Round time uses server clock | ✅ | `start_game` sets `started_at = now()`; client syncs `get_server_time` |
| Back button / deep links work | ✅ | Hash routing, `#/join/CODE` invites, share sheet |
| Account deletion + privacy policy | ✅ | Edge Function `delete-account`, `Legal.tsx` |
| UGC moderation/reporting | ✅ | Report, block, profanity filter, length/rate limits |
| Offline/slow-network handling | ✅ | Incremental saves, retries, adaptive polling, offline banner, restore retry |
| PWA/Capacitor shell + safe areas | ✅ | Manifest, service worker, icons, `100dvh`, safe-area padding |
| Crash reporting / monitoring | ✅ | Optional `VITE_ERROR_REPORT_URL` collector |
| `.env` removed from the working tree/index | ✅ | `git rm --cached .env`, `.gitignore` |
| `.env` purged from git history | ⚠️ | Requires a coordinated force-push; see README security section |
| Store age rating / Data safety form | ⚠️ | External store-console work, not code |
| Two-client E2E automation | ⚠️ | Manual checklist still recommended before store submission |

**Remaining manual steps:** complete the store listing/age-rating/Data safety
forms, run a two-device smoke test (create → join → play → results → rematch),
and decide whether to rewrite git history to purge the historical anon key.

