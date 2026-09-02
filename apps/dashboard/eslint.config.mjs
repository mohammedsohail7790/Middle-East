import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      // eslint-config-next 16 bundles eslint-plugin-react-hooks v6, which adds
      // new React Compiler-oriented rules (refs/purity/immutability/set-state-in-effect)
      // that flag long-standing "latest ref" patterns used throughout this codebase.
      // Left off for the Next 16 upgrade to stay scoped to the postcss CVE fix;
      // revisit as a separate hooks-cleanup pass.
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/use-memo": "off",
    },
  },
];

export default config;
