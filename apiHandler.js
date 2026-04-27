const DEFAULT_TIMEOUT_MS = 30_000;

// `is-html` is ESM-only, so we have to use dynamic import from this CJS
// module. Memoize the resulting promise so we pay the import cost once at
// module load instead of on every fetchTranslation call (issue #25).
let isHtmlPromise;
const getIsHtml = () => (isHtmlPromise ??= import("is-html").then((m) => m.default));

const fetchTranslation = async ({
  apiURL,
  apiKey,
  text,
  targetLocale,
  sourceLocale,
  translationProvider,
  timeoutMs,
}) => {
  const isHTML = await getIsHtml();

  if (!apiURL || !text || !targetLocale) {
    throw new Error("API URL, text, and target locale must be provided");
  }

  const params = new URLSearchParams({
    target: targetLocale,
    source: sourceLocale,
  });

  if (isHTML(text)) {
    params.set("format", "html");
  }

  if (translationProvider) {
    params.set("provider", translationProvider);
  }

  const url = `${apiURL}?${params.toString()}`;

  const headers = {
    "Content-Type": isHTML(text) ? "text/html" : "text/plain",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: text,
    signal: AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Translation API responded with HTTP ${response.status} ${response.statusText}`
    );
  }

  const data = await response.text();

  if (!data) {
    throw new Error("Translation API responded with an empty body");
  }

  return data;
};

module.exports = { fetchTranslation, DEFAULT_TIMEOUT_MS };
