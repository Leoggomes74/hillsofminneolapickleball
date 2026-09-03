// State, API access, routing, event handling.
var API = "/api/data";
var PASSCODE = "2074";
var LKEY = "hom.db";
var CLOUD = location.protocol !== "file:";

var S = {
  screen: "home",           // home | event | new | edit | types
  tab: "now",
  tourId: null,
  evId: null,
  db: { tournaments: [], eventTypes: [], defaultId: null },
  sync: CLOUD ? "loading" : "local",
  toast: "",
  unlocked: false, pinUsed: "", gate: null, gateThen: null, pin: "", bad: false,
  editing: null, draft: [],
  menu: null,
  form: null,
  confirm: null,
  note: { who: "", text: "" },
  noteBusy: false,
  reg: { team: "", p1: "", p2: "" },
  regBusy: false,
  wl: { team: "", p1: "", p2: "" },
  wlBusy: false,
  teamEdit: null,
  inv: null,
  grpAll: true,
  schedAll: true,
  typeDraft: {}, newType: { name: "", singles: false }
};

try { S.unlocked = sessionStorage.getItem("hom.unlocked") === "1"; } catch (e) {}
try { S.pinUsed = sessionStorage.getItem("hom.pin") || ""; } catch (e) {}
try { var c = localStorage.getItem(LKEY); if (c) S.db = JSON.parse(c); } catch (e) {}

// ---- shape guards ----------------------------------------------------------
function upgradeDb(db) {
  if (!db || !Array.isArray(db.tournaments)) return db;
  if (!Array.isArray(db.eventTypes) || !db.eventTypes.length) {
    db.eventTypes = TModel.DEFAULT_TYPES.map(function (t) { return { id: t.id, name: t.name, singles: t.singles }; });
  }
  db.tournaments.forEach(function (t) {
    if (!Array.isArray(t.events)) {
      var sl = String(t.category || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      var hit = db.eventTypes.filter(function (x) { return x.id === sl; })[0] || db.eventTypes[0];
      t.events = [{
        id: "ev" + Math.random().toString(36).slice(2, 8),
        eventTypeId: hit.id, date: t.date || "", time: t.time || "",
        poolCount: t.poolCount || 1, knockout: t.knockout !== false,
        poolFormat: t.poolFormat || "to11win1", koFormat: t.koFormat || "to11win2", finalFormat: t.finalFormat || "bo3to11",
        teams: t.teams || [], results: t.results || {}
      }];
    }
  });
  return db;
}

// Offline / first-run fallback so the app is never an empty shell.
if (!S.db || !Array.isArray(S.db.tournaments) || !S.db.tournaments.length) {
  S.db = { tournaments: [demoTournament()], eventTypes: TModel.DEFAULT_TYPES.map(function (t) { return { id: t.id, name: t.name, singles: t.singles }; }), defaultId: "hills-2026", v: 3 };
}
upgradeDb(S.db);

function demoTournament() {
  var roster = [
    ["Arepa con Pitorro", ["Jaime Morales", "Georgina"]], ["Caribe Smash", ["Rafael", "Jean"]],
    ["Dinking Couple", ["Mat", "Colby"]], ["Team Lionic", ["Nicci", "Gene"]],
    ["The Strangers", ["Sabrina", "Daniel"]], ["V Power", ["Sandra", "Carlos"]],
    ["Team Flame", ["Berta", "William"]], ["Team Venom", ["Raghu", "Gabby"]],
    ["Macho Camacho", ["Crystal", "Marcus"]], ["R&B", ["Rola", "Balbino"]]
  ];
  return {
    id: "hills-2026", name: "Hills of Minneola Mixed Doubles", director: "",
    date: "2026-08-30", time: "08:00",
    events: [{
      id: "ev-hills-1", eventTypeId: "mixed-doubles", date: "2026-08-30", time: "08:00",
      poolCount: 2, knockout: true, poolFormat: "to11win1", koFormat: "to11win2", finalFormat: "bo3to11",
      teams: roster.map(function (r, i) { return { name: r[0], players: r[1], pool: i < 5 ? 0 : 1 }; }),
      results: {}
    }],
    notes: [], locked: false, archived: false, createdAt: Date.now()
  };
}

function cacheDb() { try { localStorage.setItem(LKEY, JSON.stringify(S.db)); } catch (e) {} }
function tours(includeArchived) {
  return (S.db.tournaments || []).filter(function (t) { return includeArchived || !t.archived; });
}
function tour() { return (S.db.tournaments || []).filter(function (t) { return t.id === S.tourId; })[0] || null; }
function evsOf(t) { return (t && t.events) || []; }
function ev() {
  var t = tour(); if (!t) return null;
  var list = evsOf(t);
  return list.filter(function (e) { return e.id === S.evId; })[0] || list[0] || null;
}
function types() { return S.db.eventTypes || []; }
function typeOf(id) { return types().filter(function (x) { return x.id === id; })[0] || null; }
function typeName(id) { var x = typeOf(id); return x ? x.name : "Event"; }
function typeSingles(id) { var x = typeOf(id); return x ? !!x.singles : false; }
function typeInUse(id) {
  return (S.db.tournaments || []).some(function (t) { return evsOf(t).some(function (e) { return e.eventTypeId === id; }); });
}
function toast(msg, ms) { S.toast = msg; render(); setTimeout(function () { S.toast = ""; render(); }, ms || 2000); }

// ---- api -------------------------------------------------------------------
function load(quiet) {
  if (!CLOUD) { S.sync = "local"; return Promise.resolve(false); }
  return fetch(API, { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      if (d && d.db) { S.db = upgradeDb(d.db); cacheDb(); }
      S.sync = "live";
      render(); return true;
    })
    .catch(function () { S.sync = "offline"; if (!quiet) render(); return false; });
}

function post(payload, okMsg) {
  if (!CLOUD) { toast("Offline — not saved"); return Promise.resolve(null); }
  if (payload.action !== "note" && payload.action !== "waitlist") payload.pin = S.pinUsed || "";
  return fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    .then(function (r) {
      if (r.status === 401) { S.unlocked = false; S.pinUsed = ""; try { sessionStorage.removeItem("hom.unlocked"); sessionStorage.removeItem("hom.pin"); } catch (e) {} throw new Error("passcode"); }
      if (r.status === 409) return r.json().then(function (j) { throw new Error(j.error || "not allowed"); });
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(function (d) {
      if (d && d.db) { S.db = upgradeDb(d.db); cacheDb(); }
      S.sync = "live";
      if (okMsg) toast(okMsg); else render();
      return d;
    })
    .catch(function (e) {
      var m = String(e.message);
      if (m !== "passcode" && !/^\d+$/.test(m)) { toast(m, 2600); return null; }
      S.sync = "offline";
      toast(m === "passcode" ? "Passcode rejected" : "Not saved online", 2600);
      return null;
    });
}

// ---- passcode gate ---------------------------------------------------------
function needPin(then) {
  if (S.unlocked && S.pinUsed) { then(); return; }
  S.gate = true; S.gateThen = then; S.pin = ""; S.bad = false; render();
}
function pinKey(k) {
  if (S.bad) { S.pin = ""; S.bad = false; }
  if (k === "del") S.pin = S.pin.slice(0, -1);
  else if (S.pin.length < 4) S.pin += k;
  if (S.pin.length === 4) {
    if (S.pin === PASSCODE) {
      S.unlocked = true; S.pinUsed = S.pin;
      try { sessionStorage.setItem("hom.unlocked", "1"); sessionStorage.setItem("hom.pin", S.pin); } catch (e) {}
      var then = S.gateThen; S.gate = null; S.gateThen = null; S.pin = "";
      render(); if (then) then(); return;
    }
    S.bad = true;
  }
  render();
}

// ---- score sheet -----------------------------------------------------------
function openSheet(id) {
  var t = tour(), e = ev(); if (!t || !e) return;
  if (t.locked) { toast("Tournament is locked"); return; }
  needPin(function () {
    var v = TModel.build(e), m = v.byId[id];
    if (!m || !m.ready) return;
    S.editing = id;
    S.draft = m.games.map(function (g) { return { a: g.a, b: g.b, played: g.status !== "upcoming" }; });
    render();
  });
}
function saveSheet(status) {
  var t = tour(), e = ev(); if (!t || !e) return;
  var v = TModel.build(e), m = v.byId[S.editing];
  if (!m) { S.editing = null; return render(); }
  var ids = TModel.gameIds({ id: m.id, fmtKey: m.fmtKey });
  var jobs = [];
  ids.forEach(function (gid, i) {
    var d = S.draft[i];
    if (!d) return;
    var blank = !d.a && !d.b;
    if (blank && !d.played) return;
    if (blank && d.played) { jobs.push({ action: "clearScore", tournamentId: t.id, eventId: e.id, id: gid }); return; }
    jobs.push({ action: "score", tournamentId: t.id, eventId: e.id, id: gid, a: d.a, b: d.b, status: status });
  });
  S.editing = null; render();
  (function next(i) {
    if (i >= jobs.length) { toast(status === "done" ? "Score saved" : "Score updated"); return; }
    post(jobs[i]).then(function () { next(i + 1); });
  })(0);
}
function clearMatch() {
  var t = tour(), e = ev(); if (!t || !e) return;
  var v = TModel.build(e), m = v.byId[S.editing];
  var ids = m ? TModel.gameIds({ id: m.id, fmtKey: m.fmtKey }) : [];
  S.editing = null; render();
  (function next(i) {
    if (i >= ids.length) { toast("Result removed"); return; }
    post({ action: "clearScore", tournamentId: t.id, eventId: e.id, id: ids[i] }).then(function () { next(i + 1); });
  })(0);
}

// ---- create / edit form ---------------------------------------------------
function blankEvent(typeId) {
  return {
    id: null, eventTypeId: typeId || (types()[0] || {}).id || "mixed-doubles",
    date: "", time: "08:00",
    teamCount: 0, poolCount: 2, knockout: true,
    regOpen: true, maxTeams: 0,
    poolFormat: "to11win1", koFormat: "to11win2", finalFormat: "bo3to11",
    teams: []
  };
}
function blankForm() {
  var f = {
    mode: "new", id: null, name: "", director: "", fee: "",
    courtCount: 2, courtNames: ["Court 1", "Court 2"],
    date: new Date().toISOString().slice(0, 10), time: "08:00",
    events: [blankEvent()], step: 1, error: ""
  };
  f.events[0].date = f.date;
  return f;
}
// Grow/shrink the entry list without destroying pool assignments people already have.
function syncTeamRows(e) {
  var n = Math.max(0, Math.min(32, parseInt(e.teamCount, 10)));
  if (isNaN(n)) n = 0;
  e.teamCount = n;
  var pc = Math.max(1, Math.min(8, parseInt(e.poolCount, 10) || 1));
  while (e.teams.length > n) e.teams.pop();
  while (e.teams.length < n) e.teams.push({ name: "", players: ["", ""], pool: smallestPool(e.teams, pc) });
  e.teams.forEach(function (t) { t.pool = Math.min(pc - 1, Math.max(0, t.pool || 0)); });
}
function smallestPool(teams, pc) {
  var counts = [], i;
  for (i = 0; i < pc; i++) counts.push(0);
  teams.forEach(function (t) { counts[Math.min(pc - 1, Math.max(0, t.pool || 0))]++; });
  var best = 0;
  for (i = 1; i < pc; i++) if (counts[i] < counts[best]) best = i;
  return best;
}
// Full snake redistribute — only on an explicit "redistribute" tap.
function rebalance(e) {
  var pools = TModel.assignPools(e.teams.length, Math.max(1, Math.min(8, parseInt(e.poolCount, 10) || 1)));
  e.teams.forEach(function (t, i) { t.pool = pools[i]; });
}
function syncCourts(f) {
  var n = Math.max(0, Math.min(12, parseInt(f.courtCount, 10) || 0));
  f.courtCount = n;
  var out = [];
  for (var i = 0; i < n; i++) out.push((f.courtNames || [])[i] || ("Court " + (i + 1)));
  f.courtNames = out;
}
function openNew() {
  needPin(function () { S.form = blankForm(); S.screen = "new"; window.scrollTo(0, 0); render(); });
}
function openEdit(id) {
  needPin(function () {
    var t = (S.db.tournaments || []).filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    S.form = {
      mode: "edit", id: t.id, name: t.name, director: t.director || "", fee: t.fee || "",
      courtCount: t.courtCount || 0, courtNames: (TModel.courtsOf(t) || []).slice(),
      date: t.date || "", time: t.time || "",
      events: evsOf(t).map(function (e) {
        return {
          id: e.id, eventTypeId: e.eventTypeId, date: e.date || "", time: e.time || "",
          teamCount: (e.teams || []).length, poolCount: e.poolCount || 1, knockout: e.knockout !== false,
          regOpen: e.regOpen !== false, maxTeams: e.maxTeams || 0,
          poolFormat: e.poolFormat, koFormat: e.koFormat, finalFormat: e.finalFormat,
          teams: (e.teams || []).map(function (x) {
            return { name: x.name, players: [(x.players || [])[0] || "", (x.players || [])[1] || ""], pool: x.pool || 0, registered: x.registered || 0 };
          })
        };
      }),
      step: 1, error: ""
    };
    if (!S.form.events.length) { S.form.events = [blankEvent()]; syncTeamRows(S.form.events[0]); }
    S.screen = "edit"; S.menu = null; window.scrollTo(0, 0); render();
  });
}
function formValid(f) {
  if (!String(f.name).trim()) return "Give the tournament a name.";
  if (!f.events.length) return "Add at least one event type to this tournament.";
  var seen = {}, err = "";
  f.events.forEach(function (e) {
    if (err) return;
    if (seen[e.eventTypeId]) { err = "Each event type can only be added once per tournament."; return; }
    seen[e.eventTypeId] = 1;
    var single = typeSingles(e.eventTypeId), bad = 0;
    filledRows(e).forEach(function (t) {
      if (!String(t.name).trim()) bad++;
      if (!String(t.players[0]).trim()) bad++;
      if (!single && !String(t.players[1]).trim()) bad++;
    });
    if (bad) { err = typeName(e.eventTypeId) + ": " + (single ? "every entry needs a name and a player." : "every team needs a name and two players."); return; }
    if (e.regOpen) return;                       // registration will fill the pools
    var rows = filledRows(e);
    if (!rows.length) { err = typeName(e.eventTypeId) + ": add entries, or switch registration on so people can enter themselves."; return; }
    var counts = {}, i;
    for (i = 0; i < rows.length; i++) counts[rows[i].pool] = (counts[rows[i].pool] || 0) + 1;
    for (i = 0; i < e.poolCount; i++) if ((counts[i] || 0) < 2) { err = typeName(e.eventTypeId) + ": each pool needs at least two teams."; return; }
  });
  return err;
}
// Wholly blank rows are simply dropped, so an event can be created empty.
function filledRows(e) {
  return e.teams.filter(function (t) {
    return String(t.name).trim() || String(t.players[0]).trim() || String(t.players[1] || "").trim();
  });
}
function submitForm() {
  var f = S.form; if (!f) return;
  var err = formValid(f);
  if (err) { f.error = err; render(); return; }
  var payload = {
    name: f.name, director: String(f.director || "").trim(), fee: String(f.fee || "").trim(), date: f.date, time: f.time,
    courtCount: parseInt(f.courtCount, 10) || 0,
    courtNames: (f.courtNames || []).map(function (n) { return String(n || "").trim(); }),
    events: f.events.map(function (e) {
      var single = typeSingles(e.eventTypeId);
      return {
        id: e.id, eventTypeId: e.eventTypeId, date: e.date || f.date, time: e.time || f.time,
        poolCount: parseInt(e.poolCount, 10) || 1, knockout: !!e.knockout,
        regOpen: !!e.regOpen, maxTeams: parseInt(e.maxTeams, 10) || 0,
        poolFormat: e.poolFormat, koFormat: e.koFormat, finalFormat: e.finalFormat,
        teams: filledRows(e).map(function (t) {
          return { name: t.name.trim(), pool: t.pool, registered: t.registered || 0, players: single ? [t.players[0].trim()] : [t.players[0].trim(), t.players[1].trim()] };
        })
      };
    })
  };
  var newMode = f.mode === "new";
  post(newMode ? { action: "create", tournament: payload } : { action: "update", tournamentId: f.id, tournament: payload })
    .then(function (d) {
      if (!d) return;
      S.form = null;
      if (newMode) {
        var list = S.db.tournaments || [];
        var made = list[list.length - 1];
        S.tourId = made ? made.id : null;
        S.evId = made && made.events && made.events[0] ? made.events[0].id : null;
        S.screen = S.tourId ? "event" : "home";
        S.tab = "teams";
      } else {
        S.tourId = f.id; S.evId = null; S.screen = "event";
      }
      window.scrollTo(0, 0);
      toast(newMode ? "Tournament created" : "Changes saved");
    });
}

// ---- events ---------------------------------------------------------------
document.addEventListener("click", function (e) {
  var t = e.target.closest("[data-act]");
  if (!t) return;
  var act = t.getAttribute("data-act"), val = t.getAttribute("data-val");
  if (t.hasAttribute("data-back") && e.target !== t) return;

  if (act === "open") {
    S.tourId = val; S.screen = "event"; S.tab = "now"; S.menu = null;
    var tt = tour(); S.evId = tt && tt.events && tt.events[0] ? tt.events[0].id : null;
    window.scrollTo(0, 0); return render();
  }
  if (act === "openreg") {
    var bits = val.split("|");
    S.tourId = bits[0]; S.screen = "event"; S.tab = "teams"; S.menu = null;
    var to = tour();
    if (bits[1]) S.evId = bits[1];
    else {
      var open = evsOf(to).filter(function (x) {
        return x.regOpen !== false && (!x.maxTeams || (x.teams || []).length < x.maxTeams);
      })[0];
      S.evId = (open || evsOf(to)[0] || {}).id || null;
    }
    window.scrollTo(0, 0); return render();
  }
  if (act === "pickev") { S.evId = val; S.editing = null; window.scrollTo(0, 0); return render(); }  if (act === "home") { S.screen = "home"; S.tourId = null; S.evId = null; S.menu = null; S.form = null; window.scrollTo(0, 0); return render(); }
  if (act === "tab") { S.tab = val; S.editing = null; window.scrollTo(0, 0); return render(); }
  if (act === "new") return openNew();
  if (act === "edit") return openEdit(val);
  if (act === "menu") { S.menu = S.menu === val ? null : val; return render(); }
  if (act === "closemenu") { S.menu = null; return render(); }
  if (act === "refresh") { S.sync = "loading"; render(); load(); return; }

  // ---- event type table ----
  if (act === "opentypes") {
    return needPin(function () { S.screen = "types"; S.typeDraft = {}; S.newType = { name: "", singles: false }; window.scrollTo(0, 0); render(); });
  }
  if (act === "addtype") {
    var nm = String(S.newType.name || "").trim();
    if (!nm) { toast("Name the event type"); return; }
    return needPin(function () {
      post({ action: "addEventType", name: nm, singles: !!S.newType.singles }, "Event type added")
        .then(function () { S.newType = { name: "", singles: false }; render(); });
    });
  }
  if (act === "savetype") {
    var d = S.typeDraft[val];
    if (!d || !String(d.name || "").trim()) { toast("Name cannot be empty"); return; }
    return needPin(function () { post({ action: "renameEventType", id: val, name: d.name.trim(), singles: !!d.singles }, "Saved"); });
  }
  if (act === "deltype") {
    if (typeInUse(val)) { toast("In use by a tournament", 2600); return; }
    return needPin(function () { post({ action: "removeEventType", id: val }, "Event type removed"); });
  }
  if (act === "togsingles") {
    var row = S.typeDraft[val] || (S.typeDraft[val] = { name: typeName(val), singles: typeSingles(val) });
    row.singles = !row.singles; return render();
  }
  if (act === "tognewsingles") { S.newType.singles = !S.newType.singles; return render(); }

  if (act === "invite") { if (val) S.tourId = val; S.screen = "invite"; S.menu = null; window.scrollTo(0, 0); return render(); }
  if (act === "backevent") { S.screen = "event"; window.scrollTo(0, 0); return render(); }
  if (act === "schedall") { S.schedAll = val === "1"; window.scrollTo(0, 0); return render(); }
  if (act === "schedqreset") { S.schedQ = ""; return render(); }
  if (act === "schedqapply") {
    var inp = document.querySelector('input[data-field="schedQ"]');
    S.schedQ = inp ? inp.value : "";
    return render();
  }
  if (act === "grpall") { S.grpAll = val === "1"; window.scrollTo(0, 0); return render(); }
  if (act === "invdl") return downloadInvite();
  if (act === "invreset") return needPin(resetInv);
  if (act === "invunlock") return needPin(function () { render(); });
  if (act === "invshare") return shareInvite();
  if (act === "joinwait") {
    var tw = tour(), ew = ev(); if (!tw || !ew) return;
    var sw = typeSingles(ew.eventTypeId);
    var wt = String(S.wl.team || "").trim(), w1 = String(S.wl.p1 || "").trim(), w2 = String(S.wl.p2 || "").trim();
    if (!wt || !w1 || (!sw && !w2)) { toast(sw ? "Entry name and player needed" : "Team, your name and partner needed"); return; }
    S.wlBusy = true; render();
    post({ action: "waitlist", tournamentId: tw.id, eventId: ew.id, team: wt, p1: w1, p2: w2 }).then(function (d) {
      S.wlBusy = false;
      if (d) { S.wl = { team: "", p1: "", p2: "" }; toast("You\u2019re on the waitlist", 2600); }
      else render();
    });
    return;
  }
  if (act === "promotewait") {
    var tp = tour(), ep = ev(); if (!tp || !ep) return;
    return needPin(function () { post({ action: "promoteWait", tournamentId: tp.id, eventId: ep.id, id: val }, "Moved into the draw"); });
  }
  if (act === "delwait") {
    var td = tour(), ed = ev(); if (!td || !ed) return;
    return needPin(function () { post({ action: "removeWait", tournamentId: td.id, eventId: ed.id, id: val }, "Removed from waitlist"); });
  }
  if (act === "openroster") { S.screen = "roster"; S.menu = null; window.scrollTo(0, 0); return render(); }
  if (act === "openhelp") { S.helpBack = { screen: S.screen, tab: S.tab }; S.screen = "help"; S.menu = null; window.scrollTo(0, 0); return render(); }
  if (act === "backhelp") { var hb = S.helpBack || { screen: "home" }; S.screen = hb.screen; if (hb.tab) S.tab = hb.tab; S.helpBack = null; window.scrollTo(0, 0); return render(); }
  if (act === "backteams") { S.screen = "event"; S.tab = "teams"; window.scrollTo(0, 0); return render(); }
  if (act === "rosall") { S.rosAll = val === "1"; window.scrollTo(0, 0); return render(); }
  if (act === "openprint") { S.screen = "print"; S.menu = null; window.scrollTo(0, 0); return render(); }
  if (act === "backsched") { S.screen = "event"; S.tab = "sched"; window.scrollTo(0, 0); return render(); }
  if (act === "doprint") { window.print(); return; }

  // ---- court order ----
  if (act === "mvup" || act === "mvdn") {
    var tm = tour(); if (!tm) return;
    return needPin(function () {
      var keys = TModel.master(tm).map(function (r) { return r.key; }), i = +val, j = act === "mvup" ? i - 1 : i + 1;
      if (j < 0 || j >= keys.length) return;
      if ((TModel.master(tm)[i].m.stage) !== (TModel.master(tm)[j].m.stage)) { toast("Pool, semifinals, third place and final stay in that order"); return; }
      var sw = keys[i]; keys[i] = keys[j]; keys[j] = sw;
      tm.order = keys; cacheDb(); render();
      post({ action: "setOrder", tournamentId: tm.id, order: keys });
    });
  }
  if (act === "courtpick") { S.courtPick = val; return render(); }
  if (act === "courtclose") { S.courtPick = null; return render(); }
  if (act === "setcourt") {
    var cSep = val.indexOf("@@"), cKey = val.slice(0, cSep), cIdx = val.slice(cSep + 2);
    var tcm = tour(); if (!tcm) return;
    return needPin(function () {
      var mp = {}, src = tcm.courtMap || {};
      Object.keys(src).forEach(function (k) { mp[k] = src[k]; });
      if (cIdx === "auto") delete mp[cKey]; else mp[cKey] = +cIdx;
      tcm.courtMap = mp; S.courtPick = null; cacheDb(); render();
      post({ action: "setCourts", tournamentId: tcm.id, courtMap: mp }, "Court updated");
    });
  }
  if (act === "autosort") {
    var ta = tour(); if (!ta) return;
    return needPin(function () {
      var keys = TModel.autoOrder(ta);
      ta.order = keys; cacheDb(); render();
      post({ action: "setOrder", tournamentId: ta.id, order: keys }, "Court order rebuilt");
    });
  }
  if (act === "schedscore") {
    var cut = val.indexOf("|");
    S.evId = val.slice(0, cut);
    return openSheet(val.slice(cut + 1));
  }

  if (act === "postnote") {
    var who = String(S.note.who || "").trim(), text = String(S.note.text || "").trim();
    if (!who || !text) { toast("Add your name and a comment"); return; }
    var tid = S.tourId;
    S.noteBusy = true; render();
    post({ action: "note", tournamentId: tid, who: who, text: text }).then(function (d) {
      S.noteBusy = false;
      if (d) { S.note = { who: "", text: "" }; toast("Thanks — comment posted"); }
      else render();
    });
    return;
  }
  if (act === "delnote") {
    return needPin(function () { post({ action: "removeNote", tournamentId: S.tourId, id: val }, "Comment removed"); });
  }
  if (act === "score") return openSheet(val);
  if (act === "sheetclose") { S.editing = null; return render(); }
  if (act === "save") return saveSheet(val);
  if (act === "clear") return clearMatch();
  if (act === "pin") return pinKey(val);
  if (act === "gateclose") { S.gate = null; S.gateThen = null; S.pin = ""; S.bad = false; return render(); }

  if (act === "step") { S.form.step = parseInt(val, 10); S.form.error = ""; window.scrollTo(0, 0); return render(); }
  if (act === "formcancel") { S.form = null; S.screen = S.tourId ? "event" : "home"; return render(); }
  if (act === "formsubmit") return submitForm();
  if (act === "addev") {
    var used = {}; S.form.events.forEach(function (x) { used[x.eventTypeId] = 1; });
    var free = types().filter(function (x) { return !used[x.id]; })[0];
    if (!free) { toast("Every event type is already added"); return; }
    var ne = blankEvent(free.id); ne.date = S.form.date; ne.time = S.form.time;
    S.form.events.push(ne); S.form.error = ""; return render();
  }
  if (act === "delev") {
    if (S.form.events.length < 2) { toast("A tournament needs one event"); return; }
    S.form.events.splice(+val, 1); S.form.error = ""; return render();
  }
  if (act === "pool") {
    var bits = val.split(":");
    S.form.events[+bits[0]].teams[+bits[1]].pool = +bits[2];
    return render();
  }
  if (act === "autopool") { rebalance(S.form.events[+val]); return render(); }
  if (act === "addrow") {
    var ea = S.form.events[+val];
    if (ea.teams.length >= 32) { toast("32 entries is the maximum"); return; }
    ea.teams.push({ name: "", players: ["", ""], pool: smallestPool(ea.teams, Math.max(1, +ea.poolCount || 1)) });
    ea.teamCount = ea.teams.length; S.form.error = ""; return render();
  }
  if (act === "delrow") {
    var pr = val.split(":"), ed = S.form.events[+pr[0]];
    ed.teams.splice(+pr[1], 1); ed.teamCount = ed.teams.length; S.form.error = ""; return render();
  }

  if (act === "editteam") {
    var te = ev(), tt = tour(); if (!te || !tt) return;
    if (tt.locked) { toast("Tournament is locked"); return; }
    return needPin(function () {
      var row = (te.teams || [])[+val]; if (!row) return;
      S.teamEdit = {
        index: +val, name: row.name || "",
        p1: (row.players || [])[0] || "", p2: (row.players || [])[1] || "",
        pool: row.pool || 0, confirm: false
      };
      render();
    });
  }
  if (act === "teamclose") { S.teamEdit = null; return render(); }
  if (act === "teampool") { S.teamEdit.pool = +val; return render(); }
  if (act === "teamsave") {
    var ts = tour(), es = ev(), d = S.teamEdit; if (!ts || !es || !d) return;
    var sg = typeSingles(es.eventTypeId);
    if (!String(d.name).trim() || !String(d.p1).trim() || (!sg && !String(d.p2).trim())) { toast("Fill every field"); return; }
    S.teamEdit = null; render();
    post({ action: "updateTeam", tournamentId: ts.id, eventId: es.id, index: d.index,
      name: d.name.trim(), p1: d.p1.trim(), p2: d.p2.trim(), pool: d.pool }, "Entry updated");
    return;
  }
  if (act === "teamaskdel") { S.teamEdit.confirm = true; return render(); }
  if (act === "teamdel") {
    var td = tour(), ed = ev(), dd = S.teamEdit; if (!td || !ed || !dd) return;
    S.teamEdit = null; render();
    post({ action: "removeTeam", tournamentId: td.id, eventId: ed.id, index: dd.index }, "Entry removed");
    return;
  }

  if (act === "register") {
    var tr = tour(), er = ev(); if (!tr || !er) return;
    var sng = typeSingles(er.eventTypeId);
    var team = String(S.reg.team || "").trim(), p1 = String(S.reg.p1 || "").trim(), p2 = String(S.reg.p2 || "").trim();
    if (!team || !p1 || (!sng && !p2)) { toast(sng ? "Entry name and player needed" : "Team, your name and partner needed"); return; }
    S.regBusy = true; render();
    post({ action: "register", tournamentId: tr.id, eventId: er.id, team: team, p1: p1, p2: p2 }).then(function (d) {
      S.regBusy = false;
      if (d) { S.reg = { team: "", p1: "", p2: "" }; toast("You\u2019re in \u2014 see you on court", 2600); }
      else render();
    });
    return;
  }

  if (act === "lock" || act === "unlock") {
    return needPin(function () { post({ action: "lock", tournamentId: val, locked: act === "lock" }, act === "lock" ? "Locked" : "Unlocked"); S.menu = null; });
  }
  if (act === "default") { return needPin(function () { post({ action: "setDefault", tournamentId: val }, "Set as default"); S.menu = null; }); }
  if (act === "duplicate") { return needPin(function () { post({ action: "duplicate", tournamentId: val }, "Duplicated"); S.menu = null; }); }
  if (act === "archive") { return needPin(function () { post({ action: "remove", tournamentId: val }, "Archived"); S.menu = null; if (S.tourId === val) { S.screen = "home"; S.tourId = null; } }); }
  if (act === "restore") { return needPin(function () { post({ action: "restore", tournamentId: val }, "Restored"); S.menu = null; }); }
  if (act === "confirmdelete") { S.confirm = val; S.menu = null; return render(); }
  if (act === "confirmclose") { S.confirm = null; return render(); }
  if (act === "purge") {
    return needPin(function () {
      post({ action: "purge", tournamentId: val }, "Deleted");
      S.confirm = null; if (S.tourId === val) { S.screen = "home"; S.tourId = null; S.evId = null; }
    });
  }
});

document.addEventListener("input", function (e) {
  var el = e.target.closest("[data-field],[data-ef],[data-num],[data-team],[data-note],[data-tf],[data-nt],[data-reg],[data-tform],[data-inv],[data-cn],[data-wl]");
  if (!el) return;
  if (el.hasAttribute("data-cn")) { S.form.courtNames[+el.getAttribute("data-cn")] = el.value; return; }
  if (el.hasAttribute("data-num")) {
    var raw = el.value.replace(/[^0-9]/g, "").slice(0, 2);
    if (raw !== el.value) el.value = raw;
    var n = raw === "" ? 0 : Math.max(0, Math.min(30, parseInt(raw, 10)));
    if (raw !== "" && String(n) !== raw) el.value = String(n);
    var p = el.getAttribute("data-num").split(":");
    S.draft[+p[0]][p[1] === "a" ? "a" : "b"] = n;
    S.draft[+p[0]].played = true;
    return;
  }
  if (el.hasAttribute("data-note")) { S.note[el.getAttribute("data-note")] = el.value; return; }
  if (el.hasAttribute("data-reg")) { S.reg[el.getAttribute("data-reg")] = el.value; return; }
  if (el.hasAttribute("data-wl")) { S.wl[el.getAttribute("data-wl")] = el.value; return; }
  if (el.hasAttribute("data-tform")) { S.teamEdit[el.getAttribute("data-tform")] = el.value; return; }
  if (el.hasAttribute("data-inv")) {
    if (S.inv && S.unlocked) { S.inv[el.getAttribute("data-inv")] = el.value; saveInv(); drawInvite(); }
    return;
  }
  if (el.hasAttribute("data-nt")) { S.newType.name = el.value; return; }
  if (el.hasAttribute("data-tf")) {
    var tid = el.getAttribute("data-tf");
    var row = S.typeDraft[tid] || (S.typeDraft[tid] = { name: typeName(tid), singles: typeSingles(tid) });
    row.name = el.value; return;
  }
  if (el.hasAttribute("data-team")) {
    var q = el.getAttribute("data-team").split(":");
    var trow = S.form.events[+q[0]].teams[+q[1]];
    if (q[2] === "name") trow.name = el.value;
    else trow.players[+q[3]] = el.value;
    return;
  }
  if (el.hasAttribute("data-ef")) {
    var b = el.getAttribute("data-ef").split(":"), evf = S.form.events[+b[0]], key = b[1];
    if (key === "knockout") { evf.knockout = el.checked; return render(); }
    if (key === "regOpen") { evf.regOpen = el.checked; return render(); }
    if (key === "teamCount" || key === "poolCount") { evf[key] = el.value; syncTeamRows(evf); return render(); }
    evf[key] = el.value;
    if (key === "eventTypeId") return render();
    return;
  }
  if (el.getAttribute("data-field") === "schedQ") return;
  S.form[el.getAttribute("data-field")] = el.value;
});
document.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && e.target && e.target.getAttribute && e.target.getAttribute("data-field") === "schedQ") {
    e.preventDefault();
    S.schedQ = e.target.value;
    render();
  }
});

document.addEventListener("change", function (e) {
  var cc = e.target.closest('[data-field="courtCount"]');
  if (cc && S.form) { S.form.courtCount = cc.value; syncCourts(S.form); return render(); }
  var el = e.target.closest("[data-ef]");
  if (!el) return;
  var b = el.getAttribute("data-ef").split(":"), evf = S.form.events[+b[0]], key = b[1];
  if (key === "knockout") { evf.knockout = el.checked; return render(); }
  if (key === "regOpen") { evf.regOpen = el.checked; return render(); }
  evf[key] = el.value;
  render();
});

document.addEventListener("focusin", function (e) {
  var i = e.target.closest("input[data-num]");
  if (i) setTimeout(function () { i.select(); }, 0);
});

function stepScore(i, side, d) {
  var row = S.draft[i]; if (!row) return;
  row[side] = Math.max(0, Math.min(30, row[side] + d));
  row.played = true;
  render();
}
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-step2]");
  if (!b) return;
  var p = b.getAttribute("data-step2").split(":");
  stepScore(+p[0], p[1] === "a" ? "a" : "b", +p[2]);
});

render();
if (CLOUD) {
  load(true);
  setInterval(function () {
    var ae = document.activeElement;
    var typing = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName);
    if (!S.editing && !S.gate && !S.form && !S.teamEdit && S.screen !== "types" && S.screen !== "invite" && !typing && document.visibilityState !== "hidden") load(true);
  }, 10000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") load(true); });
}
