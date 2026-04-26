# strapi-provider-translate-custom-api

A translation provider for [`strapi-plugin-translate`](https://www.npmjs.com/package/strapi-plugin-translate) that routes translation requests to **any HTTP endpoint you control** instead of a fixed third party (DeepL, Google, ChatGPT). You write the translation server; this provider handles the wire protocol.

> **⚠️ v2.0.0 contains breaking wire-contract changes.** If you are upgrading from v1.x, see the [Migration from v1.x](#migration-from-v1x) section below before deploying. v1.x consumers must update their custom API server to read auth from a header and parse Content-Type before they can install v2.0.0.

## Features

- **Bring-your-own translation endpoint** — point at any URL that accepts POST and returns plain text.
- **HTML auto-detection** — input is sniffed via `is-html`; HTML payloads are flagged on the wire so your server can handle them differently from plain text.
- **Strapi blocks (jsonb) round-trip** — block editor content is converted to HTML for translation and back to blocks afterwards.
- **Locale fallbacks** — built-in fallback table for providers that don't support specific locales (e.g. DeepL doesn't support `es-419` → falls back to `es`).
- **Per-item resilience** — when one item in a batch fails, the source text is returned for that slot and the rest of the batch still succeeds. If *every* item fails, the batch throws an `AggregateError` so the host plugin sees the failure instead of silently presenting source-text fallbacks.
- **Concurrency control** — batched fan-out is throttled (default 5 in flight) so a large page doesn't fire dozens of simultaneous POSTs at your translation backend. Configurable via `providerOptions.concurrency`.
- **Markdown round-tripping** — markdown fields are converted to HTML before sending and back to markdown after, so your custom API only ever sees plain text or HTML on the wire (never raw markdown semantics).

## Installation

```bash
npm install strapi-provider-translate-custom-api
```

## Configuration

Configure in `config/plugins.js` after installing `strapi-plugin-translate`:

```js
module.exports = ({ env }) => ({
  translate: {
    enabled: true,
    config: {
      provider: "custom-api",
      providerOptions: {
        apiURL: env("TRANSLATION_API_URL"),     // required
        apiKey: env("TRANSLATION_API_KEY"),      // optional; sent as Bearer token
        translationProvider: "MyProvider",       // optional label, see fallback table
        timeoutMs: 30_000,                       // optional, default 30s
      },
      translatedFieldTypes: [
        "string",
        { type: "blocks", format: "jsonb" },
        { type: "text", format: "plain" },
        { type: "richtext", format: "markdown" },
        "component",
        "dynamiczone",
      ],
    },
  },
});
```

### `providerOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `apiURL` | string | — (required) | POST endpoint for translations. Validated at init time via `new URL(...)`. |
| `apiKey` | string | undefined | Sent as `Authorization: Bearer <apiKey>` when set. |
| `translationProvider` | string | undefined | Forwarded as `?provider=...` and used to key the locale fallback table. |
| `timeoutMs` | number | `30_000` | Per-request timeout. Hanging endpoints abort after this many milliseconds. |
| `concurrency` | number | `5` | Max in-flight requests when translating a batch. Lower it if your translation backend rate-limits aggressively; raise it if your backend is fast and you have plenty of capacity. |

## Wire contract (v2.0.0)

The provider issues one POST per item in the batch.

### Request

```
POST {apiURL}?target={targetLocale}&source={sourceLocale}[&format=html][&provider={translationProvider}]

Headers:
  Content-Type: text/plain    (or text/html when the body is HTML)
  Authorization: Bearer <apiKey>   (only when apiKey is configured)

Body: the raw text or HTML to translate
```

- Query parameters are encoded via `URLSearchParams`. Locale codes, provider names, and any other interpolated values are properly percent-encoded.
- `format=html` is added when the input passes `is-html()`. Plain text omits the parameter.
- The request aborts after `timeoutMs` (default 30s) via `AbortSignal.timeout(...)`.
- The provider runs at most `concurrency` items in flight at once (default 5) — large pages no longer fire 50+ simultaneous POSTs at your backend.

### Per-format behavior

| Field type / `format` | What hits the wire |
|---|---|
| `string`, `text`, `plain` | The raw text. `Content-Type: text/plain`. |
| `html` (input is already HTML) | The HTML. `Content-Type: text/html`, `&format=html`. |
| `markdown` | Converted to HTML before sending and back to markdown after. `Content-Type: text/html`, `&format=html`. Your custom API never sees raw markdown. |
| `jsonb` (Strapi blocks) | Blocks → HTML (via the host plugin's `format` service) → POST → HTML response → blocks. `Content-Type: text/html`, `&format=html`. |

### Response

- **2xx**: the response body is read via `response.text()` and used as the translated value. The body must be plain text — no JSON envelope.
- **Non-2xx**: throws. Per-item failures fall back to source text (with a logged error); a batch where *every* item fails throws an `AggregateError`.
- **Empty body**: throws as if it were a non-2xx error.

### Example custom API server (Express, v2.0.0)

```js
import express from "express";
import { translate } from "your-translation-engine";

const app = express();
app.use(express.text({ type: ["text/plain", "text/html"] }));

app.post("/translate", async (req, res) => {
  const apiKey = req.headers.authorization?.replace(/^Bearer /, "");
  if (apiKey !== process.env.MY_API_KEY) return res.sendStatus(401);

  const { target, source, format } = req.query;
  const isHTML = format === "html";

  const translated = await translate(req.body, { target, source, isHTML });
  res.type(isHTML ? "text/html" : "text/plain").send(translated);
});

app.listen(3000);
```

## Migration from v1.x

If you have a custom API server speaking the v1.x contract, you need to update it before installing v2.0.0. The differences:

| Concern | v1.x | v2.0.0 |
|---|---|---|
| API key location | `?apiKey=...` query param | `Authorization: Bearer <key>` header |
| Query encoding | Raw template-string interpolation | `URLSearchParams` (proper percent-encoding) |
| `Content-Type` on POST | Not set | `text/plain` or `text/html` |
| Timeout | None (could hang forever) | 30s default, configurable via `timeoutMs` |
| Failures | Silently returned source text and reported success | Per-item: log + source-text fallback. Batch-level all-fail: throws |

### Server-side migration example

**Before (v1.x):**

```js
app.post("/translate", async (req, res) => {
  if (req.query.apiKey !== process.env.MY_API_KEY) return res.sendStatus(401);
  const { target, source, format } = req.query;
  const text = req.body; // assumed string from raw-body parsing
  const translated = await translate(text, { target, source });
  res.send(translated);
});
```

**After (v2.0.0):**

```js
app.use(express.text({ type: ["text/plain", "text/html"] })); // honor Content-Type

app.post("/translate", async (req, res) => {
  const key = req.headers.authorization?.replace(/^Bearer /, "");
  if (key !== process.env.MY_API_KEY) return res.sendStatus(401);
  const { target, source, format } = req.query;
  const translated = await translate(req.body, {
    target,
    source,
    isHTML: format === "html",
  });
  res.type(req.headers["content-type"]).send(translated);
});
```

## Compatibility

- Requires Strapi v4. Strapi v5 is not yet supported because the host plugin (`strapi-plugin-translate`) does not yet ship a v5-compatible release.
- Declared as a `peerDependency` on `strapi-plugin-translate ^1.4.0`. npm will warn if you install this provider against an incompatible host plugin version. (The same surface — `format.blockToHtml`, `format.htmlToBlock`, `format.markdownToHtml`, `format.htmlToMarkdown` — has been stable in the host plugin since v1.3.0; the `^1.4.0` pin matches what the provider has actually been tested against.)

## License

MIT — see `LICENSE`.
