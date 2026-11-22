# Recipe Harbour (web)

Next.js app: ingredient search over the index exported by the pipeline.

```powershell
npm ci
npm run dev        # http://localhost:3000
npm test           # node --test (search, URL state, formatting)
npm run lint; npm run typecheck; npm run build
```

The search index `src/data/search-index.json` is generated, not edited: run
`.venv\Scripts\rh export` from the repo root after `rh build`.
