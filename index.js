const { fetchTranslation } = require("./apiHandler");

const DEFAULT_CONCURRENCY = 5;

// provide fallbacks for services that don't support the target languages
const fallbackLanguages = {
  DeepL: [{ source: "es-419", fallback: "es" }],
};

// Throttled Promise.allSettled. Runs at most `limit` items in flight at a time
// and preserves input order in the results array. We rely on this instead of
// raw Promise.allSettled so a 50-string page doesn't fire 50 simultaneous
// fetches at the consumer's API (issue #9).
const allSettledLimit = async (items, limit, fn) => {
  const results = new Array(items.length);
  let next = 0;

  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
};

module.exports = {
  provider: "custom-api",
  name: "Custom API Translation Provider",

  init(providerOptions = {}, pluginConfig = {}) {
    const {
      apiURL,
      apiKey,
      translationProvider,
      timeoutMs,
      concurrency = DEFAULT_CONCURRENCY,
    } = providerOptions;

    if (!apiURL) {
      throw new Error(
        "strapi-provider-translate-custom-api: providerOptions.apiURL is required"
      );
    }

    try {
      new URL(apiURL);
    } catch (cause) {
      throw new Error(
        `strapi-provider-translate-custom-api: providerOptions.apiURL is not a valid URL (got "${apiURL}"). Include the scheme, e.g. "https://example.com/translate".`,
        { cause }
      );
    }

    return {
      /**
       * Translate a batch of strings (or block arrays) for the host plugin.
       *
       * Host plugin invariants
       * ----------------------
       * The following invariants are enforced by `strapi-plugin-translate`'s
       * service layer (see `strapi-plugin-translate/server/services/translate.js`).
       * They're documented here so contributors don't accidentally break the
       * provider's contract with the host:
       *
       * 1. `text` is **always an array** when called from the host plugin.
       *    The single-string convenience path (`text` → `[text]`) below
       *    exists only for ad-hoc consumers; the host always sends an array.
       * 2. `format` is **homogeneous within a call** — the host never mixes
       *    `'plain'`, `'markdown'`, `'html'`, and `'jsonb'` items in one
       *    batch. The format conversion paths (markdown → HTML, blocks →
       *    HTML) safely apply to the whole array.
       * 3. The returned array **must match input length and order** — the
       *    host maps results back to the originating fields by index.
       *    `allSettledLimit` preserves order even when items resolve out of
       *    sequence; do not switch to `Promise.race` or any unordered fan-out.
       * 4. For `format === 'jsonb'`, each array element is itself an array
       *    of Strapi blocks (`text` is `[[blocksA], [blocksB], ...]`).
       *    `formatService.blockToHtml` accepts that nested shape and yields
       *    a flat array of HTML strings; `formatService.htmlToBlock` does
       *    the inverse on the way back.
       * 5. `priority` is end-to-end plumbing only — currently a **no-op**
       *    everywhere (host plugin and this provider). Don't gate logic
       *    on it without coordinating with the host.
       *
       * @param {{
       *  text: string | string[],
       *  sourceLocale: string,
       *  targetLocale: string,
       *  format?: 'plain' | 'markdown' | 'html' | 'jsonb'
       * }} options all translate options
       * @returns {Promise<string[] | object[]>} the input text(s) translated.
       *   Length and order match `options.text`. For `format === 'jsonb'`,
       *   each element is an array of Strapi blocks.
       */
      async translate(options) {
        let { sourceLocale, targetLocale, format } = options;
        let text = options.text;

        if (!text) {
          return [];
        }

        const formatService = strapi.plugin('translate').service('format');
        let isBlock = false;
        let isMarkdown = false;

        // Route format-specific content through HTML on the wire so the
        // consumer's API only ever sees plain text or HTML, never blocks
        // or markdown semantics. Mirrors the host plugin's own conversion
        // services.
        if (Array.isArray(text) && format === 'jsonb') {
          text = await formatService.blockToHtml(text);
          isBlock = true;
        } else if (format === 'markdown') {
          text = await formatService.markdownToHtml(text);
          isMarkdown = true;
        }

        // Ensure text is an array for batch translation
        if (typeof text === "string") {
          text = [text];
        }

        if (!sourceLocale || !targetLocale) {
          throw new Error("source and target locale must be defined");
        }

        // check if the target language has a fallback
        const fallbacks = fallbackLanguages[translationProvider];
        if (fallbacks) {
          const fallback = fallbacks.find(
              (item) => item.source === targetLocale
          );
          if (fallback) {
            targetLocale = fallback.fallback;
          }
        }

        const settled = await allSettledLimit(text, concurrency, (singleText) =>
          fetchTranslation({
            apiURL,
            apiKey,
            text: singleText,
            targetLocale,
            sourceLocale,
            translationProvider,
            timeoutMs,
          })
        );

        // If every item failed, surface a real error so the host plugin
        // doesn't silently mark the batch as successful (issue #8).
        if (settled.every((r) => r.status === "rejected")) {
          throw new AggregateError(
            settled.map((r) => r.reason),
            "All items failed to translate"
          );
        }

        // Per-item fallback: items that failed return the source text so a
        // single bad row doesn't poison the whole batch. Failures are still
        // logged so the operator can see what went wrong.
        let translatedTexts = settled.map((r, i) => {
          if (r.status === "fulfilled") return r.value;
          strapi.log.warn(
            `[strapi-provider-translate-custom-api] Failed to translate item ${i}: "${text[i]}" — ${r.reason?.message ?? r.reason}`
          );
          return text[i];
        });

        // Convert HTML responses back to the original format the host plugin
        // expects for this field type.
        if (isBlock) {
          let blocks = await formatService.htmlToBlock(translatedTexts);
          if (!Array.isArray(blocks)) {
            blocks = [blocks];
          }
          return blocks;
        }

        if (isMarkdown) {
          let markdown = await formatService.htmlToMarkdown(translatedTexts);
          if (!Array.isArray(markdown)) {
            markdown = [markdown];
          }
          return markdown;
        }

        return translatedTexts;
      },

      async usage() {
        // Implement usage
        // return { count: 0, limit: 100000 };
      },
    };
  },
};
