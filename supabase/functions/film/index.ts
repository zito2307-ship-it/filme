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

  const person = (p: any) => ({ name: p.name, bild: p.profile_path || null });
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

async function empfehlungen(seeds: { tmdb_id: number; gewicht: number; titel: string }[], ausschluss: number[], key: string) {
  const top = [...seeds].sort((a, b) => b.gewicht - a.gewicht).slice(0, 12);
  const raus = new Set(ausschluss);
  const punkte = new Map<number, { film: any; score: number; wegen: Map<string, number> }>();
  const listen = await Promise.all(top.map(s => tmdb(`/movie/${s.tmdb_id}/recommendations`, { language: "de-DE", page: "1" }, key).catch(() => ({ results: [] }))));
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
  const sortiert = [...punkte.values()].sort((a, b) => b.score - a.score).slice(0, 40);
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
        const d = await tmdb("/search/movie", { query: q, language: "de-DE", region: "DE", include_adult: "false", page: "1" }, k.tmdb);
        return antwort({ filme: await kompakt(d.results || [], k.tmdb) });
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
        if (!seeds.length) return antwort({ filme: [] });
        return antwort({ filme: await empfehlungen(seeds, Array.isArray(body.ausschluss) ? body.ausschluss : [], k.tmdb) });
      }
      default: return antwort({ fehler: "unbekannte aktion" }, 400);
    }
  } catch (e) {
    const msg = (e as Error).message || "fehler";
    return antwort({ fehler: msg }, msg.startsWith("tmdb_schluessel") ? 400 : 502);
  }
});
