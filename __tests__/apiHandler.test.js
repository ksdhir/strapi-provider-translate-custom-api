const { fetchTranslation } = require("../apiHandler");

const mockFetchOnce = (body, { ok = true, status = 200 } = {}) => {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok,
    status,
    text: jest.fn().mockResolvedValueOnce(body),
  });
};

const lastFetchCall = () => global.fetch.mock.calls[0];

beforeEach(() => {
  global.fetch = jest.fn();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("fetchTranslation — current v1.x wire contract", () => {
  test("builds minimum URL with target and source", async () => {
    mockFetchOnce("hola");

    await fetchTranslation({
      apiURL: "https://api.example.com/translate",
      text: "hello",
      sourceLocale: "en",
      targetLocale: "es",
    });

    const [url] = lastFetchCall();
    expect(url).toBe("https://api.example.com/translate?target=es&source=en");
  });

  test("appends apiKey to URL when provided", async () => {
    mockFetchOnce("hola");

    await fetchTranslation({
      apiURL: "https://api.example.com/translate",
      apiKey: "secret123",
      text: "hello",
      sourceLocale: "en",
      targetLocale: "es",
    });

    const [url] = lastFetchCall();
    expect(url).toContain("apiKey=secret123");
  });

  test("appends &format=html when input is HTML", async () => {
    mockFetchOnce("<p>hola</p>");

    await fetchTranslation({
      apiURL: "https://api.example.com/translate",
      text: "<p>hello</p>",
      sourceLocale: "en",
      targetLocale: "es",
    });

    const [url] = lastFetchCall();
    expect(url).toContain("format=html");
  });

  test("does not append &format=html for plain text", async () => {
    mockFetchOnce("hola");

    await fetchTranslation({
      apiURL: "https://api.example.com/translate",
      text: "plain text",
      sourceLocale: "en",
      targetLocale: "es",
    });

    const [url] = lastFetchCall();
    expect(url).not.toContain("format=html");
  });

  test("appends provider name when translationProvider is set", async () => {
    mockFetchOnce("hola");

    await fetchTranslation({
      apiURL: "https://api.example.com/translate",
      text: "hello",
      sourceLocale: "en",
      targetLocale: "es",
      translationProvider: "DeepL",
    });

    const [url] = lastFetchCall();
    expect(url).toContain("provider=DeepL");
  });

  test("POSTs with raw text body", async () => {
    mockFetchOnce("hola");

    await fetchTranslation({
      apiURL: "https://api.example.com/translate",
      text: "hello",
      sourceLocale: "en",
      targetLocale: "es",
    });

    const [, init] = lastFetchCall();
    expect(init.method).toBe("POST");
    expect(init.body).toBe("hello");
  });

  test("returns response body text on success", async () => {
    mockFetchOnce("hola");

    const result = await fetchTranslation({
      apiURL: "https://api.example.com/translate",
      text: "hello",
      sourceLocale: "en",
      targetLocale: "es",
    });

    expect(result).toBe("hola");
  });

  test("returns original text on HTTP error (current swallow behavior)", async () => {
    mockFetchOnce("oops", { ok: false, status: 500 });

    const result = await fetchTranslation({
      apiURL: "https://api.example.com/translate",
      text: "hello",
      sourceLocale: "en",
      targetLocale: "es",
    });

    expect(result).toBe("hello");
  });

  test("returns original text on network error (current swallow behavior)", async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await fetchTranslation({
      apiURL: "https://api.example.com/translate",
      text: "hello",
      sourceLocale: "en",
      targetLocale: "es",
    });

    expect(result).toBe("hello");
  });

  test("returns original text on empty response (current swallow behavior)", async () => {
    mockFetchOnce("");

    const result = await fetchTranslation({
      apiURL: "https://api.example.com/translate",
      text: "hello",
      sourceLocale: "en",
      targetLocale: "es",
    });

    expect(result).toBe("hello");
  });

  test("throws synchronously when apiURL is missing", async () => {
    await expect(
      fetchTranslation({
        text: "hello",
        sourceLocale: "en",
        targetLocale: "es",
      })
    ).rejects.toThrow(/API URL/);
  });

  test("throws synchronously when targetLocale is missing", async () => {
    await expect(
      fetchTranslation({
        apiURL: "https://api.example.com/translate",
        text: "hello",
        sourceLocale: "en",
      })
    ).rejects.toThrow(/target locale/);
  });
});
