// Vercel serverless function — shared tournament scores.
// GET  /api/results            -> { t, results: { MATCHID: {a,b,status} } }
// POST /api/results  {id,a,b,status,pin}        -> save one match
// POST /api/results  {id,remove:true,pin}       -> delete one match
//
// Storage: Vercel KV / Upstash Redis REST API. Set by the store integration:
//   KV_REST_API_URL + KV_REST_API_TOKEN   (Vercel KV)
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN   (Upstash marketplace)
// Optional: SCORE_PASSCODE (defaults to 2026) gates writes.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PIN = process.env.SCORE_PASSCODE || "2074";
const DATA_KEY = "hom2026:results";
const STAMP_KEY = "hom2026:updated";

async function kv(command) {
  if (!URL_ || !TOKEN) throw new Error("KV not configured");
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store"
  });
  if (!r.ok) throw new Error(`KV ${r.status}`);
  const j = await r.json();
  return j.result;
}

async function readAll() {
  const [raw, t] = await Promise.all([kv(["GET", DATA_KEY]), kv(["GET", STAMP_KEY])]);
  let results = {};
  if (raw) { try { results = JSON.parse(raw) || {}; } catch { results = {}; } }
  return { results, t: Number(t) || 0 };
}

async function writeAll(results) {
  const t = Date.now();
  await Promise.all([
    kv(["SET", DATA_KEY, JSON.stringify(results)]),
    kv(["SET", STAMP_KEY, String(t)])
  ]);
  return t;
}

const clamp = n => Math.max(0, Math.min(30, parseInt(n, 10) || 0));

export default async function (req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      return res.status(200).json(await readAll());
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      if (String(body.pin || "") !== String(PIN)) {
        return res.status(401).json({ error: "bad passcode" });
      }
      const id = String(body.id || "").slice(0, 12).replace(/[^A-Za-z0-9]/g, "");
      if (!id) return res.status(400).json({ error: "missing id" });
      const { results } = await readAll();
      if (body.remove) delete results[id];
      else results[id] = { a: clamp(body.a), b: clamp(body.b), status: body.status === "live" ? "live" : "done" };
      const t = await writeAll(results);
      return res.status(200).json({ t, results });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
