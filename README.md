# SpellSift 🎮
> **Tagline:** Find. Form. Win.

SpellSift is a real-time multiplayer word game built with **React**, **TypeScript**, **Vite**, **Pure CSS**, and **Supabase**. One host starts a room, picks the round duration, and provides a base word. Players race the clock to form as many valid words as possible using only the letters from the base word. Live scoreboards and chat sync in real time.

---

## 🚀 Quick Start

### 1. Clone & install

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in the Supabase client settings:

- `VITE_SUPABASE_URL`: your Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: your Supabase anon/public key.
- `VITE_ERROR_REPORT_URL` (optional): an HTTPS endpoint that receives unhandled client errors as JSON. Leave blank to log errors only in the browser console.

`.env` and `.env.local` are ignored by git. Never put a service-role key in a `VITE_*` variable: every Vite variable is embedded in the browser bundle.

### 3. Initialize Supabase

Use the [Supabase CLI](https://supabase.com/docs/guides/cli) for an existing project:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

`supabase db push` applies the numbered migrations in `supabase/migrations/`. Migration `009_security_and_integrity.sql` is the consolidated security/game-integrity upgrade and is also the source of truth for a fresh install. For a brand-new project you can alternatively run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor.

**Seed the dictionary.** Dictionary mode validates words on the server against `public.dictionary_words`. Load the bundled word list once (and again after recreating the database):

```bash
psql "$DATABASE_URL" -f supabase/seed/dictionary.sql
```

Use the direct database connection string from **Project Settings → Database**. The seed is safe to re-run.

**Deploy account deletion.** In-app account deletion calls a Supabase Edge Function:

```bash
supabase functions deploy delete-account
```

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the function automatically. The service-role key is never shipped to the browser.

Realtime publication for `rooms`, `players`, `submissions`, `chat_messages`, and `chat_message_receipts` is configured by the schema. No manual replication setup is required.

### 4. Run the development server

```bash
npm run dev
```

Open `http://localhost:5173`.

---

## 🧪 Testing and checks

```bash
npm run lint
npm test
npm run build
```

The CI workflow in `.github/workflows/ci.yml` runs the same checks on every push and pull request, plus the SQL flow/RLS suite against a disposable Postgres service.

SQL security checks live in [`supabase/tests/`](supabase/tests/). They require a Postgres database with the schema applied; see the README in that directory for the exact commands.

---

## 📂 Project structure

```
src/
├── components/
│   ├── Auth/              # Account authentication forms
│   ├── Game/              # Game board, chat, and moderation actions
│   ├── Common/            # Spinner, error boundary, profile modal
│   └── Layout/            # Navbar, footer, page frame
├── pages/
│   ├── Landing.tsx        # Homepage, login, and registration
│   ├── CreateRoom.tsx     # Game host duration and rules configuration
│   ├── JoinRoom.tsx       # Room joining, including invite deep links
│   ├── Lobby.tsx          # Real-time waiting area and invite sharing
│   ├── Game.tsx           # Play board, incremental saving, live leaderboard
│   ├── Results.tsx        # Winners, submission inspection, and rematch
│   ├── Profile.tsx        # Username, avatar, blocked players, deletion
│   ├── Statistics.tsx     # Career wins, games played, and match logs
│   └── Legal.tsx          # Privacy Policy and Terms of Service
├── hooks/                 # Auth, game, timer, dictionary, dialog, online status
├── contexts/              # Auth, game/realtime, and notifications
├── services/              # Supabase client and RPC/query wrappers
├── utils/                 # Validation, notepad, time, errors, haptics, monitoring
├── types/                 # TypeScript models
└── styles/                # Structured stylesheets (Pure CSS)

supabase/
├── schema.sql             # Secure source of truth for fresh installs
├── migrations/            # Ordered upgrade migrations
├── seed/dictionary.sql    # Server-side word list
├── functions/             # Edge Functions (account deletion)
└── tests/                 # SQL flow/RLS security checks
```

---

## 🔐 Security model

- All score, room-state, result, chat, profile, and moderation mutations go through `SECURITY DEFINER` RPCs.
- Direct writes to `players`, `rooms`, `submissions`, `game_results`, and `dictionary_words` are blocked by grants/RLS.
- `profiles` no longer stores email addresses. Email remains in `auth.users`.
- Chat supports reporting, blocking, profanity filtering, length limits, and per-user rate limits.
- The anon key is safe to ship only because RLS and RPC authorization enforce the boundary. Keep it that way.
- `.env` is untracked and ignored. If the repository was ever public with an environment file committed, purge it from history before making the repo public again:

```bash
# Requires git-filter-repo: https://github.com/newren/git-filter-repo
git filter-repo --path .env --invert-paths
git push --force-with-lease origin main
```

Force-pushing rewrites history. Coordinate with every collaborator first. Rotate the anon key from the Supabase dashboard if you want to invalidate old copies of it.

---

## 🏆 Key features

- **Server-authoritative timer**: `start_game` sets `started_at = now()` and the client syncs against a server clock offset.
- **Incremental word saving**: words are submitted as the player presses Enter or leaves the notepad, then retried at time-up.
- **Dictionary enforcement**: the server rejects words that are not in `dictionary_words`.
- **Host migration and stale-room finalization**: any active member can finish a room after the grace window, and a scheduled finalizer closes abandoned games.
- **Rematch flow**: the host can reset scores, clear submissions, and return everyone to the lobby.
- **Detailed submissions inspection**: click any player on the results screen to inspect their word breakdown.
- **Accessible dialogs and chat**: focus traps, Escape handling, focus restore, and live regions.
- **Installable PWA**: manifest, theme color, offline shell, and safe-area-aware layout.
