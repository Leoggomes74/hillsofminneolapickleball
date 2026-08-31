// Vercel serverless function — multi-tournament store.
//
// GET  /api/data                          -> { t, db }
// POST /api/data { action, pin, ... }     -> { t, db }
//   actions: score, clearScore, create, update, remove, restore, duplicate,
//            lock, setDefault, purge
//
// Storage: Vercel KV / Upstash Redis REST API. Env vars come from the store
// integration: KV_REST_API_URL + KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_*.
// SCORE_PASSCODE gates every write (defaults to 2074).

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
// Group A teams are indexes 0-4, Group B 5-9, in the order above.
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
    category: "Mixed doubles",
    date: "2026-08-30",
    time: "08:00",
    poolCount: 2,
    knockout: true,
    poolFormat: "to11win1",
    koFormat: "to11win2",
    finalFormat: "bo3to11",
    teams: HILLS_TEAMS.map(([name, players], i) => ({
      name, players, pool: i < 5 ? 0 : 1
    })),
    results: results || {},
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
  return { tournaments: [hillsTournament(results)], defaultId: "hills-2026", v: 2 };
}

async function readDb() {
  const [raw, t] = await Promise.all([kv(["GET", DB_KEY]), kv(["GET", STAMP_KEY])]);
  if (raw) {
    try {
      const db = JSON.parse(raw);
      if (db && Array.isArray(db.tournaments)) return { db, t: Number(t) || 0 };
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

function sanitizeTournament(body, existing) {
  const teams = Array.isArray(body.teams) ? body.teams.slice(0, 32).map((t, i) => ({
    name: clean(t && t.name, 40) || `Team ${i + 1}`,
    players: (Array.isArray(t && t.players) ? t.players : []).slice(0, 2).map(p => clean(p, 40)).filter(Boolean),
    pool: Math.max(0, Math.min(7, parseInt(t && t.pool, 10) || 0))
  })) : [];
  return {
    id: existing ? existing.id : `${slug(body.name)}-${Date.now().toString(36).slice(-4)}`,
    name: clean(body.name, 60) || "Untitled tournament",
    category: clean(body.category, 30) || "Mixed doubles",
    date: clean(body.date, 10),
    time: clean(body.time, 5),
    poolCount: Math.max(1, Math.min(8, parseInt(body.poolCount, 10) || 1)),
    knockout: body.knockout !== false,
    poolFormat: clean(body.poolFormat, 12) || "to11win1",
    koFormat: clean(body.koFormat, 12) || "to11win2",
    finalFormat: clean(body.finalFormat, 12) || "to11win2",
    teams,
    results: existing ? existing.results || {} : {},
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
    if (String(body.pin || "") !== String(PIN)) return res.status(401).json({ error: "bad passcode" });

    const { db } = await readDb();
    const find = id => db.tournaments.find(x => x.id === id);
    const a = body.action;

    if (a === "score" || a === "clearScore") {
      const tour = find(body.tournamentId);
      if (!tour) return res.status(404).json({ error: "no such tournament" });
      if (tour.locked) return res.status(423).json({ error: "tournament locked" });
      const id = clean(body.id, 24).replace(/[^A-Za-z0-9#-]/g, "");
      if (!id) return res.status(400).json({ error: "missing match id" });
      tour.results = tour.results || {};
      if (a === "clearScore") delete tour.results[id];
      else tour.results[id] = { a: clampScore(body.a), b: clampScore(body.b), status: body.status === "live" ? "live" : "done" };
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
      copy.results = {};
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
