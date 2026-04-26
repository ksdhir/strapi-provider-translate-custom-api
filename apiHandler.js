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

  if (apiKey) {
    params.set("apiKey", apiKey);
  }

  if (isHTML(text)) {
    params.set("format", "html");
  }

  if (translationProvider) {
    params.set("provider", translationProvider);
  }

  const url = `${apiURL}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: "POST",
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
