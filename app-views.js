// All rendering. Reads S (app-state.js) and TModel (app-core.js).
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function L(i) { return TModel.POOL_LETTERS[i]; }
function when(t) {
  if (!t.date) return "Date to be set";
  var d = new Date(t.date + "T" + (t.time || "00:00"));
  if (isNaN(d)) return t.date;
  var s = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return t.time ? s + " · " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : s;
}
function players(list) { return (list || []).filter(Boolean).join(" & "); }

function syncChip() {
  if (!CLOUD) return "";
  var cls = S.sync === "offline" ? " off" : (S.sync === "live" ? "" : " wait");
  var label = S.sync === "offline" ? "Retry" : (S.sync === "live" ? "Live" : "Sync");
  return '<button class="syncchip' + cls + '" data-act="refresh"><i></i><span>' + label + '</span></button>';
}

function masthead(title, sub, back) {
  return '<div class="hd">' +
    (back ? '<button class="back" data-act="home">‹</button>' : '') +
    '<div class="hdmain"><h1>' + title + '</h1><div class="sub">' + sub + '</div></div>' +
    '<div class="tools">' + syncChip() + '</div></div>';
}

// ---- home ------------------------------------------------------------------
function viewHome() {
  var live = tours(), archived = (S.db.tournaments || []).filter(function (t) { return t.archived; });
  var h = masthead("Pickleball<br>Tournaments", "Hills of Minneola · Pick an event", false);
  h += '<button class="cta" data-act="new">+ Create tournament</button>';
  if (!live.length) {
    h += '<div class="empty">No tournaments yet. Create one and the schedule, pools and bracket build themselves.</div>';
  }
  live.forEach(function (t) {
    var v = TModel.build(t);
    var status = t.locked ? "Locked" : (v.done.length === 0 ? "Not started" : (v.ko && v.ko.champ ? "Complete" : "In progress"));
    h += '<div class="tcard">' +
      '<button class="tmain" data-act="open" data-val="' + t.id + '">' +
        '<div class="trow"><div class="tname">' + esc(t.name) + '</div>' +
        (S.db.defaultId === t.id ? '<span class="pill">Default</span>' : '') + '</div>' +
        '<div class="tmeta">' + esc(t.category) + ' · ' + (t.teams || []).length + ' teams · ' + t.poolCount + ' pool' + (t.poolCount > 1 ? 's' : '') + '</div>' +
        '<div class="tmeta">' + esc(when(t)) + '</div>' +
        '<div class="tfoot"><span class="tstat' + (status === "In progress" ? " on" : "") + '">' + status + '</span>' +
        '<span class="tprog">' + v.done.length + ' / ' + v.scheduled + ' matches</span></div>' +
      '</button>' +
      '<button class="tmenu" data-act="menu" data-val="' + t.id + '">⋯</button>' +
      (S.menu === t.id ? menu(t) : '') +
    '</div>';
  });
  if (archived.length) {
    h += '<div class="lbl rule">Archived</div>';
    archived.forEach(function (t) {
      h += '<div class="tcard arch"><button class="tmain" data-act="open" data-val="' + t.id + '">' +
        '<div class="tname">' + esc(t.name) + '</div><div class="tmeta">' + esc(t.category) + ' · ' + esc(when(t)) + '</div></button>' +
        '<button class="tmenu" data-act="menu" data-val="' + t.id + '">⋯</button>' +
        (S.menu === t.id ? menu(t) : '') + '</div>';
    });
  }
  h += '<div class="pad"></div>';
  return h;
}

function menu(t) {
  var items = [];
  items.push(['edit', 'Edit setup']);
  items.push(['duplicate', 'Duplicate']);
  if (S.db.defaultId !== t.id) items.push(['default', 'Open by default']);
  items.push([t.locked ? 'unlock' : 'lock', t.locked ? 'Unlock scoring' : 'Lock scoring']);
  items.push([t.archived ? 'restore' : 'archive', t.archived ? 'Restore' : 'Archive']);
  items.push(['confirmdelete', 'Delete permanently', 'danger']);
  return '<div class="menuwrap" data-act="closemenu" data-back="1"><div class="menusheet">' +
    items.map(function (i) {
      return '<button class="mi' + (i[2] ? ' ' + i[2] : '') + '" data-act="' + i[0] + '" data-val="' + t.id + '">' + i[1] + '</button>';
    }).join('') +
    '<button class="mi close" data-act="closemenu">Cancel</button></div></div>';
}

// ---- create / edit ---------------------------------------------------------
function selectEl(field, value, opts) {
  return '<select data-field="' + field + '">' + opts.map(function (o) {
    var v = o[0], l = o[1];
    return '<option value="' + v + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + esc(l) + '</option>';
  }).join('') + '</select>';
}

function viewForm() {
  var f = S.form, single = TModel.isSingles(f.category);
  var fmtOpts = TModel.FORMAT_KEYS.map(function (k) { return [k, TModel.FORMATS[k].label]; });
  var h = '<div class="hd"><button class="back" data-act="formcancel">‹</button><div class="hdmain"><h1>' +
    (f.mode === "new" ? "New tournament" : "Edit setup") + '</h1><div class="sub">Step ' + f.step + ' of 2</div></div></div>';

  if (f.step === 1) {
    h += '<div class="fsec"><label>Tournament name</label><input type="text" data-field="name" value="' + esc(f.name) + '" placeholder="e.g. Hills of Minneola Fall Classic"></div>';
    h += '<div class="fsec"><label>Category</label>' + selectEl("category", f.category, TModel.CATEGORIES.map(function (c) { return [c, c]; })) + '</div>';
    h += '<div class="fsec two"><div><label>Start date</label><input type="date" data-field="date" value="' + esc(f.date) + '"></div>' +
      '<div><label>Start time</label><input type="time" data-field="time" value="' + esc(f.time) + '"></div></div>';
    h += '<div class="fsec two"><div><label>' + (single ? 'Players' : 'Teams') + '</label><input type="number" min="2" max="32" data-field="teamCount" value="' + f.teamCount + '"></div>' +
      '<div><label>Pools</label><input type="number" min="1" max="8" data-field="poolCount" value="' + f.poolCount + '"></div></div>';
    h += '<div class="fnote">' + f.teamCount + ' ' + (single ? 'players' : 'teams') + ' in ' + f.poolCount + ' pool' + (f.poolCount > 1 ? 's' : '') +
      ' — round robin inside each pool, ' + roundRobinCount(f) + ' matches.</div>';
    h += '<div class="fsec"><label>Pool game format</label>' + selectEl("poolFormat", f.poolFormat, fmtOpts) + '</div>';
    h += '<div class="fsec check"><label><input type="checkbox" data-field="knockout"' + (f.knockout ? ' checked' : '') + '> Play a knockout stage</label>' +
      '<div class="fnote">' + knockoutBlurb(f) + '</div></div>';
    if (f.knockout) {
      h += '<div class="fsec"><label>Semifinals &amp; third place format</label>' + selectEl("koFormat", f.koFormat, fmtOpts) + '</div>';
      h += '<div class="fsec"><label>Final format</label>' + selectEl("finalFormat", f.finalFormat, fmtOpts) + '</div>';
    }
    if (f.error) h += '<div class="ferr">' + esc(f.error) + '</div>';
    h += '<div class="facts"><button class="fbtn ghost" data-act="formcancel">Cancel</button><button class="fbtn" data-act="step" data-val="2">Next: ' + (single ? 'players' : 'teams') + ' →</button></div>';
  } else {
    h += '<div class="fnote top">' + (single ? 'Name each player and their entry.' : 'Name each team and both players.') +
      ' Tap a pool letter to move an entry.</div>';
    var poolOpts = [];
    for (var p = 0; p < f.poolCount; p++) poolOpts.push(p);
    f.teams.forEach(function (t, i) {
      h += '<div class="trow2"><div class="tnum">' + (i + 1) + '</div>' +
        '<div class="tfields">' +
          '<input type="text" data-team="' + i + ':name" value="' + esc(t.name) + '" placeholder="' + (single ? 'Entry name' : 'Team name') + '">' +
          '<div class="pgrid' + (single ? ' one' : '') + '">' +
            '<input type="text" data-team="' + i + ':p:0" value="' + esc(t.players[0]) + '" placeholder="' + (single ? 'Player' : 'Player 1') + '">' +
            (single ? '' : '<input type="text" data-team="' + i + ':p:1" value="' + esc(t.players[1]) + '" placeholder="Player 2">') +
          '</div>' +
          (f.poolCount > 1 ? '<div class="pools">' + poolOpts.map(function (p) {
            return '<button class="pbtn' + (t.pool === p ? ' on' : '') + '" data-act="pool" data-val="' + i + ':' + p + '">' + L(p) + '</button>';
          }).join('') + '</div>' : '') +
        '</div></div>';
    });
    if (f.poolCount > 1) h += '<button class="fbtn ghost wide" data-act="autopool">Redistribute pools evenly</button>';
    if (f.error) h += '<div class="ferr">' + esc(f.error) + '</div>';
    h += '<div class="facts"><button class="fbtn ghost" data-act="step" data-val="1">‹ Back</button>' +
      '<button class="fbtn" data-act="formsubmit">' + (f.mode === "new" ? "Create tournament" : "Save changes") + '</button></div>';
  }
  h += '<div class="pad"></div>';
  return h;
}

function roundRobinCount(f) {
  var pools = TModel.assignPools(f.teamCount, f.poolCount), counts = {};
  pools.forEach(function (p) { counts[p] = (counts[p] || 0) + 1; });
  var n = 0;
  Object.keys(counts).forEach(function (k) { var c = counts[k]; n += c * (c - 1) / 2; });
  return n + (f.knockout ? 4 : 0);
}
function knockoutBlurb(f) {
  if (!f.knockout) return "Pool play only — the winner is top of the table.";
  var n = parseInt(f.poolCount, 10) || 1;
  if (n === 1) return "Top four go to the semifinals: 1st v 4th, 2nd v 3rd. Then third place and the final.";
  if (n === 2) return "Semifinals cross over: A1 v B2, B1 v A2. Then third place and the final.";
  return "Pool winners qualify, filled to four by the best runners-up on point differential. Then third place and the final.";
}

// ---- tournament: shared bits ----------------------------------------------
function scoreCell(m) {
  if (m.status === "upcoming") return '<div></div>';
  return '<div class="num">' + (m.multi ? m.winsA + '–' + m.winsB : m.scoreA + '–' + m.scoreB) + '</div>';
}
function matchRow(m, cls) {
  var tag = m.ready && !tour().locked ? 'button' : 'div';
  var att = m.ready && !tour().locked ? ' data-act="score" data-val="' + m.id + '"' : '';
  return '<' + tag + ' class="' + cls + '"' + att + '><div class="n">#' + m.no + '</div>' +
    '<div class="t">' + esc(m.teamA) + '<br>' + esc(m.teamB) + '</div>' +
    '<div class="s' + (m.status === "live" ? " on" : "") + '">' + m.scoreLine + '</div></' + tag + '>';
}

// ---- tournament screens ---------------------------------------------------
function viewEvent() {
  var t = tour();
  if (!t) return viewHome();
  var v = TModel.build(t), h = "";
  var sub = esc(t.category) + ' · ' + (t.teams || []).length + ' teams' + (t.locked ? ' · Locked' : '');
  h += '<div class="hd"><button class="back" data-act="home">‹</button><div class="hdmain"><h1>' + esc(t.name) + '</h1><div class="sub">' + sub + '</div></div>' +
    '<div class="tools">' + (v.live.length ? '<div class="livechip"><i></i><span>LIVE</span></div>' : '') + syncChip() + '</div></div>';

  if (S.tab === "now") h += tabNow(t, v);
  if (S.tab === "groups") h += tabGroups(t, v);
  if (S.tab === "bracket") h += tabBracket(t, v);
  if (S.tab === "teams") h += tabTeams(t, v);
  if (S.tab === "recap") h += tabRecap(t, v);
  if (S.tab === "info") h += tabInfo(t, v);

  var tabs = [["now", "Now"], ["groups", "Groups"], ["bracket", "Bracket"], ["teams", "Teams"], ["recap", "Recap"], ["info", "Info"]];
  if (!t.knockout) tabs.splice(2, 1);
  h += '<div class="nav"><div style="grid-template-columns:repeat(' + tabs.length + ',1fr)">' +
    tabs.map(function (x) {
      return '<button class="' + (S.tab === x[0] ? "on" : "") + '" data-act="tab" data-val="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '</div></div>';
  return h;
}

function tabNow(t, v) {
  var h = "";
  if (t.locked) h += '<div class="snap">Scoring locked — results are final</div>';
  if (!v.live.length) {
    h += '<div class="note"><div class="k">' + (v.done.length ? "Nothing on court" : "Not started") + '</div><p>' +
      (t.locked ? "This tournament is finished." : "Tap any match to enter the score as it plays.") + '</p></div>';
  } else {
    h += '<div class="lbl">On court now</div>';
    v.live.forEach(function (m) {
      h += '<div class="live"><div class="top"><span>' + esc(m.stageLabel) + '</span><span>' + TModel.fmtLabel(m.fmtKey) + '</span></div>' +
        '<div class="row"><div class="tm">' + esc(m.teamA) + '</div><div class="sc">' + (m.multi ? m.winsA : m.scoreA) + '</div></div>' +
        '<div class="row"><div class="tm">' + esc(m.teamB) + '</div><div class="sc">' + (m.multi ? m.winsB : m.scoreB) + '</div></div>' +
        (t.locked ? '' : '<button class="act" data-act="score" data-val="' + m.id + '">Update score →</button>') + '</div>';
    });
  }
  if (v.next.length) {
    h += '<div class="lbl rule">Up next</div>';
    v.next.forEach(function (m) {
      var tag = t.locked ? 'div' : 'button', att = t.locked ? '' : ' data-act="score" data-val="' + m.id + '"';
      h += '<' + tag + ' class="next"' + att + '><div><div class="no">#' + m.no + '</div><div class="cd">' + esc(shortStage(m)) + '</div></div>' +
        '<div><div class="t">' + esc(m.teamA) + '</div><div class="v">vs</div><div class="t">' + esc(m.teamB) + '</div></div></' + tag + '>';
    });
  }
  if (v.done.length) {
    h += '<div class="lbl rule">Latest results</div>';
    v.done.slice(-3).reverse().forEach(function (m) {
      h += '<div class="res"><div><div class="k">' + esc(m.stageLabel) + '</div><div class="t">' + esc(m.teamA) + '</div><div class="t">' + esc(m.teamB) + '</div></div>' +
        '<div class="s"><div style="opacity:0">·</div><div>' + (m.multi ? m.winsA : m.scoreA) + '</div><div>' + (m.multi ? m.winsB : m.scoreB) + '</div></div></div>';
    });
  }
  h += '<div class="pad"></div>';
  return h;
}
function shortStage(m) {
  if (m.stage === "pool") return "Group " + L(m.pool);
  if (m.stage === "sf") return "Semifinal";
  if (m.stage === "bronze") return "Third place";
  return "Final";
}

function tabGroups(t, v) {
  var h = "";
  v.tables.forEach(function (rows, pi) {
    var pg = v.pool.filter(function (m) { return m.pool === pi; });
    var played = pg.filter(function (m) { return m.status === "done"; }).length;
    h += '<div class="bar"><h2>' + (v.tables.length > 1 ? 'Group ' + L(pi) : 'Standings') + '</h2><div class="meta">' + played + ' of ' + pg.length + ' played</div></div>';
    h += '<div class="sthead"><div>#</div><div>Team</div><div class="r">W</div><div class="r">L</div><div class="r">Diff</div></div>';
    rows.forEach(function (r) {
      h += '<div class="strow' + (advances(t, v, pi, r.pos) ? " adv" : "") + '"><div class="p">' + r.pos + '</div><div class="t">' + esc(r.team) + '</div>' +
        '<div class="w">' + r.w + '</div><div class="l">' + r.l + '</div><div class="d">' + r.diff + '</div></div>';
    });
    h += '<div class="lbl">' + (v.tables.length > 1 ? 'Group ' + L(pi) + ' matches' : 'Matches') + '</div>';
    pg.forEach(function (m) { h += matchRow(m, "mrow"); });
    h += '<div class="pad"></div>';
  });
  return h;
}
function advances(t, v, poolIndex, pos) {
  if (!t.knockout) return pos === 1;
  var n = v.tables.length;
  if (n === 1) return pos <= 4;
  if (n === 2) return pos <= 2;
  return pos === 1;
}

function tabBracket(t, v) {
  var ko = v.ko;
  if (!ko) return '<div class="bar"><h2>Knockout</h2></div><div class="empty">This tournament is pool play only — the winner is top of the table.</div>';
  var h = '<div class="bar"><h2>Knockout</h2><div class="meta">' + (ko.seeded ? "Seeded" : "Awaiting pool results") + '</div></div>';
  h += '<div class="lbl">Semifinals · ' + TModel.fmtLabel(t.koFormat) + '</div>';
  h += koCard(t, ko.sf[0]) + koCard(t, ko.sf[1]);
  h += '<div class="lbl rule">Third place · ' + TModel.fmtLabel(t.koFormat) + '</div>' + koCard(t, ko.bronze);
  if (ko.third) h += '<div class="award">Third place · ' + esc(ko.third) + '</div>';
  h += '<div class="lbl rule">Final · ' + TModel.fmtLabel(t.finalFormat) + '</div>';
  h += koCard(t, ko.final, "fin");
  if (ko.champ) h += '<div class="award gold">Champions · ' + esc(ko.champ) + '</div>';
  h += '<div class="empty small">' + knockoutBlurb({ knockout: true, poolCount: v.tables.length }) + '</div><div class="pad"></div>';
  return h;
}
function koCard(t, m, cls) {
  var tappable = m.ready && !t.locked;
  var tag = tappable ? 'button' : 'div', att = tappable ? ' data-act="score" data-val="' + m.id + '"' : '';
  var head = m.stageLabel + (m.multi ? ' · ' + TModel.fmtLabel(m.fmtKey) : '') + (tappable ? ' · tap to score' : '');
  var line = function (name, seed, val, win) {
    return '<div class="s' + (win ? ' w' : '') + '"><div><div class="seed">' + esc(seed) + '</div><div class="tm">' + esc(name) + '</div></div>' +
      (m.status === "upcoming" ? '<div></div>' : '<div class="num">' + val + '</div>') + '</div>';
  };
  var h = '<' + tag + ' class="sf ' + (cls || '') + '"' + att + '><div class="h">' + esc(head) + '</div>' +
    line(m.teamA, m.seedA, m.multi ? m.winsA : m.scoreA, m.winner === m.teamA) +
    line(m.teamB, m.seedB, m.multi ? m.winsB : m.scoreB, m.winner === m.teamB);
  if (m.multi && m.status !== "upcoming") {
    h += '<div class="glist">' + m.games.map(function (g, i) {
      return '<span>G' + (i + 1) + ' ' + (g.status === "upcoming" ? "–" : g.a + "–" + g.b) + '</span>';
    }).join('') + '</div>';
  }
  return h + '</' + tag + '>';
}

function tabTeams(t, v) {
  var single = TModel.isSingles(t.category);
  var h = '<div class="bar"><h2>' + (single ? 'Players' : 'Teams') + '</h2><div class="meta">' + (t.teams || []).length + ' · ' + t.poolCount + ' pool' + (t.poolCount > 1 ? 's' : '') + '</div></div>';
  v.tables.forEach(function (rows, pi) {
    if (v.tables.length > 1) h += '<div class="lbl" style="color:var(--green)">Group ' + L(pi) + '</div>';
    rows.forEach(function (r) {
      h += '<div class="team"><div><div class="n">' + esc(r.team) + '</div><div class="p">' + esc(players(r.players)) + '</div></div><div class="r">' + r.rec + '</div></div>';
    });
  });
  h += '<div class="pad"></div>';
  return h;
}

function tabRecap(t, v) {
  var h = '<div class="bar"><h2>Recap</h2><div class="meta">' + v.done.length + ' of ' + v.scheduled + ' matches</div></div>';
  if (!v.done.length) return h + '<div class="empty">Nothing to recap yet. As matches are scored, this page fills in with the podium, the numbers and the standings.</div>';
  var ko = v.ko, names = {};
  (t.teams || []).forEach(function (x) { names[x.name] = players(x.players); });
  var pts = 0;
  v.done.forEach(function (m) { pts += m.ptsA + m.ptsB; });
  var margins = v.done.map(function (m) { return { m: m, gap: Math.abs(m.ptsA - m.ptsB) }; });
  var close = margins.slice().sort(function (x, y) { return x.gap - y.gap; })[0];
  var wide = margins.slice().sort(function (x, y) { return y.gap - x.gap; })[0];
  var best = null, unbeaten = [];
  v.tables.forEach(function (rows) {
    rows.forEach(function (r) {
      if (!best || r.d > best.d) best = r;
      if (r.w && !r.l) unbeaten.push(r.team);
    });
  });

  if (ko && ko.champ) {
    h += '<div class="podium"><div class="top"><div class="lbl">★ Champions</div><div class="nm">' + esc(ko.champ) + '</div><div class="pl">' + esc(names[ko.champ] || "") + '</div></div>' +
      (ko.runner ? '<div class="row"><div><div class="p">Runner-up</div><div class="t">' + esc(ko.runner) + '</div></div><b>' + esc(names[ko.runner] || "") + '</b></div>' : '') +
      (ko.third ? '<div class="row"><div><div class="p">Third place</div><div class="t">' + esc(ko.third) + '</div></div><b>' + esc(names[ko.third] || "") + '</b></div>' : '') +
      '</div>';
  } else if (!t.knockout && v.tables[0] && v.tables[0].length) {
    var top = v.tables[0][0];
    h += '<div class="podium"><div class="top"><div class="lbl">Top of the table</div><div class="nm">' + esc(top.team) + '</div><div class="pl">' + esc(names[top.team] || "") + '</div></div></div>';
  }
  h += '<div class="kpi"><div><b>' + v.done.length + '</b><span>Matches played</span></div><div><b>' + pts + '</b><span>Points scored</span></div>' +
    '<div><b>' + (v.done.length ? (pts / v.done.length).toFixed(1) : "0") + '</b><span>Avg points per match</span></div>' +
    '<div><b>' + unbeaten.length + '</b><span>Unbeaten in pools</span></div></div>';
  h += '<div class="lbl rule" style="margin-top:4px">Highlights</div>';
  if (best) h += '<div class="hl"><b>Best pool</b><div>' + esc(best.team) + ' finished ' + best.rec + ' with a differential of ' + best.diff + '.</div></div>';
  if (close) h += '<div class="hl"><b>Closest</b><div>' + esc(close.m.teamA) + ' ' + close.m.ptsA + '–' + close.m.ptsB + ' ' + esc(close.m.teamB) + ' — decided by ' + close.gap + '.</div></div>';
  if (wide && close && wide.gap > close.gap) h += '<div class="hl"><b>Most decisive</b><div>' + esc(wide.m.teamA) + ' ' + wide.m.ptsA + '–' + wide.m.ptsB + ' ' + esc(wide.m.teamB) + '.</div></div>';
  if (unbeaten.length) h += '<div class="hl"><b>Unbeaten</b><div>' + unbeaten.map(esc).join(" · ") + ' came through the pools without a loss.</div></div>';
  v.tables.forEach(function (rows, pi) {
    h += '<div class="lbl rule">' + (v.tables.length > 1 ? 'Group ' + L(pi) : 'Final table') + '</div>' +
      '<div class="mini h"><div>#</div><div>Team</div><div class="r">W–L</div><div class="r">Diff</div></div>';
    rows.forEach(function (r) {
      h += '<div class="mini' + (advances(t, v, pi, r.pos) ? " adv" : "") + '"><div>' + r.pos + '</div><div class="t">' + esc(r.team) + '</div>' +
        '<div class="r">' + r.rec + '</div><div class="r">' + r.diff + '</div></div>';
    });
  });
  var kdone = ko ? ko.matches.filter(function (m) { return m.status === "done"; }) : [];
  if (kdone.length) {
    h += '<div class="lbl rule">Knockout</div>';
    kdone.forEach(function (m) {
      h += '<div class="ktile"><div class="h2">' + esc(m.stageLabel) + '</div>' +
        '<div class="l' + (m.winner === m.teamA ? " w" : "") + '"><span>' + esc(m.teamA) + '</span><b>' + (m.multi ? m.winsA : m.scoreA) + '</b></div>' +
        '<div class="l' + (m.winner === m.teamB ? " w" : "") + '"><span>' + esc(m.teamB) + '</span><b>' + (m.multi ? m.winsB : m.scoreB) + '</b></div></div>';
    });
  }
  h += '<div class="hl thanks"><div>Thank you to all ' + (t.teams || []).length + ' entries — ' + v.done.length + ' matches played, every line called honestly and every match finished with a handshake at the net.</div></div>';
  return h + '<div class="pad"></div>';
}

function tabInfo(t, v) {
  var single = TModel.isSingles(t.category);
  var counts = v.tables.map(function (r, i) { return r.length + ' in ' + L(i); });
  var h = '<div class="bar"><h2>Format &amp; rules</h2></div>';
  h += sec("This tournament", esc(t.name) + ' — ' + esc(t.category) + ', ' + esc(when(t)) + '. ' +
    (t.teams || []).length + ' ' + (single ? 'players' : 'teams') +
    (v.tables.length > 1 ? ' in ' + v.tables.length + ' pools (' + counts.join(', ') + ')' : ' in a single pool') +
    '. Everyone plays everyone in their pool: ' + v.pool.length + ' pool matches' + (t.knockout ? ' plus four knockout matches' : '') + '.');
  h += sec("Scoring", 'Pool games: ' + TModel.fmtLabel(t.poolFormat).toLowerCase() + '.' +
    (t.knockout ? ' Semifinals and third place: ' + TModel.fmtLabel(t.koFormat).toLowerCase() + '. Final: ' + TModel.fmtLabel(t.finalFormat).toLowerCase() + '.' : '') +
    ' Traditional side-out scoring — only the serving team scores. Call the score out loud before every serve.');
  h += sec("Advancing", knockoutBlurb({ knockout: t.knockout, poolCount: v.tables.length }) +
    ' Ties break on head-to-head, then point differential, then points scored.');
  h += sec("Serving", 'Underhand only — contact below the navel, paddle head below the wrist. Drop serves allowed. The serve must clear the kitchen and land in the diagonal court; the NVZ line is a fault. No lets. Two-bounce rule: the return and the third shot must both bounce before anyone volleys.');
  h += sec("Kitchen", 'No volleying in or touching the non-volley zone line. Momentum carrying you in after a volley is a fault, even after the ball is dead. Enter freely for a bounced ball — just exit before your next volley.');
  h += sec("Line calls", 'Players call their own lines; a ball touching the line is in. Any doubt goes to the opponent. If the teams disagree, the call of the side where the ball landed stands — no replay.');
  h += sec("Time-outs", 'One time-out per team per game, 90 seconds, between rallies only. Medical time-outs are the Tournament Director’s call and don’t count against you.');
  h += sec("Before you play", 'Paddle finger method decides serve, receive or side. Three-minute shared warm-up. More than five minutes late to your court is a forfeit.');
  h += sec("Conduct", 'Courtesy first, handshake at the net after every match. Unsportsmanlike behavior draws a technical foul worth a point to the other team; a second forfeits the game. Outdoor balls only, non-marking shoes.');
  h += sec("Safety — Florida heat", 'Drink water every round and wear sunscreen. Dizziness, nausea or confusion means stop playing and find the Tournament Director. Call “ball on court” to stop a rally when a stray ball comes through.', true);
  h += sec("Live results", 'Scores are stored on the tournament server the moment they are entered, so anyone with the site address sees them — the page refreshes itself every few seconds. Entering or editing a score needs the organizer passcode.');
  h += sec("Tournament Director", 'Protests go to the TD verbally, immediately after the incident. The TD has final say on scheduling, weather and every dispute. Anything not covered here follows USAPA rules.');
  return h + '<div class="pad"></div>';
}
function sec(title, body, accent) {
  return '<div class="sec"><h3' + (accent ? ' class="acc"' : '') + '>' + title + '</h3><p>' + body + '</p></div>';
}

// ---- overlays --------------------------------------------------------------
function sheet() {
  var t = tour(); if (!t || !S.editing) return "";
  var v = TModel.build(t), m = v.byId[S.editing];
  if (!m) return "";
  var f = TModel.fmt(m.fmtKey);
  var rows = S.draft.map(function (d, i) {
    var label = m.multi ? 'Game ' + (i + 1) : '';
    return (label ? '<div class="glabel">' + label + '</div>' : '') +
      pairRow(i, 'a', m.teamA, d.a) + pairRow(i, 'b', m.teamB, d.b);
  }).join('');
  return '<div class="back2" data-act="sheetclose" data-back="1"><div class="sheet">' +
    '<div class="h"><b>' + esc(m.stageLabel) + ' · ' + esc(TModel.fmtLabel(m.fmtKey)) + '</b><button data-act="sheetclose">CLOSE</button></div>' +
    rows +
    (anyExisting() ? '<button class="rm" data-act="clear">Remove this result</button>' : '') +
    '<div class="acts"><button class="lv" data-act="save" data-val="live">Save in progress</button>' +
    '<button class="fn" data-act="save" data-val="done">' + (m.multi ? 'Save games' : 'Final score') + '</button></div></div></div>';
}
function anyExisting() {
  return S.draft.some(function (d) { return d.played; });
}
function pairRow(i, side, name, val) {
  return '<div class="r"><div class="tm">' + esc(name) + '</div><div class="step">' +
    '<button class="minus" data-step2="' + i + ':' + side + ':-1">–</button>' +
    '<input class="v" type="number" inputmode="numeric" min="0" max="30" data-num="' + i + ':' + side + '" value="' + val + '" aria-label="Score for ' + esc(name) + '">' +
    '<button class="plus" data-step2="' + i + ':' + side + ':1">+</button></div></div>';
}

function gate() {
  if (!S.gate) return "";
  return '<div class="back2" data-act="gateclose" data-back="1"><div class="sheet gate">' +
    '<div class="h"><b>Organizer passcode</b><button data-act="gateclose">CLOSE</button></div>' +
    '<div class="msg">Enter the passcode to enter scores or manage tournaments.</div>' +
    '<div class="dots">' + [0, 1, 2, 3].map(function (i) {
      return '<i class="' + (S.bad ? "bad" : (S.pin.length > i ? "on" : "")) + '"></i>';
    }).join('') + '</div>' +
    '<div class="keys">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) {
      return '<button data-act="pin" data-val="' + n + '">' + n + '</button>';
    }).join('') +
    '<button class="wide" data-act="pin" data-val="del">Delete</button><button data-act="pin" data-val="0">0</button>' +
    '<button class="wide" data-act="gateclose">Cancel</button></div></div></div>';
}

function confirmBox() {
  if (!S.confirm) return "";
  var t = (S.db.tournaments || []).filter(function (x) { return x.id === S.confirm; })[0];
  if (!t) return "";
  return '<div class="back2" data-act="confirmclose" data-back="1"><div class="sheet">' +
    '<div class="h"><b>Delete tournament</b><button data-act="confirmclose">CLOSE</button></div>' +
    '<div class="msg">“' + esc(t.name) + '” and all its scores will be removed permanently. Archive instead if you might want it back.</div>' +
    '<div class="acts"><button class="lv" data-act="confirmclose">Keep it</button>' +
    '<button class="fn danger" data-act="purge" data-val="' + t.id + '">Delete forever</button></div></div></div>';
}

function render() {
  var h = "";
  if (S.screen === "home") h = viewHome();
  else if (S.screen === "new" || S.screen === "edit") h = S.form ? viewForm() : viewHome();
  else h = viewEvent();
  h += sheet() + gate() + confirmBox();
  if (S.toast) h += '<div class="toast"><span>' + esc(S.toast) + '</span></div>';
  document.getElementById("app").innerHTML = h;
}
