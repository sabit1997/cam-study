import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  { ignores: ["dist-electron/**", "dist/**", ".next/**"] },
  ...compat.extends("plugin:react/recommended", "plugin:@typescript-eslint/recommended"),
];

export default eslintConfig;
