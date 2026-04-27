# CLAUDE.md

Context for Claude Code when working in this repo.

## What this is

A translation **provider** for the [`strapi-plugin-translate`](https://www.npmjs.com/package/strapi-plugin-translate) plugin. It lets a Strapi project route translation requests to **any user-supplied HTTP endpoint** instead of being locked into DeepL/Google/ChatGPT. Published to npm as `strapi-provider-translate-custom-api`.

The user's own translation backend lives behind `apiURL` and is expected to accept a POST with raw text in the body and return the translated text as plain text in the response body.

## How it plugs into Strapi

`strapi-plugin-translate` discovers providers by their package name (`strapi-provider-translate-<x>`) and calls `init(providerOptions, pluginConfig)` exported from `index.js`. `init` must return an object exposing `translate(options)` and `usage()`. The plugin is wired up by the consuming Strapi project in `config/plugins.js` — see `README.md` for the example.

`providerOptions` (set by the consuming project):

- `apiURL` — POST endpoint for translations (required)
- `apiKey` — optional, appended as `?apiKey=` query param
- `translationProvider` — optional label forwarded as `?provider=`; also keys the fallback table

## Files

- `index.js` — exports the provider; implements `translate(options)`. Handles batching, jsonb⇄html conversion, and target-locale fallbacks.
- `apiHandler.js` — `fetchTranslation(...)`: builds the URL, POSTs the text, returns the response body. On failure returns the original text (so the upstream call never throws from a single item).
- `test.js` — ad-hoc manual harness. **Will not run standalone** because `index.js` calls `strapi.plugin('translate').service('format')` which only exists inside a running Strapi instance.
- `package.json` — single runtime dep is `is-html` (used to detect HTML payloads).

## Translate flow (index.js)

1. Receive `{ text, sourceLocale, targetLocale, format, priority }` from the plugin.
2. If `format === 'jsonb'` and `text` is an array, convert Strapi blocks → HTML using `strapi.plugin('translate').service('format').blockToHtml(...)`. Remember `isBlock = true`.
3. Normalize `text` to an array (single string → `[string]`).
4. Apply target-locale fallbacks from the `fallbackLanguages` map (e.g. DeepL doesn't support `es-419`, so it falls back to `es`). Keyed by `translationProvider`.
5. Fan out one `fetchTranslation` per array item with `Promise.all`. Per-item errors are caught and replaced with the original text — the batch never fails as a whole.
6. If `isBlock`, convert HTML strings back to blocks via `format.htmlToBlock(...)` and ensure the result is an array.
7. Return the array of translated values.

## Outbound HTTP contract (apiHandler.js)

```
POST {apiURL}?target={targetLocale}&source={sourceLocale}
        [&apiKey={apiKey}]
        [&format=html]            # added when is-html(text) is true
        [&provider={translationProvider}]
Body: <raw text or HTML>
Response: <raw translated text>   (text/plain, response.text())
```

Non-2xx responses throw inside `fetchTranslation`, which then catches and returns the original text.

## Host plugin invariants

These are guaranteed by `strapi-plugin-translate`'s service layer (`server/services/translate.js`) and the provider relies on them. Don't break them. Full prose lives in the JSDoc above `translate()` in `index.js`; the short list:

1. `text` is **always an array** when called from the host plugin. The single-string normalization in `translate()` is only for ad-hoc callers.
2. `format` is **homogeneous within a call** — never mixed.
3. The returned array **must match input length and order**. Host plugin maps results back by index; `allSettledLimit` preserves order even when items resolve out of sequence.
4. For `format === 'jsonb'`, each element of `text` is itself an array of blocks (`[[blocksA], [blocksB], ...]`). `formatService.blockToHtml` / `htmlToBlock` handle the nested shape.
5. `priority` is end-to-end plumbing only — currently a no-op everywhere.

## Design choices worth knowing

- **Plain-text response, not JSON.** The custom API must respond with the translated string in the body — no JSON envelope.
- **Graceful degradation everywhere.** Both `fetchTranslation` and the per-item `.catch` in `index.js` return the original text on failure. A failed translation never blocks the pipeline; the editor sees the source text and can translate manually.
- **HTML is auto-detected**, not declared. `is-html` decides whether to add `&format=html`. Strapi blocks are routed through HTML on the wire (block → HTML → translated HTML → block).
- **Fallback table is provider-scoped.** Add new entries to `fallbackLanguages` in `index.js` keyed by the `translationProvider` string the consumer passes in.
- **`usage()` is intentionally a no-op.** The plugin calls it for quota reporting; with a self-hosted endpoint there's nothing meaningful to return.

## Compatibility

README states Strapi v4; v5 is untested. The `strapi.plugin('translate').service('format')` call assumes the host plugin's service shape — if `strapi-plugin-translate` changes that API in a future major, `blockToHtml` / `htmlToBlock` need to be re-checked.

## Local testing

`npm test` runs the Jest suite under `__tests__/` (46 tests as of v2.2.0). The `format` service from the host plugin is mocked via `global.strapi`, so the suite runs standalone without a real Strapi process. Use `--experimental-vm-modules` (the script in `package.json` already does) so the dynamic `import("is-html")` works.

For end-to-end verification against a real Strapi instance:

- `npm link` into a Strapi project that already has `strapi-plugin-translate` installed and configured, **or**
- Bump the version in `package.json`, publish, and `npm install` into the consuming project.

## Package layout decisions

- **`package-lock.json` is committed** (kept, not dropped). The CI workflow in `.github/workflows/ci.yml` uses `npm ci`, which requires a lockfile. Reproducible CI builds outweigh the "libraries don't ship lockfiles" convention; consumers are unaffected since the `files` whitelist in `package.json` excludes the lockfile from the published tarball.
