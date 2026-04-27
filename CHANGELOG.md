# Changelog

All notable changes to `strapi-provider-translate-custom-api` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **GitHub Actions CI workflow** ([#29](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/29)). `.github/workflows/ci.yml` runs `npm ci && npm test` on Node 18 / 20 / 22 for every push and pull request against `main`. PRs now show a CI status check before merge.
- **Prettier check in CI** ([#31](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/31)). Separate job runs `npx prettier@3 --check .` so a formatting drift breaks the build. Configured via `.prettierrc.json` (`printWidth: 100`, double quotes, semicolons, `trailingComma: "es5"`) and `.prettierignore` (lockfile, `.claude/` tooling, `CHANGELOG.md`). Prettier itself is not added to `devDependencies` — `npx` fetches a pinned version on demand to keep the lockfile small.

### Changed

- **Memoize the `is-html` dynamic import** ([#25](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/25)). `apiHandler.js` previously did `await import("is-html")` on every `fetchTranslation` call. The import is now hoisted to module load and the resulting promise is cached, so the cost is paid once. Behavior is unchanged; this is a non-breaking micro-optimization.
- **Drop the unused `priority` field from the `translate()` JSDoc** ([#27](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/27)). The host plugin passes `priority` through but this provider has never consumed it, and there's no defined wire semantic for forwarding it to a user's custom API. Documenting an option the provider doesn't act on was misleading; the field is removed from the JSDoc. No runtime change.

### Removed

- **Legacy `test.js` scratch script** ([#28](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/28)). The half-broken script at the repo root called `strapi.plugin('translate').service('format')` without a `strapi` global and threw on first run. Real tests have lived in `__tests__/` since v2.0.0; the scratch file was strictly worse than nothing.

### Documentation

- **Custom API server contract section** ([#19](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/19)). Promoted the existing wire-contract spec into a labelled "Custom API server contract" section in the README with an explicit anchor and a status-code semantics table (2xx, 2xx-empty, non-2xx) covering provider behavior and operator guidance.
- **Failure behavior section** ([#20](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/20)). Documented the two layers of failure handling: per-item silent fallback to source text via `strapi.log.warn` (since v2.1.0), and batch-level `AggregateError` when every item fails (since v2.0.0). Notes that no `silentFallback` opt-out exists today and would land as a separate `providerOptions` entry in a future minor release.
- **Host plugin invariants in `translate()` JSDoc** ([#21](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/21)). Added a JSDoc block above `translate()` in `index.js` capturing the five invariants enforced by `strapi-plugin-translate` (text always an array, format homogeneous, length and order preserved, jsonb is nested arrays, priority is a no-op). Mirrored a short version in `CLAUDE.md`.
- **README minor fixes** ([#22](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/22)). Verified no stale `url` references remain (the field is `apiURL`), added `concurrency` to the example config block so it matches the `providerOptions` table, and confirmed the Strapi v5 compatibility note is still accurate.

## [2.2.0] - 2026-04-26

Package hygiene — non-breaking. Improves the npm presentation, the install-time signals consumers receive, and the size of the tarball they download.

### Added

- **`peerDependencies` pin** ([#14](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/14)). Declares `strapi-plugin-translate ^1.4.0` so npm warns at install time when consumers pair this provider with an incompatible host plugin version. The host plugin's `format` service surface (which this provider depends on) has been stable since v1.3.0; the `^1.4.0` pin reflects what's actually been tested.
- **`files` whitelist** in `package.json` ([#13](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/13)). Only the runtime files (`index.js`, `apiHandler.js`), `README.md`, `CHANGELOG.md`, and `LICENSE` ship to npm now. Tarball dropped from 14 files / 16.2 kB to 6 files / 8.4 kB. Tests, internal tooling, project-context files, and the legacy `test.js` scratch script no longer pollute consumer installs.
- **`engines.node: ">=18"`** in `package.json` — formalizes the Node version assumption (we use `AbortSignal.timeout`, native `fetch`, `URLSearchParams`).

### Changed

- **`package.json` metadata cleanup** ([#13](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/13)). Populated `description`, `keywords`, `author`, `homepage`, `bugs`. Corrected `license` from `ISC` (default scaffold) to `MIT` to match the actual `LICENSE` file. The npm page now reflects what the package actually is.

## [2.1.0] - 2026-04-26

Reliability hardening — non-breaking. Drops in over v2.0.0 with no migration required.

### Added

- **`providerOptions.concurrency`** ([#9](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/9)) — caps in-flight requests during batch translation. Default `5`. A 50-string page now sends 5 at a time instead of 50 at once. Override per-deployment if your translation backend has different capacity. Implemented via a small inline `allSettledLimit` helper (~15 lines, no new dep). Input order is preserved in results regardless of resolution order.
- **Markdown round-trip via HTML** ([#12](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/12)) — `format === 'markdown'` fields now go through `formatService.markdownToHtml` → POST as HTML → `formatService.htmlToMarkdown`. Mirrors the existing jsonb behavior. Custom API servers never see raw markdown semantics on the wire — they receive HTML, same as for blocks. Trade-off: any markdown features without HTML equivalents may be lost in conversion (same as for jsonb).

### Changed

- **Per-item failure logs now route through `strapi.log`** ([#10](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/10)). The `console.error` calls in the per-item fallback path are replaced with `strapi.log.warn`, so failures flow through Strapi's pino logger and respect the project's configured log level/format. Messages get a `[strapi-provider-translate-custom-api]` prefix for grep-ability across mixed plugin output. `apiHandler.js` no longer calls `console.*` at all.

## [2.0.0] - 2026-04-26

> **Breaking release.** Consumer custom-API servers built against the v1.x wire contract must be updated before deploying v2.0.0. See README "Migration from v1.x" for a side-by-side example.

### Changed (Breaking — wire contract)

- **`apiKey` moved from URL to header** ([#4](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/4)). Requests now include `Authorization: Bearer <apiKey>` when an API key is configured. Keys no longer leak into proxy/access logs or browser history. Servers must read `req.headers.authorization` instead of `req.query.apiKey`.
- **Query string is now properly URL-encoded** ([#5](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/5)). Switched URL building to `URLSearchParams`; locale codes, provider names, and other interpolated values are percent-encoded. Servers that decoded query params manually instead of using a query parser may receive different (correctly-encoded) values.
- **POSTs now include a `Content-Type` header** ([#6](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/6)). Set to `text/html` when the body is HTML (detected via `is-html`), else `text/plain`. Servers that ignored the missing header may need to update their parsing.
- **30-second fetch timeout by default** ([#7](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/7)). Hanging custom APIs now abort via `AbortSignal.timeout(...)` instead of stalling `Promise.all` indefinitely. Configurable via `providerOptions.timeoutMs`.
- **Real translation errors now surface** ([#8](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/8)). The double-swallow that hid all failures is gone. Per-item failures: error is logged and the slot falls back to source text. All-items failure: throws `AggregateError` so the host plugin sees the batch failure instead of silently presenting source-text fallbacks. The outer `try/catch` wrapper that masked error types and causes is also removed.

### Added

- **`apiURL` is validated at init time** ([#11](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/11)) via `new URL(...)`. Misconfigurations now throw a clear startup error naming the field, instead of producing a confusing fetch error on first translation.
- **`providerOptions.timeoutMs`** — new field (see #7).
- **Jest test suite** ([#15](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/15)). 40 tests covering URL building, header presence, fallback table, error paths, init validation, and the block round-trip. `npm test` exits 0 on green.

### Migration

- Update your custom API server to the v2.0.0 wire contract before installing this release. See README "Migration from v1.x" for before/after server snippets.
- If you relied on the silent source-text fallback for batch-level failures, plan for the new `AggregateError` propagation. A future `silentFallback` opt-out is tracked in [#20](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/20).

## [1.0.28] - 2026-04-26

### Added

- This `CHANGELOG.md`. From this release on, every published version gets an entry summarizing what changed (closes [#30](https://github.com/ksdhir/strapi-provider-translate-custom-api/issues/30)).

### Notes

- No runtime changes. This release exists so that `v2.0.0` (the upcoming breaking wire-contract release) has somewhere to be recorded. Versions `1.0.0` through `1.0.27` are not retroactively documented here — see `git log` for that history.

[Unreleased]: https://github.com/ksdhir/strapi-provider-translate-custom-api/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/ksdhir/strapi-provider-translate-custom-api/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/ksdhir/strapi-provider-translate-custom-api/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/ksdhir/strapi-provider-translate-custom-api/compare/v1.0.28...v2.0.0
[1.0.28]: https://github.com/ksdhir/strapi-provider-translate-custom-api/compare/v1.0.27...v1.0.28
