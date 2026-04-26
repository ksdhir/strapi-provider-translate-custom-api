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

  test("throws (wrapped) when sourceLocale or targetLocale is missing", async () => {
    setupStrapi();
    const { translate } = init();

    await expect(
      translate({ text: "hello", sourceLocale: "en" })
    ).rejects.toThrow(/Translation failed/);
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

  test("returns original text per item on per-item failure (current swallow behavior)", async () => {
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
  });

  test("usage() is a no-op", async () => {
    setupStrapi();
    const { usage } = init();
    await expect(usage()).resolves.toBeUndefined();
  });
});
