/* Filmabend – Serien. Eigener Tab mit Watchlist, Status, Bewertungen für Serie / Staffel / Folge, Heatmap und Rangliste.
   Nutzt die gemeinsamen Hilfen aus app.js über window.FA. */
window.Serien = (function () {
  const Z = { ansicht: "watchlist", rang: { wer: "beide", ebene: "serien" }, suche: "", ergebnisse: null, start: null, offen: {}, heat: "tmdb", sort: "neu" };
  let sucheTimer;
  const F = () => window.FA;
  const STATUS = [["watchlist", "Watchlist"], ["laufend", "Dabei"], ["gesehen", "Durch"]];
  const statusText = st => (STATUS.find(x => x[0] === st) || [])[1] || st;

  /* ---------- Bewertungs-Hilfen ---------- */
  const bew = (s, uid, st, fo) => (s.bewertungen || []).find(b => b.user_id === uid && b.staffel === (st || 0) && b.folge === (fo || 0));
  const alleBew = (s, st, fo) => (s.bewertungen || []).filter(b => b.staffel === (st || 0) && b.folge === (fo || 0));
  const schnitt = (s, st, fo) => { const l = alleBew(s, st, fo); return l.length ? l.reduce((a, b) => a + Number(b.punkte), 0) / l.length : null; };
  const wertFuer = (s, st, fo) => Z.rang.wer === "beide" ? schnitt(s, st, fo) : (bew(s, Z.rang.wer, st, fo) || {}).punkte;
  const gemeinsam = s => (s.bewertungen || []).some(b => F().mitTokens(b).some(x => x.startsWith("@") && x.slice(1) !== b.user_id));
  function bekannteNamen() {
    const set = new Set(F().bekannteNamen());
    (F().S.serien || []).forEach(s => (s.bewertungen || []).forEach(b => F().mitTokens(b).forEach(x => { if (x !== "allein" && !x.startsWith("@")) set.add(x); })));
    return [...set].sort((a, b) => a.localeCompare(b, "de"));
  }

  /* ---------- Hauptansicht ---------- */
  function render() {
    const { S, esc, $, view, schluesselHinweis, hinweisBinden } = F();
    const serien = S.serien || [];
    const a = Z.ansicht;
    view.innerHTML = `<div class="kopf mit-knopf"><div><h1>Serien</h1><p>${serien.length ? `${serien.length} ${serien.length === 1 ? "Serie" : "Serien"} eingetragen` : "Eure Serien, getrennt von den Filmen."}</p></div>
        <button class="btn klein primary" id="serie-neu" type="button" ${S.keys.tmdb ? "" : "disabled"}>+ Serie</button></div>
      ${schluesselHinweis()}
      <div class="umschalter vier">${STATUS.map(x => `<button data-a="${x[0]}" aria-pressed="${a === x[0]}" type="button">${x[1]}</button>`).join("")}<button data-a="rangliste" aria-pressed="${a === "rangliste"}" type="button">Rangliste</button></div>
      <div id="serien-inhalt"></div>`;
    hinweisBinden();
    $("#serie-neu").onclick = sucheOeffnen;
    view.querySelectorAll(".umschalter button").forEach(b => b.onclick = () => { Z.ansicht = b.dataset.a; render(); });
    if (a === "rangliste") renderRangliste(); else renderStatus(a);
  }
  function renderStatus(status) {
    const { S, esc, $, view, bild, pkt, kurz } = F();
    const liste = (S.serien || []).filter(s => s.status === status);
    const opts = [["neu", "Zuletzt eingetragen"], ["titel", "Titel"], ["wertung", "Unsere Wertung"], ["imdb", "IMDb-Wertung"], ["jahr", "Jahr"]];
    const l = [...liste];
    if (Z.sort === "titel") l.sort((a, b) => a.titel.localeCompare(b.titel, "de"));
    else if (Z.sort === "wertung") l.sort((a, b) => (schnitt(b) || 0) - (schnitt(a) || 0));
    else if (Z.sort === "imdb") l.sort((a, b) => (b.imdb_rating || 0) - (a.imdb_rating || 0));
    else if (Z.sort === "jahr") l.sort((a, b) => (b.jahr || 0) - (a.jahr || 0));
    const leer = { watchlist: ["Noch keine Serie auf der Watchlist", "Über „+ Serie“ suchen und eintragen."], laufend: ["Gerade keine Serie am Laufen", "Serien, die ihr gerade schaut, landen hier."], gesehen: ["Noch keine Serie durch", "Fertig geschaute Serien landen hier – mit Bewertung."] }[status];
    $("#serien-inhalt").innerHTML = `${liste.length ? `<div class="werkzeug"><span>${liste.length} ${liste.length === 1 ? "Serie" : "Serien"}</span><select id="ssort">${opts.map(o => `<option value="${o[0]}" ${Z.sort === o[0] ? "selected" : ""}>${o[1]}</option>`).join("")}</select></div>` : ""}
      ${l.length ? `<div class="raster">${l.map(karte).join("")}</div>` : `<div class="empty"><b>${leer[0]}</b>${leer[1]}</div>`}`;
    const sel = $("#ssort"); if (sel) sel.onchange = () => { Z.sort = sel.value; renderStatus(status); };
    view.querySelectorAll(".karte[data-sid]").forEach(k => k.onclick = () => { const s = S.serien.find(x => x.id === k.dataset.sid); if (s) oeffneSerie(s); });
  }
  function karte(s) {
    const { esc, bild, pkt, kurz } = F();
    const eigene = alleBew(s).map(b => `<span>${esc(kurz(b.user_id))} ${pkt(b.punkte)}</span>`).join("");
    return `<button class="karte" data-sid="${s.id}" type="button">
      <div class="plakat">${s.poster ? `<img src="${bild(s.poster, "w342")}" alt="" loading="lazy">` : `<div class="ohne">${esc(s.titel)}</div>`}
        ${s.imdb_rating ? `<span class="eck">★ ${s.imdb_rating}</span>` : s.tmdb_rating ? `<span class="eck">★ ${s.tmdb_rating}</span>` : ""}
        ${eigene ? `<div class="eigene">${eigene}</div>` : ""}</div>
      <div class="t">${esc(s.titel)}</div><div class="u">${s.jahr || ""}${s.anzahl_staffeln ? ` · ${s.anzahl_staffeln} St.` : ""}</div></button>`;
  }

  /* ---------- Rangliste: Serien, Staffeln, Folgen ---------- */
  function renderRangliste() {
    const { S, esc, $, view, bild, pkt, nameVon } = F();
    const r = Z.rang; if (r.wer !== "beide" && !S.profile.some(p => p.id === r.wer)) r.wer = "beide";
    const items = [];
    for (const s of S.serien || []) {
      if (r.ebene === "serien") { const w = wertFuer(s); if (w != null) items.push({ s, w, titel: s.titel, unter: [s.jahr, s.anzahl_staffeln ? s.anzahl_staffeln + " Staffeln" : null].filter(Boolean).join(" · "), st: 0, fo: 0 }); }
      else for (const st of s.staffeln || []) {
        if (r.ebene === "staffeln") { const w = wertFuer(s, st.nr); if (w != null) items.push({ s, w, titel: `${s.titel} · ${st.name || "Staffel " + st.nr}`, unter: [st.start ? st.start.slice(0, 4) : null, (st.folgen || []).length + " Folgen"].filter(Boolean).join(" · "), st: st.nr, fo: 0 }); }
        else for (const f of st.folgen || []) { const w = wertFuer(s, st.nr, f.nr); if (w != null) items.push({ s, w, titel: `${s.titel} · S${st.nr}E${f.nr}`, unter: f.titel || "", st: st.nr, fo: f.nr, still: f.still }); }
      }
    }
    items.sort((a, b) => b.w - a.w || a.titel.localeCompare(b.titel, "de"));
    const zeile = (x, i) => {
      const einzel = r.wer === "beide" ? alleBew(x.s, x.st, x.fo).map(b => `<span>${esc(nameVon(b.user_id))} ${pkt(b.punkte)}</span>`).join("") : "";
      return `<li class="rang-zeile${i < 3 ? " top" : ""}" data-sid="${x.s.id}" data-st="${x.st}"><span class="platz">${i + 1}</span>
        <div class="plakat${x.still ? " breit" : ""}">${x.still || x.s.poster ? `<img src="${bild(x.still || x.s.poster, x.still ? "w300" : "w185")}" alt="" loading="lazy">` : `<div class="ohne">${esc(x.s.titel)}</div>`}</div>
        <div class="inhalt"><h3>${esc(x.titel)}</h3><div class="u">${esc(x.unter)}</div>${einzel && alleBew(x.s, x.st, x.fo).length > 1 ? `<div class="einzel">${einzel}</div>` : ""}</div><b class="punkte">${pkt(x.w)}</b></li>`;
    };
    $("#serien-inhalt").innerHTML = `<div class="chips"><button class="chip" data-w="beide" aria-pressed="${r.wer === "beide"}">Zusammen</button>${S.profile.map(p => `<button class="chip" data-w="${p.id}" aria-pressed="${r.wer === p.id}">${esc(p.name)}</button>`).join("")}</div>
      <div class="chips"><button class="chip" data-e="serien" aria-pressed="${r.ebene === "serien"}">Serien</button><button class="chip" data-e="staffeln" aria-pressed="${r.ebene === "staffeln"}">Staffeln</button><button class="chip" data-e="folgen" aria-pressed="${r.ebene === "folgen"}">Folgen</button></div>
      ${items.length ? `<ol class="rang">${items.slice(0, 100).map(zeile).join("")}</ol>` : `<div class="empty"><b>Noch keine Rangliste</b>${r.ebene === "serien" ? "Bewertet eine Serie im Ganzen, dann entsteht hier eure Top-Liste." : r.ebene === "staffeln" ? "Bewertet einzelne Staffeln in der Serienansicht." : "Bewertet einzelne Folgen in der Serienansicht."}</div>`}`;
    view.querySelectorAll(".chip[data-w]").forEach(c => c.onclick = () => { r.wer = c.dataset.w; renderRangliste(); });
    view.querySelectorAll(".chip[data-e]").forEach(c => c.onclick = () => { r.ebene = c.dataset.e; renderRangliste(); });
    view.querySelectorAll(".rang-zeile").forEach(z => z.onclick = () => { const s = S.serien.find(x => x.id === z.dataset.sid); if (!s) return; const st = parseInt(z.dataset.st); if (st) (Z.offen[s.id] = Z.offen[s.id] || new Set()).add(st); oeffneSerie(s); });
  }

  /* ---------- Suche & Hinzufügen ---------- */
  function sucheOeffnen() {
    const { panel, $, esc, ICON, schliessen } = F();
    const p = panel(`<h2>Serie suchen</h2><div class="suchfeld">${ICON.suche}<input id="sq" type="search" placeholder="Serientitel …" value="${esc(Z.suche)}" autocomplete="off"><button class="leeren" id="s-leeren" type="button" ${Z.suche ? "" : "hidden"}>✕</button></div><div id="s-inhalt"></div>`, "klein");
    // Beim Schließen alles vergessen – nächstes Öffnen startet frisch
    const zu = () => { Z.suche = ""; Z.ergebnisse = null; Z.start = null; schliessen(); };
    $(".zu", p).onclick = zu; p.parentElement.onclick = e => { if (e.target === e.currentTarget) zu(); };
    const q = $("#sq", p);
    q.oninput = () => { Z.suche = q.value; $("#s-leeren", p).hidden = !q.value; clearTimeout(sucheTimer); if (!q.value.trim()) { Z.ergebnisse = null; startseite(p); return; } sucheTimer = setTimeout(() => suchen(p), 350); };
    $("#s-leeren", p).onclick = () => { Z.suche = ""; Z.ergebnisse = null; q.value = ""; $("#s-leeren", p).hidden = true; startseite(p); q.focus(); };
    q.focus();
    if (Z.suche.trim()) { if (Z.ergebnisse) zeigeErgebnisse(p); else suchen(p); } else startseite(p);
  }
  // Startseite der Suche: passende Vorschläge, Bestbewertete (zum schnellen „Durch“-Eintragen), Beliebte
  async function startseite(p) {
    const { $, S, esc, fehlerText } = F(); const el = $("#s-inhalt", p); if (!el) return;
    if (!Z.start) {
      el.innerHTML = '<div class="empty"><span class="lade"></span></div>';
      try { Z.start = await Store.film("serie_start", { seeds: seeds("alle"), quer: F().filmSeeds("alle").filter(x => x.gewicht >= 1.5), ausschluss: (S.serien || []).map(s => s.tmdb_id) }); }
      catch (x) { el.innerHTML = `<div class="empty"><b>Vorschläge nicht geladen</b>${esc(fehlerText(x))}</div>`; return; }
    }
    if (Z.suche.trim() || !F().sheet.contains(p)) return;
    const gesehen = new Set(); const nurNeu = l => (l || []).filter(x => !gesehen.has(x.tmdb_id) && gesehen.add(x.tmdb_id));
    const block = (titel, hinweis, liste) => liste.length ? `<h3 class="sheet-h3">${titel}</h3>${hinweis ? `<p class="sheet-hinweis">${hinweis}</p>` : ""}<div class="liste">${liste.map(zeileHTML).join("")}</div>` : "";
    el.innerHTML = block("Passend zu dem, was ihr feiert", "", nurNeu(Z.start.passend))
      + block("Schon gesehen? Die Bestbewerteten", "Zum schnellen Eintragen: „Durch“ antippen, wenn ihr sie kennt.", nurNeu(Z.start.top))
      + block("Gerade beliebt", "", nurNeu(Z.start.beliebt))
      || `<div class="empty">Tipp einen Serientitel ein.</div>`;
    zeilenBinden(el, { bleiben: true });
  }
  async function suchen(p) {
    const { $, esc, fehlerText } = F();
    const q = Z.suche.trim(); const el = $("#s-inhalt", p); if (!el) return;
    if (!q) { Z.ergebnisse = null; el.innerHTML = ""; return; }
    el.innerHTML = '<div class="empty"><span class="lade"></span></div>';
    try { const r = await Store.film("serie_suche", { query: q }); if (Z.suche.trim() !== q) return; Z.ergebnisse = r.serien || []; }
    catch (x) { el.innerHTML = `<div class="empty"><b>Suche fehlgeschlagen</b>${esc(fehlerText(x))}</div>`; return; }
    zeigeErgebnisse(p);
  }
  function zeileHTML(r) {
    const { S, esc, bild } = F();
    const drin = (S.serien || []).find(x => x.tmdb_id === r.tmdb_id);
    const u = [r.jahr, r.rolle || null, (r.genres || []).slice(0, 2).join(", "), r.tmdb_rating ? "TMDB " + r.tmdb_rating : null].filter(Boolean).map(esc).join(" · ");
    return `<div class="zeile" data-stmdb="${r.tmdb_id}"><div class="offen" role="button" tabindex="0"><div class="plakat">${r.poster ? `<img src="${bild(r.poster, "w185")}" alt="" loading="lazy">` : `<div class="ohne">${esc(r.titel)}</div>`}</div>
      <div class="inhalt">${r.wegen && r.wegen.length ? `<div class="wegen">${F().wegenText(r.wegen[0])}</div>` : ""}<h3>${esc(r.titel)}</h3><div class="u">${u}</div><p>${esc(r.beschreibung)}</p>
      <div class="aktionen">${drin ? `<span class="ok">✓ ${statusText(drin.status)}</span>` : STATUS.map(x => `<button class="btn klein${x[0] === "watchlist" ? " primary" : ""}" data-add="${x[0]}" type="button">${x[0] === "watchlist" ? "+ Watchlist" : x[1]}</button>`).join("")}</div></div></div></div>`;
  }
  // opt.bleiben: Suchblatt bleibt nach dem Eintragen offen; Vorschau bekommt einen Zurück-Knopf
  function zeilenBinden(el, opt = {}) {
    const { $, S } = F();
    el.querySelectorAll(".zeile[data-stmdb]").forEach(z => {
      const id = parseInt(z.dataset.stmdb);
      z.querySelectorAll("[data-add]").forEach(b => b.onclick = ev => { ev.stopPropagation(); hinzufuegen(id, b.dataset.add, b, opt); });
      $(".offen", z).onclick = ev => { if (ev.target.closest("[data-add]")) return; const drin = (S.serien || []).find(x => x.tmdb_id === id); if (drin) oeffneSerie(drin, opt); else vorschau(id, opt); };
    });
  }
  function zeigeErgebnisse(p) {
    const { $ } = F();
    const el = $("#s-inhalt", p); if (!el) return;
    el.innerHTML = Z.ergebnisse.length ? `<div class="liste">${Z.ergebnisse.map(zeileHTML).join("")}</div>` : `<div class="empty"><b>Nichts gefunden</b>Vielleicht den Originaltitel probieren.</div>`;
    zeilenBinden(el, { bleiben: true });
  }
  // Nach dem Eintragen aus dem Suchblatt: Liste an Ort und Stelle auffrischen (✓ statt Knöpfe)
  function suchblattAuffrischen() {
    const p = document.querySelector("#sheet .panel");
    if (p && p.querySelector("#s-inhalt")) { Z.suche.trim() ? zeigeErgebnisse(p) : startseite(p); return true; }
    return false;
  }
  const zurueckKnopf = () => `<button class="zurueck-sheet" id="s-zurueck" type="button">← Zur Suche</button>`;
  // Saatgut für Serien-Empfehlungen: wie bei Filmen, Gewicht nach eurer Gesamtwertung
  function seeds(basis) {
    const { S } = F(); const out = [];
    for (const s of S.serien || []) {
      const meine = bew(s, S.user.id);
      if (basis === "gemeinsam" && !gemeinsam(s)) continue;
      if (basis === "meine" && !(meine || s.hinzugefuegt_von === S.user.id)) continue;
      const w = basis === "meine" && meine ? meine.punkte : schnitt(s); let gewicht;
      if (s.status === "watchlist") gewicht = 0.8;
      else if (w == null) gewicht = 1.2; else if (w >= 8) gewicht = 3; else if (w >= 6) gewicht = 1.5; else continue;
      out.push({ tmdb_id: s.tmdb_id, gewicht, titel: s.titel });
    }
    return out;
  }
  async function hinzufuegen(tmdb_id, status, btn, opt = {}) {
    const { S, toast, fehlerText, schliessen, heute } = F();
    if ((S.serien || []).some(s => s.tmdb_id === tmdb_id)) { toast("Ist schon eingetragen."); return; }
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="lade"></span>'; }
    try {
      const { serie } = await Store.film("serie_details", { tmdb_id }); delete serie.omdb_aktiv;
      const neu = await Store.serieAnlegen({ ...serie, status, hinzugefuegt_von: S.user.id });
      neu.bewertungen = []; S.serien.unshift(neu);
      toast(status === "watchlist" ? "Auf die Serien-Watchlist gesetzt" : status === "laufend" ? "Als „Dabei“ eingetragen" : "Als „Durch“ eingetragen");
      S.empfVeraltet = true;
      if (S.tab === "serien") Z.ansicht = status;
      F().render();
      if (opt.bleiben) { if (!suchblattAuffrischen()) sucheOeffnen(); return neu; } // zurück zur Suchliste, Blatt bleibt offen
      if (document.querySelector("#sheet .panel")) schliessen();
    } catch (x) { toast(fehlerText(x)); if (btn) { btn.disabled = false; btn.textContent = statusText(status); } }
  }
  async function vorschau(tmdb_id, opt = {}) {
    const { panel, $, esc, fehlerText, schliessen, trailerBinden, personenBinden } = F();
    const p = panel(`${opt.bleiben ? zurueckKnopf() : ""}<div class="empty"><span class="lade"></span></div>`);
    if (opt.bleiben) $("#s-zurueck", p).onclick = sucheOeffnen;
    let d; try { d = (await Store.film("serie_details", { tmdb_id })).serie; } catch (x) { p.innerHTML = `<button class="zu" type="button">✕</button><div class="empty"><b>Konnte nicht laden</b>${esc(fehlerText(x))}</div>`; $(".zu", p).onclick = schliessen; return; }
    if (!F().sheet.contains(p)) return;
    d.bewertungen = []; d.id = "vorschau";
    p.innerHTML = `<button class="zu" type="button" aria-label="Schließen">✕</button>${opt.bleiben ? zurueckKnopf() : ""}${detailHTML(d, false)}`; $(".zu", p).onclick = schliessen; trailerBinden(d); personenBinden(p); F().angeboteLaden($("#s-angebote", p), d, "serie");
    if (opt.bleiben) $("#s-zurueck", p).onclick = sucheOeffnen;
    $("#s-aktionen", p).innerHTML = `<div class="status-reihe">${STATUS.map(x => `<button class="btn${x[0] === "watchlist" ? " primary" : ""}" data-add="${x[0]}" type="button">${x[0] === "watchlist" ? "+ Watchlist" : x[1]}</button>`).join("")}</div>`;
    p.querySelectorAll("[data-add]").forEach(b => b.onclick = () => hinzufuegen(tmdb_id, b.dataset.add, b, opt));
    staffelnBinden(d, p);
  }

  /* ---------- Detailansicht ---------- */
  function detailHTML(d, gespeichert) {
    const { esc, bild, ICON, personHTML, anbieterHTML, pkt } = F();
    const u = [d.jahr ? (d.ende_jahr && d.ende_jahr !== d.jahr ? `${d.jahr}–${d.ende_jahr}` : d.laeuft ? `seit ${d.jahr}` : d.jahr) : null, d.anzahl_staffeln ? `${d.anzahl_staffeln} ${d.anzahl_staffeln === 1 ? "Staffel" : "Staffeln"}` : null, d.anzahl_folgen ? `${d.anzahl_folgen} Folgen` : null, d.laufzeit ? `~${d.laufzeit} min` : null].filter(Boolean).join(" · ");
    const w = [];
    if (d.imdb_rating) w.push(`<div class="wertung imdb"><small>IMDb</small><b>${d.imdb_rating}</b><span style="color:var(--fg3);font-size:12px">/10</span></div>`);
    if (d.rt_rating != null) w.push(`<div class="wertung rt"><small>Rotten T.</small><b>${d.rt_rating}%</b></div>`);
    if (d.metascore != null) w.push(`<div class="wertung meta"><small>Metacritic</small><b>${d.metascore}</b></div>`);
    if (d.tmdb_rating) w.push(`<div class="wertung"><small>TMDB</small><b>${d.tmdb_rating}</b></div>`);
    const macher = (d.macher || []).length ? `<div class="crew"><div><span>Idee</span>${d.macher.map(p => `<button class="crew-name" type="button" data-pid="${p.id || ""}" data-pname="${esc(p.name)}">${esc(p.name)}</button>`).join(", ")}</div></div>` : "";
    return `<div class="hero" id="hero">${d.hintergrund ? `<img src="${bild(d.hintergrund, "w780")}" alt="">` : d.poster ? `<img src="${bild(d.poster, "w780")}" alt="" style="filter:blur(14px);opacity:.6">` : ""}
        ${d.trailer ? `<button class="play" id="trailer" type="button">${ICON.play} Trailer</button>` : ""}</div>
      <div class="detail">
        <div class="kopfzeile"><div class="plakat">${d.poster ? `<img src="${bild(d.poster, "w342")}" alt="">` : `<div class="ohne">${esc(d.titel)}</div>`}</div>
          <div><h2>${esc(d.titel)}</h2><div class="u">${esc(u)}${d.laeuft ? " · läuft noch" : ""}${d.original_titel && d.original_titel !== d.titel ? `<br>Original: ${esc(d.original_titel)}` : ""}<br>${(d.genres || []).map(esc).join(", ")}</div></div></div>
        ${w.length ? `<div class="wertungen">${w.join("")}</div>` : ""}
        <div id="s-aktionen"></div>
        ${d.beschreibung ? `<h3>Worum geht's</h3><p class="text">${esc(d.beschreibung)}</p>` : ""}
        ${(d.staffeln || []).length ? `<h3>Folgen im Überblick</h3>${heatHTML(d)}` : ""}
        <div id="s-bewertung"></div>
        ${(d.staffeln || []).length ? `<h3>Staffeln & Folgen</h3><div id="staffeln">${(d.staffeln || []).map(st => staffelHTML(d, st, gespeichert)).join("")}</div>` : ""}
        ${(d.schauspieler || []).length ? `<h3>Besetzung</h3><div class="personen">${d.schauspieler.map(p => personHTML(p, p.rolle)).join("")}</div>` : ""}
        ${macher ? `<h3>Hinter der Kamera</h3>${macher}` : ""}
        <h3>Wo schauen</h3><div id="s-angebote"></div>
        <div id="s-unten"></div>
      </div>`;
  }
  // Heatmap wie bei seriesgraph: Zeilen = Staffeln, Zellen = Folgen, Farbe = Wertung
  // Farbstufen: <6 rot, 6–7 orange, 7–8 gelb, 8–9 grün, ab 9 strahlendes Hellblau
  function heatFarbe(r) {
    if (r == null) return "var(--bg3)";
    if (r >= 9) return "#38BDF8"; if (r >= 8) return "#3FAE5A"; if (r >= 7) return "#C9B52E"; if (r >= 6) return "#E08A2E"; if (r >= 5) return "#D9532B"; return "#A8322A";
  }
  function heatHTML(d) {
    const { esc, pkt } = F();
    const maxF = Math.max(1, ...(d.staffeln || []).map(st => (st.folgen || []).length));
    const wert = (st, f) => Z.heat === "tmdb" ? ((f.stimmen || 0) >= 1 ? f.tmdb_rating : null) : schnitt(d, st.nr, f.nr);
    const zeilen = (d.staffeln || []).map(st => `<div class="heat-zeile"><span class="heat-label">S${st.nr}</span>${(st.folgen || []).map(f => { const w = wert(st, f); const zukunft = f.datum && f.datum > new Date().toISOString().slice(0, 10); return `<button class="heat-zelle${zukunft ? " zukunft" : ""}${w != null && w >= 9 ? " top" : ""}" type="button" data-st="${st.nr}" data-fo="${f.nr}" style="background:${heatFarbe(w)}" title="S${st.nr}E${f.nr} ${esc(f.titel || "")}${w != null ? " – " + pkt(w) : ""}">${w != null ? pkt(w) : ""}</button>`; }).join("")}</div>`).join("");
    return `<div class="heat-kopf"><div class="umschalter klein"><button data-h="tmdb" aria-pressed="${Z.heat === "tmdb"}" type="button">TMDB</button><button data-h="uns" aria-pressed="${Z.heat === "uns"}" type="button">Unsere</button></div><small>${maxF > 1 ? "Antippen öffnet die Folge" : ""}</small></div>
      <div class="heat" style="--n:${maxF}">${zeilen}</div>`;
  }
  function staffelHTML(d, st, gespeichert) {
    const { esc, bild, pkt, kurz, nameVon } = F();
    const offen = (Z.offen[d.id] || new Set()).has(st.nr);
    const folgen = st.folgen || [];
    const bewertet = folgen.filter(f => (f.stimmen || 0) > 0 && f.tmdb_rating);
    const tmdbØ = bewertet.length ? bewertet.reduce((a, f) => a + f.tmdb_rating, 0) / bewertet.length : null;
    const eigene = alleBew(d, st.nr).map(b => `<span class="mini">${esc(kurz(b.user_id))} ${pkt(b.punkte)}</span>`).join("");
    const heute = new Date().toISOString().slice(0, 10);
    const folgeHTML = f => {
      const zukunft = f.datum && f.datum > heute;
      const unsere = alleBew(d, st.nr, f.nr).map(b => `<span class="mini">${esc(kurz(b.user_id))} ${pkt(b.punkte)}</span>`).join("");
      return `<div class="folge${zukunft ? " zukunft" : ""}" id="folge-${st.nr}-${f.nr}" data-st="${st.nr}" data-fo="${f.nr}">
        <button class="folge-kopf" type="button"><span class="nr">${f.nr}</span><span class="titel"><b>${esc(f.titel || "Folge " + f.nr)}</b><small>${[f.datum ? (zukunft ? "kommt " : "") + F().datum(f.datum) : null, f.laufzeit ? f.laufzeit + " min" : null, f.tmdb_rating && f.stimmen ? "TMDB " + f.tmdb_rating : null].filter(Boolean).join(" · ")}</small></span><span class="badges">${unsere}</span></button>
        <div class="folge-rater" hidden></div></div>`;
    };
    return `<div class="staffel${offen ? " offen" : ""}" data-st="${st.nr}">
      <button class="staffel-kopf" type="button"><div class="plakat">${st.poster || d.poster ? `<img src="${bild(st.poster || d.poster, "w185")}" alt="" loading="lazy">` : ""}</div>
        <div class="text"><b>${esc(st.name || "Staffel " + st.nr)}</b><small>${[st.start ? st.start.slice(0, 4) : null, folgen.length + " Folgen", tmdbØ ? "TMDB Ø " + pkt(tmdbØ) : null].filter(Boolean).join(" · ")}</small></div>
        <span class="badges">${eigene}</span><span class="pfeil">›</span></button>
      <div class="staffel-inhalt" ${offen ? "" : "hidden"}>
        ${gespeichert ? `<div class="staffel-bewertung"><div class="wer"><span>Staffel bewerten</span><b id="st-punkte-${st.nr}">${(() => { const m = bew(d, F().S.user.id, st.nr); return m ? pkt(m.punkte) + "/10" : "noch offen"; })()}</b></div>${raterHTML(bew(d, F().S.user.id, st.nr))}</div>` : ""}
        <div class="folgen">${folgen.map(folgeHTML).join("")}</div>
      </div></div>`;
  }
  function raterHTML(meine) {
    const ganz = meine ? Math.floor(meine.punkte) : null, dez = meine ? Math.round((meine.punkte - ganz) * 10) : 0;
    return `<div class="rater"><div class="sterne">${Array.from({ length: 10 }, (_, i) => i + 1).map(n => `<button type="button" data-g="${n}" aria-pressed="${ganz === n}" class="${ganz != null && n < ganz ? "unter" : ""}">${n}</button>`).join("")}</div>
      <div class="sterne dez">${Array.from({ length: 10 }, (_, i) => i).map(n => `<button type="button" data-d="${n}" aria-pressed="${meine != null && dez === n}" ${ganz == null || ganz === 10 ? "disabled" : ""}>,${n}</button>`).join("")}${meine ? `<button type="button" class="weg" data-weg="1" title="Bewertung entfernen">✕</button>` : ""}</div></div>`;
  }
  // Bindet einen Rater (ganze Zahl + Nachkommastelle) an eine Ebene (Serie/Staffel/Folge)
  function raterBinden(el, s, st, fo, nach) {
    const { S, pkt, toast } = F();
    const speichere = async punkte => {
      punkte = Math.min(10, Math.max(1, Math.round(punkte * 10) / 10));
      const alt = bew(s, S.user.id, st, fo);
      try {
        const b = await Store.serieBewerten(s.id, S.user.id, st || 0, fo || 0, punkte, alt ? alt.kommentar : null, alt ? alt.mit : []);
        s.bewertungen = (s.bewertungen || []).filter(x => !(x.user_id === S.user.id && x.staffel === (st || 0) && x.folge === (fo || 0))).concat([b]);
        toast("Bewertet: " + pkt(punkte) + "/10"); nach && nach();
      } catch (x) { toast("Bewertung nicht gespeichert: " + x.message); }
    };
    el.querySelectorAll("[data-g]").forEach(b => b.onclick = () => { const m = bew(s, S.user.id, st, fo); const g = parseInt(b.dataset.g); const d = m && Math.floor(m.punkte) === g ? Math.round((m.punkte - g) * 10) : 0; speichere(g === 10 ? 10 : g + d / 10); });
    el.querySelectorAll("[data-d]").forEach(b => b.onclick = () => { const m = bew(s, S.user.id, st, fo); if (!m) { toast("Erst die ganze Zahl wählen."); return; } speichere(Math.floor(m.punkte) + parseInt(b.dataset.d) / 10); });
    const weg = el.querySelector("[data-weg]"); if (weg) weg.onclick = async () => {
      try { await Store.serieBewertungLoeschen(s.id, S.user.id, st || 0, fo || 0); s.bewertungen = (s.bewertungen || []).filter(x => !(x.user_id === S.user.id && x.staffel === (st || 0) && x.folge === (fo || 0))); toast("Bewertung entfernt"); nach && nach(); }
      catch (x) { toast("Nicht entfernt: " + x.message); }
    };
  }
  function serienBewertungHTML(s) {
    const { S, esc, pkt, ich, nameVon, mitText, andereProfile, mitTokens } = F();
    const meine = bew(s, S.user.id);
    const andere = alleBew(s).filter(b => b.user_id !== S.user.id);
    const m = mitTokens(meine);
    const chip = (tok, text) => `<button class="chip" type="button" data-m="${esc(tok)}" aria-pressed="${m.includes(tok)}">${esc(text)}</button>`;
    return `<h3>Unsere Bewertung der Serie</h3><div class="bewertung-box"><div class="wer"><span>${esc((ich() || {}).name || "Ich")}</span><b id="s-meine">${meine ? pkt(meine.punkte) + "/10" : "noch offen"}</b></div>
        <div id="s-rater">${raterHTML(meine)}</div>
        <div class="mit"><span>Geschaut</span><div class="chips" id="s-mit">${chip("allein", "Allein")}${andereProfile().map(p => chip("@" + p.id, "Mit " + p.name)).join("")}${bekannteNamen().map(n => chip(n, "Mit " + n)).join("")}<button class="chip plus" type="button" data-m="+">+ Name</button></div></div>
        <textarea id="s-kommentar" placeholder="Kurzer Kommentar (optional)">${esc(meine ? meine.kommentar || "" : "")}</textarea>
        <div class="reihe" style="margin-top:8px;justify-content:flex-end"><button class="btn klein" id="s-kommentar-speichern" type="button">Kommentar speichern</button></div></div>
      ${andere.map(b => `<div class="bewertung-box"><div class="wer"><span>${esc(nameVon(b.user_id))}</span><b>${pkt(b.punkte)}/10</b></div>${mitText(b) ? `<div class="mit-info">${esc(mitText(b))}</div>` : ""}${b.kommentar ? `<div class="kommentar">„${esc(b.kommentar)}“</div>` : ""}</div>`).join("")}
      ${S.profile.filter(p => p.id !== S.user.id && !andere.some(b => b.user_id === p.id)).map(p => `<div class="bewertung-box"><div class="wer"><span>${esc(p.name)}</span><span style="color:var(--fg3)">hat noch nicht bewertet</span></div></div>`).join("")}`;
  }
  function oeffneSerie(s, opt = {}) {
    const { panel, $, esc, datum, nameVon, toast, trailerBinden, personenBinden, S } = F();
    const p = panel(`${opt.bleiben ? zurueckKnopf() : ""}${detailHTML(s, true)}`); trailerBinden(s); personenBinden(p); F().angeboteLaden($("#s-angebote", p), s, "serie");
    if (opt.bleiben) $("#s-zurueck", p).onclick = sucheOeffnen;
    const scrollMerken = p.scrollTop;
    // Status
    $("#s-aktionen", p).innerHTML = `<div class="status-reihe status-serie">${STATUS.map(x => `<button class="btn${s.status === x[0] ? " primary" : ""}" data-st="${x[0]}" type="button">${x[1]}</button>`).join("")}</div>`;
    p.querySelectorAll("[data-st].btn").forEach(b => b.onclick = async () => {
      if (b.dataset.st === s.status) return;
      try { const neu = await Store.serieAendern(s.id, { status: b.dataset.st }); Object.assign(s, neu, { bewertungen: s.bewertungen }); toast("Status: " + statusText(s.status)); render(); oeffneSerie(s, opt); }
      catch (x) { toast("Speichern fehlgeschlagen: " + x.message); }
    });
    // Serienbewertung
    const neuZeichnen = () => { const top = p.scrollTop; render(); oeffneSerie(s, opt); const np = $(".panel", F().sheet); if (np) np.scrollTop = top; };
    $("#s-bewertung", p).innerHTML = serienBewertungHTML(s);
    raterBinden($("#s-rater", p), s, 0, 0, neuZeichnen);
    const mitBinden = () => $("#s-mit", p).querySelectorAll(".chip").forEach(c => c.onclick = async () => {
      const meine = bew(s, S.user.id); if (!meine) { toast("Erst Punkte vergeben."); return; }
      let m = F().mitTokens(meine).slice(); const tok = c.dataset.m;
      if (tok === "+") { const name = (prompt("Mit wem geschaut? (Name)") || "").trim().replace(/^mit\s+/i, ""); if (!name) return; if (!m.includes(name)) m.push(name); m = m.filter(x => x !== "allein"); }
      else if (tok === "allein") m = m.includes("allein") ? [] : ["allein"];
      else { m = m.includes(tok) ? m.filter(x => x !== tok) : m.concat([tok]); m = m.filter(x => x !== "allein"); }
      try { const b = await Store.serieBewerten(s.id, S.user.id, 0, 0, meine.punkte, $("#s-kommentar", p).value.trim(), m); s.bewertungen = s.bewertungen.filter(x => x !== meine).concat([b]); toast(m.length ? "Gespeichert: " + F().mitText({ mit: m }) : "Angabe entfernt"); neuZeichnen(); }
      catch (x) { toast("Nicht gespeichert: " + x.message); }
    });
    mitBinden();
    $("#s-kommentar-speichern", p).onclick = async () => {
      const meine = bew(s, S.user.id); if (!meine) { toast("Erst Punkte vergeben."); return; }
      try { const b = await Store.serieBewerten(s.id, S.user.id, 0, 0, meine.punkte, $("#s-kommentar", p).value.trim(), meine.mit); s.bewertungen = s.bewertungen.filter(x => x !== meine).concat([b]); toast("Kommentar gespeichert"); } catch (x) { toast("Nicht gespeichert: " + x.message); }
    };
    staffelnBinden(s, p, neuZeichnen);
    $("#s-unten", p).innerHTML = `<div class="meta-zeile">Eingetragen${s.hinzugefuegt_von ? " von " + esc(nameVon(s.hinzugefuegt_von)) : ""} am ${datum(s.erstellt_am)}${s.imdb_id ? ` · <a href="https://www.imdb.com/title/${esc(s.imdb_id)}/" target="_blank" rel="noopener">IMDb</a>` : ""} · <a href="https://www.themoviedb.org/tv/${s.tmdb_id}" target="_blank" rel="noopener">TMDB</a></div>
      <div class="reihe" style="margin-top:14px"><button class="btn klein" id="s-neu" type="button">Daten & Folgen aktualisieren</button><button class="btn klein ghost danger" id="s-weg" type="button">Entfernen</button></div>`;
    $("#s-neu", p).onclick = async ev => {
      const b = ev.currentTarget; b.disabled = true; b.innerHTML = '<span class="lade"></span> Lädt …';
      try { const { serie } = await Store.film("serie_details", { tmdb_id: s.tmdb_id }); delete serie.omdb_aktiv; const neu = await Store.serieAendern(s.id, serie); Object.assign(s, neu, { bewertungen: s.bewertungen }); toast("Aktualisiert"); neuZeichnen(); }
      catch (x) { toast(F().fehlerText(x)); b.disabled = false; b.textContent = "Daten & Folgen aktualisieren"; }
    };
    $("#s-weg", p).onclick = async () => {
      if (!confirm(`„${s.titel}“ wirklich entfernen? Auch alle Bewertungen dazu gehen verloren.`)) return;
      try { await Store.serieLoeschen(s.id); S.serien = S.serien.filter(x => x.id !== s.id); F().schliessen(); toast("Entfernt"); render(); } catch (x) { toast("Löschen fehlgeschlagen: " + x.message); }
    };
    if (scrollMerken) p.scrollTop = scrollMerken;
  }
  function staffelnBinden(s, p, nach) {
    const { $, pkt, S } = F();
    const offen = Z.offen[s.id] = Z.offen[s.id] || new Set();
    p.querySelectorAll(".heat-kopf [data-h]").forEach(b => b.onclick = () => { Z.heat = b.dataset.h; nach ? nach() : null; });
    p.querySelectorAll(".heat-zelle").forEach(z => z.onclick = () => {
      const st = parseInt(z.dataset.st), fo = parseInt(z.dataset.fo); offen.add(st);
      const block = p.querySelector(`.staffel[data-st="${st}"]`); if (block) { block.classList.add("offen"); $(".staffel-inhalt", block).hidden = false; }
      const f = $(`#folge-${st}-${fo}`, p); if (f) { f.scrollIntoView({ behavior: "smooth", block: "center" }); folgeOeffnen(f, s, st, fo, nach); }
    });
    p.querySelectorAll(".staffel").forEach(block => {
      const st = parseInt(block.dataset.st);
      $(".staffel-kopf", block).onclick = () => { const inh = $(".staffel-inhalt", block); inh.hidden = !inh.hidden; block.classList.toggle("offen", !inh.hidden); if (inh.hidden) offen.delete(st); else offen.add(st); };
      const sr = $(".staffel-bewertung .rater", block); if (sr) raterBinden(sr, s, st, 0, nach);
      block.querySelectorAll(".folge").forEach(f => { $(".folge-kopf", f).onclick = () => folgeOeffnen(f, s, st, parseInt(f.dataset.fo), nach, true); });
    });
  }
  function folgeOeffnen(f, s, st, fo, nach, umschalten) {
    const { $, S, pkt, nameVon, esc } = F();
    if (s.id === "vorschau") return;
    const r = $(".folge-rater", f);
    if (umschalten && !r.hidden) { r.hidden = true; return; }
    const andere = alleBew(s, st, fo).filter(b => b.user_id !== S.user.id);
    r.innerHTML = `${raterHTML(bew(s, S.user.id, st, fo))}${andere.length ? `<div class="andere">${andere.map(b => `${esc(nameVon(b.user_id))}: <b>${pkt(b.punkte)}</b>`).join(" · ")}</div>` : ""}`;
    r.hidden = false;
    raterBinden(r, s, st, fo, () => { Z.offen[s.id].add(st); nach && nach(); setTimeout(() => { const nf = document.getElementById(`folge-${st}-${fo}`); if (nf) { nf.scrollIntoView({ block: "center" }); folgeOeffnen(nf, s, st, fo, nach); } }, 0); });
  }

  return { render, oeffneSerie, gemeinsam, seeds, zeileHTML, zeilenBinden };
})();
