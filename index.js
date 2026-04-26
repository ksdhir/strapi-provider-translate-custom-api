const { fetchTranslation } = require("./apiHandler");

// provide fallbacks for services that don't support the target languages
const fallbackLanguages = {
  DeepL: [{ source: "es-419", fallback: "es" }],
};

module.exports = {
  provider: "custom-api",
  name: "Custom API Translation Provider",

  init(providerOptions = {}, pluginConfig = {}) {
    const { apiURL, apiKey, translationProvider, timeoutMs } = providerOptions;

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
       * @param {{
       *  text:string|string[],
       *  sourceLocale: string,
       *  targetLocale: string,
       *  priority: number,
       *  format?: 'plain'|'markdown'|'html'|'jsonb'
       * }} options all translate options
       * @returns {string[]|object[]} the input text(s) translated
       */
      async translate(options) {
        let { sourceLocale, targetLocale, format } = options;
        let text = options.text;

        if (!text) {
          return [];
        }

        const formatService = strapi.plugin('translate').service('format');
        let isBlock = false;

        // If the input is a block (jsonb), convert it to HTML for translation
        if (Array.isArray(text) && format === 'jsonb') {
          text = await formatService.blockToHtml(text);
          isBlock = true;
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

        const settled = await Promise.allSettled(
          text.map((singleText) =>
            fetchTranslation({
              apiURL,
              apiKey,
              text: singleText,
              targetLocale,
              sourceLocale,
              translationProvider,
              timeoutMs,
            })
          )
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

        // If we translated a block, convert the translated HTML back to blocks
        if (isBlock) {
          let blocks = await formatService.htmlToBlock(translatedTexts);
          if (!Array.isArray(blocks)) {
            blocks = [blocks];
          }
          return blocks;
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
