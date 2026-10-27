# Filmabend

Private Film-App für Ziu und Alex. Vanilla JS, kein Build-Schritt.

- Live: https://zito2307-ship-it.github.io/filme/ (GitHub Pages, Branch `main`, Ordner `/`)
- Daten: Supabase-Projekt FILME (`rqjsuklfjrgwvaamftds`)
- Filmdaten: Edge Function `film` in `supabase/functions/film/` (TMDB Filme/Serien/Personen + OMDb + Letterboxd)

## Dateien

`index.html` (Gerüst), `app.js` (Filme, Ansichten, gemeinsame Hilfen in `window.FA`), `serien.js` (Serien-Tab: Watchlist, Staffeln, Folgen, Heatmap, Rangliste), `store.js` (Supabase-Zugriff), `styles.css`, `config.js` (URL + öffentlicher Schlüssel), `sw.js` (Offline-Cache), `manifest.webmanifest`, `icons/`, `vendor/supabase.js`.

## Neue Version veröffentlichen

1. In `sw.js` die Zeile `const CACHE = "filmabend-vN"` um eins erhöhen.
2. Committen und auf `main` pushen (GitHub Desktop: „Push origin“).
3. Nach ein bis zwei Minuten ist die Seite aktualisiert.
