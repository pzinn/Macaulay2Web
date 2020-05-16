module.exports = {
  parser: "@typescript-eslint/parser", // Specifies the ESLint parser
  parserOptions: {
    ecmaVersion: 2020, // Allows for the parsing of modern ECMAScript features
    sourceType: "module" // Allows for the use of imports
  },
  extends: [
      "plugin:@typescript-eslint/recommended", // Uses the recommended rules from the @typescript-eslint/eslint-plugin
      "prettier/@typescript-eslint",
      "plugin:prettier/recommended"
  ],
  rules: {
    // Place to specify ESLint rules. Can be used to overwrite rules specified from the extended configs
      // e.g. "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/interface-name-prefix": "off",
      "@typescript-eslint/no-var-requires": "warn",
      "@typescript-eslint/no-use-before-define": "warn",
      "@typescript-eslint/no-this-alias": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-var-requires": "off"
  }
};
