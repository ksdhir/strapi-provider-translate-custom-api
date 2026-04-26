const DEFAULT_TIMEOUT_MS = 30_000;

const fetchTranslation = async ({
  apiURL,
  apiKey,
  text,
  targetLocale,
  sourceLocale,
  translationProvider,
  timeoutMs,
}) => {
  // dynamic import html
  const isHTML = (await import("is-html")).default;

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
