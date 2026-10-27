/* Datenzugriff: Supabase (Login, Filme, Bewertungen) und Edge Function "film" (TMDB/OMDb). */
window.Store = (function () {
  const cfg = window.FILME_CONFIG;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  function pruefe(res) { if (res.error) throw new Error(res.error.message || String(res.error)); return res.data; }

  return {
    sb,
    async session() { const { data } = await sb.auth.getSession(); return data.session; },
    async anmelden(email, password) { pruefe(await sb.auth.signInWithPassword({ email, password })); return this.session(); },
    async abmelden() { await sb.auth.signOut(); },
    beiAuth(fn) { sb.auth.onAuthStateChange((_e, s) => fn(s)); },

    async profile() { return pruefe(await sb.from("profile").select("id,name").order("name")); },
    async nameSetzen(id, name) { pruefe(await sb.from("profile").update({ name }).eq("id", id)); },

    async filme() {
      const filme = pruefe(await sb.from("filme").select("*").order("erstellt_am", { ascending: false }));
      const bew = pruefe(await sb.from("bewertungen").select("*"));
      for (const f of filme) f.bewertungen = bew.filter(b => b.film_id === f.id);
      return filme;
    },
    async filmAnlegen(daten) { return pruefe(await sb.from("filme").insert(daten).select("*").single()); },
    async filmAendern(id, daten) { return pruefe(await sb.from("filme").update(daten).eq("id", id).select("*").single()); },
    async filmLoeschen(id) { pruefe(await sb.from("filme").delete().eq("id", id)); },
    async bewerten(film_id, user_id, punkte, kommentar, mit) {
      return pruefe(await sb.from("bewertungen").upsert({ film_id, user_id, punkte, kommentar: kommentar || null, mit: Array.isArray(mit) ? mit : [] }, { onConflict: "film_id,user_id" }).select("*").single());
    },
    async bewertungLoeschen(film_id, user_id) { pruefe(await sb.from("bewertungen").delete().eq("film_id", film_id).eq("user_id", user_id)); },

    async schluesselStatus() { return pruefe(await sb.rpc("schluessel_status")); },
    async schluesselSetzen(schluessel, wert) { pruefe(await sb.rpc("schluessel_setzen", { p_schluessel: schluessel, p_wert: wert })); },

    // Edge Function "film": suche | details | beliebt | empfehlungen
    async film(aktion, params) {
      const { data, error } = await sb.functions.invoke("film", { body: { aktion, ...(params || {}) } });
      if (error) {
        let detail = null;
        try { detail = error.context && typeof error.context.json === "function" ? await error.context.json() : null; } catch (_) { /* egal */ }
        const code = detail && detail.fehler ? detail.fehler : (error.message || "fehler");
        const e = new Error(code); e.code = code; throw e;
      }
      if (data && data.fehler) { const e = new Error(data.fehler); e.code = data.fehler; throw e; }
      return data;
    },
  };
})();
