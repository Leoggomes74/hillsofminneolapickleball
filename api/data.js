// Vercel serverless function — multi-tournament / multi-event store.
//
// GET  /api/data                          -> { t, db }
// POST /api/data { action, pin, ... }     -> { t, db }
//   tournament: create, update, remove, restore, duplicate, lock, setDefault, purge
//   event type: addEventType, renameEventType, removeEventType
//   scores:     score, clearScore   (require eventId)
//   open:       note                (no passcode) / removeNote (passcode)
//
// Storage: Vercel KV / Upstash Redis REST API.
// SCORE_PASSCODE gates every write except `note` (defaults to 2074).

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PIN = process.env.SCORE_PASSCODE || "2074";
const DB_KEY = "hom:db";
const STAMP_KEY = "hom:updated";
const LEGACY_KEY = "hom2026:results";

async function kv(command) {
  if (!URL_ || !TOKEN) throw new Error("KV not configured");
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store"
  });
  if (!r.ok) throw new Error(`KV ${r.status}`);
  return (await r.json()).result;
}

const DEFAULT_TYPES = [
  { id: "mens-singles", name: "Men's Singles", singles: true },
  { id: "womens-singles", name: "Women's Singles", singles: true },
  { id: "mens-doubles", name: "Men's Doubles", singles: false },
  { id: "womens-doubles", name: "Women's Doubles", singles: false },
  { id: "mixed-doubles", name: "Mixed Doubles", singles: false }
];

const HILLS_TEAMS = [
  ["Arepa con Pitorro", ["Jaime Morales", "Georgina"]],
  ["Caribe Smash", ["Rafael", "Jean"]],
  ["Dinking Couple", ["Mat", "Colby"]],
  ["Team Lionic", ["Nicci", "Gene"]],
  ["The Strangers", ["Sabrina", "Daniel"]],
  ["V Power", ["Sandra", "Carlos"]],
  ["Team Flame", ["Berta", "William"]],
  ["Team Venom", ["Raghu", "Gabby"]],
  ["Macho Camacho", ["Crystal", "Marcus"]],
  ["R&B", ["Rola", "Balbino"]]
];

// Old ids (GA1…GB10, SF1, SF2, B3, F1..F3) -> new deterministic ids.
const LEGACY_MAP = (() => {
  const order = {
    GA1: [0, 1], GA2: [2, 3], GA3: [0, 4], GA4: [1, 2], GA5: [3, 4],
    GA6: [0, 2], GA7: [1, 3], GA8: [2, 4], GA9: [0, 3], GA10: [1, 4],
    GB1: [0, 1], GB2: [2, 3], GB3: [0, 4], GB4: [1, 2], GB5: [3, 4],
    GB6: [0, 2], GB7: [1, 3], GB8: [2, 4], GB9: [0, 3], GB10: [1, 4]
  };
  const map = {};
  for (const [old, pair] of Object.entries(order)) {
    const pool = old[1] === "A" ? 0 : 1;
    map[old] = `P${pool}-${pair[0]}-${pair[1]}`;
  }
  map.SF1 = "SF1"; map.SF2 = "SF2"; map.B3 = "BR";
  map.F1 = "FN#1"; map.F2 = "FN#2"; map.F3 = "FN#3";
  return map;
})();

function hillsTournament(results) {
  return {
    id: "hills-2026",
    name: "Hills of Minneola Mixed Doubles",
    director: "",
    date: "2026-08-30",
    time: "08:00",
    events: [{
      id: "ev-hills-1",
      eventTypeId: "mixed-doubles",
      date: "2026-08-30",
      time: "08:00",
      poolCount: 2,
      knockout: true,
      poolFormat: "to11win1",
      koFormat: "to11win2",
      finalFormat: "bo3to11",
      teams: HILLS_TEAMS.map(([name, players], i) => ({ name, players, pool: i < 5 ? 0 : 1 })),
      results: results || {}
    }],
    notes: [],
    locked: false,
    archived: false,
    createdAt: Date.now()
  };
}

function migrate(legacyRaw) {
  let old = {};
  if (legacyRaw) { try { old = JSON.parse(legacyRaw) || {}; } catch { old = {}; } }
  const results = {};
  for (const [k, v] of Object.entries(old)) {
    const id = LEGACY_MAP[k];
    if (id) results[id] = v;
  }
  return { tournaments: [hillsTournament(results)], eventTypes: DEFAULT_TYPES.map(t => ({ ...t })), defaultId: "hills-2026", v: 3 };
}

// v2 (tournament owns teams/pools) -> v3 (tournament owns events)
function upgrade(db) {
  if (!Array.isArray(db.eventTypes) || !db.eventTypes.length) db.eventTypes = DEFAULT_TYPES.map(t => ({ ...t }));
  db.eventTypes.forEach(t => { if (typeof t.singles !== "boolean") t.singles = /singles/i.test(t.name || ""); });
  const matchType = name => {
    const s = slug(name || "");
    return (db.eventTypes.find(t => t.id === s) || db.eventTypes.find(t => slug(t.name) === s) || db.eventTypes[0]).id;
  };
  (db.tournaments || []).forEach(t => {
    if (!Array.isArray(t.events)) {
      t.events = [{
        id: "ev" + Math.random().toString(36).slice(2, 8),
        eventTypeId: matchType(t.category),
        date: t.date || "", time: t.time || "",
        poolCount: t.poolCount || 1,
        knockout: t.knockout !== false,
        poolFormat: t.poolFormat || "to11win1",
        koFormat: t.koFormat || "to11win2",
        finalFormat: t.finalFormat || "bo3to11",
        teams: Array.isArray(t.teams) ? t.teams : [],
        results: t.results || {}
      }];
      delete t.category; delete t.poolCount; delete t.knockout;
      delete t.poolFormat; delete t.koFormat; delete t.finalFormat;
      delete t.teams; delete t.results;
    }
  });
  db.v = 3;
  return db;
}

async function readDb() {
  const [raw, t] = await Promise.all([kv(["GET", DB_KEY]), kv(["GET", STAMP_KEY])]);
  if (raw) {
    try {
      const db = JSON.parse(raw);
      if (db && Array.isArray(db.tournaments)) {
        const before = db.v;
        upgrade(db);
        if (before !== 3) await writeDb(db);
        return { db, t: Number(t) || 0 };
      }
    } catch { /* fall through to migration */ }
  }
  const legacy = await kv(["GET", LEGACY_KEY]);
  const db = migrate(legacy);
  await writeDb(db);
  return { db, t: Date.now() };
}

async function writeDb(db) {
  const t = Date.now();
  await Promise.all([
    kv(["SET", DB_KEY, JSON.stringify(db)]),
    kv(["SET", STAMP_KEY, String(t)])
  ]);
  return t;
}

const clampScore = n => Math.max(0, Math.min(99, parseInt(n, 10) || 0));
const clean = (s, max) => String(s == null ? "" : s).slice(0, max).trim();
const slug = s => clean(s, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event";
const rid = p => p + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5);

function sanitizeEvent(body, existing) {
  const teams = Array.isArray(body.teams) ? body.teams.slice(0, 32).map((t, i) => ({
    name: clean(t && t.name, 40) || `Team ${i + 1}`,
    players: (Array.isArray(t && t.players) ? t.players : []).slice(0, 2).map(p => clean(p, 40)).filter(Boolean),
    pool: Math.max(0, Math.min(7, parseInt(t && t.pool, 10) || 0)),
    registered: t && t.registered ? Number(t.registered) || 0 : 0
  })) : [];
  return {
    id: existing ? existing.id : rid("ev"),
    eventTypeId: slug(body.eventTypeId || "mixed-doubles"),
    date: clean(body.date, 10),
    time: clean(body.time, 5),
    regOpen: body.regOpen !== false,
    maxTeams: Math.max(0, Math.min(32, parseInt(body.maxTeams, 10) || 0)),
    poolCount: Math.max(1, Math.min(8, parseInt(body.poolCount, 10) || 1)),
    knockout: body.knockout !== false,
    poolFormat: clean(body.poolFormat, 12) || "to11win1",
    koFormat: clean(body.koFormat, 12) || "to11win2",
    finalFormat: clean(body.finalFormat, 12) || "to11win2",
    teams,
    waitlist: existing && Array.isArray(existing.waitlist) ? existing.waitlist : [],
    results: existing ? existing.results || {} : {}
  };
}

function sanitizeTournament(body, existing) {
  const prev = existing ? (existing.events || []) : [];
  const events = (Array.isArray(body.events) ? body.events : []).slice(0, 12)
    .map(e => sanitizeEvent(e, prev.find(p => p.id === (e && e.id))));
  return {
    id: existing ? existing.id : `${slug(body.name)}-${Date.now().toString(36).slice(-4)}`,
    name: clean(body.name, 60) || "Untitled tournament",
    director: clean(body.director, 60),
    fee: clean(body.fee, 40),
    date: clean(body.date, 10),
    time: clean(body.time, 5),
    events: events.length ? events : prev,
    order: Array.isArray(body.order) ? body.order.slice(0, 600).map(k => clean(k, 60)) : (existing ? existing.order || [] : []),
    courtCount: Math.max(0, Math.min(12, parseInt(body.courtCount, 10) || 0)),
    courtNames: (Array.isArray(body.courtNames) ? body.courtNames : []).slice(0, 12).map(n => clean(n, 24)),
    courtMap: existing ? existing.courtMap || {} : {},
    notes: existing ? existing.notes || [] : [],
    locked: existing ? !!existing.locked : false,
    archived: existing ? !!existing.archived : false,
    createdAt: existing ? existing.createdAt : Date.now()
  };
}

export default async function (req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const { db, t } = await readDb();
      return res.status(200).json({ t, db });
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "method not allowed" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const OPEN = new Set(["note", "register", "waitlist"]);   // actions that need no passcode
    if (!OPEN.has(body.action) && String(body.pin || "") !== String(PIN)) {
      return res.status(401).json({ error: "bad passcode" });
    }

    const { db } = await readDb();
    const find = id => db.tournaments.find(x => x.id === id);
    const findEv = (tour, id) => (tour.events || []).find(e => e.id === id) || (tour.events || [])[0];
    const a = body.action;

    // ---- event type table ---------------------------------------------------
    if (a === "addEventType" || a === "renameEventType" || a === "removeEventType") {
      db.eventTypes = Array.isArray(db.eventTypes) ? db.eventTypes : DEFAULT_TYPES.map(t => ({ ...t }));
      if (a === "addEventType") {
        const name = clean(body.name, 40);
        if (!name) return res.status(400).json({ error: "name required" });
        let id = slug(name);
        while (db.eventTypes.some(t => t.id === id)) id = id + "-2";
        db.eventTypes.push({ id, name, singles: !!body.singles });
      } else if (a === "renameEventType") {
        const cur = db.eventTypes.find(t => t.id === body.id);
        if (!cur) return res.status(404).json({ error: "no such event type" });
        const name = clean(body.name, 40);
        if (!name) return res.status(400).json({ error: "name required" });
        cur.name = name;
        if (typeof body.singles === "boolean") cur.singles = body.singles;
      } else {
        const used = db.tournaments.some(t => (t.events || []).some(e => e.eventTypeId === body.id));
        if (used) return res.status(409).json({ error: "event type is in use" });
        db.eventTypes = db.eventTypes.filter(t => t.id !== body.id);
        if (!db.eventTypes.length) return res.status(409).json({ error: "keep at least one event type" });
      }
      const t = await writeDb(db);
      return res.status(200).json({ t, db });
    }

    // ---- public self-registration -------------------------------------------
    if (a === "register") {
      const tour = find(body.tournamentId);
      if (!tour) return res.status(404).json({ error: "no such tournament" });
      if (tour.locked) return res.status(423).json({ error: "this tournament is locked" });
      const ev = (tour.events || []).find(e => e.id === body.eventId);
      if (!ev) return res.status(404).json({ error: "no such event" });
      if (ev.regOpen === false) return res.status(409).json({ error: "registration is closed for this event" });
      const type = (db.eventTypes || []).find(x => x.id === ev.eventTypeId);
      const single = type ? !!type.singles : false;
      const name = clean(body.team, 40), p1 = clean(body.p1, 40), p2 = clean(body.p2, 40);
      if (!name || !p1 || (!single && !p2)) return res.status(400).json({ error: "name, player and partner are required" });
      ev.teams = Array.isArray(ev.teams) ? ev.teams : [];
      const cap = ev.maxTeams ? Math.min(ev.maxTeams, 32) : 32;
      if (ev.teams.length >= cap) return res.status(409).json({ error: "this event is full" });
      const lower = s => String(s).toLowerCase();
      if (ev.teams.some(t => lower(t.name) === lower(name))) return res.status(409).json({ error: "that team name is already taken" });
      const already = ev.teams.some(t => (t.players || []).some(p => lower(p) === lower(p1) || (p2 && lower(p) === lower(p2))));
      if (already) return res.status(409).json({ error: "one of those players is already entered" });
      const pc = Math.max(1, ev.poolCount || 1), counts = new Array(pc).fill(0);
      ev.teams.forEach(t => { counts[Math.min(pc - 1, Math.max(0, t.pool || 0))]++; });
      let pool = 0;
      for (let i = 1; i < pc; i++) if (counts[i] < counts[pool]) pool = i;
      ev.teams.push({ name, players: single ? [p1] : [p1, p2], pool, registered: Date.now() });
      const t = await writeDb(db);
      return res.status(200).json({ t, db });
    }

    // ---- waitlist ------------------------------------------------------------
    if (a === "waitlist" || a === "promoteWait" || a === "removeWait") {
      const tour = find(body.tournamentId);
      if (!tour) return res.status(404).json({ error: "no such tournament" });
      const ev = (tour.events || []).find(e => e.id === body.eventId);
      if (!ev) return res.status(404).json({ error: "no such event" });
      ev.teams = Array.isArray(ev.teams) ? ev.teams : [];
      ev.waitlist = Array.isArray(ev.waitlist) ? ev.waitlist : [];
      const type = (db.eventTypes || []).find(x => x.id === ev.eventTypeId);
      const single = type ? !!type.singles : false;
      const cap = ev.maxTeams ? Math.min(ev.maxTeams, 32) : 32;
      const lower = s => String(s).toLowerCase();

      if (a === "removeWait") {
        ev.waitlist = ev.waitlist.filter(w => w.id !== clean(body.id, 24));
      } else if (a === "promoteWait") {
        if (ev.teams.length >= cap) return res.status(409).json({ error: "no free spot yet" });
        const w = ev.waitlist.find(x => x.id === clean(body.id, 24));
        if (!w) return res.status(404).json({ error: "not on the waitlist" });
        const pc = Math.max(1, ev.poolCount || 1), counts = new Array(pc).fill(0);
        ev.teams.forEach(t => { counts[Math.min(pc - 1, Math.max(0, t.pool || 0))]++; });
        let pool = 0;
        for (let i = 1; i < pc; i++) if (counts[i] < counts[pool]) pool = i;
        ev.teams.push({ name: w.name, players: w.players || [], pool, registered: Date.now() });
        ev.waitlist = ev.waitlist.filter(x => x.id !== w.id);
      } else {
        if (tour.locked) return res.status(423).json({ error: "this tournament is locked" });
        if (ev.regOpen === false) return res.status(409).json({ error: "registration is closed for this event" });
        if (ev.teams.length < cap) return res.status(409).json({ error: "there are still spots open — register normally" });
        const name = clean(body.team, 40), p1 = clean(body.p1, 40), p2 = clean(body.p2, 40);
        if (!name || !p1 || (!single && !p2)) return res.status(400).json({ error: "name, player and partner are required" });
        if (ev.waitlist.length >= 32) return res.status(409).json({ error: "the waitlist is full too" });
        if (ev.teams.some(t => lower(t.name) === lower(name)) || ev.waitlist.some(w => lower(w.name) === lower(name)))
          return res.status(409).json({ error: "that name is already taken" });
        const dup = r => (r.players || []).some(p => lower(p) === lower(p1) || (p2 && lower(p) === lower(p2)));
        if (ev.teams.some(dup) || ev.waitlist.some(dup)) return res.status(409).json({ error: "one of those players is already entered" });
        ev.waitlist.push({
          id: "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name, players: single ? [p1] : [p1, p2], at: Date.now()
        });
      }
      const t = await writeDb(db);
      return res.status(200).json({ t, db });
    }

    if (a === "note" || a === "removeNote") {
      const tour = find(body.tournamentId);
      if (!tour) return res.status(404).json({ error: "no such tournament" });
      tour.notes = Array.isArray(tour.notes) ? tour.notes : [];
      if (a === "removeNote") {
        tour.notes = tour.notes.filter(n => n.id !== clean(body.id, 24));
      } else {
        const who = clean(body.who, 40);
        const text = clean(body.text, 600);
        if (!who || !text) return res.status(400).json({ error: "name and comment required" });
        if (tour.notes.length >= 500) tour.notes.shift();
        tour.notes.push({ id: "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), who, text, at: Date.now() });
      }
      const t = await writeDb(db);
      return res.status(200).json({ t, db });
    }

    if (a === "updateTeam" || a === "removeTeam") {
      const tour = find(body.tournamentId);
      if (!tour) return res.status(404).json({ error: "no such tournament" });
      if (tour.locked) return res.status(423).json({ error: "this tournament is locked" });
      const ev = (tour.events || []).find(e => e.id === body.eventId);
      if (!ev) return res.status(404).json({ error: "no such event" });
      ev.teams = Array.isArray(ev.teams) ? ev.teams : [];
      const i = parseInt(body.index, 10);
      if (!(i >= 0 && i < ev.teams.length)) return res.status(404).json({ error: "no such entry" });
      const pc = Math.max(1, ev.poolCount || 1);
      if (a === "removeTeam") {
        const pool = Math.min(pc - 1, Math.max(0, ev.teams[i].pool || 0));
        ev.teams.splice(i, 1);
        // Pool match ids are positional, so that pool's results no longer line up.
        ev.results = ev.results || {};
        for (const k of Object.keys(ev.results)) if (k.indexOf(`P${pool}-`) === 0) delete ev.results[k];
      } else {
        const type = (db.eventTypes || []).find(x => x.id === ev.eventTypeId);
        const single = type ? !!type.singles : false;
        const name = clean(body.name, 40), p1 = clean(body.p1, 40), p2 = clean(body.p2, 40);
        if (!name || !p1 || (!single && !p2)) return res.status(400).json({ error: "name and player(s) required" });
        const lower = s => String(s).toLowerCase();
        if (ev.teams.some((t, j) => j !== i && lower(t.name) === lower(name))) return res.status(409).json({ error: "that team name is already taken" });
        const before = Math.min(pc - 1, Math.max(0, ev.teams[i].pool || 0));
        const pool = Math.min(pc - 1, Math.max(0, parseInt(body.pool, 10) || 0));
        ev.teams[i].name = name;
        ev.teams[i].players = single ? [p1] : [p1, p2];
        if (pool !== before) {
          ev.teams[i].pool = pool;
          ev.results = ev.results || {};
          for (const k of Object.keys(ev.results)) {
            if (k.indexOf(`P${before}-`) === 0 || k.indexOf(`P${pool}-`) === 0) delete ev.results[k];
          }
        }
      }
      const t = await writeDb(db);
      return res.status(200).json({ t, db });
    }

    if (a === "score" || a === "clearScore") {
      const tour = find(body.tournamentId);
      if (!tour) return res.status(404).json({ error: "no such tournament" });
      if (tour.locked) return res.status(423).json({ error: "tournament locked" });
      const ev = findEv(tour, body.eventId);
      if (!ev) return res.status(404).json({ error: "no such event" });
      const id = clean(body.id, 24).replace(/[^A-Za-z0-9#-]/g, "");
      if (!id) return res.status(400).json({ error: "missing match id" });
      ev.results = ev.results || {};
      if (a === "clearScore") delete ev.results[id];
      else ev.results[id] = { a: clampScore(body.a), b: clampScore(body.b), status: body.status === "live" ? "live" : "done" };
    } else if (a === "create") {
      const t = sanitizeTournament(body.tournament || {}, null);
      db.tournaments.push(t);
      if (!db.defaultId) db.defaultId = t.id;
      res.setHeader("X-New-Id", t.id);
    } else if (a === "update") {
      const cur = find(body.tournamentId);
      if (!cur) return res.status(404).json({ error: "no such tournament" });
      const next = sanitizeTournament(body.tournament || {}, cur);
      Object.assign(cur, next);
    } else if (a === "duplicate") {
      const cur = find(body.tournamentId);
      if (!cur) return res.status(404).json({ error: "no such tournament" });
      const copy = JSON.parse(JSON.stringify(cur));
      copy.id = `${slug(cur.name)}-${Date.now().toString(36).slice(-4)}`;
      copy.name = clean(body.name, 60) || `${cur.name} (copy)`;
      copy.order = [];
      copy.courtMap = {};
      (copy.events || []).forEach(e => { e.id = rid("ev"); e.results = {}; e.waitlist = []; });
      copy.notes = [];
      copy.locked = false;
      copy.archived = false;
      copy.createdAt = Date.now();
      db.tournaments.push(copy);
    } else if (a === "remove" || a === "restore") {
      const cur = find(body.tournamentId);
      if (!cur) return res.status(404).json({ error: "no such tournament" });
      cur.archived = a === "remove";
    } else if (a === "purge") {
      db.tournaments = db.tournaments.filter(x => x.id !== body.tournamentId);
      if (db.defaultId === body.tournamentId) db.defaultId = (db.tournaments[0] || {}).id || null;
    } else if (a === "lock") {
      const cur = find(body.tournamentId);
      if (!cur) return res.status(404).json({ error: "no such tournament" });
      cur.locked = !!body.locked;
    } else if (a === "setOrder") {
      const cur = find(body.tournamentId);
      if (!cur) return res.status(404).json({ error: "no such tournament" });
      cur.order = (Array.isArray(body.order) ? body.order : []).slice(0, 600).map(k => clean(k, 60));
    } else if (a === "setCourts") {
      const cur = find(body.tournamentId);
      if (!cur) return res.status(404).json({ error: "no such tournament" });
      const src = body.courtMap && typeof body.courtMap === "object" ? body.courtMap : {};
      const out = {};
      Object.keys(src).slice(0, 600).forEach(k => {
        const i = parseInt(src[k], 10);
        if (Number.isInteger(i) && i >= 0 && i < 12) out[clean(k, 60)] = i;
      });
      cur.courtMap = out;
    } else if (a === "setDefault") {
      db.defaultId = body.tournamentId || null;
    } else {
      return res.status(400).json({ error: "unknown action" });
    }

    const t = await writeDb(db);
    return res.status(200).json({ t, db });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
