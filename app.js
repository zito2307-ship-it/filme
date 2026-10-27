/* Filmabend – Oberfläche. Vanilla JS, kein Build. */
(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const view = $("#view"), tabs = $("#tabs"), tablist = $("#tablist"), sheet = $("#sheet"), toastEl = $("#toast"), meBtn = $("#me");
  const IMG = "https://image.tmdb.org/t/p/";
  const S = { session: null, user: null, profile: [], filme: [], keys: { tmdb: false, omdb: false }, tab: "watchlist",
    genre: { watchlist: null, gesehen: null, zufall: new Set(), fuerdich: null }, sort: { watchlist: "neu", gesehen: "neu" },
    suche: "", ergebnisse: null, beliebt: null, empfehlungen: null, zufall: { quelle: "watchlist", max: 0, ergebnis: null, dreht: false } };

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
    fuerdich: '<svg viewBox="0 0 24 24"><path d="m12 3 2.5 5.5 6 .7-4.5 4 1.3 6L12 16.2 6.7 19.2l1.3-6-4.5-4 6-.7z"/></svg>',
    suche: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  };
  const TABS = [["watchlist", "Watchlist"], ["gesehen", "Gesehen"], ["zufall", "Zufall"], ["fuerdich", "Für uns"], ["suche", "Suchen"]];

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
      const [profile, filme, keys] = await Promise.all([Store.profile(), Store.filme(), Store.schluesselStatus()]);
      S.profile = profile; S.filme = filme; S.keys = keys || S.keys;
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
        ${f.imdb_rating ? `<span class="eck">★ ${f.imdb_rating}</span>` : ""}${f.rt_rating != null ? `<span class="eck rt">🍅 ${f.rt_rating}%</span>` : ""}
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
    view.innerHTML = `<div class="kopf"><h1>${titel}</h1><p>${alle.length} ${alle.length === 1 ? "Film" : "Filme"}${status === "watchlist" ? " zum Schauen" : ""}</p></div>
      ${schluesselHinweis()}
      ${genres.length > 1 ? `<div class="chips"><button class="chip" data-g="" aria-pressed="${!g}">Alle</button>${genres.map(x => `<button class="chip" data-g="${esc(x)}" aria-pressed="${g === x}">${esc(x)}</button>`).join("")}</div>` : ""}
      ${alle.length ? `<div class="werkzeug"><span>${liste.length} angezeigt</span><select id="sort">${sortOpts.map(o => `<option value="${o[0]}" ${S.sort[status] === o[0] ? "selected" : ""}>${o[1]}</option>`).join("")}</select></div>` : ""}
      ${liste.length ? `<div class="raster">${liste.map(karte).join("")}</div>`
        : `<div class="empty"><b>${status === "watchlist" ? "Noch nichts auf der Watchlist" : "Noch nichts gesehen"}</b>${status === "watchlist" ? "Über „Suchen“ Filme eintragen." : "Markiere einen Film als gesehen, dann könnt ihr ihn bewerten."}</div>`}`;
    hinweisBinden();
    view.querySelectorAll(".chip").forEach(c => c.onclick = () => { S.genre[status] = c.dataset.g || null; renderListe(status); });
    const sel = $("#sort"); if (sel) sel.onchange = () => { S.sort[status] = sel.value; renderListe(status); };
    kartenBinden();
  }

  /* ---------- Zufall ---------- */
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
    view.innerHTML = `<div class="kopf"><h1>Zufall</h1><p>Keine Ahnung, was ihr schauen wollt? Lasst würfeln.</p></div>
      <div class="chips">
        <button class="chip" data-q="watchlist" aria-pressed="${z.quelle === "watchlist"}">Nur Watchlist</button>
        <button class="chip" data-q="alle" aria-pressed="${z.quelle === "alle"}">Auch Gesehene</button>
      </div>
      ${genres.length > 1 ? `<div class="chips">${genres.map(x => `<button class="chip" data-g="${esc(x)}" aria-pressed="${S.genre.zufall.has(x)}">${esc(x)}</button>`).join("")}</div>` : ""}
      <div class="werkzeug"><span>${kand.length} ${kand.length === 1 ? "Film" : "Filme"} im Topf</span>
        <select id="max"><option value="0" ${!z.max ? "selected" : ""}>Länge egal</option><option value="100" ${z.max === 100 ? "selected" : ""}>bis 100 min</option><option value="120" ${z.max === 120 ? "selected" : ""}>bis 2 Std.</option><option value="150" ${z.max === 150 ? "selected" : ""}>bis 2,5 Std.</option></select></div>
      <div class="zufall-buehne" id="buehne"><div class="plakat">${e && e.poster ? `<img src="${bild(e.poster, "w342")}" alt="">` : `<div class="ohne">${e ? esc(e.titel) : "?"}</div>`}</div></div>
      <div class="zufall-ergebnis" id="ergebnis">${e ? ergebnisHTML(e) : ""}</div>
      <button class="btn primary wuerfel" id="wuerfeln" ${kand.length ? "" : "disabled"}>${ICON.zufall} ${e ? "Nochmal würfeln" : "Würfeln"}</button>`;
    view.querySelectorAll(".chip[data-q]").forEach(c => c.onclick = () => { z.quelle = c.dataset.q; renderZufall(); });
    view.querySelectorAll(".chip[data-g]").forEach(c => c.onclick = () => { const g = c.dataset.g; if (S.genre.zufall.has(g)) S.genre.zufall.delete(g); else S.genre.zufall.add(g); renderZufall(); });
    $("#max").onchange = ev => { z.max = parseInt(ev.target.value) || 0; renderZufall(); };
    $("#wuerfeln").onclick = wuerfeln;
    const d = $("#details-zufall"); if (d) d.onclick = () => oeffneFilm(e);
  }
  function ergebnisHTML(f) {
    return `<h2>${esc(f.titel)}</h2><div class="u">${[f.jahr, f.laufzeit ? f.laufzeit + " min" : null, (f.genres || []).slice(0, 2).join(", ")].filter(Boolean).join(" · ")}${f.imdb_rating ? ` · IMDb ${f.imdb_rating}` : ""}</div>
      <div class="reihe" style="justify-content:center"><button class="btn" id="details-zufall">Details & Trailer</button></div>`;
  }
  function wuerfeln() {
    const kand = zufallKandidaten(); if (!kand.length || S.zufall.dreht) return;
    const buehne = $("#buehne"), erg = $("#ergebnis"), btn = $("#wuerfeln");
    S.zufall.dreht = true; buehne.classList.add("dreht"); btn.disabled = true; erg.innerHTML = "";
    const ziel = kand[Math.floor(Math.random() * kand.length)];
    let schritte = Math.min(18, 6 + kand.length * 2), i = 0, warte = 60;
    const tick = () => {
      const f = i < schritte - 1 ? kand[Math.floor(Math.random() * kand.length)] : ziel;
      buehne.innerHTML = `<div class="plakat">${f.poster ? `<img src="${bild(f.poster, "w342")}" alt="">` : `<div class="ohne">${esc(f.titel)}</div>`}</div>`;
      i++;
      if (i < schritte) { warte = Math.round(warte * 1.18); setTimeout(tick, warte); }
      else { S.zufall.dreht = false; S.zufall.ergebnis = ziel; buehne.classList.remove("dreht"); erg.innerHTML = ergebnisHTML(ziel); btn.disabled = false; btn.innerHTML = ICON.zufall + " Nochmal würfeln"; $("#details-zufall").onclick = () => oeffneFilm(ziel); }
    };
    tick();
  }

  /* ---------- Für uns (Empfehlungen) ---------- */
  function seeds() {
    const out = [];
    for (const f of S.filme) {
      const s = schnitt(f); let gewicht;
      if (f.status === "gesehen") { if (s == null) gewicht = 1; else if (s >= 8) gewicht = 3; else if (s >= 6) gewicht = 1.5; else continue; }
      else gewicht = 0.8;
      out.push({ tmdb_id: f.tmdb_id, gewicht, titel: f.titel });
    }
    return out;
  }
  async function renderFuerDich() {
    view.innerHTML = `<div class="kopf"><h1>Für uns</h1><p>Vorschläge auf Basis eurer Filme und Bewertungen.</p></div>${schluesselHinweis()}<div id="inhalt"><div class="empty"><span class="lade"></span></div></div>`;
    hinweisBinden();
    if (!S.keys.tmdb) { $("#inhalt").innerHTML = ""; return; }
    const sd = seeds();
    try {
      if (!S.empfehlungen) {
        const r = sd.length ? await Store.film("empfehlungen", { seeds: sd, ausschluss: S.filme.map(f => f.tmdb_id) }) : await Store.film("beliebt");
        S.empfehlungen = { basis: sd.length ? "eure" : "beliebt", filme: r.filme || [] };
      }
    } catch (x) { $("#inhalt").innerHTML = `<div class="empty"><b>Keine Vorschläge</b>${esc(fehlerText(x))}</div>`; return; }
    if (S.tab !== "fuerdich") return;
    const vorhanden = new Set(S.filme.map(f => f.tmdb_id));
    const alle = S.empfehlungen.filme.filter(f => !vorhanden.has(f.tmdb_id));
    const genres = genresVon(alle); const g = S.genre.fuerdich && genres.includes(S.genre.fuerdich) ? S.genre.fuerdich : null;
    const liste = g ? alle.filter(f => f.genres.includes(g)) : alle;
    $("#inhalt").innerHTML = `${S.empfehlungen.basis === "beliebt" ? `<div class="hinweis">Ihr habt noch keine Filme eingetragen – darum erst mal, was gerade beliebt ist. Sobald ihr Filme bewertet, wird es persönlich.</div>` : ""}
      ${genres.length > 1 ? `<div class="chips"><button class="chip" data-g="" aria-pressed="${!g}">Alle</button>${genres.map(x => `<button class="chip" data-g="${esc(x)}" aria-pressed="${g === x}">${esc(x)}</button>`).join("")}</div>` : ""}
      ${liste.length ? `<div class="liste">${liste.map(zeile).join("")}</div>` : `<div class="empty"><b>Nichts gefunden</b>Bewertet ein paar Filme, dann gibt es Vorschläge.</div>`}`;
    view.querySelectorAll(".chip").forEach(c => c.onclick = () => { S.genre.fuerdich = c.dataset.g || null; renderFuerDich(); });
    zeilenBinden(alle);
  }
  function zeile(f) {
    const drin = S.filme.find(x => x.tmdb_id === f.tmdb_id);
    return `<div class="zeile" data-tmdb="${f.tmdb_id}">
      <button class="offen" type="button"><div class="plakat">${f.poster ? `<img src="${bild(f.poster, "w185")}" alt="" loading="lazy">` : `<div class="ohne">${esc(f.titel)}</div>`}</div>
        <div class="inhalt">${f.wegen && f.wegen.length ? `<div class="wegen">Weil ihr „${esc(f.wegen[0])}“ mögt</div>` : ""}<h3>${esc(f.titel)}</h3>
          <div class="u">${[f.jahr, (f.genres || []).slice(0, 2).join(", "), f.tmdb_rating ? "TMDB " + f.tmdb_rating : null].filter(Boolean).join(" · ")}</div><p>${esc(f.beschreibung)}</p>
          <div class="aktionen">${drin ? `<span class="ok">${drin.status === "gesehen" ? "✓ Schon gesehen" : "✓ Auf der Watchlist"}</span>` : `<button class="btn klein primary" data-add="watchlist" type="button">+ Watchlist</button><button class="btn klein" data-add="gesehen" type="button">Schon gesehen</button>`}</div>
        </div></button></div>`;
  }
  function zeilenBinden(quelle) {
    view.querySelectorAll(".zeile").forEach(z => {
      const id = parseInt(z.dataset.tmdb); const f = quelle.find(x => x.tmdb_id === id);
      z.querySelectorAll("[data-add]").forEach(b => b.onclick = ev => { ev.stopPropagation(); hinzufuegen(id, b.dataset.add, b); });
      $(".offen", z).onclick = ev => { if (ev.target.closest("[data-add]")) return; const drin = S.filme.find(x => x.tmdb_id === id); if (drin) oeffneFilm(drin); else vorschau(id, f); };
    });
  }

  /* ---------- Suche ---------- */
  let sucheTimer;
  function renderSuche() {
    view.innerHTML = `<div class="kopf"><h1>Film eintragen</h1><p>Titel suchen, dann auf die Watchlist oder als gesehen eintragen.</p></div>${schluesselHinweis()}
      <div class="suchfeld">${ICON.suche}<input id="q" type="search" placeholder="Filmtitel …" value="${esc(S.suche)}" autocomplete="off" ${S.keys.tmdb ? "" : "disabled"}><button class="leeren" id="leeren" type="button" ${S.suche ? "" : "hidden"}>✕</button></div>
      <div id="inhalt"></div>`;
    hinweisBinden();
    const q = $("#q"); q.oninput = () => { S.suche = q.value; $("#leeren").hidden = !q.value; clearTimeout(sucheTimer); sucheTimer = setTimeout(suchen, 350); };
    $("#leeren").onclick = () => { S.suche = ""; S.ergebnisse = null; renderSuche(); q.focus(); };
    if (S.keys.tmdb && !S.suche) q.focus();
    zeigeErgebnisse();
    if (S.suche && !S.ergebnisse) suchen();
  }
  async function suchen() {
    const q = S.suche.trim(); if (!q) { S.ergebnisse = null; zeigeErgebnisse(); return; }
    $("#inhalt").innerHTML = '<div class="empty"><span class="lade"></span></div>';
    try { const r = await Store.film("suche", { query: q }); if (S.suche.trim() !== q) return; S.ergebnisse = r.filme || []; }
    catch (x) { $("#inhalt").innerHTML = `<div class="empty"><b>Suche fehlgeschlagen</b>${esc(fehlerText(x))}</div>`; return; }
    zeigeErgebnisse();
  }
  function zeigeErgebnisse() {
    const el = $("#inhalt"); if (!el) return;
    if (!S.suche.trim()) { el.innerHTML = `<div class="empty">${S.keys.tmdb ? "Tipp einfach einen Titel ein." : ""}</div>`; return; }
    if (!S.ergebnisse) return;
    el.innerHTML = S.ergebnisse.length ? `<div class="liste">${S.ergebnisse.map(zeile).join("")}</div>` : `<div class="empty"><b>Nichts gefunden</b>Vielleicht anders schreiben oder den Originaltitel probieren.</div>`;
    zeilenBinden(S.ergebnisse);
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
      neu.bewertungen = []; S.filme.unshift(neu); S.empfehlungen = null;
      toast(status === "gesehen" ? "Als gesehen eingetragen" : "Auf die Watchlist gesetzt");
      sheet.innerHTML = ""; render();
      if (status === "gesehen") oeffneFilm(neu);
      return neu;
    } catch (x) { toast(fehlerText(x)); if (btn) { btn.disabled = false; btn.textContent = status === "gesehen" ? "Schon gesehen" : "+ Watchlist"; } }
  }
  function ersetze(neu) { const i = S.filme.findIndex(f => f.id === neu.id); if (i >= 0) { neu.bewertungen = S.filme[i].bewertungen || []; S.filme[i] = neu; } return neu; }
  async function statusSetzen(f, status) {
    try { const neu = ersetze(await Store.filmAendern(f.id, { status, gesehen_am: status === "gesehen" ? (f.gesehen_am || heute()) : null })); S.empfehlungen = null; toast(status === "gesehen" ? "Als gesehen markiert" : "Zurück auf der Watchlist"); render(); oeffneFilm(neu); }
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
    try { await Store.filmLoeschen(f.id); S.filme = S.filme.filter(x => x.id !== f.id); S.empfehlungen = null; sheet.innerHTML = ""; toast("Entfernt"); render(); }
    catch (x) { toast("Löschen fehlgeschlagen: " + x.message); }
  }
  async function bewerten(f, punkte, kommentar) {
    try {
      const b = await Store.bewerten(f.id, S.user.id, punkte, kommentar);
      f.bewertungen = (f.bewertungen || []).filter(x => x.user_id !== S.user.id).concat([b]); S.empfehlungen = null;
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
  const personHTML = (p, unter) => `<div class="person"><div class="foto">${p.bild ? `<img src="${bild(p.bild, "w185")}" alt="" loading="lazy">` : esc((p.name || "?").split(" ").map(x => x[0]).join("").slice(0, 2))}</div><b>${esc(p.name)}</b>${unter ? `<span>${esc(unter)}</span>` : ""}</div>`;
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
      .map(x => `<div><span>${x[0]}</span>${x[1].map(p => esc(p.name)).join(", ")}</div>`).join("");
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
    p.innerHTML = `<button class="zu" type="button" aria-label="Schließen">✕</button>${detailHTML(d, false)}`; $(".zu", p).onclick = schliessen; trailerBinden(d);
    $("#aktionen", p).innerHTML = `<div class="status-reihe"><button class="btn primary" data-add="watchlist" type="button">+ Watchlist</button><button class="btn" data-add="gesehen" type="button">Schon gesehen</button></div>`;
    p.querySelectorAll("[data-add]").forEach(b => b.onclick = () => hinzufuegen(tmdb_id, b.dataset.add, b));
  }
  function oeffneFilm(f) {
    const p = panel(detailHTML(f, true)); trailerBinden(f);
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
        <textarea id="kommentar" placeholder="Kurzer Kommentar (optional)">${esc(meine ? meine.kommentar || "" : "")}</textarea>
        <div class="reihe" style="margin-top:8px;justify-content:flex-end"><button class="btn klein" id="kommentar-speichern" type="button">Kommentar speichern</button></div></div>
      ${andere.map(b => `<div class="bewertung-box"><div class="wer"><span>${esc(nameVon(b.user_id))}</span><b>${pkt(b.punkte)}/10</b></div>${b.kommentar ? `<div class="kommentar">„${esc(b.kommentar)}“</div>` : ""}</div>`).join("")}
      ${S.profile.filter(p => p.id !== S.user.id && !andere.some(b => b.user_id === p.id)).map(p => `<div class="bewertung-box"><div class="wer"><span>${esc(p.name)}</span><span style="color:var(--fg3)">hat noch nicht bewertet</span></div></div>`).join("")}`;
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
      try { await Store.schluesselSetzen(k, v); S.keys[k] = true; S.empfehlungen = null; toast("Gespeichert"); einstellungen(); render(); }
      catch (x) { toast("Fehler: " + x.message); b.disabled = false; }
    });
    $("#abmelden", p).onclick = async () => { await Store.abmelden(); S.filme = []; S.empfehlungen = null; zeigeLogin(); };
  }

  start();
})();
