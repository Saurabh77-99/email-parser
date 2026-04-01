import googleappsscript from "eslint-plugin-googleappsscript";
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["**/*.gs"],
    plugins: {
      googleappsscript: googleappsscript
    },
    languageOptions: {
      globals: {
        ...googleappsscript.environments.googleappsscript.globals,
        CardService: "readonly",
        GmailApp: "readonly",
        UrlFetchApp: "readonly",
        SpreadsheetApp: "readonly",
        Utilities: "readonly",
        Logger: "readonly",
        console: "readonly"
      }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": "off" // Relaxed for GS global functions
    }
  }
];
