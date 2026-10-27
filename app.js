/* Filmabend – Oberfläche. Vanilla JS, kein Build. */
(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const view = $("#view"), tabs = $("#tabs"), tablist = $("#tablist"), sheet = $("#sheet"), toastEl = $("#toast"), meBtn = $("#me");
  const IMG = "https://image.tmdb.org/t/p/";
  const S = { session: null, user: null, profile: [], filme: [], serien: [], keys: { tmdb: false, omdb: false }, tab: "watchlist",
    genre: { watchlist: null, gesehen: null, zufall: new Set(), fuerdich: null }, sort: { watchlist: "neu", gesehen: "neu" },
    suche: "", ergebnisse: null, personen: null, person: null, personSort: "beliebt", beliebt: null, empfCache: {}, empfVeraltet: false, empfBasis: "alle",
    ansicht: "raster", rang: { wer: "beide", nur: "alle" }, empfArt: "filme", personArt: "filme",
    zufall: { quelle: "watchlist", max: 0, ergebnis: null, dreht: false, ton: localStorage.getItem("filmabend-ton") !== "aus" } };

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const heute = () => new Date().toISOString().slice(0, 10);
  const datum = d => d ? new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  let toastTimer;
  function toast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.hidden = true, 2600); }
  const bild = (pfad, groesse) => pfad ? IMG + groesse + pfad : "";
  const pkt = p => (Math.round(p * 10) / 10).toLocaleString("de-DE", { maximumFractionDigits: 1 });
  const ICON = {
    watchlist: '<svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>',
    gesehen: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    zufall: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="16" cy="8" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="8" cy="16" r="1.2" fill="currentColor"/><circle cx="16" cy="16" r="1.2" fill="currentColor"/></svg>',
    serien: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 21h8M12 18v3M8 3l4 3 4-3"/></svg>',
    fuerdich: '<svg viewBox="0 0 24 24"><path d="m12 3 2.5 5.5 6 .7-4.5 4 1.3 6L12 16.2 6.7 19.2l1.3-6-4.5-4 6-.7z"/></svg>',
    suche: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  };
  const TABS = [["watchlist", "Watchlist"], ["gesehen", "Gesehen"], ["zufall", "Zufall"], ["fuerdich", "Für uns"], ["serien", "Serien"], ["suche", "Suchen"]];

  /* ---------- Start & Login ---------- */
  async function start() {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    S.session = await Store.session();
    Store.beiAuth(s => { const vorher = !!S.session; S.session = s; if (!!s !== vorher) { if (s) laden(); else zeigeLogin(); } });
    if (S.session) laden(); else zeigeLogin();
  }

  function zeigeLogin() {
    tabs.hidden = true; meBtn.hidden = true; sheet.innerHTML = "";
    view.innerHTML = `<div class="login"><h1>Filmabend</h1><p>Unsere Watchlist, Bewertungen und der Zufallspicker.</p>
      <form id="login">
        <label class="feld"><span>E-Mail</span><input type="email" name="email" autocomplete="username" required></label>
        <label class="feld"><span>Passwort</span><input type="password" name="password" autocomplete="current-password" required></label>
        <div class="fehler" id="loginfehler" hidden></div>
        <button class="btn primary voll" type="submit">Anmelden</button>
      </form></div>`;
    $("#login").onsubmit = async e => {
      e.preventDefault(); const f = e.target; const b = $("button", f); b.disabled = true;
      try { await Store.anmelden(f.email.value.trim(), f.password.value); }
      catch (x) { const el = $("#loginfehler"); el.hidden = false; el.textContent = /invalid|credentials/i.test(x.message) ? "E-Mail oder Passwort stimmt nicht." : "Anmeldung fehlgeschlagen: " + x.message; b.disabled = false; }
    };
  }

  async function laden() {
    S.user = S.session.user; view.innerHTML = '<div class="empty">Lädt …</div>';
    try {
      const [profile, filme, serien, keys] = await Promise.all([Store.profile(), Store.filme(), Store.serien(), Store.schluesselStatus()]);
      S.profile = profile; S.filme = filme; S.serien = serien; S.keys = keys || S.keys;
    } catch (x) { view.innerHTML = `<div class="empty"><b>Daten konnten nicht geladen werden</b>${esc(x.message)}</div>`; return; }
    meBtn.textContent = (ich() || {}).name || "Ich"; meBtn.hidden = false; meBtn.onclick = einstellungen;
    tabs.hidden = false; renderTabs(); render();
  }
  const ich = () => S.profile.find(p => p.id === S.user.id);
  const nameVon = id => ((S.profile.find(p => p.id === id) || {}).name) || "?";
  const kurz = id => nameVon(id).slice(0, 1).toUpperCase();

  /* ---------- Navigation ---------- */
  function renderTabs() {
    tablist.innerHTML = TABS.map(([k, t]) => `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${ICON[k]}${t}</button>`).join("");
    tablist.querySelectorAll("button").forEach(b => b.onclick = () => { S.tab = b.dataset.tab; renderTabs(); render(); window.scrollTo(0, 0); });
  }
  function render() {
    if (S.tab === "watchlist" || S.tab === "gesehen") renderListe(S.tab);
    else if (S.tab === "zufall") renderZufall();
    else if (S.tab === "fuerdich") renderFuerDich();
    else if (S.tab === "serien") window.Serien.render();
    else renderSuche();
  }
  function schluesselHinweis() {
    if (S.keys.tmdb) return "";
    return `<div class="hinweis">Damit die App Filme findet, fehlt noch der kostenlose TMDB-Zugang. <a href="#" id="zu-einstellungen">Jetzt eintragen →</a></div>`;
  }
  function hinweisBinden() { const a = $("#zu-einstellungen"); if (a) a.onclick = e => { e.preventDefault(); einstellungen(); }; }

  /* ---------- Hilfen für Filme ---------- */
  const eigeneWertung = (f, uid) => (f.bewertungen || []).find(b => b.user_id === uid);
  function schnitt(f) { const b = f.bewertungen || []; return b.length ? b.reduce((s, x) => s + x.punkte, 0) / b.length : null; }
  const andereProfile = () => S.profile.filter(p => p.id !== S.user.id);
  const mitTokens = b => Array.isArray(b && b.mit) ? b.mit : [];
  // „gemeinsam geschaut“ = jemand hat bei seiner Bewertung einen anderen App-Nutzer angegeben
  const gemeinsam = f => (f.bewertungen || []).some(b => mitTokens(b).some(x => x.startsWith("@") && x.slice(1) !== b.user_id));
  function mitText(b) {
    const m = mitTokens(b); if (!m.length) return "";
    if (m.includes("allein")) return "allein geschaut";
    return "mit " + m.map(x => x.startsWith("@") ? nameVon(x.slice(1)) : x).join(", ") + " geschaut";
  }
  function bekannteNamen() {
    const s = new Set();
    S.filme.forEach(f => (f.bewertungen || []).forEach(b => mitTokens(b).forEach(x => { if (x !== "allein" && !x.startsWith("@")) s.add(x); })));
    return [...s].sort((a, b) => a.localeCompare(b, "de"));
  }
  const wegenText = w => w.startsWith("Serie: ") ? `Weil ihr die Serie „${esc(w.slice(7))}“ feiert` : w.startsWith("Film: ") ? `Weil ihr den Film „${esc(w.slice(6))}“ feiert` : `Weil ihr „${esc(w)}“ mögt`;
  function genresVon(filme) { const m = new Map(); filme.forEach(f => (f.genres || []).forEach(g => m.set(g, (m.get(g) || 0) + 1))); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]); }
  function sortiere(filme, art) {
    const l = [...filme];
    if (art === "titel") l.sort((a, b) => a.titel.localeCompare(b.titel, "de"));
    else if (art === "imdb") l.sort((a, b) => (b.imdb_rating || 0) - (a.imdb_rating || 0));
    else if (art === "letterboxd") l.sort((a, b) => (b.lb_rating || 0) - (a.lb_rating || 0));
    else if (art === "jahr") l.sort((a, b) => (b.jahr || 0) - (a.jahr || 0));
    else if (art === "wertung") l.sort((a, b) => (schnitt(b) || 0) - (schnitt(a) || 0));
    else if (art === "gesehen") l.sort((a, b) => (b.gesehen_am || "").localeCompare(a.gesehen_am || ""));
    return l;
  }
  function karte(f) {
    const eigene = (f.bewertungen || []).map(b => `<span>${esc(kurz(b.user_id))} ${pkt(b.punkte)}</span>`).join("");
    return `<button class="karte" data-id="${f.id}" type="button">
      <div class="plakat">${f.poster ? `<img src="${bild(f.poster, "w342")}" alt="" loading="lazy">` : `<div class="ohne">${esc(f.titel)}</div>`}
        ${f.imdb_rating || f.lb_rating || f.rt_rating != null ? `<div class="leiste" title="IMDb · Letterboxd · Rotten Tomatoes"><span class="i">${f.imdb_rating ? "★ " + f.imdb_rating : ""}</span><span class="l">${f.lb_rating ? pkt(f.lb_rating) : ""}</span><span class="r">${f.rt_rating != null ? f.rt_rating + "%" : ""}</span></div>` : ""}
        ${eigene ? `<div class="eigene">${eigene}</div>` : ""}</div>
      <div class="t">${esc(f.titel)}</div><div class="u">${f.jahr || ""}${f.genres && f.genres[0] ? " · " + esc(f.genres[0]) : ""}</div></button>`;
  }
  function kartenBinden(el) { (el || view).querySelectorAll(".karte[data-id]").forEach(b => b.onclick = () => { const f = S.filme.find(x => x.id === b.dataset.id); if (f) oeffneFilm(f); }); }

  /* ---------- Watchlist / Gesehen ---------- */
  function renderListe(status) {
    const alle = S.filme.filter(f => f.status === status);
    const genres = genresVon(alle);
    const g = S.genre[status] && genres.includes(S.genre[status]) ? S.genre[status] : (S.genre[status] = null);
    const liste = sortiere(g ? alle.filter(f => f.genres.includes(g)) : alle, S.sort[status]);
    const titel = status === "watchlist" ? "Watchlist" : "Gesehen";
    const sortOpts = status === "watchlist" ? [["neu", "Zuletzt eingetragen"], ["titel", "Titel"], ["imdb", "IMDb-Wertung"], ["letterboxd", "Letterboxd"], ["jahr", "Jahr"]]
      : [["gesehen", "Zuletzt gesehen"], ["wertung", "Unsere Wertung"], ["titel", "Titel"], ["imdb", "IMDb-Wertung"], ["letterboxd", "Letterboxd"], ["jahr", "Jahr"]];
    if (!S.sort[status] || !sortOpts.some(o => o[0] === S.sort[status])) S.sort[status] = sortOpts[0][0];
    const rang = status === "gesehen" && S.ansicht === "rangliste";
    view.innerHTML = `<div class="kopf"><h1>${titel}</h1><p>${alle.length} ${alle.length === 1 ? "Film" : "Filme"}${status === "watchlist" ? " zum Schauen" : ""}</p></div>
      ${schluesselHinweis()}
      ${status === "gesehen" && alle.length ? `<div class="umschalter"><button data-a="raster" aria-pressed="${!rang}" type="button">Alle Filme</button><button data-a="rangliste" aria-pressed="${rang}" type="button">Rangliste</button></div>` : ""}
      ${rang ? ranglisteHTML(alle) : `
      ${genres.length > 1 ? `<div class="chips"><button class="chip" data-g="" aria-pressed="${!g}">Alle</button>${genres.map(x => `<button class="chip" data-g="${esc(x)}" aria-pressed="${g === x}">${esc(x)}</button>`).join("")}</div>` : ""}
      ${alle.length ? `<div class="werkzeug"><span>${liste.length} angezeigt</span><select id="sort">${sortOpts.map(o => `<option value="${o[0]}" ${S.sort[status] === o[0] ? "selected" : ""}>${o[1]}</option>`).join("")}</select></div>` : ""}
      ${liste.length ? `<div class="raster">${liste.map(karte).join("")}</div>`
        : `<div class="empty"><b>${status === "watchlist" ? "Noch nichts auf der Watchlist" : "Noch nichts gesehen"}</b>${status === "watchlist" ? "Über „Suchen“ Filme eintragen." : "Markiere einen Film als gesehen, dann könnt ihr ihn bewerten."}</div>`}`}`;
    hinweisBinden();
    view.querySelectorAll(".umschalter button").forEach(b => b.onclick = () => { S.ansicht = b.dataset.a; renderListe(status); });
    if (rang) { ranglisteBinden(status); return; }
    view.querySelectorAll(".chip").forEach(c => c.onclick = () => { S.genre[status] = c.dataset.g || null; renderListe(status); });
    const sel = $("#sort"); if (sel) sel.onchange = () => { S.sort[status] = sel.value; renderListe(status); };
    kartenBinden();
  }

  /* ---------- Rangliste ---------- */
  function rangWert(f) { return S.rang.wer === "beide" ? schnitt(f) : (eigeneWertung(f, S.rang.wer) || {}).punkte; }
  function ranglisteHTML(alle) {
    const r = S.rang; if (r.wer !== "beide" && !S.profile.some(p => p.id === r.wer)) r.wer = "beide";
    const basis = r.nur === "gemeinsam" ? alle.filter(gemeinsam) : alle;
    const liste = basis.map(f => ({ f, w: rangWert(f) })).filter(x => x.w != null).sort((a, b) => b.w - a.w || (b.f.gesehen_am || "").localeCompare(a.f.gesehen_am || ""));
    const leer = r.nur === "gemeinsam" && !basis.length ? "Noch kein Film ist als „gemeinsam geschaut“ markiert. Das geht bei der Bewertung unter „Geschaut“."
      : r.wer === "beide" ? "Bewertet gesehene Filme, dann entsteht hier eure Top-Liste." : nameVon(r.wer) + " hat noch nichts bewertet.";
    return `<div class="chips"><button class="chip" data-w="beide" aria-pressed="${r.wer === "beide"}">Zusammen</button>${S.profile.map(p => `<button class="chip" data-w="${p.id}" aria-pressed="${r.wer === p.id}">${esc(p.name)}</button>`).join("")}</div>
      <div class="chips"><button class="chip" data-n="alle" aria-pressed="${r.nur === "alle"}">Alle gesehenen</button><button class="chip" data-n="gemeinsam" aria-pressed="${r.nur === "gemeinsam"}">Gemeinsam geschaut</button></div>
      ${liste.length ? `<ol class="rang">${liste.map((x, i) => rangZeile(x.f, x.w, i + 1)).join("")}</ol>` : `<div class="empty"><b>Noch keine Rangliste</b>${leer}</div>`}`;
  }
  function rangZeile(f, w, platz) {
    const bew = f.bewertungen || [];
    const einzel = S.rang.wer === "beide" && bew.length > 1 ? bew.map(b => `<span>${esc(nameVon(b.user_id))} ${pkt(b.punkte)}</span>`).join("") : "";
    const nurEiner = S.rang.wer === "beide" && bew.length === 1 && S.profile.length > 1 ? `nur ${esc(nameVon(bew[0].user_id))}` : "";
    const mit = S.rang.wer === "beide"
      ? (gemeinsam(f) ? "gemeinsam geschaut" : bew.filter(b => mitTokens(b).length).map(b => esc(nameVon(b.user_id)) + " " + esc(mitText(b))).join(" · "))
      : esc(mitText(eigeneWertung(f, S.rang.wer)));
    const u = [f.jahr, (f.genres || [])[0]].filter(Boolean).map(esc).join(" · ");
    return `<li class="rang-zeile${platz <= 3 ? " top" : ""}" data-id="${f.id}"><span class="platz">${platz}</span>
      <div class="plakat">${f.poster ? `<img src="${bild(f.poster, "w185")}" alt="" loading="lazy">` : `<div class="ohne">${esc(f.titel)}</div>`}</div>
      <div class="inhalt"><h3>${esc(f.titel)}</h3><div class="u">${[u, mit, nurEiner].filter(Boolean).join(" · ")}</div>${einzel ? `<div class="einzel">${einzel}</div>` : ""}</div>
      <b class="punkte">${pkt(w)}</b></li>`;
  }
  function ranglisteBinden(status) {
    view.querySelectorAll(".chip[data-w]").forEach(c => c.onclick = () => { S.rang.wer = c.dataset.w; renderListe(status); });
    view.querySelectorAll(".chip[data-n]").forEach(c => c.onclick = () => { S.rang.nur = c.dataset.n; renderListe(status); });
    view.querySelectorAll(".rang-zeile").forEach(z => z.onclick = () => { const f = S.filme.find(x => x.id === z.dataset.id); if (f) oeffneFilm(f); });
  }

  /* ---------- Zufall: Spielautomat ---------- */
  function zufallKandidaten() {
    const z = S.zufall;
    return S.filme.filter(f => (z.quelle === "alle" || f.status === "watchlist")
      && (!S.genre.zufall.size || f.genres.some(g => S.genre.zufall.has(g)))
      && (!z.max || !f.laufzeit || f.laufzeit <= z.max));
  }
  function renderZufall() {
    const z = S.zufall; const genres = genresVon(S.filme.filter(f => z.quelle === "alle" || f.status === "watchlist"));
    [...S.genre.zufall].forEach(g => { if (!genres.includes(g)) S.genre.zufall.delete(g); });
    const kand = zufallKandidaten(); const e = z.ergebnis && kand.find(f => f.id === z.ergebnis.id) ? z.ergebnis : null;
    view.innerHTML = `<div class="kopf"><h1>Zufall</h1><p>Keine Ahnung, was ihr schauen wollt? Der Automat entscheidet.</p></div>
      <div class="chips">
        <button class="chip" data-q="watchlist" aria-pressed="${z.quelle === "watchlist"}">Nur Watchlist</button>
        <button class="chip" data-q="alle" aria-pressed="${z.quelle === "alle"}">Auch Gesehene</button>
      </div>
      ${genres.length > 1 ? `<div class="chips">${genres.map(x => `<button class="chip" data-g="${esc(x)}" aria-pressed="${S.genre.zufall.has(x)}">${esc(x)}</button>`).join("")}</div>` : ""}
      <div class="werkzeug"><span>${kand.length} ${kand.length === 1 ? "Film" : "Filme"} im Topf</span>
        <select id="max"><option value="0" ${!z.max ? "selected" : ""}>Länge egal</option><option value="100" ${z.max === 100 ? "selected" : ""}>bis 100 min</option><option value="120" ${z.max === 120 ? "selected" : ""}>bis 2 Std.</option><option value="150" ${z.max === 150 ? "selected" : ""}>bis 2,5 Std.</option></select></div>
      <div class="slot${e ? " treffer" : ""}" id="slot">
        <div class="lampen oben" aria-hidden="true">${lampen()}</div>
        <div class="fenster" id="fenster"><div class="band ruhe" id="band">${reelItem(e, true)}</div><div class="rahmen"></div></div>
        <div class="lampen unten" aria-hidden="true">${lampen()}</div>
      </div>
      <div class="zufall-ergebnis" id="ergebnis">${e ? ergebnisHTML(e) : ""}</div>
      <button class="btn primary wuerfel" id="wuerfeln" ${kand.length ? "" : "disabled"}>${ICON.zufall} ${e ? "Nochmal drehen" : "Drehen"}</button>
      <button class="ton" id="ton" type="button" aria-pressed="${z.ton}">${z.ton ? "🔊 Ton an" : "🔇 Ton aus"}</button>`;
    view.querySelectorAll(".chip[data-q]").forEach(c => c.onclick = () => { if (z.dreht) return; z.quelle = c.dataset.q; renderZufall(); });
    view.querySelectorAll(".chip[data-g]").forEach(c => c.onclick = () => { if (z.dreht) return; const g = c.dataset.g; if (S.genre.zufall.has(g)) S.genre.zufall.delete(g); else S.genre.zufall.add(g); renderZufall(); });
    $("#max").onchange = ev => { if (z.dreht) { ev.target.value = z.max; return; } z.max = parseInt(ev.target.value) || 0; renderZufall(); };
    $("#wuerfeln").onclick = wuerfeln;
    $("#ton").onclick = () => { z.ton = !z.ton; localStorage.setItem("filmabend-ton", z.ton ? "an" : "aus"); const b = $("#ton"); b.setAttribute("aria-pressed", z.ton); b.textContent = z.ton ? "🔊 Ton an" : "🔇 Ton aus"; if (z.ton) ton("tick"); };
    const d = $("#details-zufall"); if (d) d.onclick = () => oeffneFilm(e);
  }
  const lampen = () => Array.from({ length: 9 }, (_, i) => `<i style="--i:${i}"></i>`).join("");
  const reelItem = (f, aktiv) => `<div class="reel-item${aktiv ? " aktiv" : ""}"><div class="plakat">${f && f.poster ? `<img src="${bild(f.poster, "w342")}" alt="">` : `<div class="ohne">${f ? esc(f.titel) : "?"}</div>`}</div></div>`;
  function ergebnisHTML(f) {
    return `<h2>${esc(f.titel)}</h2><div class="u">${[f.jahr, f.laufzeit ? f.laufzeit + " min" : null, (f.genres || []).slice(0, 2).join(", ")].filter(Boolean).join(" · ")}${f.imdb_rating ? ` · IMDb ${f.imdb_rating}` : ""}</div>
      <div class="reihe" style="justify-content:center"><button class="btn" id="details-zufall">Details & Trailer</button></div>`;
  }
  // Töne über WebAudio – kein Download, nur kurze Klicks und eine kleine Fanfare
  let audio;
  function ton(art) {
    if (!S.zufall.ton) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      const t = audio.currentTime;
      const note = (freq, start, dauer, laut, typ) => { const o = audio.createOscillator(), g = audio.createGain(); o.type = typ; o.frequency.value = freq; g.gain.setValueAtTime(0.0001, start); g.gain.exponentialRampToValueAtTime(laut, start + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, start + dauer); o.connect(g).connect(audio.destination); o.start(start); o.stop(start + dauer + 0.05); };
      if (art === "tick") note(1500 + Math.random() * 300, t, 0.045, 0.05, "square");
      else [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, t + i * 0.11, i === 3 ? 0.7 : 0.3, 0.16, "triangle"));
    } catch { /* kein Ton möglich – egal */ }
  }
  function konfetti(el) {
    const farben = ["#E8B458", "#FFF1C2", "#E06B6B", "#6FA3E8", "#5FB87A", "#F5C518"];
    el.insertAdjacentHTML("beforeend", `<div class="konfetti" aria-hidden="true">${Array.from({ length: 36 }, (_, i) => `<i style="--x:${Math.random() * 100}%;--d:${(0.9 + Math.random() * 0.9).toFixed(2)}s;--v:${(Math.random() * 0.4).toFixed(2)}s;--r:${Math.round(Math.random() * 720 - 360)}deg;--c:${farben[i % farben.length]}"></i>`).join("")}</div>`);
    setTimeout(() => { const k = $(".konfetti", el); if (k) k.remove(); }, 2600);
  }
  function wuerfeln() {
    const kand = zufallKandidaten(); if (!kand.length || S.zufall.dreht) return;
    const z = S.zufall, slot = $("#slot"), fenster = $("#fenster"), band = $("#band"), erg = $("#ergebnis"), btn = $("#wuerfeln");
    z.dreht = true; z.ergebnis = null; slot.classList.remove("treffer"); slot.classList.add("dreht"); btn.disabled = true; btn.innerHTML = '<span class="lade"></span> Dreht …'; erg.innerHTML = "";
    const ziel = kand[Math.floor(Math.random() * kand.length)];
    // Dauer zufällig 5–10 s; Schritte werden geometrisch langsamer (70 ms → ~480 ms)
    const dauer = 5000 + Math.random() * 5000, d0 = 70, dn = 480;
    const r = 1 + d0 * (dn / d0 - 1) / dauer, n = Math.max(12, Math.round(Math.log(dn / d0) / Math.log(r)));
    const zufaellig = vorher => { if (kand.length === 1) return kand[0]; let f; do { f = kand[Math.floor(Math.random() * kand.length)]; } while (f === vorher); return f; };
    const filme = [zufaellig(null)]; // Index 0 = Nachbar oben
    for (let i = 0; i < n; i++) filme.push(zufaellig(filme[filme.length - 1]));
    filme[filme.length - 1] = ziel; if (n > 1 && filme[n - 1] === ziel) filme[n - 1] = zufaellig(ziel);
    filme.push(zufaellig(ziel), zufaellig(null));
    band.classList.remove("ruhe"); band.style.transition = "none";
    band.innerHTML = filme.map((f, i) => reelItem(f, i === 1)).join("");
    const ih = band.children[0].offsetHeight, fh = Math.round(ih * 1.7);
    fenster.style.height = fh + "px";
    const pos = c => `translateY(${Math.round((fh - ih) / 2 - c * ih)}px)`;
    band.style.transform = pos(1);
    void band.offsetHeight; // Layout erzwingen, damit die erste Transition greift
    let i = 1, warte = d0;
    const schritt = () => {
      i++; const letzter = i === n; // Index n ist der Gewinnerfilm
      warte = letzter ? 600 : Math.min(dn, Math.round(warte * r));
      band.style.transition = `transform ${warte}ms ${letzter ? "cubic-bezier(.22,1.35,.45,1)" : warte < 160 ? "linear" : "ease-out"}`;
      band.style.transform = pos(i);
      band.querySelectorAll(".reel-item").forEach((el, k) => el.classList.toggle("aktiv", k === i));
      ton("tick");
      if (!letzter) setTimeout(schritt, warte);
      else setTimeout(() => {
        band.style.transition = "none"; band.style.transform = pos(n); // sicher auf dem Gewinner einrasten
        z.dreht = false; z.ergebnis = ziel; slot.classList.remove("dreht"); slot.classList.add("treffer");
        ton("fanfare"); konfetti(slot);
        erg.innerHTML = ergebnisHTML(ziel); btn.disabled = false; btn.innerHTML = ICON.zufall + " Nochmal drehen";
        $("#details-zufall").onclick = () => oeffneFilm(ziel);
      }, warte + 80);
    };
    setTimeout(schritt, 120);
  }

  /* ---------- Für uns (Empfehlungen) ---------- */
  function seeds(basis) {
    const out = [];
    for (const f of S.filme) {
      const meine = eigeneWertung(f, S.user.id);
      if (basis === "gemeinsam" && !(f.status === "gesehen" && gemeinsam(f))) continue;
      if (basis === "meine" && !(meine || (f.status === "watchlist" && f.hinzugefuegt_von === S.user.id))) continue;
      const s = basis === "meine" && meine ? meine.punkte : schnitt(f); let gewicht;
      if (f.status === "gesehen") { if (s == null) gewicht = 1; else if (s >= 8) gewicht = 3; else if (s >= 6) gewicht = 1.5; else continue; }
      else gewicht = 0.8;
      out.push({ tmdb_id: f.tmdb_id, gewicht, titel: f.titel });
    }
    return out;
  }
  async function renderFuerDich() {
    const basen = [["alle", "Alle unsere " + (S.empfArt === "serien" ? "Serien" : "Filme")], ["gemeinsam", "Gemeinsam geschaut"], ["meine", "Nur meine"]];
    const art = S.empfArt, serien = art === "serien";
    const quelleLeer = serien ? !(S.serien || []).length : !S.filme.length;
    const basisChips = quelleLeer ? "" : `<div class="chips">${basen.map(b => `<button class="chip" data-b="${b[0]}" aria-pressed="${S.empfBasis === b[0]}">${b[1]}</button>`).join("")}</div>`;
    view.innerHTML = `<div class="kopf mit-knopf"><div><h1>Für uns</h1><p>Vorschläge auf Basis eurer ${serien ? "Serien" : "Filme"} und Bewertungen.</p></div>
        <button class="btn klein${S.empfVeraltet ? " primary" : ""}" id="neu-laden" type="button" title="Vorschläge neu berechnen">↻ ${S.empfVeraltet ? "Neue Vorschläge" : "Neu laden"}</button></div>
      ${schluesselHinweis()}
      <div class="umschalter"><button data-art="filme" aria-pressed="${!serien}" type="button">Filme</button><button data-art="serien" aria-pressed="${serien}" type="button">Serien</button></div>
      ${basisChips}<div id="inhalt"><div class="empty"><span class="lade"></span></div></div>`;
    hinweisBinden();
    view.querySelectorAll(".umschalter [data-art]").forEach(b => b.onclick = () => { S.empfArt = b.dataset.art; renderFuerDich(); });
    view.querySelectorAll(".chip[data-b]").forEach(c => c.onclick = () => { S.empfBasis = c.dataset.b; renderFuerDich(); });
    $("#neu-laden").onclick = () => { S.empfCache = {}; S.empfVeraltet = false; renderFuerDich(); };
    if (!S.keys.tmdb) { $("#inhalt").innerHTML = ""; return; }
    const basis = S.empfBasis, key = art + ":" + basis;
    try {
      if (!S.empfCache[key]) {
        // Saatgut der eigenen Art plus „quer“: die Lieblinge der anderen Art (Serien färben Filmvorschläge und umgekehrt)
        const sd = serien ? window.Serien.seeds(basis) : seeds(basis);
        const quer = (serien ? seeds(basis) : window.Serien.seeds(basis)).filter(x => x.gewicht >= 1.5);
        const gibtSaat = sd.length || quer.length;
        let liste = [];
        if (serien) {
          const r = gibtSaat ? await Store.film("serie_empfehlungen", { seeds: sd, quer, ausschluss: (S.serien || []).map(s => s.tmdb_id) }) : (basis === "alle" ? await Store.film("serie_beliebt") : { serien: [] });
          const vorhanden = new Set((S.serien || []).map(s => s.tmdb_id)); liste = (r.serien || []).filter(x => !vorhanden.has(x.tmdb_id));
        } else {
          const r = gibtSaat ? await Store.film("empfehlungen", { seeds: sd, quer, ausschluss: S.filme.map(f => f.tmdb_id) }) : (basis === "alle" ? await Store.film("beliebt") : { filme: [] });
          const vorhanden = new Set(S.filme.map(f => f.tmdb_id)); liste = (r.filme || []).filter(x => !vorhanden.has(x.tmdb_id));
        }
        S.empfCache[key] = { quelle: gibtSaat ? "eure" : "beliebt", filme: liste };
      }
    } catch (x) { $("#inhalt").innerHTML = `<div class="empty"><b>Keine Vorschläge</b>${esc(fehlerText(x))}</div>`; return; }
    if (S.tab !== "fuerdich" || S.empfArt + ":" + S.empfBasis !== key) return;
    const E = S.empfCache[key];
    // Die Liste bleibt stehen, bis man „Neu laden“ drückt – frisch eingetragene Titel werden nur als ✓ markiert.
    const alle = E.filme;
    const genres = genresVon(alle); const g = S.genre.fuerdich && genres.includes(S.genre.fuerdich) ? S.genre.fuerdich : null;
    const liste = g ? alle.filter(f => f.genres.includes(g)) : alle;
    const was = serien ? "Serien" : "Filme";
    const leer = basis === "gemeinsam" ? `Markiert bei der Bewertung, mit wem ihr geschaut habt – dann gibt es hier Vorschläge auf Basis eurer gemeinsamen ${was}.`
      : basis === "meine" ? `Bewerte ein paar ${was}, dann gibt es Vorschläge nur für dich.` : `Bewertet ein paar ${was}, dann gibt es Vorschläge.`;
    $("#inhalt").innerHTML = `${E.quelle === "beliebt" ? `<div class="hinweis">Ihr habt noch keine ${was} eingetragen – darum erst mal, was gerade beliebt ist. Sobald ihr ${was} bewertet, wird es persönlich.</div>` : ""}
      ${genres.length > 1 ? `<div class="chips"><button class="chip" data-g="" aria-pressed="${!g}">Alle</button>${genres.map(x => `<button class="chip" data-g="${esc(x)}" aria-pressed="${g === x}">${esc(x)}</button>`).join("")}</div>` : ""}
      ${liste.length ? `<div class="liste">${liste.map(serien ? window.Serien.zeileHTML : zeile).join("")}</div>` : `<div class="empty"><b>Nichts gefunden</b>${leer}</div>`}`;
    view.querySelectorAll(".chip[data-g]").forEach(c => c.onclick = () => { S.genre.fuerdich = c.dataset.g || null; renderFuerDich(); });
    if (serien) window.Serien.zeilenBinden($("#inhalt")); else zeilenBinden(alle);
  }
  function zeile(f) {
    const drin = S.filme.find(x => x.tmdb_id === f.tmdb_id);
    const u = [f.jahr, f.rolle || null, (f.genres || []).slice(0, 2).join(", "), f.tmdb_rating ? "TMDB " + f.tmdb_rating : null].filter(Boolean).map(esc).join(" · ");
    return `<div class="zeile" data-tmdb="${f.tmdb_id}">
      <div class="offen" role="button" tabindex="0"><div class="plakat">${f.poster ? `<img src="${bild(f.poster, "w185")}" alt="" loading="lazy">` : `<div class="ohne">${esc(f.titel)}</div>`}</div>
        <div class="inhalt">${f.wegen && f.wegen.length ? `<div class="wegen">${wegenText(f.wegen[0])}</div>` : ""}<h3>${esc(f.titel)}</h3>
          <div class="u">${u}</div><p>${esc(f.beschreibung)}</p>
          <div class="aktionen">${drin ? `<span class="ok">${drin.status === "gesehen" ? "✓ Schon gesehen" : "✓ Auf der Watchlist"}</span>` : `<button class="btn klein primary" data-add="watchlist" type="button">+ Watchlist</button><button class="btn klein" data-add="gesehen" type="button">Schon gesehen</button>`}</div>
        </div></div></div>`;
  }
  function zeilenBinden(quelle) {
    view.querySelectorAll(".zeile").forEach(z => {
      const id = parseInt(z.dataset.tmdb); const f = quelle.find(x => x.tmdb_id === id);
      z.querySelectorAll("[data-add]").forEach(b => b.onclick = ev => { ev.stopPropagation(); hinzufuegen(id, b.dataset.add, b); });
      const oeffne = ev => { if (ev.target.closest("[data-add]")) return; const drin = S.filme.find(x => x.tmdb_id === id); if (drin) oeffneFilm(drin); else vorschau(id, f); };
      $(".offen", z).onclick = oeffne; $(".offen", z).onkeydown = ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); oeffne(ev); } };
    });
  }

  /* ---------- Suche ---------- */
  let sucheTimer;
  function renderSuche() {
    if (S.person) return renderPerson();
    view.innerHTML = `<div class="kopf"><h1>Suchen</h1><p>Film, Schauspieler oder Regisseur – dann eintragen oder stöbern.</p></div>${schluesselHinweis()}
      <div class="suchfeld">${ICON.suche}<input id="q" type="search" placeholder="Film, Schauspieler, Regisseur …" value="${esc(S.suche)}" autocomplete="off" ${S.keys.tmdb ? "" : "disabled"}><button class="leeren" id="leeren" type="button" ${S.suche ? "" : "hidden"}>✕</button></div>
      <div id="inhalt"></div>`;
    hinweisBinden();
    const q = $("#q"); q.oninput = () => { S.suche = q.value; $("#leeren").hidden = !q.value; clearTimeout(sucheTimer); sucheTimer = setTimeout(suchen, 350); };
    $("#leeren").onclick = () => { S.suche = ""; S.ergebnisse = null; S.personen = null; renderSuche(); q.focus(); };
    if (S.keys.tmdb && !S.suche) q.focus();
    zeigeErgebnisse();
    if (S.suche && !S.ergebnisse) suchen();
  }
  async function suchen() {
    const q = S.suche.trim(); if (!q) { S.ergebnisse = null; S.personen = null; zeigeErgebnisse(); return; }
    $("#inhalt").innerHTML = '<div class="empty"><span class="lade"></span></div>';
    try { const r = await Store.film("suche", { query: q }); if (S.suche.trim() !== q) return; S.ergebnisse = r.filme || []; S.personen = r.personen || []; }
    catch (x) { $("#inhalt").innerHTML = `<div class="empty"><b>Suche fehlgeschlagen</b>${esc(fehlerText(x))}</div>`; return; }
    zeigeErgebnisse();
  }
  const personChip = p => `<button class="person-treffer" type="button" data-pid="${p.id}" data-pname="${esc(p.name)}"><span class="foto">${p.bild ? `<img src="${bild(p.bild, "w185")}" alt="">` : esc((p.name || "?").split(" ").map(x => x[0]).join("").slice(0, 2))}</span><span class="text"><b>${esc(p.name)}</b><small>${esc([p.abteilung, (p.bekannt_fuer || []).slice(0, 2).join(", ")].filter(Boolean).join(" · "))}</small></span></button>`;
  function zeigeErgebnisse() {
    const el = $("#inhalt"); if (!el) return;
    if (!S.suche.trim()) { el.innerHTML = `<div class="empty">${S.keys.tmdb ? "Tipp einen Filmtitel oder einen Namen ein." : ""}</div>`; return; }
    if (!S.ergebnisse) return;
    const personen = S.personen || [];
    el.innerHTML = `${personen.length ? `<div class="personen-treffer">${personen.map(personChip).join("")}</div>` : ""}
      ${S.ergebnisse.length ? `<div class="liste">${S.ergebnisse.map(zeile).join("")}</div>` : personen.length ? "" : `<div class="empty"><b>Nichts gefunden</b>Vielleicht anders schreiben oder den Originaltitel probieren.</div>`}`;
    personenBinden(el); zeilenBinden(S.ergebnisse);
  }
  function personenBinden(el) {
    (el || view).querySelectorAll("[data-pname]").forEach(b => b.onclick = ev => { ev.stopPropagation(); zeigePerson({ id: parseInt(b.dataset.pid) || null, name: b.dataset.pname }); });
  }
  function zeigePerson(p) {
    schliessen(); S.person = { id: p.id, name: p.name, daten: null }; S.personSort = "beliebt";
    if (S.tab !== "suche") { S.tab = "suche"; renderTabs(); }
    window.scrollTo(0, 0); renderPerson();
  }
  async function renderPerson() {
    const P = S.person; if (!P) return renderSuche();
    const kopf = d => `<div class="person-kopf"><div class="foto">${d && d.bild ? `<img src="${bild(d.bild, "w185")}" alt="">` : esc((P.name || "?").split(" ").map(x => x[0]).join("").slice(0, 2))}</div>
      <div><h1>${esc(d ? d.name : P.name)}</h1><p>${d ? esc([d.abteilung, d.anzahl ? d.anzahl + " Filme" : null, d.geboren ? "geboren " + datum(d.geboren) : null].filter(Boolean).join(" · ")) : "Filme werden geladen …"}</p></div></div>`;
    view.innerHTML = `<button class="zurueck" id="zurueck" type="button">← Zur Suche</button>${kopf(P.daten && P.daten.person)}<div id="inhalt"><div class="empty"><span class="lade"></span></div></div>`;
    $("#zurueck").onclick = () => { S.person = null; renderSuche(); };
    if (!P.daten) {
      try { P.daten = await Store.film("person", P.id ? { id: P.id } : { name: P.name }); }
      catch (x) { if (S.person === P) $("#inhalt").innerHTML = `<div class="empty"><b>Keine Filme gefunden</b>${esc(x.code === "person_unbekannt" ? "Diese Person ist in der Filmdatenbank nicht bekannt." : fehlerText(x))}</div>`; return; }
      if (S.person !== P || S.tab !== "suche") return;
      view.querySelector(".person-kopf").outerHTML = kopf(P.daten.person);
    }
    const serienDa = (P.daten.serien || []).length, filmeDa = (P.daten.filme || []).length;
    if (S.personArt === "serien" && !serienDa) S.personArt = "filme";
    const serien = S.personArt === "serien";
    const liste = [...(serien ? P.daten.serien : P.daten.filme)];
    if (S.personSort === "neu") liste.sort((a, b) => (b.jahr || 0) - (a.jahr || 0));
    else if (S.personSort === "wertung") liste.sort((a, b) => ((b.stimmen || 0) >= 50 ? b.tmdb_rating || 0 : 0) - ((a.stimmen || 0) >= 50 ? a.tmdb_rating || 0 : 0));
    const opts = [["beliebt", "Bekannteste zuerst"], ["neu", "Neueste zuerst"], ["wertung", "Beste Wertung"]];
    $("#inhalt").innerHTML = `${serienDa ? `<div class="umschalter"><button data-art="filme" aria-pressed="${!serien}" type="button">Filme (${filmeDa})</button><button data-art="serien" aria-pressed="${serien}" type="button">Serien (${serienDa})</button></div>` : ""}
      <div class="werkzeug"><span>${liste.length} ${serien ? "Serien" : "Filme"}</span><select id="psort">${opts.map(o => `<option value="${o[0]}" ${S.personSort === o[0] ? "selected" : ""}>${o[1]}</option>`).join("")}</select></div>
      ${liste.length ? `<div class="liste">${liste.map(serien ? window.Serien.zeileHTML : zeile).join("")}</div>` : `<div class="empty"><b>Nichts gefunden</b></div>`}`;
    $("#inhalt").querySelectorAll(".umschalter [data-art]").forEach(b => b.onclick = () => { S.personArt = b.dataset.art; renderPerson(); });
    $("#psort").onchange = ev => { S.personSort = ev.target.value; renderPerson(); };
    if (serien) window.Serien.zeilenBinden($("#inhalt")); else zeilenBinden(liste);
  }
  function fehlerText(x) {
    const c = x.code || x.message || "";
    if (c === "tmdb_fehlt") return "Der TMDB-Zugang fehlt noch (Einstellungen oben rechts).";
    if (c === "tmdb_schluessel_ungueltig") return "Der TMDB-Schlüssel wird nicht akzeptiert. Bitte in den Einstellungen prüfen.";
    if (c === "nicht angemeldet") return "Bitte neu anmelden.";
    return "Verbindung zur Filmdatenbank gestört (" + c + ").";
  }

  /* ---------- Hinzufügen / Ändern ---------- */
  async function hinzufuegen(tmdb_id, status, btn) {
    if (S.filme.some(f => f.tmdb_id === tmdb_id)) { toast("Ist schon eingetragen."); return; }
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="lade"></span>'; }
    try {
      const { film } = await Store.film("details", { tmdb_id });
      delete film.omdb_aktiv;
      const neu = await Store.filmAnlegen({ ...film, status, hinzugefuegt_von: S.user.id, gesehen_am: status === "gesehen" ? heute() : null });
      neu.bewertungen = []; S.filme.unshift(neu); S.empfVeraltet = true;
      toast(status === "gesehen" ? "Als gesehen eingetragen" : "Auf die Watchlist gesetzt");
      sheet.innerHTML = ""; render();
      if (status === "gesehen") oeffneFilm(neu);
      return neu;
    } catch (x) { toast(fehlerText(x)); if (btn) { btn.disabled = false; btn.textContent = status === "gesehen" ? "Schon gesehen" : "+ Watchlist"; } }
  }
  function ersetze(neu) { const i = S.filme.findIndex(f => f.id === neu.id); if (i >= 0) { neu.bewertungen = S.filme[i].bewertungen || []; S.filme[i] = neu; } return neu; }
  async function statusSetzen(f, status) {
    try { const neu = ersetze(await Store.filmAendern(f.id, { status, gesehen_am: status === "gesehen" ? (f.gesehen_am || heute()) : null })); S.empfVeraltet = true; toast(status === "gesehen" ? "Als gesehen markiert" : "Zurück auf der Watchlist"); render(); oeffneFilm(neu); }
    catch (x) { toast("Speichern fehlgeschlagen: " + x.message); }
  }
  async function gesehenAm(f, d) { try { ersetze(await Store.filmAendern(f.id, { gesehen_am: d || null })); } catch (x) { toast("Datum nicht gespeichert"); } }
  async function aktualisieren(f, btn) {
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="lade"></span> Lädt …'; }
    try {
      const { film } = await Store.film("details", { tmdb_id: f.tmdb_id }); delete film.omdb_aktiv;
      const neu = ersetze(await Store.filmAendern(f.id, film)); toast("Aktualisiert"); render(); oeffneFilm(neu);
    } catch (x) { toast(fehlerText(x)); if (btn) { btn.disabled = false; btn.textContent = "Daten aktualisieren"; } }
  }
  async function loeschen(f) {
    if (!confirm(`„${f.titel}“ wirklich aus der Liste entfernen?`)) return;
    try { await Store.filmLoeschen(f.id); S.filme = S.filme.filter(x => x.id !== f.id); S.empfVeraltet = true; sheet.innerHTML = ""; toast("Entfernt"); render(); }
    catch (x) { toast("Löschen fehlgeschlagen: " + x.message); }
  }
  async function bewerten(f, punkte, kommentar, mit) {
    try {
      const alt = eigeneWertung(f, S.user.id);
      const b = await Store.bewerten(f.id, S.user.id, punkte, kommentar, mit || mitTokens(alt));
      f.bewertungen = (f.bewertungen || []).filter(x => x.user_id !== S.user.id).concat([b]); S.empfVeraltet = true;
      return b;
    } catch (x) { toast("Bewertung nicht gespeichert: " + x.message); }
  }

  /* ---------- Detailansicht ---------- */
  function schliessen() { sheet.innerHTML = ""; }
  function panel(html, klasse) {
    sheet.innerHTML = `<div class="schleier"><div class="panel ${klasse || ""}" role="dialog"><button class="zu" type="button" aria-label="Schließen">✕</button>${html}</div></div>`;
    $(".schleier", sheet).onclick = e => { if (e.target === e.currentTarget) schliessen(); };
    $(".zu", sheet).onclick = schliessen;
    return $(".panel", sheet);
  }
  const personHTML = (p, unter) => `<button class="person" type="button" data-pid="${p.id || ""}" data-pname="${esc(p.name)}"><div class="foto">${p.bild ? `<img src="${bild(p.bild, "w185")}" alt="" loading="lazy">` : esc((p.name || "?").split(" ").map(x => x[0]).join("").slice(0, 2))}</div><b>${esc(p.name)}</b>${unter ? `<span>${esc(unter)}</span>` : ""}</button>`;
  function anbieterHTML(a) {
    if (!a || !(a.streamen || []).length && !(a.leihen || []).length && !(a.kaufen || []).length) return `<p class="text">Derzeit kein Streaming-Angebot in Deutschland bekannt.${a && a.link ? ` <a href="${esc(a.link)}" target="_blank" rel="noopener">Bei JustWatch nachsehen →</a>` : ""}</p>`;
    const gruppe = (t, l) => (l || []).length ? `<div class="gruppe"><span>${t}</span>${l.map(p => p.logo ? `<img src="${bild(p.logo, "w92")}" alt="${esc(p.name)}" title="${esc(p.name)}">` : `<span class="name">${esc(p.name)}</span>`).join("")}</div>` : "";
    return `<div class="anbieter">${gruppe("Im Abo", a.streamen)}${gruppe("Leihen", a.leihen)}${gruppe("Kaufen", a.kaufen)}
      ${a.link ? `<div><a href="${esc(a.link)}" target="_blank" rel="noopener">Alle Angebote bei JustWatch →</a> <small style="color:var(--fg3)">Stand ${datum(a.stand)}</small></div>` : ""}</div>`;
  }
  function detailHTML(d, gespeichert) {
    const u = [d.jahr, d.laufzeit ? d.laufzeit + " min" : null, (d.genres || []).join(", ")].filter(Boolean).join(" · ");
    const w = [];
    if (d.imdb_rating) w.push(`<div class="wertung imdb"><small>IMDb</small><b>${d.imdb_rating}</b><span style="color:var(--fg3);font-size:12px">/10</span></div>`);
    if (d.rt_rating != null) w.push(`<div class="wertung rt"><small>Rotten T.</small><b>${d.rt_rating}%</b></div>`);
    if (d.lb_rating) w.push(`<div class="wertung lb"><small>Letterboxd</small><b>${pkt(d.lb_rating)}</b><span style="color:var(--fg3);font-size:12px">/5</span></div>`);
    if (d.metascore != null) w.push(`<div class="wertung meta"><small>Metacritic</small><b>${d.metascore}</b></div>`);
    if (d.tmdb_rating) w.push(`<div class="wertung"><small>TMDB</small><b>${d.tmdb_rating}</b></div>`);
    const crew = [["Regie", d.regie], ["Drehbuch", d.drehbuch], ["Produktion", d.produzenten]].filter(x => (x[1] || []).length)
      .map(x => `<div><span>${x[0]}</span>${x[1].map(p => `<button class="crew-name" type="button" data-pid="${p.id || ""}" data-pname="${esc(p.name)}">${esc(p.name)}</button>`).join(", ")}</div>`).join("");
    return `<div class="hero" id="hero">${d.hintergrund ? `<img src="${bild(d.hintergrund, "w780")}" alt="">` : d.poster ? `<img src="${bild(d.poster, "w780")}" alt="" style="filter:blur(14px);opacity:.6">` : ""}
        ${d.trailer ? `<button class="play" id="trailer" type="button">${ICON.play} Trailer</button>` : ""}</div>
      <div class="detail">
        <div class="kopfzeile"><div class="plakat">${d.poster ? `<img src="${bild(d.poster, "w342")}" alt="">` : `<div class="ohne">${esc(d.titel)}</div>`}</div>
          <div><h2>${esc(d.titel)}</h2><div class="u">${esc(u)}${d.original_titel && d.original_titel !== d.titel ? `<br>Original: ${esc(d.original_titel)}` : ""}</div></div></div>
        ${w.length ? `<div class="wertungen">${w.join("")}</div>` : (d.omdb_aktiv === false && !gespeichert ? `<p class="meta-zeile">IMDb/Rotten Tomatoes erscheinen, sobald der OMDb-Schlüssel eingetragen ist.</p>` : "")}
        <div id="aktionen"></div>
        ${d.beschreibung ? `<h3>Worum geht's</h3><p class="text">${esc(d.beschreibung)}</p>` : ""}
        ${(d.schauspieler || []).length ? `<h3>Besetzung</h3><div class="personen">${d.schauspieler.map(p => personHTML(p, p.rolle)).join("")}</div>` : ""}
        ${crew ? `<h3>Hinter der Kamera</h3><div class="crew">${crew}</div>` : ""}
        ${(d.bilder || []).length ? `<h3>Bilder</h3><div class="galerie">${d.bilder.map(b => `<a href="${bild(b, "original")}" target="_blank" rel="noopener"><img src="${bild(b, "w500")}" alt="" loading="lazy"></a>`).join("")}</div>` : ""}
        <h3>Wo schauen</h3>${anbieterHTML(d.anbieter)}
        <div id="unten"></div>
      </div>`;
  }
  function trailerBinden(d) {
    const t = $("#trailer", sheet); if (!t) return;
    t.onclick = () => { $("#hero", sheet).innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(d.trailer)}?autoplay=1&rel=0" title="Trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`; };
  }
  async function vorschau(tmdb_id, kompakt) {
    const p = panel(`<div class="empty"><span class="lade"></span><br><br>${esc((kompakt || {}).titel || "")}</div>`);
    let d; try { d = (await Store.film("details", { tmdb_id })).film; } catch (x) { p.innerHTML = `<button class="zu" type="button">✕</button><div class="empty"><b>Konnte nicht laden</b>${esc(fehlerText(x))}</div>`; $(".zu", p).onclick = schliessen; return; }
    if (!sheet.contains(p)) return;
    p.innerHTML = `<button class="zu" type="button" aria-label="Schließen">✕</button>${detailHTML(d, false)}`; $(".zu", p).onclick = schliessen; trailerBinden(d); personenBinden(p);
    $("#aktionen", p).innerHTML = `<div class="status-reihe"><button class="btn primary" data-add="watchlist" type="button">+ Watchlist</button><button class="btn" data-add="gesehen" type="button">Schon gesehen</button></div>`;
    p.querySelectorAll("[data-add]").forEach(b => b.onclick = () => hinzufuegen(tmdb_id, b.dataset.add, b));
  }
  function oeffneFilm(f) {
    const p = panel(detailHTML(f, true)); trailerBinden(f); personenBinden(p);
    const a = $("#aktionen", p);
    a.innerHTML = f.status === "watchlist"
      ? `<div class="status-reihe"><button class="btn primary" id="gesehen" type="button">${ICON.gesehen} Gesehen – jetzt bewerten</button></div>`
      : `<div class="status-reihe"><label class="feld" style="flex:1;margin:0"><span>Gesehen am</span><input type="date" id="gesehen_am" value="${f.gesehen_am || ""}"></label><button class="btn" id="watchlist" type="button" style="align-self:flex-end">Zurück auf Watchlist</button></div>
         <h3>Unsere Bewertung</h3>${bewertungenHTML(f)}`;
    if ($("#gesehen", p)) $("#gesehen", p).onclick = () => statusSetzen(f, "gesehen");
    if ($("#watchlist", p)) $("#watchlist", p).onclick = () => statusSetzen(f, "watchlist");
    if ($("#gesehen_am", p)) $("#gesehen_am", p).onchange = ev => gesehenAm(f, ev.target.value);
    bewertungBinden(f, p);
    $("#unten", p).innerHTML = `<div class="meta-zeile">Eingetragen${f.hinzugefuegt_von ? " von " + esc(nameVon(f.hinzugefuegt_von)) : ""} am ${datum(f.erstellt_am)}${f.imdb_id ? ` · <a href="https://www.imdb.com/title/${esc(f.imdb_id)}/" target="_blank" rel="noopener">IMDb</a>` : ""}${f.lb_url ? ` · <a href="${esc(f.lb_url)}" target="_blank" rel="noopener">Letterboxd</a>` : ""}</div>
      <div class="reihe" style="margin-top:14px"><button class="btn klein" id="neu" type="button">Daten aktualisieren</button><button class="btn klein ghost danger" id="weg" type="button">Entfernen</button></div>`;
    $("#neu", p).onclick = ev => aktualisieren(f, ev.currentTarget); $("#weg", p).onclick = () => loeschen(f);
  }
  function bewertungenHTML(f) {
    const meine = eigeneWertung(f, S.user.id);
    const andere = (f.bewertungen || []).filter(b => b.user_id !== S.user.id);
    const ganz = meine ? Math.floor(meine.punkte) : null, dez = meine ? Math.round((meine.punkte - ganz) * 10) : 0;
    const ganze = Array.from({ length: 10 }, (_, i) => i + 1).map(n => `<button type="button" data-g="${n}" aria-pressed="${ganz === n}" class="${ganz != null && n < ganz ? "unter" : ""}">${n}</button>`).join("");
    const dezimale = Array.from({ length: 10 }, (_, i) => i).map(n => `<button type="button" data-d="${n}" aria-pressed="${meine != null && dez === n}" ${ganz == null || ganz === 10 ? "disabled" : ""}>,${n}</button>`).join("");
    return `<div class="bewertung-box"><div class="wer"><span>${esc((ich() || {}).name || "Ich")}</span><b id="meine-punkte">${meine ? pkt(meine.punkte) + "/10" : "noch offen"}</b></div>
        <div class="sterne" id="sterne">${ganze}</div>
        <div class="sterne dez" id="dezimale">${dezimale}</div>
        <div class="mit"><span>Geschaut</span><div class="chips" id="mit">${mitChips(meine)}</div></div>
        <textarea id="kommentar" placeholder="Kurzer Kommentar (optional)">${esc(meine ? meine.kommentar || "" : "")}</textarea>
        <div class="reihe" style="margin-top:8px;justify-content:flex-end"><button class="btn klein" id="kommentar-speichern" type="button">Kommentar speichern</button></div></div>
      ${andere.map(b => `<div class="bewertung-box"><div class="wer"><span>${esc(nameVon(b.user_id))}</span><b>${pkt(b.punkte)}/10</b></div>${mitText(b) ? `<div class="mit-info">${esc(mitText(b))}</div>` : ""}${b.kommentar ? `<div class="kommentar">„${esc(b.kommentar)}“</div>` : ""}</div>`).join("")}
      ${S.profile.filter(p => p.id !== S.user.id && !andere.some(b => b.user_id === p.id)).map(p => `<div class="bewertung-box"><div class="wer"><span>${esc(p.name)}</span><span style="color:var(--fg3)">hat noch nicht bewertet</span></div></div>`).join("")}`;
  }
  function mitChips(meine) {
    const m = mitTokens(meine);
    const chip = (tok, text) => `<button class="chip" type="button" data-m="${esc(tok)}" aria-pressed="${m.includes(tok)}">${esc(text)}</button>`;
    return chip("allein", "Allein") + andereProfile().map(p => chip("@" + p.id, "Mit " + p.name)).join("") + bekannteNamen().map(n => chip(n, "Mit " + n)).join("")
      + `<button class="chip plus" type="button" data-m="+">+ Name</button>`;
  }
  function bewertungBinden(f, p) {
    const st = $("#sterne", p), dz = $("#dezimale", p); if (!st) return;
    const zeichne = punkte => {
      const ganz = Math.floor(punkte), dez = Math.round((punkte - ganz) * 10);
      st.querySelectorAll("button").forEach(x => { const n = parseInt(x.dataset.g); x.setAttribute("aria-pressed", n === ganz); x.classList.toggle("unter", n < ganz); });
      dz.querySelectorAll("button").forEach(x => { x.disabled = ganz === 10; x.setAttribute("aria-pressed", parseInt(x.dataset.d) === dez); });
      $("#meine-punkte", p).textContent = pkt(punkte) + "/10";
    };
    const speichere = async punkte => {
      punkte = Math.min(10, Math.max(1, Math.round(punkte * 10) / 10));
      const bew = await bewerten(f, punkte, $("#kommentar", p).value.trim()); if (!bew) return;
      zeichne(punkte); toast("Bewertet: " + pkt(punkte) + "/10"); render();
    };
    st.querySelectorAll("button").forEach(b => b.onclick = () => {
      const meine = eigeneWertung(f, S.user.id); const ganz = parseInt(b.dataset.g);
      const dez = meine && Math.floor(meine.punkte) === ganz ? Math.round((meine.punkte - ganz) * 10) : 0;
      speichere(ganz === 10 ? 10 : ganz + dez / 10);
    });
    dz.querySelectorAll("button").forEach(b => b.onclick = () => {
      const meine = eigeneWertung(f, S.user.id); if (!meine) { toast("Erst die ganze Zahl wählen."); return; }
      speichere(Math.floor(meine.punkte) + parseInt(b.dataset.d) / 10);
    });
    const mitBinden = () => $("#mit", p).querySelectorAll(".chip").forEach(c => c.onclick = async () => {
      const meine = eigeneWertung(f, S.user.id); if (!meine) { toast("Erst Punkte vergeben."); return; }
      let m = mitTokens(meine).slice(); const tok = c.dataset.m;
      if (tok === "+") {
        const name = (prompt("Mit wem geschaut? (Name)") || "").trim().replace(/^mit\s+/i, "");
        if (!name) return; if (!m.includes(name)) m.push(name); m = m.filter(x => x !== "allein");
      } else if (tok === "allein") m = m.includes("allein") ? [] : ["allein"];
      else { m = m.includes(tok) ? m.filter(x => x !== tok) : m.concat([tok]); m = m.filter(x => x !== "allein"); }
      if (await bewerten(f, meine.punkte, $("#kommentar", p).value.trim(), m)) { $("#mit", p).innerHTML = mitChips(eigeneWertung(f, S.user.id)); mitBinden(); toast(m.length ? "Gespeichert: " + mitText({ mit: m }) : "Angabe entfernt"); }
    });
    mitBinden();
    $("#kommentar-speichern", p).onclick = async () => {
      const meine = eigeneWertung(f, S.user.id); if (!meine) { toast("Erst Punkte vergeben."); return; }
      if (await bewerten(f, meine.punkte, $("#kommentar", p).value.trim())) toast("Kommentar gespeichert");
    };
  }

  /* ---------- Einstellungen ---------- */
  function einstellungen() {
    const theme = document.documentElement.dataset.theme || "dark";
    const p = panel(`<h2>Einstellungen</h2>
      <div class="abschnitt"><h3>Mein Name</h3><div class="reihe"><input id="name" value="${esc((ich() || {}).name || "")}" style="flex:1;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:9px 11px"><button class="btn klein" id="name-speichern" type="button">Speichern</button></div></div>
      <div class="abschnitt"><h3>Darstellung</h3><div class="chips"><button class="chip" data-t="dark" aria-pressed="${theme === "dark"}">Dunkel</button><button class="chip" data-t="light" aria-pressed="${theme === "light"}">Hell</button></div></div>
      <div class="abschnitt"><h3>Filmdatenbank (TMDB) <span class="${S.keys.tmdb ? "ok" : "fehlt"}">${S.keys.tmdb ? "✓ eingerichtet" : "fehlt"}</span></h3>
        <p>Liefert Titel, Beschreibung, Besetzung, Trailer, Anbieter und Empfehlungen. Kostenlos.</p>
        <ol><li>Auf themoviedb.org kostenlos registrieren.</li><li>Oben rechts Profilbild → Einstellungen → „API“.</li><li>Den „API-Schlüssel“ (v3) kopieren und hier einfügen.</li></ol>
        <div class="reihe"><input id="tmdb" placeholder="${S.keys.tmdb ? "Neuen Schlüssel einfügen, um ihn zu ersetzen" : "TMDB API-Schlüssel"}" style="flex:1;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:9px 11px"><button class="btn klein" data-k="tmdb" type="button">Speichern</button></div></div>
      <div class="abschnitt"><h3>IMDb & Rotten Tomatoes (OMDb) <span class="${S.keys.omdb ? "ok" : "fehlt"}">${S.keys.omdb ? "✓ eingerichtet" : "fehlt"}</span></h3>
        <p>Liefert die IMDb-Wertung, Rotten-Tomatoes- und Metacritic-Prozent. Kostenlos bis 1.000 Abfragen pro Tag.</p>
        <ol><li>Auf omdbapi.com → „API Key“ → „FREE“ wählen, E-Mail eintragen.</li><li>Den Schlüssel aus der E-Mail über den Link darin aktivieren.</li><li>Schlüssel hier einfügen.</li></ol>
        <div class="reihe"><input id="omdb" placeholder="${S.keys.omdb ? "Neuen Schlüssel einfügen, um ihn zu ersetzen" : "OMDb API-Schlüssel"}" style="flex:1;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:9px 11px"><button class="btn klein" data-k="omdb" type="button">Speichern</button></div></div>
      <button class="btn voll ghost" id="abmelden" type="button">Abmelden</button>`, "klein");
    $("#name-speichern", p).onclick = async () => { const n = $("#name", p).value.trim(); if (!n) return; try { await Store.nameSetzen(S.user.id, n); ich().name = n; meBtn.textContent = n; toast("Name gespeichert"); } catch (x) { toast("Fehler: " + x.message); } };
    p.querySelectorAll(".chip[data-t]").forEach(c => c.onclick = () => { const t = c.dataset.t; document.documentElement.dataset.theme = t; try { localStorage.setItem("filmabend-theme", t); } catch (_) {} p.querySelectorAll(".chip[data-t]").forEach(x => x.setAttribute("aria-pressed", x === c)); });
    p.querySelectorAll("[data-k]").forEach(b => b.onclick = async () => {
      const k = b.dataset.k; const v = $("#" + k, p).value.trim(); if (!v) { toast("Bitte Schlüssel einfügen."); return; }
      b.disabled = true;
      try { await Store.schluesselSetzen(k, v); S.keys[k] = true; S.empfVeraltet = true; toast("Gespeichert"); einstellungen(); render(); }
      catch (x) { toast("Fehler: " + x.message); b.disabled = false; }
    });
    $("#abmelden", p).onclick = async () => { await Store.abmelden(); S.filme = []; S.serien = []; S.empfVeraltet = true; zeigeLogin(); };
  }

  // Gemeinsame Hilfen für serien.js
  window.FA = { S, $, view, sheet, esc, datum, pkt, bild, toast, panel, schliessen, ICON, nameVon, kurz, ich, andereProfile, mitTokens, mitText, bekannteNamen, fehlerText, heute, personHTML, personenBinden, anbieterHTML, trailerBinden, schluesselHinweis, hinweisBinden, render, renderTabs, wegenText, filmSeeds: seeds };
  start();
})();
