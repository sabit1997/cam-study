// next build --output standalone 후 정적 파일들을 standalone 디렉터리로 복사
const { cpSync, existsSync } = require("fs");
const { join } = require("path");

const root = join(__dirname, "..");
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error("ERROR: .next/standalone not found. Run 'npm run build:web' first.");
  process.exit(1);
}

const copies = [
  [join(root, ".next", "static"), join(standalone, ".next", "static")],
  [join(root, "public"), join(standalone, "public")],
  [join(root, ".env.production"), join(standalone, ".env.production")],
];

for (const [src, dest] of copies) {
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
    console.log(`copied: ${src.replace(root, ".")} → ${dest.replace(root, ".")}`);
  }
}
