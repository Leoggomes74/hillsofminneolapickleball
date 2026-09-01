// All rendering. Reads S (app-state.js) and TModel (app-core.js).
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function L(i) { return TModel.POOL_LETTERS[i]; }
function when(t) {
  if (!t || !t.date) return "Date to be set";
  var d = new Date(t.date + "T" + (t.time || "00:00"));
  if (isNaN(d)) return t.date;
  var s = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return t.time ? s + " · " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : s;
}
function shortWhen(e) {
  if (!e || !e.date) return "TBD";
  var d = new Date(e.date + "T" + (e.time || "00:00"));
  if (isNaN(d)) return e.date;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + (e.time ? " · " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
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
  h += '<button class="cta ghost" data-act="opentypes">⚙ Manage event types</button>';
  if (!live.length) {
    h += '<div class="empty">No tournaments yet. Create one, add its event types, and every schedule, pool and bracket builds itself.</div>';
  }
  h += '<div class="tlist">';
  live.forEach(function (t) {
    var evs = evsOf(t), done = 0, sched = 0, entries = 0, anyLive = false;
    evs.forEach(function (e) {
      var v = TModel.build(e);
      done += v.done.length; sched += v.scheduled; entries += (e.teams || []).length;
      if (v.live.length) anyLive = true;
    });
    var status = t.locked ? "Locked" : (done === 0 ? "Not started" : (done >= sched ? "Complete" : "In progress"));
    var regOn = !t.locked && evs.some(function (e) {
      return e.regOpen !== false && (!e.maxTeams || (e.teams || []).length < e.maxTeams);
    });
    h += '<div class="tcard">' +
      '<button class="tmain" data-act="open" data-val="' + t.id + '">' +
        '<div class="trow"><div class="tname">' + esc(t.name) + '</div>' +
        (S.db.defaultId === t.id ? '<span class="pill">Default</span>' : '') +
        (anyLive ? '<span class="pill live">Live</span>' : '') + '</div>' +
        '<div class="tmeta">' + esc(when(t)) + '</div>' +
        '<div class="chips">' + (evs.length ? evs.map(function (e) {
          return '<span class="chip">' + esc(typeName(e.eventTypeId)) + '</span>';
        }).join('') : '<span class="chip">No events yet</span>') + '</div>' +
        '<div class="tmeta">' + evs.length + ' event' + (evs.length === 1 ? '' : 's') + ' · ' + entries + ' entries</div>' +
        '<div class="tfoot"><span class="tstat' + (status === "In progress" ? " on" : "") + '">' + status + '</span>' +
        '<span class="tprog">' + done + ' / ' + sched + ' matches</span></div>' +
      '</button>' +
      (regOn ? '<div class="regrow">' + evs.filter(function (x) {
        return x.regOpen !== false && (!x.maxTeams || (x.teams || []).length < x.maxTeams);
      }).map(function (x) {
        return '<button class="regcta" data-act="openreg" data-val="' + t.id + '|' + x.id + '">' +
          '<span>Register \u00b7 ' + esc(typeName(x.eventTypeId)) + '</span><i>' +
          (x.maxTeams ? (x.maxTeams - (x.teams || []).length) + ' left' : (x.teams || []).length + ' in') + ' \u2192</i></button>';
      }).join('') + '</div>' : '') +
      '<button class="tmenu" data-act="menu" data-val="' + t.id + '">⋯</button>' +
      (S.menu === t.id ? menu(t) : '') +
    '</div>';
  });
  if (archived.length) {
    h += '</div><div class="lbl rule">Archived</div><div class="tlist">';
    archived.forEach(function (t) {
      h += '<div class="tcard arch"><button class="tmain" data-act="open" data-val="' + t.id + '">' +
        '<div class="tname">' + esc(t.name) + '</div><div class="tmeta">' + esc(when(t)) + '</div></button>' +
        '<button class="tmenu" data-act="menu" data-val="' + t.id + '">⋯</button>' +
        (S.menu === t.id ? menu(t) : '') + '</div>';
    });
  }
  h += '</div><div class="pad"></div>';
  return h;
}

function menu(t) {
  var items = [];
  items.push(['edit', 'Edit setup & events']);
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

// ---- event type table ------------------------------------------------------
function viewTypes() {
  var h = masthead("Event types", "Master table · passcode protected", true);
  h += '<div class="fnote top">These are the event types you can add to any tournament. Rename or add your own — a type that is already used by a tournament cannot be deleted.</div>';
  types().forEach(function (x) {
    var d = S.typeDraft[x.id] || { name: x.name, singles: !!x.singles };
    var used = typeInUse(x.id);
    h += '<div class="ttrow">' +
      '<input type="text" data-tf="' + x.id + '" value="' + esc(d.name) + '" maxlength="40" aria-label="Event type name">' +
      '<div class="ttfoot">' +
        '<button class="tag' + (d.singles ? ' on' : '') + '" data-act="togsingles" data-val="' + x.id + '">' + (d.singles ? 'Singles' : 'Doubles') + '</button>' +
        '<span class="ttuse">' + (used ? 'In use' : 'Unused') + '</span>' +
        '<button class="tbtn" data-act="savetype" data-val="' + x.id + '">Save</button>' +
        '<button class="tbtn danger" data-act="deltype" data-val="' + x.id + '"' + (used ? ' disabled' : '') + '>Delete</button>' +
      '</div></div>';
  });
  h += '<div class="lbl rule">Add an event type</div>';
  h += '<div class="ttrow">' +
    '<input type="text" data-nt="1" value="' + esc(S.newType.name) + '" maxlength="40" placeholder="e.g. Mixed Doubles 3.5+">' +
    '<div class="ttfoot">' +
      '<button class="tag' + (S.newType.singles ? ' on' : '') + '" data-act="tognewsingles">' + (S.newType.singles ? 'Singles' : 'Doubles') + '</button>' +
      '<span class="ttuse">One player per entry?</span>' +
      '<button class="tbtn go" data-act="addtype">Add</button>' +
    '</div></div>';
  h += '<div class="pad"></div>';
  return h;
}

// ---- create / edit ---------------------------------------------------------
function selectEl(attr, field, value, opts) {
  return '<select ' + attr + '="' + field + '">' + opts.map(function (o) {
    var v = o[0], l = o[1];
    return '<option value="' + esc(v) + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + esc(l) + '</option>';
  }).join('') + '</select>';
}

function viewForm() {
  var f = S.form;
  var fmtOpts = TModel.FORMAT_KEYS.map(function (k) { return [k, TModel.FORMATS[k].label]; });
  var typeOpts = types().map(function (x) { return [x.id, x.name]; });
  var h = '<div class="hd"><button class="back" data-act="formcancel">‹</button><div class="hdmain"><h1>' +
    (f.mode === "new" ? "New tournament" : "Edit setup") + '</h1><div class="sub">Step ' + f.step + ' of 3 · ' +
    (f.step === 1 ? "Tournament" : f.step === 2 ? "Event types" : "Entries") + '</div></div></div>';

  if (f.step === 1) {
    h += '<div class="fnote top">Master data for the whole tournament. Each event type you add next carries its own date, pools, format and roster — and can be left empty for players to register themselves.</div>';
    h += '<div class="fsec"><label>Tournament name</label><input type="text" data-field="name" value="' + esc(f.name) + '" placeholder="e.g. Hills of Minneola Fall Classic"></div>';
    h += '<div class="fsec"><label>Tournament director</label><input type="text" data-field="director" value="' + esc(f.director) + '" placeholder="Who runs the event"></div>';
    h += '<div class="fsec"><label>Registration fee</label><input type="text" data-field="fee" value="' + esc(f.fee) + '" placeholder="e.g. $40 per team" maxlength="40">' +
      '<div class="fnote">Shown on the Info tab and to anyone registering. Leave blank if the event is free.</div></div>';
    h += '<div class="fsec two"><div><label>Start date</label><input type="date" data-field="date" value="' + esc(f.date) + '"></div>' +
      '<div><label>Start time</label><input type="time" data-field="time" value="' + esc(f.time) + '"></div></div>';
    if (f.error) h += '<div class="ferr">' + esc(f.error) + '</div>';
    h += '<div class="facts"><button class="fbtn ghost" data-act="formcancel">Cancel</button><button class="fbtn" data-act="step" data-val="2">Next: event types →</button></div>';
  } else if (f.step === 2) {
    h += '<div class="fnote top">One or more event types per tournament. Every event has its own start, pools, scoring formats and entry list.</div>';
    f.events.forEach(function (e, i) {
      var single = typeSingles(e.eventTypeId);
      h += '<div class="evcard"><div class="evhead"><b>Event ' + (i + 1) + '</b>' +
        (f.events.length > 1 ? '<button class="evdel" data-act="delev" data-val="' + i + '">Remove</button>' : '') + '</div>';
      h += '<div class="fsec"><label>Event type</label>' + selectEl("data-ef", i + ":eventTypeId", e.eventTypeId, typeOpts) + '</div>';
      h += '<div class="fsec two"><div><label>Date</label><input type="date" data-ef="' + i + ':date" value="' + esc(e.date) + '"></div>' +
        '<div><label>Start time</label><input type="time" data-ef="' + i + ':time" value="' + esc(e.time) + '"></div></div>';
      h += '<div class="fsec two"><div><label>' + (single ? 'Players' : 'Teams') + ' now</label><input type="number" min="0" max="32" data-ef="' + i + ':teamCount" value="' + e.teamCount + '"></div>' +
        '<div><label>Pools</label><input type="number" min="1" max="8" data-ef="' + i + ':poolCount" value="' + e.poolCount + '"></div></div>';
      h += '<div class="fsec check"><label><input type="checkbox" data-ef="' + i + ':regOpen"' + (e.regOpen ? ' checked' : '') + '> Let people register themselves</label>' +
        '<div class="fnote">' + (e.regOpen
          ? 'Anyone can add their team on the Teams page — no passcode. Entries drop into the emptiest pool and you can edit or remove them here afterwards.'
          : 'Closed — only you can add entries, on the next step.') + '</div></div>';
      if (e.regOpen) {
        h += '<div class="fsec"><label>Maximum entries (0 = no limit)</label><input type="number" min="0" max="32" data-ef="' + i + ':maxTeams" value="' + (e.maxTeams || 0) + '"></div>';
      }
      h += '<div class="fnote">' + (e.teamCount ? e.teamCount + ' ' + (single ? 'players' : 'teams') : 'No entries yet') + ' in ' + e.poolCount + ' pool' + (e.poolCount > 1 ? 's' : '') +
        (e.teamCount ? ' — round robin inside each pool, ' + roundRobinCount(e) + ' matches.' : ' — the schedule builds itself as people register.') + '</div>';
      h += '<div class="fsec"><label>Pool game format</label>' + selectEl("data-ef", i + ":poolFormat", e.poolFormat, fmtOpts) + '</div>';
      h += '<div class="fsec check"><label><input type="checkbox" data-ef="' + i + ':knockout"' + (e.knockout ? ' checked' : '') + '> Play a knockout stage</label>' +
        '<div class="fnote">' + knockoutBlurb(e) + '</div></div>';
      if (e.knockout) {
        h += '<div class="fsec"><label>Semifinals &amp; third place format</label>' + selectEl("data-ef", i + ":koFormat", e.koFormat, fmtOpts) + '</div>';
        h += '<div class="fsec last"><label>Final format</label>' + selectEl("data-ef", i + ":finalFormat", e.finalFormat, fmtOpts) + '</div>';
      }
      h += '</div>';
    });
    h += '<button class="fbtn ghost wide" data-act="addev">+ Add another event type</button>';
    if (f.events.every(function (e) { return e.regOpen; })) {
      h += '<div class="fnote">Every event above is open for self-registration, so you can finish here and let players enter themselves.</div>';
      h += '<button class="fbtn wide" data-act="formsubmit">' + (f.mode === "new" ? "Create — players register themselves" : "Save — players register themselves") + '</button>';
    }
    if (f.error) h += '<div class="ferr">' + esc(f.error) + '</div>';
    h += '<div class="facts"><button class="fbtn ghost" data-act="step" data-val="1">‹ Back</button>' +
      '<button class="fbtn ghost" data-act="step" data-val="3">Add entries now →</button></div>';
  } else {
    h += '<div class="fnote top">Optional — leave an event empty and players will register themselves. Tap a pool letter to move an entry.</div>';
    f.events.forEach(function (e, ei) {
      var single = typeSingles(e.eventTypeId);
      var poolOpts = [];
      for (var p = 0; p < e.poolCount; p++) poolOpts.push(p);
      h += '<div class="bar"><h2>' + esc(typeName(e.eventTypeId)) + '</h2><div class="meta">' + e.teams.length + (single ? ' players' : ' teams') +
        (e.regOpen ? '<br>Registration open' : '') + '</div></div>';
      if (!e.teams.length) h += '<div class="empty small">No entries yet' + (e.regOpen ? ' — people can register themselves, or add them here.' : '. Add them below.') + '</div>';
      e.teams.forEach(function (t, i) {
        h += '<div class="trow2"><div class="tnum">' + (i + 1) + (t.registered ? '<b class="regdot" title="Self-registered">●</b>' : '') + '</div>' +
          '<div class="tfields">' +
            '<input type="text" data-team="' + ei + ':' + i + ':name" value="' + esc(t.name) + '" placeholder="' + (single ? 'Entry name' : 'Team name') + '">' +
            '<div class="pgrid' + (single ? ' one' : '') + '">' +
              '<input type="text" data-team="' + ei + ':' + i + ':p:0" value="' + esc(t.players[0]) + '" placeholder="' + (single ? 'Player' : 'Player 1') + '">' +
              (single ? '' : '<input type="text" data-team="' + ei + ':' + i + ':p:1" value="' + esc(t.players[1]) + '" placeholder="Player 2">') +
            '</div>' +
            '<div class="rowfoot">' +
              (e.poolCount > 1 ? '<div class="pools">' + poolOpts.map(function (p) {
                return '<button class="pbtn' + (t.pool === p ? ' on' : '') + '" data-act="pool" data-val="' + ei + ':' + i + ':' + p + '">' + L(p) + '</button>';
              }).join('') + '</div>' : '<div></div>') +
              '<button class="rowdel" data-act="delrow" data-val="' + ei + ':' + i + '">Remove</button>' +
            '</div>' +
          '</div></div>';
      });
      h += '<button class="fbtn ghost wide" data-act="addrow" data-val="' + ei + '">+ Add ' + (single ? 'a player' : 'a team') + '</button>';
      if (e.poolCount > 1 && e.teams.length) h += '<button class="fbtn ghost wide" data-act="autopool" data-val="' + ei + '">Redistribute pools evenly</button>';
    });
    if (f.error) h += '<div class="ferr">' + esc(f.error) + '</div>';
    h += '<div class="facts"><button class="fbtn ghost" data-act="step" data-val="2">‹ Back</button>' +
      '<button class="fbtn" data-act="formsubmit">' + (f.mode === "new" ? "Create tournament" : "Save changes") + '</button></div>';
  }
  h += '<div class="pad"></div>';
  return h;
}

function roundRobinCount(e) {
  var pools = TModel.assignPools(e.teamCount, e.poolCount), counts = {};
  pools.forEach(function (p) { counts[p] = (counts[p] || 0) + 1; });
  var n = 0;
  Object.keys(counts).forEach(function (k) { var c = counts[k]; n += c * (c - 1) / 2; });
  return n + (e.knockout ? 4 : 0);
}
function knockoutBlurb(e) {
  if (!e.knockout) return "Pool play only — the winner is top of the table.";
  var n = parseInt(e.poolCount, 10) || 1;
  if (n === 1) return "Top four go to the semifinals: 1st v 4th, 2nd v 3rd. Then third place and the final.";
  if (n === 2) return "Semifinals cross over: A1 v B2, B1 v A2. Then third place and the final.";
  return "Pool winners qualify, filled to four by the best runners-up on point differential. Then third place and the final.";
}

// ---- tournament: shared bits ----------------------------------------------
function matchRow(m, cls) {
  var open = m.ready && !tour().locked;
  var tag = open ? 'button' : 'div';
  var att = open ? ' data-act="score" data-val="' + m.id + '"' : '';
  return '<' + tag + ' class="' + cls + '"' + att + '><div class="n">#' + m.no + '</div>' +
    '<div class="t">' + esc(m.teamA) + '<br>' + esc(m.teamB) + '</div>' +
    '<div class="s' + (m.status === "live" ? " on" : "") + '">' + m.scoreLine + '</div></' + tag + '>';
}

// ---- tournament screens ---------------------------------------------------
function viewEvent() {
  var t = tour();
  if (!t) return viewHome();
  var evs = evsOf(t), e = ev();
  if (!e) {
    return masthead(esc(t.name), "No events yet", true) +
      '<div class="empty">This tournament has no event types yet. Use ⋯ → Edit setup &amp; events to add one.</div>';
  }
  var v = TModel.build(e), h = "";
  var single = typeSingles(e.eventTypeId);
  var sub = esc(typeName(e.eventTypeId)) + ' · ' + (e.teams || []).length + (single ? ' players' : ' teams') + (t.locked ? ' · Locked' : '');
  h += '<div class="hd"><button class="back" data-act="home">‹</button><div class="hdmain"><h1>' + esc(t.name) + '</h1><div class="sub">' + sub + '</div></div>' +
    '<div class="tools">' + (v.live.length ? '<div class="livechip"><i></i><span>LIVE</span></div>' : '') + syncChip() + '</div></div>';

  if (evs.length > 1) {
    h += '<div class="evbar">' + evs.map(function (x) {
      return '<button class="evchip' + (x.id === e.id ? ' on' : '') + '" data-act="pickev" data-val="' + x.id + '">' +
        esc(typeName(x.eventTypeId)) + '<i>' + esc(shortWhen(x)) + '</i></button>';
    }).join('') + '</div>';
  } else {
    h += '<div class="snap">' + esc(typeName(e.eventTypeId)) + ' · ' + esc(when(e)) + '</div>';
  }

  if (S.tab === "now") h += tabNow(t, e, v);
  if (S.tab === "sched") h += tabSched(t, e, v);
  if (S.tab === "groups") h += tabGroups(t, e, v);
  if (S.tab === "bracket") h += tabBracket(t, e, v);
  if (S.tab === "teams") h += tabTeams(t, e, v);
  if (S.tab === "recap") h += tabRecap(t, e, v);
  if (S.tab === "notes") h += tabNotes(t, e, v);
  if (S.tab === "info") h += tabInfo(t, e, v);

  var tabs = [["now", "Now"], ["sched", "Order"], ["groups", "Groups"], ["bracket", "Bracket"], ["teams", "Teams"], ["recap", "Recap"], ["notes", "Say"], ["info", "Info"]];
  if (!e.knockout) tabs.splice(3, 1);
  h += '<div class="nav"><div style="grid-template-columns:repeat(' + tabs.length + ',1fr)">' +
    tabs.map(function (x) {
      return '<button class="' + (S.tab === x[0] ? "on" : "") + '" data-act="tab" data-val="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '</div></div>';
  return h;
}

function tabNow(t, e, v) {
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

// ---- printable blank score sheets ------------------------------------------
function viewPrint() {
  var t = tour();
  if (!t) return viewHome();
  var list = TModel.master(t);
  var h = '<div class="hd noprint"><button class="back" data-act="backsched">‹</button>' +
    '<div class="hdmain"><h1>Score sheets</h1><div class="sub">Blank · for the scorer’s table</div></div></div>';
  h += '<div class="fnote top noprint">One line per match, in court order, with empty boxes to write the score. Print it, keep it at the table, then type the results in afterwards.</div>';
  h += '<div class="facts noprint"><button class="fbtn ghost" data-act="backsched">Back</button><button class="fbtn" data-act="doprint">Print</button></div>';

  h += '<div class="psheet"><div class="phead"><div><div class="pt">' + esc(t.name) + '</div>' +
    '<div class="ps">' + esc(when(t)) + (t.director ? ' · TD: ' + esc(t.director) : '') + '</div></div>' +
    '<div class="ps r">' + list.length + ' matches<br>Sheet of ____</div></div>';

  if (!list.length) {
    h += '<div class="empty">No matches scheduled yet.</div></div><div class="pad"></div>';
    return h;
  }

  list.forEach(function (r, i) {
    var m = r.m, games = TModel.fmt(m.fmtKey).games;
    var boxes = '';
    for (var g = 0; g < games; g++) boxes += '<i></i>';
    h += '<div class="prow"><div class="pno">' + (i + 1) + '</div>' +
      '<div class="pmid">' +
        '<div class="pev">' + esc(typeName(r.ev.eventTypeId)) + ' · ' + esc(m.stageLabel) + '</div>' +
        '<div class="pteam"><span>' + esc(m.ready ? m.teamA : (m.seedA || m.teamA)) + '</span><div class="pbx">' + boxes + '</div></div>' +
        '<div class="pteam"><span>' + esc(m.ready ? m.teamB : (m.seedB || m.teamB)) + '</span><div class="pbx">' + boxes + '</div></div>' +
      '</div>' +
      '<div class="pmeta"><b>' + esc(TModel.fmtLabel(m.fmtKey)) + '</b><span>Court ____</span><span>Time ____</span><span>Initials ____</span></div>' +
    '</div>';
  });
  h += '<div class="pfoot">Winner circles their own score. Both teams initial the line before leaving the court.</div>';
  h += '</div><div class="pad noprint"></div>';
  return h;
}

// ---- court order (all events, one sequence) --------------------------------
function tabSched(t, cur, v) {
  var list = TModel.master(t), evs = evsOf(t);
  var played = list.filter(function (r) { return r.m.status === "done"; }).length;
  var h = '<div class="bar"><h2>Court order</h2><div class="meta">' + played + ' of ' + list.length + ' played</div></div>';
  h += '<div class="fnote top">Every event shares the same courts, so this is the single running order for the whole tournament. Move a match up or down to change the sequence — organizer passcode required.</div>';
  h += '<button class="fbtn ghost wide" data-act="autosort">Rebuild automatic order</button>';
  h += '<button class="fbtn ghost wide" data-act="openprint">⎙ Printable score sheets</button>';
  if (!list.length) return h + '<div class="empty">No matches scheduled yet.</div><div class="pad"></div>';
  h += '<div class="lbl rule">Running order</div>';
  list.forEach(function (r, i) {
    var m = r.m, tappable = m.ready && !t.locked;
    var cls = "srow" + (m.status === "done" ? " done" : "") + (m.status === "live" ? " onair" : "");
    h += '<div class="' + cls + '"><div class="sno">' + (i + 1) + '</div>' +
      '<' + (tappable ? 'button' : 'div') + ' class="sbody"' + (tappable ? ' data-act="schedscore" data-val="' + r.key + '"' : '') + '>' +
        '<div class="stop"><span class="chip ev">' + esc(typeName(r.ev.eventTypeId)) + '</span>' +
        '<span class="sstage">' + esc(m.stageLabel) + '</span></div>' +
        '<div class="steams">' + esc(m.teamA) + ' <i>v</i> ' + esc(m.teamB) + '</div>' +
        '<div class="sscore' + (m.status === "live" ? ' on' : '') + '">' + (m.status === "upcoming" ? esc(shortWhen(r.ev)) : m.scoreLine + (m.status === "live" ? ' · live' : '')) + '</div>' +
      '</' + (tappable ? 'button' : 'div') + '>' +
      '<div class="smove">' +
        '<button class="mvb" data-act="mvup" data-val="' + i + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move up">▲</button>' +
        '<button class="mvb" data-act="mvdn" data-val="' + i + '"' + (i === list.length - 1 ? ' disabled' : '') + ' aria-label="Move down">▼</button>' +
      '</div></div>';
  });
  if (evs.length > 1) {
    h += '<div class="empty small">Automatic order alternates between the ' + evs.length + ' events round by round, then runs the semifinals, third-place matches and finals.</div>';
  }
  return h + '<div class="pad"></div>';
}

function tabGroups(t, e, v) {  var h = '<div class="gwrap">';
  v.tables.forEach(function (rows, pi) {
    var pg = v.pool.filter(function (m) { return m.pool === pi; });
    var played = pg.filter(function (m) { return m.status === "done"; }).length;
    h += '<div class="gblock">';
    h += '<div class="bar"><h2>' + (v.tables.length > 1 ? 'Group ' + L(pi) : 'Standings') + '</h2><div class="meta">' + played + ' of ' + pg.length + ' played</div></div>';
    h += '<div class="sthead"><div>#</div><div>Team</div><div class="r">W</div><div class="r">L</div><div class="r">Diff</div></div>';
    rows.forEach(function (r) {
      h += '<div class="strow' + (advances(e, v, pi, r.pos) ? " adv" : "") + '"><div class="p">' + r.pos + '</div><div class="t">' + esc(r.team) + '</div>' +
        '<div class="w">' + r.w + '</div><div class="l">' + r.l + '</div><div class="d">' + r.diff + '</div></div>';
    });
    h += '<div class="lbl">' + (v.tables.length > 1 ? 'Group ' + L(pi) + ' matches' : 'Matches') + '</div>';
    pg.forEach(function (m) { h += matchRow(m, "mrow"); });
    h += '</div>';
  });
  return h + '</div><div class="pad"></div>';
}
function advances(e, v, poolIndex, pos) {
  if (!e.knockout) return pos === 1;
  var n = v.tables.length;
  if (n === 1) return pos <= 4;
  if (n === 2) return pos <= 2;
  return pos === 1;
}

function tabBracket(t, e, v) {
  var ko = v.ko;
  if (!ko) return '<div class="bar"><h2>Knockout</h2></div><div class="empty">This event is pool play only — the winner is top of the table.</div>';
  var h = '<div class="bar"><h2>Knockout</h2><div class="meta">' + (ko.seeded ? "Seeded" : "Awaiting pool results") + '</div></div>';
  h += '<div class="lbl">Semifinals · ' + TModel.fmtLabel(e.koFormat) + '</div>';
  h += '<div class="kowrap">' + koCard(t, ko.sf[0]) + koCard(t, ko.sf[1]) + '</div>';
  h += '<div class="lbl rule">Third place · ' + TModel.fmtLabel(e.koFormat) + '</div>' + koCard(t, ko.bronze);
  if (ko.third) h += '<div class="award">Third place · ' + esc(ko.third) + '</div>';
  h += '<div class="lbl rule">Final · ' + TModel.fmtLabel(e.finalFormat) + '</div>';
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

function tabTeams(t, e, v) {
  var single = typeSingles(e.eventTypeId);
  var n = (e.teams || []).length, cap = e.maxTeams || 0;
  var open = e.regOpen !== false && !t.locked && (!cap || n < cap);
  var h = '<div class="bar"><h2>' + (single ? 'Players' : 'Teams') + '</h2><div class="meta">' + n + (cap ? ' of ' + cap : '') + ' · ' + e.poolCount + ' pool' + (e.poolCount > 1 ? 's' : '') + '</div></div>';

  if (open) {
    h += '<div class="regbox"><div class="regh">Register for ' + esc(typeName(e.eventTypeId)) + '</div>' +
      '<div class="regsub">' + esc(when(e)) + ' · no passcode needed' + (cap ? ' · ' + (cap - n) + ' place' + (cap - n === 1 ? '' : 's') + ' left' : '') + '</div>' +
      (t.fee ? '<div class="regfee">Entry fee · <b>' + esc(t.fee) + '</b></div>' : '') +
      '<div class="fsec"><label>' + (single ? 'Entry name' : 'Team name') + '</label><input type="text" data-reg="team" value="' + esc(S.reg.team) + '" placeholder="' + (single ? 'How should we list you?' : 'What is your team called?') + '" maxlength="40"></div>' +
      '<div class="fsec"><label>Your name</label><input type="text" data-reg="p1" value="' + esc(S.reg.p1) + '" placeholder="First and last name" maxlength="40"></div>' +
      (single ? '' : '<div class="fsec"><label>Partner name</label><input type="text" data-reg="p2" value="' + esc(S.reg.p2) + '" placeholder="First and last name" maxlength="40"></div>') +
      '<button class="fbtn wide"' + (S.regBusy ? ' disabled' : '') + ' data-act="register">' + (S.regBusy ? 'Registering\u2026' : 'Register') + '</button>' +
      '<div class="fnote">You go straight into the draw and the emptiest pool.' + (t.fee ? ' The ' + esc(t.fee) + ' entry fee is payable to the Tournament Organization.' : '') + ' Organizers can correct any detail afterwards.</div></div>';
  } else if (e.regOpen !== false && cap && n >= cap) {
    h += '<div class="empty">This event is full — ' + cap + ' entries. Talk to the tournament director about a waiting list.</div>';
  }

  if (!n) {
    h += '<div class="empty">Nobody has entered yet.</div><div class="pad"></div>';
    return h;
  }
  var idxOf = {};
  (e.teams || []).forEach(function (x, i) { idxOf[x.name] = i; });
  v.tables.forEach(function (rows, pi) {
    if (v.tables.length > 1) h += '<div class="lbl" style="color:var(--green)">Group ' + L(pi) + '</div>';
    rows.forEach(function (r) {
      h += '<div class="team"><div><div class="n">' + esc(r.team) + '</div><div class="p">' + esc(players(r.players)) + '</div></div>' +
        '<div class="r">' + r.rec + '</div>' +
        (t.locked ? '' : '<button class="tedit" data-act="editteam" data-val="' + idxOf[r.team] + '">Edit</button>') + '</div>';
    });
  });
  h += '<div class="empty small">Organizers: tap <b>Edit</b> on any entry to correct names, move it to another pool or remove it — passcode required.</div>';
  h += '<div class="pad"></div>';
  return h;
}

function tabRecap(t, e, v) {
  var h = '<div class="bar"><h2>Recap</h2><div class="meta">' + v.done.length + ' of ' + v.scheduled + ' matches</div></div>';
  if (!v.done.length) return h + '<div class="empty">Nothing to recap yet. As matches are scored, this page fills in with the podium, the numbers and the standings.</div>';
  var ko = v.ko, names = {};
  (e.teams || []).forEach(function (x) { names[x.name] = players(x.players); });
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
    h += '<div class="podium"><div class="top"><div class="lbl">★ Champions · ' + esc(typeName(e.eventTypeId)) + '</div><div class="nm">' + esc(ko.champ) + '</div><div class="pl">' + esc(names[ko.champ] || "") + '</div></div>' +
      (ko.runner ? '<div class="row"><div><div class="p">Runner-up</div><div class="t">' + esc(ko.runner) + '</div></div><b>' + esc(names[ko.runner] || "") + '</b></div>' : '') +
      (ko.third ? '<div class="row"><div><div class="p">Third place</div><div class="t">' + esc(ko.third) + '</div></div><b>' + esc(names[ko.third] || "") + '</b></div>' : '') +
      '</div>';
  } else if (!e.knockout && v.tables[0] && v.tables[0].length) {
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
      h += '<div class="mini' + (advances(e, v, pi, r.pos) ? " adv" : "") + '"><div>' + r.pos + '</div><div class="t">' + esc(r.team) + '</div>' +
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
  h += '<div class="hl thanks"><div>Thank you to all ' + (e.teams || []).length + ' entries in the ' + esc(typeName(e.eventTypeId)) + ' — ' + v.done.length + ' matches played, every line called honestly and every match finished with a handshake at the net.</div></div>';
  return h + '<div class="pad"></div>';
}

function noteWhen(ms) {
  var d = new Date(ms);
  if (isNaN(d)) return "";
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " · " +
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function tabNotes(t, e, v) {
  var notes = (t.notes || []).slice().sort(function (x, y) { return y.at - x.at; });
  var h = '<div class="bar"><h2>Say something</h2><div class="meta">' + notes.length + (notes.length === 1 ? ' comment' : ' comments') + '</div></div>';
  h += '<div class="fnote top">Suggestions, thanks, gripes about the heat — anything you want the organizers to read. No passcode needed.</div>';
  h += '<div class="fsec"><label>Your name</label><input type="text" data-note="who" value="' + esc(S.note.who) + '" placeholder="Who is this?" maxlength="40"></div>';
  h += '<div class="fsec"><label>Comment or suggestion</label><textarea data-note="text" rows="4" placeholder="What would you tell the organizers?" maxlength="600">' + esc(S.note.text) + '</textarea></div>';
  h += '<button class="fbtn wide"' + (S.noteBusy ? ' disabled' : '') + ' data-act="postnote">' + (S.noteBusy ? 'Posting…' : 'Post comment') + '</button>';
  if (!notes.length) {
    h += '<div class="empty">No comments yet — be the first.</div>';
  } else {
    h += '<div class="lbl rule">What people are saying</div>';
    notes.forEach(function (n) {
      h += '<div class="cmt"><div class="chead"><span class="cwho">' + esc(n.who) + '</span><span class="cat">' + esc(noteWhen(n.at)) + '</span></div>' +
        '<p>' + esc(n.text) + '</p>' +
        (S.unlocked ? '<button class="cdel" data-act="delnote" data-val="' + n.id + '">Remove</button>' : '') + '</div>';
    });
  }
  return h + '<div class="pad"></div>';
}

function tabInfo(t, e, v) {
  var single = typeSingles(e.eventTypeId);
  var counts = v.tables.map(function (r, i) { return r.length + ' in ' + L(i); });
  var evs = evsOf(t);
  var h = '<div class="bar"><h2>Format &amp; rules</h2></div>';
  h += sec("This tournament", esc(t.name) + ' — ' + esc(when(t)) + '. ' + evs.length + ' event' + (evs.length === 1 ? '' : 's') + ' on the programme.' +
    (t.director ? ' Tournament director: <b>' + esc(t.director) + '</b>.' : ''));
  h += sec("Registration fee", t.fee
    ? '<b>' + esc(t.fee) + '</b>, payable to the Tournament Organization.'
    : 'No entry fee for this tournament.');
  h += '<div class="lbl rule">Events</div>';
  evs.forEach(function (x) {
    var xv = TModel.build(x);
    h += '<div class="erow' + (x.id === e.id ? ' on' : '') + '"><div><div class="en">' + esc(typeName(x.eventTypeId)) + '</div>' +
      '<div class="ed">' + esc(when(x)) + '</div>' +
      '<div class="ed">' + (x.teams || []).length + (typeSingles(x.eventTypeId) ? ' players' : ' teams') + ' · ' + x.poolCount + ' pool' + (x.poolCount > 1 ? 's' : '') +
      ' · ' + (x.knockout ? 'knockout' : 'pool play only') +
      (x.regOpen !== false && !t.locked ? ' · <b style="color:var(--green)">entries open</b>' : '') + '</div></div>' +
      '<div class="ep">' + xv.done.length + '/' + xv.scheduled + '</div></div>';
  });
  h += sec("This event", esc(typeName(e.eventTypeId)) + ' — ' + esc(when(e)) + '. ' +
    (e.teams || []).length + ' ' + (single ? 'players' : 'teams') +
    (v.tables.length > 1 ? ' in ' + v.tables.length + ' pools (' + counts.join(', ') + ')' : ' in a single pool') +
    '. Everyone plays everyone in their pool: ' + v.pool.length + ' pool matches' + (e.knockout ? ' plus four knockout matches' : '') + '.');
  h += '<div class="secwrap">';
  h += sec("Scoring", 'Pool games: ' + TModel.fmtLabel(e.poolFormat).toLowerCase() + '.' +
    (e.knockout ? ' Semifinals and third place: ' + TModel.fmtLabel(e.koFormat).toLowerCase() + '. Final: ' + TModel.fmtLabel(e.finalFormat).toLowerCase() + '.' : '') +
    ' Traditional side-out scoring — only the serving team scores. Call the score out loud before every serve.');
  h += sec("Advancing", knockoutBlurb({ knockout: e.knockout, poolCount: v.tables.length }) +
    ' Ties break on head-to-head, then point differential, then points scored.');
  h += sec("Serving", 'Underhand only — contact below the navel, paddle head below the wrist. Drop serves allowed. The serve must clear the kitchen and land in the diagonal court; the NVZ line is a fault. No lets. Two-bounce rule: the return and the third shot must both bounce before anyone volleys.');
  h += sec("Kitchen", 'No volleying in or touching the non-volley zone line. Momentum carrying you in after a volley is a fault, even after the ball is dead. Enter freely for a bounced ball — just exit before your next volley.');
  h += sec("Line calls", 'Players call their own lines; a ball touching the line is in. Any doubt goes to the opponent. If the teams disagree, the call of the side where the ball landed stands — no replay.');
  h += sec("Time-outs", 'One time-out per team per game, 90 seconds, between rallies only. Medical time-outs are the Tournament Director’s call and don’t count against you.');
  h += sec("Before you play", 'Paddle finger method decides serve, receive or side. Three-minute shared warm-up. More than five minutes late to your court is a forfeit.');
  h += sec("Conduct", 'Courtesy first, handshake at the net after every match. Unsportsmanlike behavior draws a technical foul worth a point to the other team; a second forfeits the game. Outdoor balls only, non-marking shoes.');
  h += sec("Safety — Florida heat", 'Drink water every round and wear sunscreen. Dizziness, nausea or confusion means stop playing and find the Tournament Director. Call “ball on court” to stop a rally when a stray ball comes through.', true);
  h += sec("Who can change what", 'Anyone can read every event and leave a comment on the Say page. Entering scores, creating or editing tournaments, adding event types and moderating comments all need the organizer passcode.');
  h += sec("Tournament Director", (t.director ? '<b>' + esc(t.director) + '</b> is directing this tournament. ' : '') + 'Protests go to the TD verbally, immediately after the incident. The TD has final say on scheduling, weather and every dispute. Anything not covered here follows USAPA rules.');
  h += '</div>';
  return h + '<div class="pad"></div>';
}
function sec(title, body, accent) {
  return '<div class="sec"><h3' + (accent ? ' class="acc"' : '') + '>' + title + '</h3><p>' + body + '</p></div>';
}

// ---- overlays --------------------------------------------------------------
function sheet() {
  var t = tour(), e = ev(); if (!t || !e || !S.editing) return "";
  var v = TModel.build(e), m = v.byId[S.editing];
  if (!m) return "";
  var rows = S.draft.map(function (d, i) {
    var label = m.multi ? 'Game ' + (i + 1) : '';
    return (label ? '<div class="glabel">' + label + '</div>' : '') +
      pairRow(i, 'a', m.teamA, d.a) + pairRow(i, 'b', m.teamB, d.b);
  }).join('');
  return '<div class="back2" data-act="sheetclose" data-back="1"><div class="sheet">' +
    '<div class="h"><b>' + esc(typeName(e.eventTypeId)) + ' · ' + esc(m.stageLabel) + '</b><button data-act="sheetclose">CLOSE</button></div>' +
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

function teamSheet() {
  var t = tour(), e = ev(), d = S.teamEdit;
  if (!t || !e || !d) return "";
  var single = typeSingles(e.eventTypeId), pc = Math.max(1, e.poolCount || 1);
  var pools = '';
  if (pc > 1) {
    var i, btns = '';
    for (i = 0; i < pc; i++) btns += '<button class="pbtn' + (d.pool === i ? ' on' : '') + '" data-act="teampool" data-val="' + i + '">' + L(i) + '</button>';
    pools = '<div class="fsec"><label>Pool</label><div class="pools">' + btns + '</div>' +
      '<div class="fnote">Moving an entry renumbers that pool’s round robin, so scores already entered in the old and new pools are cleared.</div></div>';
  }
  return '<div class="back2" data-act="teamclose" data-back="1"><div class="sheet">' +
    '<div class="h"><b>Edit entry · ' + esc(typeName(e.eventTypeId)) + '</b><button data-act="teamclose">CLOSE</button></div>' +
    '<div class="fsec"><label>' + (single ? 'Entry name' : 'Team name') + '</label><input type="text" data-tform="name" value="' + esc(d.name) + '" maxlength="40"></div>' +
    '<div class="fsec"><label>' + (single ? 'Player' : 'Player 1') + '</label><input type="text" data-tform="p1" value="' + esc(d.p1) + '" maxlength="40"></div>' +
    (single ? '' : '<div class="fsec"><label>Player 2</label><input type="text" data-tform="p2" value="' + esc(d.p2) + '" maxlength="40"></div>') +
    pools +
    (d.confirm
      ? '<div class="msg"><b>Remove “' + esc(d.name) + '”?</b> Its pool’s round robin is rebuilt and any scores already entered in that pool are cleared.</div>' +
        '<div class="acts"><button class="lv" data-act="teamclose">Keep it</button><button class="fn danger" data-act="teamdel">Remove entry</button></div>'
      : '<button class="rm" data-act="teamaskdel">Remove this entry</button>' +
        '<div class="acts"><button class="lv" data-act="teamclose">Cancel</button><button class="fn" data-act="teamsave">Save entry</button></div>') +
    '</div></div>';
}

function gate() {
  if (!S.gate) return "";
  return '<div class="back2" data-act="gateclose" data-back="1"><div class="sheet gate">' +
    '<div class="h"><b>Organizer passcode</b><button data-act="gateclose">CLOSE</button></div>' +
    '<div class="msg">Enter the passcode to enter scores or manage tournaments and event types.</div>' +
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
    '<div class="msg">“' + esc(t.name) + '”, all its events and all their scores will be removed permanently. Archive instead if you might want it back.</div>' +
    '<div class="acts"><button class="lv" data-act="confirmclose">Keep it</button>' +
    '<button class="fn danger" data-act="purge" data-val="' + t.id + '">Delete forever</button></div></div></div>';
}

function render() {
  var h = "";
  if (S.screen === "home") h = viewHome();
  else if (S.screen === "print") h = viewPrint();
  else if (S.screen === "types") h = viewTypes();
  else if (S.screen === "new" || S.screen === "edit") h = S.form ? viewForm() : viewHome();
  else h = viewEvent();
  h += sheet() + teamSheet() + gate() + confirmBox();
  if (S.toast) h += '<div class="toast"><span>' + esc(S.toast) + '</span></div>';
  document.getElementById("app").innerHTML = h;
}
