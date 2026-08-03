import { config } from "@remotion/eslint-config-flat";

export default [
  ...config,
  {
    files: ["src/three/**/*.tsx"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
];
