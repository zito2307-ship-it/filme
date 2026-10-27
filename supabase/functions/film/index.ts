// Filmabend – Edge Function "film"
// Holt Filmdaten von TMDB (Suche, Details, Besetzung, Trailer, Anbieter, Empfehlungen)
// IMDb-/Rotten-Tomatoes-Wertungen von OMDb und die Letterboxd-Wertung von der öffentlichen Filmseite. Die API-Schlüssel liegen in der
// Tabelle "einstellungen" (nur per Service Role lesbar) oder als Secrets TMDB_KEY / OMDB_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const TMDB = "https://api.themoviedb.org/3";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

type Schluessel = { tmdb?: string; omdb?: string };
let genreCache: Record<number, string> | null = null;

function antwort(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function schluessel(): Promise<Schluessel> {
  const k: Schluessel = { tmdb: Deno.env.get("TMDB_KEY") || undefined, omdb: Deno.env.get("OMDB_KEY") || undefined };
  const { data } = await admin.from("einstellungen").select("schluessel,wert");
  for (const z of data || []) {
    if (z.schluessel === "tmdb" && z.wert) k.tmdb = z.wert;
    if (z.schluessel === "omdb" && z.wert) k.omdb = z.wert;
  }
  return k;
}

async function tmdb(pfad: string, params: Record<string, string>, key: string) {
  const u = new URL(TMDB + pfad);
  for (const [a, b] of Object.entries(params)) u.searchParams.set(a, b);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (key.startsWith("eyJ")) headers["Authorization"] = "Bearer " + key; // v4 Lese-Token
  else u.searchParams.set("api_key", key); // v3 API-Key
  const r = await fetch(u, { headers });
  if (r.status === 401) throw new Error("tmdb_schluessel_ungueltig");
  if (!r.ok) throw new Error("tmdb_" + r.status);
  return r.json();
}

async function genres(key: string) {
  if (genreCache) return genreCache;
  const d = await tmdb("/genre/movie/list", { language: "de-DE" }, key);
  genreCache = Object.fromEntries((d.genres || []).map((g: { id: number; name: string }) => [g.id, g.name]));
  return genreCache!;
}

function jahr(datum?: string) { const j = parseInt((datum || "").slice(0, 4)); return isNaN(j) ? null : j; }

async function kompakt(liste: any[], key: string) {
  const g = await genres(key);
  return liste.filter(m => m && m.id && m.title).map(m => ({
    tmdb_id: m.id,
    titel: m.title,
    original_titel: m.original_title,
    jahr: jahr(m.release_date),
    poster: m.poster_path || null,
    beschreibung: m.overview || "",
    tmdb_rating: m.vote_average ? Math.round(m.vote_average * 10) / 10 : null,
    stimmen: m.vote_count || 0,
    genres: (m.genre_ids || []).map((id: number) => g[id]).filter(Boolean),
  }));
}

const ABTEILUNG: Record<string, string> = { Acting: "Schauspiel", Directing: "Regie", Writing: "Drehbuch", Production: "Produktion", Sound: "Musik", Camera: "Kamera", Editing: "Schnitt", Art: "Ausstattung" };
const JOB: Record<string, string> = { Director: "Regie", Screenplay: "Drehbuch", Writer: "Drehbuch", Story: "Drehbuch", Novel: "Vorlage", Producer: "Produktion", "Executive Producer": "Produktion", "Original Music Composer": "Musik", "Director of Photography": "Kamera", Editor: "Schnitt" };

async function personenSuche(q: string, key: string) {
  const d = await tmdb("/search/person", { query: q, language: "de-DE", include_adult: "false", page: "1" }, key).catch(() => ({ results: [] }));
  return (d.results || []).filter((p: any) => p.id && p.name && (p.popularity || 0) > 0.5).slice(0, 6).map((p: any) => ({
    id: p.id, name: p.name, bild: p.profile_path || null, abteilung: ABTEILUNG[p.known_for_department] || p.known_for_department || "",
    bekannt_fuer: (p.known_for || []).map((m: any) => m.title || m.name).filter(Boolean).slice(0, 3),
  }));
}

// Alle Filme einer Person (Besetzung + wichtige Crew-Jobs), nach Beliebtheit sortiert
async function personFilme(id: number | null, name: string | null, key: string) {
  if (!id && name) { const l = await personenSuche(name, key); if (!l.length) return null; id = l[0].id; }
  if (!id) return null;
  const [p, c, tv] = await Promise.all([tmdb(`/person/${id}`, { language: "de-DE" }, key), tmdb(`/person/${id}/movie_credits`, { language: "de-DE" }, key), tmdb(`/person/${id}/tv_credits`, { language: "de-DE" }, key).catch(() => ({ cast: [], crew: [] }))]);
  const rollen = new Map<number, { film: any; rollen: string[] }>();
  const merk = (m: any, rolle: string) => { if (!m || !m.id || !m.title) return; const e = rollen.get(m.id) || { film: m, rollen: [] }; if (rolle && !e.rollen.includes(rolle)) e.rollen.push(rolle); rollen.set(m.id, e); };
  for (const m of c.cast || []) merk(m, m.character ? "als " + m.character : "Schauspiel");
  for (const m of c.crew || []) if (JOB[m.job]) merk(m, JOB[m.job]);
  const liste = [...rollen.values()].filter(e => (e.film.vote_count || 0) >= 5 || e.film.poster_path)
    .sort((a, b) => (b.film.popularity || 0) - (a.film.popularity || 0)).slice(0, 80);
  const filme = await kompakt(liste.map(e => e.film), key);
  // Serien: Gastauftritte (1 Folge), Talkshows, Nachrichten und Reality rausfiltern
  const selbst = /^(self|himself|herself|sich selbst|er selbst|sie selbst)/i;
  const tvRollen = new Map<number, { serie: any; rollen: string[] }>();
  const merkTV = (m: any, rolle: string) => { if (!m || !m.id || !m.name) return; if ((m.genre_ids || []).some((g: number) => [10767, 10763, 10764].includes(g))) return; const e = tvRollen.get(m.id) || { serie: m, rollen: [] }; if (rolle && !e.rollen.includes(rolle)) e.rollen.push(rolle); tvRollen.set(m.id, e); };
  for (const m of tv.cast || []) if ((m.episode_count || 0) >= 2 && !selbst.test(m.character || "")) merkTV(m, m.character ? "als " + m.character : "Schauspiel");
  for (const m of tv.crew || []) if (JOB[m.job] || m.job === "Creator") merkTV(m, m.job === "Creator" ? "Idee" : JOB[m.job]);
  const tvListe = [...tvRollen.values()].filter(e => (e.serie.vote_count || 0) >= 5 || e.serie.poster_path)
    .sort((a, b) => (b.serie.popularity || 0) - (a.serie.popularity || 0)).slice(0, 40);
  const serien = await kompaktTV(tvListe.map(e => e.serie), key);
  return {
    person: { id: p.id, name: p.name, bild: p.profile_path || null, abteilung: ABTEILUNG[p.known_for_department] || p.known_for_department || "", geboren: p.birthday || null, ort: p.place_of_birth || null, anzahl: liste.length, anzahl_serien: tvListe.length },
    filme: filme.map((f, i) => ({ ...f, rolle: liste[i].rollen.slice(0, 2).join(", "), popularitaet: liste[i].film.popularity || 0 })),
    serien: serien.map((s, i) => ({ ...s, rolle: tvListe[i].rollen.slice(0, 2).join(", "), popularitaet: tvListe[i].serie.popularity || 0 })),
  };
}

/* ---------- Serien (TMDB TV) ---------- */
let tvGenreCache: Record<number, string> | null = null;
async function tvGenres(key: string) {
  if (tvGenreCache) return tvGenreCache;
  const d = await tmdb("/genre/tv/list", { language: "de-DE" }, key);
  tvGenreCache = Object.fromEntries((d.genres || []).map((g: { id: number; name: string }) => [g.id, g.name]));
  return tvGenreCache!;
}
async function kompaktTV(liste: any[], key: string) {
  const g = await tvGenres(key);
  return liste.filter(m => m && m.id && m.name).map(m => ({
    tmdb_id: m.id, titel: m.name, original_titel: m.original_name, jahr: jahr(m.first_air_date), poster: m.poster_path || null,
    beschreibung: m.overview || "", tmdb_rating: m.vote_average ? Math.round(m.vote_average * 10) / 10 : null, stimmen: m.vote_count || 0,
    genres: (m.genre_ids || []).map((id: number) => g[id]).filter(Boolean),
  }));
}
async function serieDetails(id: number, k: Schluessel) {
  const d = await tmdb(`/tv/${id}`, { language: "de-DE", append_to_response: "credits,videos,external_ids,watch/providers", include_video_language: "de,en,null" }, k.tmdb!);
  let beschreibung = d.overview || "";
  if (!beschreibung) { try { const en = await tmdb(`/tv/${id}`, { language: "en-US" }, k.tmdb!); beschreibung = en.overview || ""; } catch { /* egal */ } }
  const videos = (d.videos?.results || []).filter((v: any) => v.site === "YouTube");
  const rang = (v: any) => (v.type === "Trailer" ? 0 : v.type === "Teaser" ? 10 : 20) + (v.iso_639_1 === "de" ? 0 : v.iso_639_1 === "en" ? 3 : 6) + (v.official ? 0 : 1);
  videos.sort((a: any, b: any) => rang(a) - rang(b));
  const person = (p: any) => ({ id: p.id, name: p.name, bild: p.profile_path || null });
  const cast = (d.credits?.cast || []).slice(0, 14).map((p: any) => ({ ...person(p), rolle: p.character || "" }));
  const macher = (d.created_by || []).map(person);
  const de = d["watch/providers"]?.results?.DE || {};
  const anb = (l: any[]) => (l || []).map(p => ({ name: p.provider_name, logo: p.logo_path || null }));
  const anbieter = { link: de.link || null, streamen: anb(de.flatrate), leihen: anb(de.rent), kaufen: anb(de.buy), stand: new Date().toISOString().slice(0, 10) };
  // Alle Staffeln mit Folgen – TMDB erlaubt bis zu 20 Staffeln pro Anfrage über append_to_response
  const meta = (d.seasons || []).filter((s: any) => s.season_number > 0);
  const nums: number[] = meta.map((s: any) => s.season_number);
  const staffeln: any[] = [];
  for (let i = 0; i < nums.length; i += 20) {
    const block = nums.slice(i, i + 20);
    const r = await tmdb(`/tv/${id}`, { language: "de-DE", append_to_response: block.map(n => `season/${n}`).join(",") }, k.tmdb!);
    for (const n of block) {
      const s = r[`season/${n}`]; const m = meta.find((x: any) => x.season_number === n) || {};
      if (!s) continue;
      staffeln.push({
        nr: n, name: s.name || m.name || `Staffel ${n}`, start: s.air_date || m.air_date || null, poster: s.poster_path || m.poster_path || null,
        folgen: (s.episodes || []).map((e: any) => ({ nr: e.episode_number, titel: e.name || "", datum: e.air_date || null, tmdb_rating: e.vote_count ? Math.round(e.vote_average * 10) / 10 : null, stimmen: e.vote_count || 0, still: e.still_path || null, laufzeit: e.runtime || null })),
      });
    }
  }
  const beendet = d.status === "Ended" || d.status === "Canceled";
  const imdbId = d.external_ids?.imdb_id || null;
  const wertungen = imdbId && k.omdb ? await omdb(imdbId, k.omdb) : {};
  const alleFolgen = staffeln.flatMap(s => s.folgen);
  return {
    tmdb_id: d.id, imdb_id: imdbId, titel: d.name, original_titel: d.original_name,
    jahr: jahr(d.first_air_date), ende_jahr: beendet ? jahr(d.last_air_date) : null, laeuft: !beendet,
    laufzeit: (d.episode_run_time || [])[0] || (alleFolgen.find((f: any) => f.laufzeit) || {}).laufzeit || null,
    beschreibung, poster: d.poster_path || null, hintergrund: d.backdrop_path || null,
    genres: (d.genres || []).map((g: any) => g.name),
    tmdb_rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
    imdb_rating: null, rt_rating: null, metascore: null, ...wertungen,
    trailer: videos[0]?.key || null, schauspieler: cast, macher, anbieter, staffeln,
    anzahl_staffeln: staffeln.length, anzahl_folgen: alleFolgen.length,
    omdb_aktiv: !!k.omdb,
  };
}

/* ---------- Empfehlungen über Kreuz: Serien → Filme und Filme → Serien ----------
   TMDB kennt keine gemischten Empfehlungen. Darum: Schlagwörter, Genres und Personen der Lieblingstitel
   nehmen und damit die andere Medienart durchsuchen (discover). Geringeres Gewicht als direkte Empfehlungen. */
type Seed = { tmdb_id: number; gewicht: number; titel: string };
const TV_ZU_FILM_GENRE: Record<number, number[]> = { 10759: [28, 12], 10765: [878, 14], 10768: [10752], 10762: [16, 10751], 10766: [18], 16: [16], 35: [35], 80: [80], 99: [99], 18: [18], 10751: [10751], 9648: [9648], 37: [37] };
const FILM_ZU_TV_GENRE: Record<number, number[]> = { 28: [10759], 12: [10759], 878: [10765], 14: [10765], 10752: [10768], 53: [80, 9648], 27: [9648], 10749: [18], 16: [16], 35: [35], 80: [80], 99: [99], 18: [18], 10751: [10751], 9648: [9648], 37: [37] };
type Sammler = Map<number, { film: any; score: number; wegen: Map<string, number> }>;
function sammle(map: Sammler, liste: any[], gewicht: number, wegen: string, raus: Set<number>, minStimmen: number) {
  (liste || []).forEach((m: any, pos: number) => {
    if (!m || raus.has(m.id) || !m.poster_path || (m.vote_count || 0) < minStimmen) return;
    const beitrag = gewicht * (1 / (1 + pos * 0.15));
    const e = map.get(m.id) || { film: m, score: 0, wegen: new Map() };
    e.score += beitrag; e.wegen.set(wegen, (e.wegen.get(wegen) || 0) + beitrag); map.set(m.id, e);
  });
}
async function querFilmeAusSerien(seeds: Seed[], raus: Set<number>, map: Sammler, key: string) {
  const top = [...seeds].sort((a, b) => b.gewicht - a.gewicht).slice(0, 4);
  await Promise.all(top.map(async s => {
    try {
      const [d, kw] = await Promise.all([tmdb(`/tv/${s.tmdb_id}`, { append_to_response: "credits" }, key), tmdb(`/tv/${s.tmdb_id}/keywords`, {}, key).catch(() => ({ results: [] }))]);
      const woerter = (kw.results || []).slice(0, 5).map((k: any) => k.id);
      const leute = [...(d.created_by || []).map((p: any) => p.id), ...(d.credits?.cast || []).slice(0, 3).map((p: any) => p.id)].slice(0, 4);
      const genres = [...new Set((d.genres || []).flatMap((g: any) => TV_ZU_FILM_GENRE[g.id] || []))].slice(0, 2);
      const basis = { language: "de-DE", region: "DE", include_adult: "false", sort_by: "vote_average.desc" };
      const wegen = "Serie: " + s.titel; const g = s.gewicht * 0.6;
      const [a, b, c] = await Promise.all([
        woerter.length ? tmdb("/discover/movie", { ...basis, with_keywords: woerter.join("|"), "vote_count.gte": "300" }, key).catch(() => ({})) : {},
        leute.length ? tmdb("/discover/movie", { ...basis, with_people: leute.join("|"), "vote_count.gte": "300" }, key).catch(() => ({})) : {},
        genres.length ? tmdb("/discover/movie", { ...basis, with_genres: genres.join(","), "vote_count.gte": "3000" }, key).catch(() => ({})) : {},
      ]);
      sammle(map, a.results, g, wegen, raus, 300); sammle(map, b.results, g * 0.8, wegen, raus, 300); sammle(map, c.results, g * 0.3, wegen, raus, 3000);
    } catch { /* eine Serie ohne Daten – egal */ }
  }));
}
async function querSerienAusFilmen(seeds: Seed[], raus: Set<number>, map: Sammler, key: string) {
  const top = [...seeds].sort((a, b) => b.gewicht - a.gewicht).slice(0, 4);
  await Promise.all(top.map(async s => {
    try {
      const [d, kw] = await Promise.all([tmdb(`/movie/${s.tmdb_id}`, {}, key), tmdb(`/movie/${s.tmdb_id}/keywords`, {}, key).catch(() => ({ keywords: [] }))]);
      const woerter = (kw.keywords || []).slice(0, 5).map((k: any) => k.id);
      const genres = [...new Set((d.genres || []).flatMap((g: any) => FILM_ZU_TV_GENRE[g.id] || []))].slice(0, 2);
      const basis = { language: "de-DE", include_adult: "false", sort_by: "vote_average.desc" };
      const wegen = "Film: " + s.titel; const g = s.gewicht * 0.6;
      const [a, c] = await Promise.all([
        woerter.length ? tmdb("/discover/tv", { ...basis, with_keywords: woerter.join("|"), "vote_count.gte": "150" }, key).catch(() => ({})) : {},
        genres.length ? tmdb("/discover/tv", { ...basis, with_genres: genres.join(","), "vote_count.gte": "1500", without_genres: "10763,10764,10767" }, key).catch(() => ({})) : {},
      ]);
      sammle(map, a.results, g, wegen, raus, 150); sammle(map, c.results, g * 0.3, wegen, raus, 1500);
    } catch { /* egal */ }
  }));
}
function abschluss(map: Sammler) {
  return [...map.values()].sort((a, b) => b.score - a.score).slice(0, 40);
}

async function empfehlungenTV(seeds: Seed[], ausschluss: number[], key: string, quer: Seed[] = []) {
  const top = [...seeds].sort((a, b) => b.gewicht - a.gewicht).slice(0, 12);
  const raus = new Set(ausschluss);
  const punkte: Sammler = new Map();
  const [listen] = await Promise.all([
    Promise.all(top.map(s => tmdb(`/tv/${s.tmdb_id}/recommendations`, { language: "de-DE", page: "1" }, key).catch(() => ({ results: [] })))),
    quer.length ? querSerienAusFilmen(quer, raus, punkte, key) : Promise.resolve(),
  ]);
  listen.forEach((l, i) => {
    const s = top[i];
    (l.results || []).forEach((m: any, pos: number) => {
      if (raus.has(m.id) || !m.poster_path || (m.vote_count || 0) < 30) return;
      const beitrag = s.gewicht * (1 / (1 + pos * 0.12)) * ((m.vote_average || 0) >= 6.5 ? 1 : 0.5);
      const e = punkte.get(m.id) || { film: m, score: 0, wegen: new Map() };
      e.score += beitrag; e.wegen.set(s.titel, (e.wegen.get(s.titel) || 0) + beitrag);
      punkte.set(m.id, e);
    });
  });
  const sortiert = abschluss(punkte);
  const serien = await kompaktTV(sortiert.map(e => e.film), key);
  return serien.map((s, i) => ({ ...s, wegen: [...sortiert[i].wegen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]) }));
}

async function omdb(imdbId: string, key: string) {
  try {
    const r = await fetch(`https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(key)}`);
    if (!r.ok) return {};
    const d = await r.json();
    if (d.Response === "False") return {};
    const rt = (d.Ratings || []).find((x: { Source: string }) => x.Source === "Rotten Tomatoes");
    const num = (s?: string) => { const n = parseFloat(String(s || "").replace("%", "")); return isNaN(n) ? null : n; };
    return { imdb_rating: num(d.imdbRating), rt_rating: rt ? num(rt.Value) : null, metascore: num(d.Metascore) };
  } catch { return {}; }
}

// Letterboxd hat keine öffentliche API. Die Filmseite (erreichbar über die TMDB-ID) enthält
// die Durchschnittswertung (0,5–5) als strukturierte Daten (schema.org AggregateRating).
async function letterboxd(tmdbId: number) {
  const leer = { lb_rating: null, lb_stimmen: null, lb_url: null };
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(`https://letterboxd.com/tmdb/${tmdbId}/`, { redirect: "follow", signal: ctl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Filmabend, private Watchlist)", "Accept": "text/html" } });
    clearTimeout(t);
    if (!r.ok || !/\/film\//.test(r.url)) return leer;
    const html = await r.text();
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (!m) return { ...leer, lb_url: r.url };
    const json = m[1].replace(/\/\*\s*<!\[CDATA\[\s*\*\//, "").replace(/\/\*\s*\]\]>\s*\*\//, "").trim();
    const d = JSON.parse(json);
    const a = d.aggregateRating || {};
    const wert = parseFloat(a.ratingValue);
    return { lb_rating: isNaN(wert) ? null : Math.round(wert * 100) / 100, lb_stimmen: parseInt(a.ratingCount) || null, lb_url: d.url || r.url };
  } catch { return leer; }
}

async function details(tmdbId: number, k: Schluessel) {
  const d = await tmdb(`/movie/${tmdbId}`, {
    language: "de-DE",
    append_to_response: "credits,videos,external_ids,watch/providers,images",
    include_image_language: "null,de,en",
    include_video_language: "de,en,null",
  }, k.tmdb!);
  let beschreibung = d.overview || "";
  if (!beschreibung) {
    try { const en = await tmdb(`/movie/${tmdbId}`, { language: "en-US" }, k.tmdb!); beschreibung = en.overview || ""; } catch { /* egal */ }
  }
  // Trailer: deutsch bevorzugt, sonst englisch
  const videos = (d.videos?.results || []).filter((v: any) => v.site === "YouTube");
  const rang = (v: any) => (v.type === "Trailer" ? 0 : v.type === "Teaser" ? 10 : 20) + (v.iso_639_1 === "de" ? 0 : v.iso_639_1 === "en" ? 3 : 6) + (v.official ? 0 : 1);
  videos.sort((a: any, b: any) => rang(a) - rang(b));
  const trailer = videos[0]?.key || null;

  const person = (p: any) => ({ id: p.id, name: p.name, bild: p.profile_path || null });
  const cast = (d.credits?.cast || []).slice(0, 14).map((p: any) => ({ ...person(p), rolle: p.character || "" }));
  const crew = d.credits?.crew || [];
  const sammel = (jobs: string[], max: number) => {
    const out: any[] = []; const seen = new Set<string>();
    for (const p of crew) if (jobs.includes(p.job) && !seen.has(p.name)) { seen.add(p.name); out.push({ ...person(p), job: p.job }); if (out.length >= max) break; }
    return out;
  };
  const regie = sammel(["Director"], 4);
  const drehbuch = sammel(["Screenplay", "Writer", "Story", "Novel"], 4);
  const produzenten = sammel(["Producer", "Executive Producer"], 6);

  const de = d["watch/providers"]?.results?.DE || {};
  const anb = (l: any[]) => (l || []).map(p => ({ name: p.provider_name, logo: p.logo_path || null }));
  const anbieter = { link: de.link || null, streamen: anb(de.flatrate), leihen: anb(de.rent), kaufen: anb(de.buy), stand: new Date().toISOString().slice(0, 10) };

  // Szenenbilder: beste Backdrops zuerst, Poster-Varianten als Ergänzung
  const backs = [...(d.images?.backdrops || [])].sort((a: any, b: any) => (b.vote_count || 0) - (a.vote_count || 0)).map((b: any) => b.file_path).filter((p: string) => p && p !== d.backdrop_path);
  const bilder = [d.backdrop_path, ...backs].filter(Boolean).slice(0, 10);

  const imdbId = d.imdb_id || d.external_ids?.imdb_id || null;
  const [wertungen, lb] = await Promise.all([imdbId && k.omdb ? omdb(imdbId, k.omdb) : Promise.resolve({}), letterboxd(tmdbId)]);

  return {
    tmdb_id: d.id,
    imdb_id: imdbId,
    titel: d.title,
    original_titel: d.original_title,
    jahr: jahr(d.release_date),
    laufzeit: d.runtime || null,
    beschreibung,
    poster: d.poster_path || null,
    hintergrund: d.backdrop_path || null,
    bilder,
    genres: (d.genres || []).map((g: any) => g.name),
    tmdb_rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
    imdb_rating: null, rt_rating: null, metascore: null,
    ...wertungen,
    ...lb,
    trailer,
    schauspieler: cast,
    regie, drehbuch, produzenten,
    anbieter,
    omdb_aktiv: !!k.omdb,
  };
}

async function empfehlungen(seeds: Seed[], ausschluss: number[], key: string, quer: Seed[] = []) {
  const top = [...seeds].sort((a, b) => b.gewicht - a.gewicht).slice(0, 12);
  const raus = new Set(ausschluss);
  const punkte: Sammler = new Map();
  const [listen] = await Promise.all([
    Promise.all(top.map(s => tmdb(`/movie/${s.tmdb_id}/recommendations`, { language: "de-DE", page: "1" }, key).catch(() => ({ results: [] })))),
    quer.length ? querFilmeAusSerien(quer, raus, punkte, key) : Promise.resolve(),
  ]);
  listen.forEach((l, i) => {
    const s = top[i];
    (l.results || []).forEach((m: any, pos: number) => {
      if (raus.has(m.id) || !m.poster_path || (m.vote_count || 0) < 50) return;
      const beitrag = s.gewicht * (1 / (1 + pos * 0.12)) * ((m.vote_average || 0) >= 6 ? 1 : 0.5);
      const e = punkte.get(m.id) || { film: m, score: 0, wegen: new Map() };
      e.score += beitrag; e.wegen.set(s.titel, (e.wegen.get(s.titel) || 0) + beitrag);
      punkte.set(m.id, e);
    });
  });
  const sortiert = abschluss(punkte);
  const filme = await kompakt(sortiert.map(e => e.film), key);
  return filme.map((f, i) => ({ ...f, wegen: [...sortiert[i].wegen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]) }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return antwort({ fehler: "nur POST" }, 405);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return antwort({ fehler: "nicht angemeldet" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { return antwort({ fehler: "ungueltige anfrage" }, 400); }
  if (body.aktion === "letterboxd") { // nur Letterboxd-Wertung, braucht keinen TMDB-Schlüssel
    const id = parseInt(body.tmdb_id);
    return id ? antwort(await letterboxd(id)) : antwort({ fehler: "tmdb_id fehlt" }, 400);
  }
  const k = await schluessel();
  if (!k.tmdb) return antwort({ fehler: "tmdb_fehlt" }, 400);

  try {
    switch (body.aktion) {
      case "suche": {
        const q = String(body.query || "").trim();
        if (!q) return antwort({ filme: [] });
        const [d, personen] = await Promise.all([tmdb("/search/movie", { query: q, language: "de-DE", region: "DE", include_adult: "false", page: "1" }, k.tmdb), personenSuche(q, k.tmdb)]);
        return antwort({ filme: await kompakt(d.results || [], k.tmdb), personen });
      }
      case "person": {
        const r = await personFilme(parseInt(body.id) || null, body.name ? String(body.name) : null, k.tmdb);
        return r ? antwort(r) : antwort({ fehler: "person_unbekannt" }, 404);
      }
      case "serie_suche": {
        const q = String(body.query || "").trim();
        if (!q) return antwort({ serien: [] });
        const d = await tmdb("/search/tv", { query: q, language: "de-DE", include_adult: "false", page: "1" }, k.tmdb);
        return antwort({ serien: await kompaktTV(d.results || [], k.tmdb) });
      }
      case "serie_empfehlungen": {
        const seeds = Array.isArray(body.seeds) ? body.seeds : [];
        if (!seeds.length && !(Array.isArray(body.quer) && body.quer.length)) return antwort({ serien: [] });
        return antwort({ serien: await empfehlungenTV(seeds, Array.isArray(body.ausschluss) ? body.ausschluss : [], k.tmdb, Array.isArray(body.quer) ? body.quer : []) });
      }
      case "serie_start": { // Startseite der Serien-Suche: passende Vorschläge, Bestbewertete, Beliebte
        const seeds = Array.isArray(body.seeds) ? body.seeds : [];
        const raus = Array.isArray(body.ausschluss) ? body.ausschluss : [];
        const [passend, top, beliebt] = await Promise.all([
          (seeds.length || (Array.isArray(body.quer) && body.quer.length)) ? empfehlungenTV(seeds, raus, k.tmdb, Array.isArray(body.quer) ? body.quer : []) : Promise.resolve([]),
          tmdb("/tv/top_rated", { language: "de-DE", page: "1" }, k.tmdb).then(d => kompaktTV(d.results || [], k.tmdb)).catch(() => []),
          tmdb("/tv/popular", { language: "de-DE", page: "1" }, k.tmdb).then(d => kompaktTV((d.results || []).filter((m: any) => !(m.genre_ids || []).some((g: number) => [10763, 10764, 10767].includes(g))), k.tmdb)).catch(() => []),
        ]);
        const rs = new Set(raus);
        return antwort({ passend: passend.slice(0, 20), top: top.filter(s => !rs.has(s.tmdb_id)).slice(0, 20), beliebt: beliebt.filter(s => !rs.has(s.tmdb_id)).slice(0, 20) });
      }
      case "serie_beliebt": {
        const d = await tmdb("/tv/popular", { language: "de-DE", page: "1" }, k.tmdb);
        return antwort({ serien: await kompaktTV(d.results || [], k.tmdb) });
      }
      case "serie_details": {
        const id = parseInt(body.tmdb_id);
        if (!id) return antwort({ fehler: "tmdb_id fehlt" }, 400);
        return antwort({ serie: await serieDetails(id, k) });
      }
      case "beliebt": {
        const d = await tmdb("/movie/popular", { language: "de-DE", region: "DE", page: "1" }, k.tmdb);
        return antwort({ filme: await kompakt(d.results || [], k.tmdb) });
      }
      case "details": {
        const id = parseInt(body.tmdb_id);
        if (!id) return antwort({ fehler: "tmdb_id fehlt" }, 400);
        return antwort({ film: await details(id, k) });
      }
      case "empfehlungen": {
        const seeds = Array.isArray(body.seeds) ? body.seeds : [];
        if (!seeds.length && !(Array.isArray(body.quer) && body.quer.length)) return antwort({ filme: [] });
        return antwort({ filme: await empfehlungen(seeds, Array.isArray(body.ausschluss) ? body.ausschluss : [], k.tmdb, Array.isArray(body.quer) ? body.quer : []) });
      }
      default: return antwort({ fehler: "unbekannte aktion" }, 400);
    }
  } catch (e) {
    const msg = (e as Error).message || "fehler";
    return antwort({ fehler: msg }, msg.startsWith("tmdb_schluessel") ? 400 : 502);
  }
});
