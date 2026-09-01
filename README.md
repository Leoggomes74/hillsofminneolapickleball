# Pickleball Tournaments — Hills of Minneola

Live tournament site. Everything is stored server-side, so every visitor with
the link sees the same schedule and the same scores.

## Files

- `index.html` — shell and styles (no build step)
- `app-core.js` — schedule generation, formats, standings, knockout, court order
- `app-views.js` — all screens
- `app-state.js` — state, API calls, events, **the passcode constant**
- `api/data.js` — serverless function: tournaments, events, event types, scores, comments
- `package.json` — marks the API route as an ES module
- `vercel.json` — caching headers

## Data model

```
db
├── eventTypes[]        maintainable master table (Men's Singles, Mixed Doubles, …)
└── tournaments[]
    ├── name, director, date, time, locked, archived
    ├── order[]         one court sequence across every event
    ├── notes[]         public comments (Say tab)
    ├── events[]        one per event type in this tournament
        ├── eventTypeId, date, time
        ├── regOpen, maxTeams          public self-registration
        ├── poolCount, knockout, poolFormat, koFormat, finalFormat
        ├── teams[]     name + players + pool + registered
        └── results{}   scores for this event only
```

Older data upgrades itself on first read: a pre-existing tournament becomes a
single event matching its old category, with its scores intact.

## Event types

Home screen → **⚙ Manage event types** (passcode). Ships with Men's Singles,
Women's Singles, Men's Doubles, Women's Doubles and Mixed Doubles. You can
rename any of them, flag a type as singles (one player per entry) or doubles,
and add your own. A type that is used by any tournament cannot be deleted.

## Tournaments and events

**+ Create tournament** (passcode) is three steps:

1. **Tournament** — name, director, start date and time.
2. **Event types** — add one or more events. Each event has its own date, start
   time, number of teams/players, number of pools, pool game format, knockout
   on/off, and semifinal/final formats.
3. **Entries** — the roster for each event: add or remove entries, edit names,
   and tap pool letters to move an entry. Self-registered entries carry a green
   dot.

## Self-registration

Each event has **Let people register themselves** (on by default) and an
optional maximum. When it is on, anyone can open the tournament, pick the event
from the chip row, and register on the **Teams** tab: team name, their name and
their partner's name — no passcode. The entry lands in the roster and in the
emptiest pool, so the schedule, standings and bracket update immediately.

Rejected automatically: duplicate team names, a player who is already entered in
that event, and anything past the maximum. The panel disappears when the event
is full, registration is closed, or the tournament is locked.

Organizers correct or delete any registration in **⋯ → Edit setup & events →
Entries**.

Each event generates its own round robin and bracket:

- 1 pool → top four to the semifinals (1v4, 2v3)
- 2 pools → semifinals cross over (A1–B2, B1–A2)
- 3+ pools → pool winners, filled to four by the best runners-up on differential
- Knockout off → pool play only, winner is top of the table

On the tournament screen, a chip row switches between events. Now, Groups,
Bracket, Teams and Recap are per event; Order, Say and Info cover the whole
tournament.

## Court order

All events share the same courts, so the **Order** tab shows one running order
for the entire tournament. The automatic order interleaves pool matches round by
round across every event, then runs all semifinals, all third-place matches and
all finals. Use ▲▼ to move any match (passcode required) — the manual sequence
is saved per tournament and survives edits; new matches append to the end.
**Rebuild automatic order** resets it. Tapping a row opens that match's score
sheet.

## Printable score sheets

**Order** tab → **⎘ Printable score sheets**. One line per match in court order:
number, event type, stage, both entries on a dotted write-on line, empty boxes
for the score (three when the format is best of 3), and blanks for Court, Time
and Initials. Print strips the app chrome and prints full-width black-on-white.

## Who can do what

| | Visitor | Organizer (passcode) |
| --- | --- | --- |
| View schedule, standings, brackets, recap | ✓ | ✓ |
| Leave a comment on **Say** | ✓ | ✓ |
| Register a team for an open event | ✓ | ✓ |
| Enter or edit scores | | ✓ |
| Create / edit / duplicate / lock / archive / delete tournaments | | ✓ |
| Add or edit event types | | ✓ |
| Change the court order | | ✓ |
| Remove a comment | | ✓ |

Every write except posting a comment is checked **on the server**, not in the
browser.

## Deploy (about 5 minutes)

1. **Push these files** to your repo root (or drag the folder onto vercel.com/new).
2. **Add a store.** Vercel dashboard → your project → **Storage** →
   **Create Database** → **Upstash Redis** (this is what "Vercel KV" is now) →
   Free plan → connect it to this project. That adds the env vars the API route
   needs (`KV_REST_API_URL` / `KV_REST_API_TOKEN`, or the `UPSTASH_…` equivalents).
3. **Set the scoring passcode** (next section).
4. **Redeploy** so the new env vars are picked up.

## Setting the passcode

The passcode lives in two places and **both must match**. If you skip this, it
stays `2074` and everything still works.

### Part A — the server (in Vercel)

1. Open your project on **vercel.com** → **Settings** → **Environment Variables**.
2. Key: `SCORE_PASSCODE`  Value: your 4 digits, e.g. `7391`.
3. Leave Production, Preview and Development all ticked → **Save**.
4. **Deployments** tab → **⋯** on the newest deployment → **Redeploy**.
   Environment variables only take effect on a new deployment.

### Part B — the page

1. Open `app-state.js`.
2. Line 4:

       var PASSCODE = "2074";

3. Change it to the same digits, save, commit and push.

If the keypad accepts a code but saving fails, the two values differ.

## How it works

- Anyone can read; writing requires the passcode, checked server-side.
- The page re-fetches every 10 seconds and whenever it regains focus, so
  spectators see scores appear without reloading. Auto-refresh pauses while you
  are typing in any field.
- If the server is unreachable the badge turns **RETRY** and the app falls back
  to that device's cached copy.

## API

`GET /api/data` → `{ t, db }`

`POST /api/data` with `{ action, pin, … }`:

| Action | Payload | Passcode |
| --- | --- | --- |
| `score` / `clearScore` | tournamentId, eventId, id, a, b, status | ✓ |
| `create` / `update` | tournament {…, events[]} | ✓ |
| `duplicate` / `remove` / `restore` / `purge` / `lock` / `setDefault` | tournamentId | ✓ |
| `setOrder` | tournamentId, order[] | ✓ |
| `addEventType` / `renameEventType` / `removeEventType` | id, name, singles | ✓ |
| `note` | tournamentId, who, text | — |
| `register` | tournamentId, eventId, team, p1, p2 | — |
| `removeNote` | tournamentId, id | ✓ |
