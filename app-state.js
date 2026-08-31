// State, API access, routing, event handling.
var API = "/api/data";
var PASSCODE = "2074";
var LKEY = "hom.db";
var CLOUD = location.protocol !== "file:";

var S = {
  screen: "home",           // home | event | new | edit
  tab: "now",
  tourId: null,
  db: { tournaments: [], defaultId: null },
  sync: CLOUD ? "loading" : "local",
  toast: "",
  unlocked: false, pinUsed: "", gate: null, gateThen: null, pin: "", bad: false,
  editing: null, draft: [],
  menu: null,
  form: null,
  confirm: null,
  note: { who: "", text: "" },
  noteBusy: false
};

try { S.unlocked = sessionStorage.getItem("hom.unlocked") === "1"; } catch (e) {}
try { S.pinUsed = sessionStorage.getItem("hom.pin") || ""; } catch (e) {}
try { var c = localStorage.getItem(LKEY); if (c) S.db = JSON.parse(c); } catch (e) {}

// Offline / first-run fallback so the app is never an empty shell.
if (!S.db || !Array.isArray(S.db.tournaments) || !S.db.tournaments.length) {
  S.db = { tournaments: [demoTournament()], defaultId: "hills-2026", v: 2 };
}
function demoTournament() {
  var roster = [
    ["Arepa con Pitorro", ["Jaime Morales", "Georgina"]], ["Caribe Smash", ["Rafael", "Jean"]],
    ["Dinking Couple", ["Mat", "Colby"]], ["Team Lionic", ["Nicci", "Gene"]],
    ["The Strangers", ["Sabrina", "Daniel"]], ["V Power", ["Sandra", "Carlos"]],
    ["Team Flame", ["Berta", "William"]], ["Team Venom", ["Raghu", "Gabby"]],
    ["Macho Camacho", ["Crystal", "Marcus"]], ["R&B", ["Rola", "Balbino"]]
  ];
  return {
    id: "hills-2026", name: "Hills of Minneola Mixed Doubles", category: "Mixed doubles",
    date: "2026-08-30", time: "08:00", poolCount: 2, knockout: true, director: "",
    poolFormat: "to11win1", koFormat: "to11win2", finalFormat: "bo3to11",
    teams: roster.map(function (r, i) { return { name: r[0], players: r[1], pool: i < 5 ? 0 : 1 }; }),
    results: {}, locked: false, archived: false, createdAt: Date.now()
  };
}

function cacheDb() { try { localStorage.setItem(LKEY, JSON.stringify(S.db)); } catch (e) {} }
function tours(includeArchived) {
  return (S.db.tournaments || []).filter(function (t) { return includeArchived || !t.archived; });
}
function tour() { return (S.db.tournaments || []).filter(function (t) { return t.id === S.tourId; })[0] || null; }
function toast(msg, ms) { S.toast = msg; render(); setTimeout(function () { S.toast = ""; render(); }, ms || 2000); }

// ---- api -------------------------------------------------------------------
function load(quiet) {
  if (!CLOUD) { S.sync = "local"; return Promise.resolve(false); }
  return fetch(API, { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      if (d && d.db) { S.db = d.db; cacheDb(); }
      S.sync = "live";
      if (!S.tourId && S.screen === "home" && S.db.defaultId && tours().length) {
        // don't auto-navigate; the picker highlights the default instead
      }
      render(); return true;
    })
    .catch(function () { S.sync = "offline"; if (!quiet) render(); return false; });
}

function post(payload, okMsg) {
  if (!CLOUD) { toast("Offline — not saved"); return Promise.resolve(null); }
  if (payload.action !== "note") payload.pin = S.pinUsed || "";
  return fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    .then(function (r) {
      if (r.status === 401) { S.unlocked = false; S.pinUsed = ""; try { sessionStorage.removeItem("hom.unlocked"); sessionStorage.removeItem("hom.pin"); } catch (e) {} throw new Error("passcode"); }
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(function (d) {
      if (d && d.db) { S.db = d.db; cacheDb(); }
      S.sync = "live";
      if (okMsg) toast(okMsg); else render();
      return d;
    })
    .catch(function (e) {
      S.sync = "offline";
      toast(String(e.message) === "passcode" ? "Passcode rejected" : "Not saved online", 2600);
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
  var t = tour(); if (!t) return;
  if (t.locked) { toast("Tournament is locked"); return; }
  needPin(function () {
    var v = TModel.build(t), m = v.byId[id];
    if (!m || !m.ready) return;
    S.editing = id;
    S.draft = m.games.map(function (g) { return { a: g.a, b: g.b, played: g.status !== "upcoming" }; });
    render();
  });
}
function saveSheet(status) {
  var t = tour(); if (!t) return;
  var v = TModel.build(t), m = v.byId[S.editing];
  if (!m) { S.editing = null; return render(); }
  var ids = TModel.gameIds({ id: m.id, fmtKey: m.fmtKey });
  var jobs = [];
  ids.forEach(function (gid, i) {
    var d = S.draft[i];
    if (!d) return;
    var blank = !d.a && !d.b;
    if (blank && !d.played) return;                       // never entered — skip
    if (blank && d.played) { jobs.push({ action: "clearScore", tournamentId: t.id, id: gid }); return; }
    jobs.push({ action: "score", tournamentId: t.id, id: gid, a: d.a, b: d.b, status: status });
  });
  S.editing = null; render();
  (function next(i) {
    if (i >= jobs.length) { toast(status === "done" ? "Score saved" : "Score updated"); return; }
    post(jobs[i]).then(function () { next(i + 1); });
  })(0);
}
function clearMatch() {
  var t = tour(); if (!t) return;
  var v = TModel.build(t), m = v.byId[S.editing];
  var ids = m ? TModel.gameIds({ id: m.id, fmtKey: m.fmtKey }) : [];
  S.editing = null; render();
  (function next(i) {
    if (i >= ids.length) { toast("Result removed"); return; }
    post({ action: "clearScore", tournamentId: t.id, id: ids[i] }).then(function () { next(i + 1); });
  })(0);
}

// ---- create / edit form ---------------------------------------------------
function blankForm() {
  return {
    mode: "new", id: null,
    name: "", category: TModel.CATEGORIES[0], director: "",
    date: new Date().toISOString().slice(0, 10), time: "08:00",
    teamCount: 8, poolCount: 2, knockout: true,
    poolFormat: "to11win1", koFormat: "to11win2", finalFormat: "bo3to11",
    teams: [], step: 1, error: ""
  };
}
function syncTeamRows(f) {
  var n = Math.max(2, Math.min(32, parseInt(f.teamCount, 10) || 2));
  f.teamCount = n;
  while (f.teams.length < n) f.teams.push({ name: "", players: ["", ""] });
  f.teams.length = n;
  var pools = TModel.assignPools(n, Math.max(1, Math.min(8, parseInt(f.poolCount, 10) || 1)));
  f.teams.forEach(function (t, i) { t.pool = pools[i]; });
}
function openNew() {
  needPin(function () { S.form = blankForm(); syncTeamRows(S.form); S.screen = "new"; window.scrollTo(0, 0); render(); });
}
function openEdit(id) {
  needPin(function () {
    var t = (S.db.tournaments || []).filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    S.form = {
      mode: "edit", id: t.id, name: t.name, category: t.category, director: t.director || "",
      date: t.date || "", time: t.time || "",
      teamCount: (t.teams || []).length, poolCount: t.poolCount || 1, knockout: t.knockout !== false,
      poolFormat: t.poolFormat, koFormat: t.koFormat, finalFormat: t.finalFormat,
      teams: (t.teams || []).map(function (x) {
        return { name: x.name, players: [(x.players || [])[0] || "", (x.players || [])[1] || ""], pool: x.pool || 0 };
      }),
      step: 1, error: ""
    };
    S.screen = "edit"; S.menu = null; window.scrollTo(0, 0); render();
  });
}
function formValid(f) {
  if (!String(f.name).trim()) return "Give the tournament a name.";
  var single = TModel.isSingles(f.category), bad = 0;
  f.teams.forEach(function (t) {
    if (!String(t.name).trim()) bad++;
    if (!String(t.players[0]).trim()) bad++;
    if (!single && !String(t.players[1]).trim()) bad++;
  });
  if (bad) return single ? "Every entry needs a name and a player." : "Every team needs a name and two players.";
  var counts = {}, i;
  for (i = 0; i < f.teams.length; i++) counts[f.teams[i].pool] = (counts[f.teams[i].pool] || 0) + 1;
  for (i = 0; i < f.poolCount; i++) if ((counts[i] || 0) < 2) return "Each pool needs at least two teams.";
  return "";
}
function submitForm() {
  var f = S.form; if (!f) return;
  var err = formValid(f);
  if (err) { f.error = err; render(); return; }
  var single = TModel.isSingles(f.category);
  var payload = {
    name: f.name, category: f.category, director: String(f.director || "").trim(), date: f.date, time: f.time,
    poolCount: parseInt(f.poolCount, 10) || 1, knockout: !!f.knockout,
    poolFormat: f.poolFormat, koFormat: f.koFormat, finalFormat: f.finalFormat,
    teams: f.teams.map(function (t) {
      return { name: t.name.trim(), pool: t.pool, players: single ? [t.players[0].trim()] : [t.players[0].trim(), t.players[1].trim()] };
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
        S.screen = S.tourId ? "event" : "home";
        S.tab = "teams";
      } else {
        S.tourId = f.id; S.screen = "event";
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
  // Backdrops only close when the backdrop itself is clicked.
  if (t.hasAttribute("data-back") && e.target !== t) return;

  if (act === "open") { S.tourId = val; S.screen = "event"; S.tab = "now"; S.menu = null; window.scrollTo(0, 0); return render(); }
  if (act === "home") { S.screen = "home"; S.tourId = null; S.menu = null; S.form = null; window.scrollTo(0, 0); return render(); }
  if (act === "tab") { S.tab = val; S.editing = null; window.scrollTo(0, 0); return render(); }
  if (act === "new") return openNew();
  if (act === "edit") return openEdit(val);
  if (act === "menu") { S.menu = S.menu === val ? null : val; return render(); }
  if (act === "closemenu") { S.menu = null; return render(); }
  if (act === "refresh") { S.sync = "loading"; render(); load(); return; }
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
  if (act === "pool") {
    var bits = val.split(":"), i = +bits[0];
    S.form.teams[i].pool = +bits[1];
    return render();
  }
  if (act === "autopool") { syncTeamRows(S.form); return render(); }

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
      S.confirm = null; if (S.tourId === val) { S.screen = "home"; S.tourId = null; }
    });
  }
});

document.addEventListener("input", function (e) {
  var el = e.target.closest("[data-field],[data-num],[data-team],[data-note]");
  if (!el) return;
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
  if (el.hasAttribute("data-note")) {
    S.note[el.getAttribute("data-note")] = el.value;
    return;
  }
  if (el.hasAttribute("data-team")) {
    var q = el.getAttribute("data-team").split(":");
    var row = S.form.teams[+q[0]];
    if (q[1] === "name") row.name = el.value;
    else row.players[+q[2]] = el.value;
    return;
  }
  var f = el.getAttribute("data-field"), v = el.value;
  if (f === "teamCount" || f === "poolCount") { S.form[f] = v; syncTeamRows(S.form); return render(); }
  if (f === "knockout") { S.form.knockout = el.checked; return render(); }
  if (f === "category") { S.form.category = v; return render(); }
  S.form[f] = v;
});

document.addEventListener("change", function (e) {
  var el = e.target.closest("[data-field]");
  if (!el) return;
  var f = el.getAttribute("data-field");
  if (f === "knockout") { S.form.knockout = el.checked; return render(); }
  if (f === "category" || f === "poolFormat" || f === "koFormat" || f === "finalFormat") { S.form[f] = el.value; return render(); }
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
    if (!S.editing && !S.gate && !S.form && !typing && document.visibilityState !== "hidden") load(true);
  }, 10000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") load(true); });
}
