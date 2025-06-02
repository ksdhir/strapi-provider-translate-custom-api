# strapi-provider-translate-custom-api

`strapi-provider-translate-custom-api` is a custom translation provider plugin for Strapi that integrates seamlessly with the `strapi-plugin-translate`. It enables developers to use their own translation endpoint or API for translating content, without relying on third-party services like Google Translate or OpenAI's ChatGPT.

## Features

- **Custom Translation Endpoint**: Use your own POST API endpoint to handle translations.
- **Error Handling**: If the translation fails, the plugin gracefully falls back to the original value, allowing manual translation.
- **Seamless Integration**: Works directly with `strapi-plugin-translate`.

## Installation

Install the plugin using npm:

```bash
npm install strapi-provider-translate-custom-api
```

## Configuration

To configure the plugin, you need to specify the custom translation endpoint in your Strapi configuration file (`config/plugins.js`) after installing the `strapi-plugin-translate` package.

Example:

```javascript
module.exports = {
  translate: {
    enabled: true,
    config: {
      provider: "custom-api",
      providerOptions: {
        apiURL: env("TRANSLATION_API_URL"),
      },
      translatedFieldTypes: [
        'string',
        { type: 'blocks', format: 'jsonb' }, 
        { type: 'text', format: 'plain' },
        { type: 'richtext', format: 'markdown' },
        'component',
        'dynamiczone',
      ],
    },
  },
// ...
};

```

## Usage

Once configured, `strapi-provider-translate-custom-api` will automatically handle translations via the specified endpoint when used with `strapi-plugin-translate`.

The translation request is sent as a POST request to the configured `url` with the following structure:

### Request Example

```javascript
const response = await fetch(url, {
  method: "POST",
  body: text,
});
```

- `url`: Your custom API endpoint.
- `body`: The text to be translated.

### Response

The plugin expects the translated text to be returned in the response body as plain text.

## Fallback Behavior

If the translation fails (e.g., due to a network error or an invalid response from the custom API), the plugin will automatically fallback to the original text. This ensures that content remains editable and can be translated manually if needed.

## Compatibility

- Requires Strapi v4 (not tested on v5)
- Fully compatible with `strapi-plugin-translate`.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests to improve this plugin.

## License

This plugin is licensed under the MIT License. See the LICENSE file for more details.

---

### Notes

- Make sure your custom API endpoint can handle POST requests and returns the expected translation output.
- Ensure the endpoint is secure and performs adequate error handling.

