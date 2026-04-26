jest.mock("../apiHandler", () => ({
  fetchTranslation: jest.fn(),
}));

const { fetchTranslation } = require("../apiHandler");
const provider = require("../index");

const setupStrapi = ({
  blockToHtml = jest.fn(),
  htmlToBlock = jest.fn(),
} = {}) => {
  global.strapi = {
    plugin: jest.fn().mockReturnValue({
      service: jest.fn().mockReturnValue({ blockToHtml, htmlToBlock }),
    }),
  };
  return { blockToHtml, htmlToBlock };
};

beforeEach(() => {
  fetchTranslation.mockReset();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  delete global.strapi;
});

const init = (opts = {}) =>
  provider.init({
    apiURL: "https://api.example.com/translate",
    ...opts,
  });

describe("init — timeoutMs forwarding (#7)", () => {
  test("forwards timeoutMs from providerOptions to fetchTranslation", async () => {
    setupStrapi();
    fetchTranslation.mockResolvedValueOnce("hola");
    const { translate } = provider.init({
      apiURL: "https://api.example.com/translate",
      timeoutMs: 5_000,
    });

    await translate({
      text: "hello",
      sourceLocale: "en",
      targetLocale: "es",
    });

    expect(fetchTranslation).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 5_000 })
    );
  });

  test("forwards undefined when timeoutMs is not configured (default applies in apiHandler)", async () => {
    setupStrapi();
    fetchTranslation.mockResolvedValueOnce("hola");
    const { translate } = provider.init({
      apiURL: "https://api.example.com/translate",
    });

    await translate({
      text: "hello",
      sourceLocale: "en",
      targetLocale: "es",
    });

    expect(fetchTranslation).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: undefined })
    );
  });
});

describe("init — apiURL validation (#11)", () => {
  test("throws when apiURL is missing", () => {
    expect(() => provider.init({})).toThrow(/apiURL is required/);
  });

  test("throws when apiURL has no scheme", () => {
    expect(() => provider.init({ apiURL: "example.com/translate" })).toThrow(
      /not a valid URL/
    );
  });

  test("throws when apiURL is malformed", () => {
    expect(() => provider.init({ apiURL: "  " })).toThrow(/not a valid URL/);
  });

  test("preserves the bad URL value in the error message", () => {
    expect(() =>
      provider.init({ apiURL: "not a url" })
    ).toThrow(/not a url/);
  });

  test("accepts a valid http URL", () => {
    expect(() =>
      provider.init({ apiURL: "http://api.example.com/translate" })
    ).not.toThrow();
  });

  test("accepts a valid https URL with path and query", () => {
    expect(() =>
      provider.init({ apiURL: "https://api.example.com/v1/translate?x=1" })
    ).not.toThrow();
  });
});

describe("init / translate — current v1.x behavior", () => {
  test("returns empty array when text is missing", async () => {
    setupStrapi();
    const { translate } = init();

    const result = await translate({
      text: undefined,
      sourceLocale: "en",
      targetLocale: "es",
    });

    expect(result).toEqual([]);
  });

  test("translates a single string by wrapping it in an array", async () => {
    setupStrapi();
    fetchTranslation.mockResolvedValueOnce("hola");
    const { translate } = init();

    const result = await translate({
      text: "hello",
      sourceLocale: "en",
      targetLocale: "es",
    });

    expect(result).toEqual(["hola"]);
    expect(fetchTranslation).toHaveBeenCalledTimes(1);
  });

  test("translates an array of strings in parallel", async () => {
    setupStrapi();
    fetchTranslation
      .mockResolvedValueOnce("hola")
      .mockResolvedValueOnce("mundo");
    const { translate } = init();

    const result = await translate({
      text: ["hello", "world"],
      sourceLocale: "en",
      targetLocale: "es",
    });

    expect(result).toEqual(["hola", "mundo"]);
    expect(fetchTranslation).toHaveBeenCalledTimes(2);
  });

  test("throws when sourceLocale or targetLocale is missing", async () => {
    setupStrapi();
    const { translate } = init();

    await expect(
      translate({ text: "hello", sourceLocale: "en" })
    ).rejects.toThrow(/source and target locale/);
  });

  test("applies DeepL es-419 → es fallback", async () => {
    setupStrapi();
    fetchTranslation.mockResolvedValueOnce("hola");
    const { translate } = init({ translationProvider: "DeepL" });

    await translate({
      text: "hello",
      sourceLocale: "en",
      targetLocale: "es-419",
    });

    expect(fetchTranslation).toHaveBeenCalledWith(
      expect.objectContaining({ targetLocale: "es" })
    );
  });

  test("does not apply fallback when translationProvider is not DeepL", async () => {
    setupStrapi();
    fetchTranslation.mockResolvedValueOnce("translated");
    const { translate } = init({ translationProvider: "Google" });

    await translate({
      text: "hello",
      sourceLocale: "en",
      targetLocale: "es-419",
    });

    expect(fetchTranslation).toHaveBeenCalledWith(
      expect.objectContaining({ targetLocale: "es-419" })
    );
  });

  test("converts blocks to HTML and back for jsonb format", async () => {
    const { blockToHtml, htmlToBlock } = setupStrapi();
    blockToHtml.mockResolvedValueOnce("<p>hello</p>");
    fetchTranslation.mockResolvedValueOnce("<p>hola</p>");
    htmlToBlock.mockResolvedValueOnce([{ type: "paragraph", children: [{ text: "hola" }] }]);
    const { translate } = init();

    const result = await translate({
      text: [{ type: "paragraph", children: [{ text: "hello" }] }],
      sourceLocale: "en",
      targetLocale: "es",
      format: "jsonb",
    });

    expect(blockToHtml).toHaveBeenCalled();
    expect(htmlToBlock).toHaveBeenCalledWith(["<p>hola</p>"]);
    expect(Array.isArray(result)).toBe(true);
  });

  test("ensures htmlToBlock result is wrapped in an array", async () => {
    const { blockToHtml, htmlToBlock } = setupStrapi();
    blockToHtml.mockResolvedValueOnce("<p>hello</p>");
    fetchTranslation.mockResolvedValueOnce("<p>hola</p>");
    htmlToBlock.mockResolvedValueOnce({ type: "paragraph", children: [{ text: "hola" }] });
    const { translate } = init();

    const result = await translate({
      text: [{ type: "paragraph", children: [{ text: "hello" }] }],
      sourceLocale: "en",
      targetLocale: "es",
      format: "jsonb",
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });

  test("falls back to source text on partial failure but logs (#8)", async () => {
    setupStrapi();
    fetchTranslation
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("mundo");
    const { translate } = init();

    const result = await translate({
      text: ["hello", "world"],
      sourceLocale: "en",
      targetLocale: "es",
    });

    expect(result).toEqual(["hello", "mundo"]);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to translate item 0")
    );
  });

  test("throws AggregateError when every item fails (#8)", async () => {
    setupStrapi();
    fetchTranslation
      .mockRejectedValueOnce(new Error("boom1"))
      .mockRejectedValueOnce(new Error("boom2"));
    const { translate } = init();

    await expect(
      translate({
        text: ["hello", "world"],
        sourceLocale: "en",
        targetLocale: "es",
      })
    ).rejects.toThrow(AggregateError);
  });

  test("usage() is a no-op", async () => {
    setupStrapi();
    const { usage } = init();
    await expect(usage()).resolves.toBeUndefined();
  });
});
