const { fetchTranslation } = require("./apiHandler");

// provide fallbacks for services that don't support the target languages
const fallbackLanguages = {
  DeepL: [{ source: "es-419", fallback: "es" }],
};

module.exports = {
  provider: "custom-api",
  name: "Custom API Translation Provider",

  init(providerOptions = {}, pluginConfig = {}) {
    const { apiURL, apiKey, translationProvider } = providerOptions;

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
        try {
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

          // collect all promises
          const translationPromises = text.map((singleText) => {
            return fetchTranslation({
              apiURL,
              apiKey,
              text: singleText,
              targetLocale,
              sourceLocale,
            }).catch((error) => {
              console.log(`Failed to translate: "${singleText}"`);
              console.error(error);
              return singleText; // Fallback to original text on failure
            });
          });

          // execute all promises
          let translatedTexts = await Promise.all(translationPromises);
          // If we translated a block, convert the translated HTML back to blocks
          if (isBlock) {

            let blocks = await formatService.htmlToBlock(translatedTexts);

            // Always ensure blocks is an array
            if (!Array.isArray(blocks)) {
              blocks = [blocks];
            }
            return blocks;
          }

          return translatedTexts;
        } catch (error) {
          throw new Error(`Translation failed: ${error.message}`);
        }
      },

      async usage() {
        // Implement usage
        // return { count: 0, limit: 100000 };
      },
    };
  },
};
