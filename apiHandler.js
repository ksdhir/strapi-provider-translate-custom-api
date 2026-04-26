const fetchTranslation = async ({
  apiURL,
  apiKey,
  text,
  targetLocale,
  sourceLocale,
  translationProvider,
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

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: text,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.text();

    if (!data) {
      throw new Error("No translation found");
    }

    return data;
  } catch (error) {
    console.error(`Failed to fetch translation for: "${text}"`);
    console.error(error);
    return text; // Fallback to original text on failure
  }
};

module.exports = { fetchTranslation };
