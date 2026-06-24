# SpellSift 🎮
> **Tagline:** Find. Form. Win.

SpellSift is a production-ready, real-time multiplayer word game built with **React**, **TypeScript**, **Vite**, **Pure CSS**, and **Supabase**. One host starts a room, picks the round duration, and provides a base word. Players race the clock to form as many valid words as possible using only the letters from the base word. Live scoreboards and chat sync in real time!

---

## 🚀 Quick Start Instructions

### 1. Clone & Install Dependencies
First, install the package dependencies:
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory and copy the contents of `.env.example`:
```bash
cp .env.example .env
```
Fill in the Supabase client settings used by this frontend:
- `VITE_SUPABASE_URL`: Your Supabase Project URL.
- `VITE_SUPABASE_ANON_KEY`: Your Supabase Anonymous API Key.

The Postgres URI you pasted is for direct database access from server-side tools. The browser app uses the project URL plus anon key instead.

### 3. Initialize the Database
1. Go to the [Supabase Console](https://supabase.com/dashboard).
2. Open the **SQL Editor** in your project.
3. Copy the entire contents of [supabase/schema.sql](supabase/schema.sql) and execute it.
4. Go to **Database** -> **Replication** -> **Source tables** and make sure you enable Replication for the following tables to activate real-time features:
   - `rooms`
   - `players`
   - `submissions`
   - `chat_messages`

For an existing project whose database was reset or repaired, also run
[`supabase/migrations/002_repair_auth_profiles_and_room_rls.sql`](supabase/migrations/002_repair_auth_profiles_and_room_rls.sql).
It restores missing public profiles for existing Auth users and repairs the room/player RLS policies without disabling RLS.

### 4. Run Development Server
Start the local Vite development server:
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:5173`.

---

## 🧪 Testing

To run unit tests for the word validation logic:
```bash
npm run test
```

---

## 📂 File Structure

```
src/
├── components/
│   ├── Auth/              # Account authentication forms
│   ├── Game/              # Active Game boards, Chat widgets
│   ├── Common/            # Loading Spinners, Audio volume selectors
│   └── Layout/            # Navbars, Footers, Page frames
├── pages/
│   ├── Landing.tsx        # Homepage, login, and registration
│   ├── CreateRoom.tsx     # Game host duration and rules configuration
│   ├── JoinRoom.tsx       # Room joining keypad
│   ├── Lobby.tsx          # Real-time waiting area
│   ├── Game.tsx           # Play board with letter tiles and live leaderboards
│   ├── Results.tsx        # Winner crown displays, submissions inspection, and rematch button
│   ├── Profile.tsx        # User username editor and robot avatar selection
│   └── Statistics.tsx     # Career wins, games played, and match logs
├── hooks/
│   ├── useAuth.ts         # User session references
│   ├── useGame.ts         # Sync room subscriptions
│   └── useTimer.ts        # Drift-free ticking countdown timer
├── contexts/
│   ├── AuthContext.tsx    # Auth handlers
│   └── GameContext.tsx    # Real-time Postgres Changes channels
├── services/
│   ├── supabase.ts        # Supabase client singleton
│   └── api.ts             # Direct database SQL wrapper calls
├── utils/
│   ├── validation.ts      # Word validation check
│   └── sound.ts           # Browser Web Audio API sound synthesizer
├── types/
│   └── index.ts           # TypeScript models
└── styles/                # Structured stylesheets (Pure CSS)
```

---

## 🏆 Key Features

- **Drift-Free Realtime Timers**: Timer syncs based on absolute server timestamps to accommodate page reloads and network lag.
- **Micro-synthesized Audio**: Sound effects for countdown ticks, success chimes, buzzers, and victory melodies built purely using the Web Audio API (no assets to load).
- **Rematch Flow**: Host can trigger a rematch which resets scores, clears submissions, and updates lobby views for all players instantly.
- **Detailed Submissions Inspection**: Click on any player in the results screen to inspect their submissions breakdown in real time.
