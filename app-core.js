// Model, schedule generation, scoring formats, standings, knockout.
// Pure data — no DOM.

var FORMATS = {
  to11win1: { label: "To 11, win by 1", target: 11, by: 1, games: 1 },
  to11win2: { label: "To 11, win by 2", target: 11, by: 2, games: 1 },
  to15win2: { label: "To 15, win by 2", target: 15, by: 2, games: 1 },
  bo3to11: { label: "Best of 3 to 11", target: 11, by: 2, games: 3 }
};
var FORMAT_KEYS = ["to11win1", "to11win2", "to15win2", "bo3to11"];
var CATEGORIES = ["Mixed doubles", "Men's doubles", "Women's doubles", "Men's singles", "Women's singles"];
var POOL_LETTERS = "ABCDEFGH";

function isSingles(cat) { return /singles/i.test(cat || ""); }
function fmt(key) { return FORMATS[key] || FORMATS.to11win1; }
function fmtLabel(key) { return fmt(key).label; }

// ---- round robin -----------------------------------------------------------
// Circle method: returns [[ [i,j], ... ] per round ] over n team indexes.
function rounds(n) {
  var idx = [], i;
  for (i = 0; i < n; i++) idx.push(i);
  if (n % 2) idx.push(-1);
  var m = idx.length, out = [];
  for (var r = 0; r < m - 1; r++) {
    var pairs = [];
    for (i = 0; i < m / 2; i++) {
      var a = idx[i], b = idx[m - 1 - i];
      if (a >= 0 && b >= 0) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    out.push(pairs);
    idx.splice(1, 0, idx.pop());
  }
  return out;
}

function poolsOf(tour) {
  var out = [], i;
  for (i = 0; i < (tour.poolCount || 1); i++) out.push([]);
  (tour.teams || []).forEach(function (t, ti) {
    var p = Math.min(out.length - 1, Math.max(0, t.pool || 0));
    out[p].push({ name: t.name, players: t.players || [], idx: ti, local: out[p].length });
  });
  return out;
}

// Even distribution used when creating/editing: snake order.
function assignPools(count, poolCount) {
  var out = [], dir = 1, p = 0;
  for (var i = 0; i < count; i++) {
    out.push(p);
    p += dir;
    if (p === poolCount) { p = poolCount - 1; dir = -1; }
    else if (p < 0) { p = 0; dir = 1; }
  }
  return out;
}

// ---- match list ------------------------------------------------------------
// Pool matches, interleaved across pools round by round, then numbered.
function poolMatches(tour) {
  var groups = poolsOf(tour), byRound = [], maxR = 0;
  groups.forEach(function (teams, pi) {
    var rs = rounds(teams.length);
    maxR = Math.max(maxR, rs.length);
    rs.forEach(function (pairs, ri) {
      byRound[ri] = byRound[ri] || [];
      pairs.forEach(function (pair) {
        var A = teams[pair[0]], B = teams[pair[1]];
        if (!A || !B) return;
        byRound[ri].push({
          id: "P" + pi + "-" + Math.min(A.local, B.local) + "-" + Math.max(A.local, B.local),
          stage: "pool", pool: pi, round: ri + 1,
          teamA: A.name, teamB: B.name, fmtKey: tour.poolFormat, ready: true
        });
      });
    });
  });
  var flat = [];
  byRound.forEach(function (r) { (r || []).forEach(function (m) { flat.push(m); }); });
  flat.forEach(function (m, i) {
    m.no = i + 1;
    m.stage_label = "Match " + m.no + " · Group " + POOL_LETTERS[m.pool];
  });
  return flat;
}

// ---- scoring ---------------------------------------------------------------
// A match is one entry when its format is single-game, or N sub-games (id#1…).
function gameIds(match) {
  var g = fmt(match.fmtKey).games;
  if (g === 1) return [match.id];
  var out = [];
  for (var i = 1; i <= g; i++) out.push(match.id + "#" + i);
  return out;
}

function gameRec(tour, gid) {
  var r = (tour.results || {})[gid];
  return r ? { a: r.a | 0, b: r.b | 0, status: r.status === "live" ? "live" : "done" } : null;
}

// Rolls a match up: totals, per-game list, winner, status.
function matchState(tour, match) {
  var ids = gameIds(match), gs = ids.map(function (id) {
    var r = gameRec(tour, id);
    return { id: id, a: r ? r.a : 0, b: r ? r.b : 0, status: r ? r.status : "upcoming" };
  });
  var winsA = 0, winsB = 0, ptsA = 0, ptsB = 0, any = false, allDone = true, live = false;
  gs.forEach(function (g) {
    ptsA += g.a; ptsB += g.b;
    if (g.status === "upcoming") { allDone = false; return; }
    any = true;
    if (g.status === "live") { live = true; allDone = false; return; }
    if (g.a >= g.b) winsA++; else winsB++;
  });
  var best = fmt(match.fmtKey).games;
  var need = best === 1 ? 1 : 2;
  var decided = winsA >= need || winsB >= need;
  var status = decided ? "done" : (live || any ? "live" : "upcoming");
  var winner = decided ? (winsA > winsB ? match.teamA : match.teamB) : null;
  return {
    games: gs, winsA: winsA, winsB: winsB, ptsA: ptsA, ptsB: ptsB,
    status: status, winner: winner, loser: winner ? (winner === match.teamA ? match.teamB : match.teamA) : null,
    multi: best > 1, need: need,
    scoreLine: best === 1 ? (status === "upcoming" ? "–" : gs[0].a + "–" + gs[0].b) : (status === "upcoming" ? "–" : winsA + "–" + winsB)
  };
}

function decorate(tour, match) {
  var st = matchState(tour, match);
  return {
    id: match.id, no: match.no, stage: match.stage, stageLabel: match.stage_label || match.stage,
    pool: match.pool, teamA: match.teamA, teamB: match.teamB, fmtKey: match.fmtKey,
    ready: match.ready !== false, seedA: match.seedA || "", seedB: match.seedB || "",
    games: st.games, status: st.status, winner: st.winner, loser: st.loser,
    multi: st.multi, scoreA: st.games[0] ? st.games[0].a : 0, scoreB: st.games[0] ? st.games[0].b : 0,
    ptsA: st.ptsA, ptsB: st.ptsB, winsA: st.winsA, winsB: st.winsB, scoreLine: st.scoreLine
  };
}

// ---- standings -------------------------------------------------------------
function standings(tour, matches, poolIndex) {
  var teams = poolsOf(tour)[poolIndex] || [];
  var rows = teams.map(function (t) { return { team: t.name, players: t.players, w: 0, l: 0, pf: 0, pa: 0 }; });
  var find = function (n) { return rows.filter(function (r) { return r.team === n; })[0]; };
  matches.filter(function (m) { return m.stage === "pool" && m.pool === poolIndex && m.status === "done"; })
    .forEach(function (m) {
      var A = find(m.teamA), B = find(m.teamB);
      if (!A || !B) return;
      A.pf += m.ptsA; A.pa += m.ptsB; B.pf += m.ptsB; B.pa += m.ptsA;
      if (m.winner === m.teamA) { A.w++; B.l++; } else { B.w++; A.l++; }
    });
  rows.forEach(function (r) { r.d = r.pf - r.pa; });
  rows.sort(function (x, y) { return y.w - x.w || y.d - x.d || y.pf - x.pf; });
  return rows.map(function (r, i) {
    return { pos: i + 1, team: r.team, players: r.players, w: r.w, l: r.l, pf: r.pf, pa: r.pa,
      d: r.d, diff: (r.d > 0 ? "+" : "") + r.d, rec: r.w + "–" + r.l };
  });
}

// ---- knockout --------------------------------------------------------------
// 1 pool  -> top 4 cross (1v4, 2v3)
// 2 pools -> A1–B2, B1–A2
// 3+      -> pool winners, filled to 4 by best runners-up on differential
function seedLabels(n) {
  if (n === 1) return [["1st", "4th"], ["2nd", "3rd"]];
  if (n === 2) return [["Group A · 1st", "Group B · 2nd"], ["Group B · 1st", "Group A · 2nd"]];
  return [["Pool winner", "Lowest qualifier"], ["Pool winner", "Wildcard"]];
}
function seeds(tour, tables, complete) {
  var n = tables.length;
  if (!complete) return null;
  if (n === 1) {
    var t = tables[0];
    if (t.length < 4) return null;
    return [
      { a: t[0].team, b: t[3].team, sa: "1st", sb: "4th" },
      { a: t[1].team, b: t[2].team, sa: "2nd", sb: "3rd" }
    ];
  }
  if (n === 2) {
    if (tables[0].length < 2 || tables[1].length < 2) return null;
    return [
      { a: tables[0][0].team, b: tables[1][1].team, sa: "Group A · 1st", sb: "Group B · 2nd" },
      { a: tables[1][0].team, b: tables[0][1].team, sa: "Group B · 1st", sb: "Group A · 2nd" }
    ];
  }
  var winners = tables.map(function (t, i) { return { team: t[0].team, seed: "Group " + POOL_LETTERS[i] + " · 1st", d: t[0].d }; });
  var seconds = tables.map(function (t, i) { return t[1] ? { team: t[1].team, seed: "Wildcard · " + POOL_LETTERS[i] + " 2nd", d: t[1].d } : null; })
    .filter(Boolean).sort(function (x, y) { return y.d - x.d; });
  var four = winners.slice(0, 4);
  while (four.length < 4 && seconds.length) four.push(seconds.shift());
  if (four.length < 4) return null;
  return [
    { a: four[0].team, b: four[3].team, sa: four[0].seed, sb: four[3].seed },
    { a: four[1].team, b: four[2].team, sa: four[1].seed, sb: four[2].seed }
  ];
}

function knockout(tour, matches, tables) {
  if (!tour.knockout) return null;
  var pm = matches.filter(function (m) { return m.stage === "pool"; });
  var complete = pm.length > 0 && pm.every(function (m) { return m.status === "done"; });
  var pair = seeds(tour, tables, complete);
  var lab = seedLabels(tables.length);
  var base = pm.length;

  function mk(id, offset, label, stage, fmtKey, a, b, sa, sb) {
    var m = { id: id, no: base + offset, stage: stage, stage_label: label,
      teamA: a || "To be decided", teamB: b || "To be decided", fmtKey: fmtKey,
      ready: !!(a && b), seedA: sa, seedB: sb };
    return decorate(tour, m);
  }

  var sf1 = mk("SF1", 1, "Semifinal 1", "sf", tour.koFormat, pair && pair[0].a, pair && pair[0].b, pair ? pair[0].sa : lab[0][0], pair ? pair[0].sb : lab[0][1]);
  var sf2 = mk("SF2", 2, "Semifinal 2", "sf", tour.koFormat, pair && pair[1].a, pair && pair[1].b, pair ? pair[1].sa : lab[1][0], pair ? pair[1].sb : lab[1][1]);
  var bronze = mk("BR", 3, "Third place", "bronze", tour.koFormat, sf1.loser, sf2.loser, "Loser SF1", "Loser SF2");
  var final = mk("FN", 4, "Final", "final", tour.finalFormat, sf1.winner, sf2.winner, "Winner SF1", "Winner SF2");

  return {
    matches: [sf1, sf2, bronze, final],
    sf: [sf1, sf2], bronze: bronze, final: final,
    seeded: !!pair,
    champ: final.winner, runner: final.loser, third: bronze.winner
  };
}

// Everything a view needs for one tournament.
function build(tour) {
  var raw = poolMatches(tour);
  var pool = raw.map(function (m) { return decorate(tour, m); });
  var tables = [];
  for (var i = 0; i < (tour.poolCount || 1); i++) tables.push(standings(tour, pool, i));
  var ko = knockout(tour, pool, tables);
  var all = pool.concat(ko ? ko.matches.filter(function (m) { return m.ready || m.status !== "upcoming"; }) : []);
  return {
    tour: tour, pool: pool, tables: tables, ko: ko, all: all,
    scheduled: pool.length + (ko ? ko.matches.length : 0),
    live: all.filter(function (m) { return m.status === "live"; }),
    done: all.filter(function (m) { return m.status === "done"; }),
    next: all.filter(function (m) { return m.status === "upcoming" && m.ready; }).slice(0, 4),
    byId: (function () { var o = {}; all.forEach(function (m) { o[m.id] = m; }); if (ko) ko.matches.forEach(function (m) { o[m.id] = m; }); return o; })()
  };
}

window.TModel = {
  FORMATS: FORMATS, FORMAT_KEYS: FORMAT_KEYS, CATEGORIES: CATEGORIES, POOL_LETTERS: POOL_LETTERS,
  isSingles: isSingles, fmt: fmt, fmtLabel: fmtLabel, assignPools: assignPools, poolsOf: poolsOf,
  build: build, gameIds: gameIds, standings: standings
};
