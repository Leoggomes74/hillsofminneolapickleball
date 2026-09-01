// Invitation poster generator — draws a Letter-format PNG on a canvas from the
// tournament's own data, themed by keywords in its title.

var INV_W = 1275, INV_H = 1650;   // 8.5 x 11 in at 150 dpi

var INV_THEMES = [
  { key: "fall", test: /fall|autumn|harvest|october|november|pumpkin/i,
    bg: "#2b1508", panel: "#3a1d0b", ink: "#fdf2e2", accent: "#e08a1e", accent2: "#a8341a", soft: "#c9a06a",
    motif: "leaves", season: "Fall Classic",
    line: "Cooler mornings, warmer rallies. Bring your best dinks." },
  { key: "winter", test: /winter|holiday|christmas|snow|december|january|frost/i,
    bg: "#0b1c33", panel: "#122744", ink: "#eef5ff", accent: "#7cc4ff", accent2: "#c8e4ff", soft: "#8fa9c8",
    motif: "snow", season: "Winter Series",
    line: "Short days, long rallies. Warm up and come play." },
  { key: "spring", test: /spring|bloom|blossom|march|april|easter/i,
    bg: "#14331f", panel: "#1b4429", ink: "#f2fbef", accent: "#f2a5c4", accent2: "#9fd67c", soft: "#a9c9a4",
    motif: "petals", season: "Spring Open",
    line: "New season, fresh legs, everything to play for." },
  { key: "summer", test: /summer|sun|beach|july|august|heat|sizzl/i,
    bg: "#07323a", panel: "#0b4450", ink: "#effcff", accent: "#ffb64d", accent2: "#3fd0c9", soft: "#8fc4cc",
    motif: "sun", season: "Summer Slam",
    line: "Sunscreen on, water cold, paddles hot." },
  { key: "night", test: /night|glow|under the lights|twilight/i,
    bg: "#161129", panel: "#221a3d", ink: "#f4f0ff", accent: "#c9a6ff", accent2: "#65e0c0", soft: "#a094c4",
    motif: "stars", season: "Night Session",
    line: "Lights on, nerves up. See you after dark." },
  { key: "champ", test: /championship|classic|cup|open|invitational|masters/i,
    bg: "#14261b", panel: "#1b3324", ink: "#f4faf2", accent: "#e0a92a", accent2: "#7fd39a", soft: "#a8bfa9",
    motif: "confetti", season: "Championship",
    line: "Bring your A game. Titles are on the line." }
];
var INV_DEFAULT = {
  key: "default", bg: "#123524", panel: "#1a4630", ink: "#f4f6f1", accent: "#e0a92a", accent2: "#7fd39a", soft: "#a8bfa9",
  motif: "confetti", season: "Tournament",
  line: "Grab a partner, pick your event, and get on the list."
};

function invTheme(t) {
  var hay = String((t && t.name) || "") + " " + String((t && t.date) || "");
  for (var i = 0; i < INV_THEMES.length; i++) if (INV_THEMES[i].test.test(hay)) return INV_THEMES[i];
  var m = /^\d{4}-(\d{2})/.exec(String((t && t.date) || ""));
  if (m) {
    var mo = parseInt(m[1], 10);
    if (mo >= 9 && mo <= 11) return INV_THEMES[0];
    if (mo === 12 || mo <= 2) return INV_THEMES[1];
    if (mo >= 3 && mo <= 5) return INV_THEMES[2];
    return INV_THEMES[3];
  }
  return INV_DEFAULT;
}

function invRand(seed) {
  var s = 0;
  for (var i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function invWrap(ctx, text, max) {
  var words = String(text).split(/\s+/), lines = [], cur = "";
  words.forEach(function (w) {
    var probe = cur ? cur + " " + w : w;
    if (ctx.measureText(probe).width > max && cur) { lines.push(cur); cur = w; }
    else cur = probe;
  });
  if (cur) lines.push(cur);
  return lines;
}

function invMotif(ctx, th, rnd, y0, y1, count) {
  for (var i = 0; i < count; i++) {
    var x = rnd() * INV_W, y = y0 + rnd() * (y1 - y0), s = 14 + rnd() * 30, a = rnd() * Math.PI;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.globalAlpha = 0.14 + rnd() * 0.28;
    ctx.fillStyle = rnd() > 0.5 ? th.accent : th.accent2;
    if (th.motif === "snow" || th.motif === "stars" || th.motif === "petals") {
      ctx.beginPath(); ctx.arc(0, 0, s * 0.32, 0, Math.PI * 2); ctx.fill();
      if (th.motif === "petals") { ctx.globalAlpha *= 0.7; ctx.beginPath(); ctx.ellipse(s * 0.4, 0, s * 0.34, s * 0.16, 0, 0, Math.PI * 2); ctx.fill(); }
    } else if (th.motif === "leaves") {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.5); ctx.quadraticCurveTo(s * 0.5, 0, 0, s * 0.5); ctx.quadraticCurveTo(-s * 0.5, 0, 0, -s * 0.5);
      ctx.fill();
    } else if (th.motif === "sun") {
      ctx.lineWidth = 4; ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.5, 0, Math.PI * 1.4); ctx.stroke();
    } else {
      ctx.fillRect(-s * 0.4, -s * 0.14, s * 0.8, s * 0.28);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function invDate(t) {
  if (!t.date) return { big: "Date to be announced", small: "" };
  var d = new Date(t.date + "T" + (t.time || "00:00"));
  if (isNaN(d)) return { big: t.date, small: "" };
  return {
    big: d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }).toUpperCase(),
    small: d.getFullYear() + (t.time ? "  ·  FIRST SERVE " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toUpperCase() : "")
  };
}

var INV_LKEY = "hom.invite";
function invStore() { try { return JSON.parse(localStorage.getItem(INV_LKEY) || "{}"); } catch (e) { return {}; } }
function invDefaults(t) {
  var th = invTheme(t);
  return { kicker: "You are invited", line: th.line, cta: "Register on the tournament app" };
}
function ensureInv(t) {
  if (S.inv && S.inv.id === t.id) return S.inv;
  var saved = invStore()[t.id] || {}, d = invDefaults(t);
  S.inv = { id: t.id, kicker: saved.kicker != null ? saved.kicker : d.kicker,
    line: saved.line != null ? saved.line : d.line, cta: saved.cta != null ? saved.cta : d.cta };
  return S.inv;
}
function saveInv() {
  if (!S.inv) return;
  try {
    var all = invStore();
    all[S.inv.id] = { kicker: S.inv.kicker, line: S.inv.line, cta: S.inv.cta };
    localStorage.setItem(INV_LKEY, JSON.stringify(all));
  } catch (e) {}
}
function resetInv() {
  var t = tour(); if (!t) return;
  try { var all = invStore(); delete all[t.id]; localStorage.setItem(INV_LKEY, JSON.stringify(all)); } catch (e) {}
  S.inv = null; ensureInv(t); render();
}

function drawInvite() {
  var cv = document.getElementById("invcanvas");
  var t = tour();
  if (!cv || !t) return;
  var ctx = cv.getContext("2d");
  cv.width = INV_W; cv.height = INV_H;
  var th = invTheme(t), rnd = invRand(t.name + t.id);
  var evs = evsOf(t), inv = ensureInv(t);

  ctx.fillStyle = th.bg; ctx.fillRect(0, 0, INV_W, INV_H);
  invMotif(ctx, th, rnd, -20, 520, 26);
  invMotif(ctx, th, rnd, INV_H - 460, INV_H + 20, 20);

  var M = 78;
  ctx.strokeStyle = th.accent; ctx.lineWidth = 7;
  ctx.strokeRect(M, M, INV_W - M * 2, INV_H - M * 2);

  var x = M + 62, wide = INV_W - (M + 62) * 2, y = M + 118;

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = th.accent;
  ctx.font = "800 27px Archivo, sans-serif";
  ctx.letterSpacing = "10px";
  ctx.fillText(String(inv.kicker || "").toUpperCase(), x, y);
  ctx.letterSpacing = "0px";

  y += 34;
  ctx.fillStyle = th.soft;
  ctx.font = "600 26px Archivo, sans-serif";
  ctx.fillText(th.season.toUpperCase() + "  ·  PICKLEBALL", x, y + 22);

  y += 96;
  ctx.fillStyle = th.ink;
  var size = 104;
  ctx.font = "800 " + size + "px Archivo, sans-serif";
  var lines = invWrap(ctx, t.name, wide);
  while (lines.length > 3 && size > 58) {
    size -= 8;
    ctx.font = "800 " + size + "px Archivo, sans-serif";
    lines = invWrap(ctx, t.name, wide);
  }
  lines.forEach(function (ln) { y += size * 0.94; ctx.fillText(ln, x, y); });

  y += 46;
  ctx.fillStyle = th.accent; ctx.fillRect(x, y, 132, 8);

  var dt = invDate(t);
  y += 76;
  ctx.fillStyle = th.ink;
  ctx.font = "800 44px Archivo, sans-serif";
  ctx.fillText(dt.big, x, y);
  if (dt.small) {
    y += 40;
    ctx.fillStyle = th.accent2;
    ctx.font = "700 26px Archivo, sans-serif";
    ctx.fillText(dt.small, x, y);
  }

  y += 58;
  ctx.fillStyle = th.panel;
  var panelTop = y;
  var rowH = 74, headH = 62;
  var panelH = headH + Math.max(1, evs.length) * rowH + 22;
  ctx.fillRect(x, panelTop, wide, panelH);
  ctx.fillStyle = th.accent; ctx.fillRect(x, panelTop, wide, 5);

  ctx.fillStyle = th.soft;
  ctx.font = "800 22px Archivo, sans-serif";
  ctx.letterSpacing = "6px";
  ctx.fillText("EVENTS", x + 30, panelTop + 44);
  ctx.letterSpacing = "0px";

  var ry = panelTop + headH;
  if (!evs.length) {
    ctx.fillStyle = th.ink;
    ctx.font = "600 30px Archivo, sans-serif";
    ctx.fillText("Events announced soon", x + 30, ry + 44);
  }
  evs.forEach(function (e, i) {
    if (i) { ctx.fillStyle = th.soft; ctx.globalAlpha = 0.25; ctx.fillRect(x + 30, ry, wide - 60, 2); ctx.globalAlpha = 1; }
    ctx.fillStyle = th.ink;
    ctx.font = "800 34px Archivo, sans-serif";
    ctx.fillText(typeName(e.eventTypeId), x + 30, ry + 46);
    var when = "";
    if (e.date) {
      var d = new Date(e.date + "T" + (e.time || "00:00"));
      if (!isNaN(d)) when = d.toLocaleDateString([], { month: "short", day: "numeric" }).toUpperCase() +
        (e.time ? " · " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toUpperCase() : "");
    }
    if (when) {
      ctx.fillStyle = th.accent2;
      ctx.font = "700 24px Archivo, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(when, x + wide - 30, ry + 44);
      ctx.textAlign = "left";
    }
    ry += rowH;
  });

  y = panelTop + panelH + 62;
  ctx.fillStyle = th.ink;
  ctx.font = "600 31px Archivo, sans-serif";
  String(inv.line || "").split(/\n+/).forEach(function (para) {
    invWrap(ctx, para, wide).forEach(function (ln) { ctx.fillText(ln, x, y); y += 42; });
  });

  var footY = INV_H - M - 150;
  ctx.fillStyle = th.soft; ctx.globalAlpha = 0.3;
  ctx.fillRect(x, footY - 46, wide, 2);
  ctx.globalAlpha = 1;

  if (t.fee) {
    ctx.fillStyle = th.accent;
    ctx.font = "800 26px Archivo, sans-serif";
    ctx.letterSpacing = "4px";
    ctx.fillText("ENTRY " + String(t.fee).toUpperCase(), x, footY);
    ctx.letterSpacing = "0px";
  }
  ctx.fillStyle = th.ink;
  ctx.font = "800 30px Archivo, sans-serif";
  ctx.fillText(String(inv.cta || ""), x, footY + (t.fee ? 52 : 10));
  if (t.director) {
    ctx.fillStyle = th.soft;
    ctx.font = "600 24px Archivo, sans-serif";
    ctx.fillText("Tournament director · " + t.director, x, footY + (t.fee ? 92 : 50));
  }
}

function inviteFilename() {
  var t = tour();
  return String((t && t.name) || "invitation").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-invite.png";
}
function downloadInvite() {
  var cv = document.getElementById("invcanvas"); if (!cv) return;
  cv.toBlob(function (b) {
    if (!b) return;
    var u = URL.createObjectURL(b), a = document.createElement("a");
    a.href = u; a.download = inviteFilename();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
  }, "image/png");
}
function shareInvite() {
  var cv = document.getElementById("invcanvas"); if (!cv) return;
  var t = tour();
  cv.toBlob(function (b) {
    if (!b) return downloadInvite();
    var file = new File([b], inviteFilename(), { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: t ? t.name : "Tournament invitation" }).catch(function () {});
    } else {
      downloadInvite();
      toast("Image saved — attach it in WhatsApp", 2800);
    }
  }, "image/png");
}

function viewInvite() {
  var t = tour();
  if (!t) return viewHome();
  var th = invTheme(t), inv = ensureInv(t);
  var h = '<div class="hd"><button class="back" data-act="backevent">‹</button>' +
    '<div class="hdmain"><h1>Invitation</h1><div class="sub">' + esc(th.season) + ' · letter format</div></div></div>';
  h += '<div class="fnote top">Built from this tournament’s own details and themed to match its name. Edit the wording below — the poster redraws as you type — then save or share it.</div>';
  h += '<div class="invwrap"><canvas id="invcanvas" aria-label="Tournament invitation"></canvas></div>';
  h += '<div class="facts"><button class="fbtn ghost" data-act="invdl">Save image</button>' +
    '<button class="fbtn" data-act="invshare">Share →</button></div>';
  h += '<div class="lbl rule">Wording</div>';
  if (!S.unlocked) {
    h += '<div class="empty small">The wording is set by the organizers. Anyone can save or share this invitation.</div>';
    h += '<button class="fbtn ghost wide" data-act="invunlock">🔒 Enter passcode to edit wording</button>';
  } else {
    h += '<div class="fsec"><label>Opening line</label><input type="text" data-inv="kicker" value="' + esc(inv.kicker) + '" maxlength="32" placeholder="You are invited"></div>';
    h += '<div class="fsec"><label>Message</label><textarea data-inv="line" rows="3" maxlength="240" placeholder="Say something that makes people want to play">' + esc(inv.line) + '</textarea></div>';
    h += '<div class="fsec"><label>Call to action</label><input type="text" data-inv="cta" value="' + esc(inv.cta) + '" maxlength="48" placeholder="Register on the tournament app"></div>';
    h += '<button class="fbtn ghost wide" data-act="invreset">Reset to suggested wording</button>';
  }
  h += '<div class="empty small">The name, dates, events and fee come straight from the tournament — edit those in the setup form. Seasonal words in the title (fall, winter, spring, summer, night, classic) pick the artwork.</div>';
  return h + '<div class="pad"></div>';
}
