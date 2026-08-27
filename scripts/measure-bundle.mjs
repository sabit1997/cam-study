// scripts/measure-bundle.mjs
// 사용법: node scripts/measure-bundle.mjs before | node scripts/measure-bundle.mjs after
// 결과: bundle-out/<label>/summary.md, raw.json
//
// 앱의 크기를 4계층으로 나눠 잰다. 층이 다르면 재는 대상도, 줄이는 방법도,
// 사용자가 체감하는 지점도 다르기 때문에 한 숫자로 합치지 않는다.
//   A 렌더러 청크   dist/assets/*.js        웹 첫 로드 · 라우트 전환
//   B Electron 메인 dist-electron/main.js   데스크탑 기동 시간
//   C 프로덕션 의존성 node_modules 서브셋    CI · npm install 시간
//   D 인스톨러       app.asar / NSIS·DMG     다운로드 · 설치
//
// 원칙 (docs/bundle-size.md):
//   1. 모든 수치에 커밋 해시를 박는다. 날짜만으로는 재현이 안 된다.
//   2. raw / gzip / minify 를 섞어 비교하지 않는다. 항상 라벨을 함께 적는다.
//
// D 계층은 electron-builder 실행이 필요해 느리다. MEASURE_INSTALLER=1 일 때만 돈다.
// 빌드를 건너뛰고 기존 산출물로 집계만 하려면 --no-build.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execSync, execFileSync } from "node:child_process";

const ROOT = path.join(import.meta.dirname, "..");

// ─────────────── 인자 · 출력 ───────────────
const LABEL = process.argv[2];
if (!LABEL || LABEL.startsWith("--")) {
  console.error("usage: node scripts/measure-bundle.mjs <before|after> [--no-build]");
  process.exit(1);
}
const NO_BUILD = process.argv.includes("--no-build");
const WITH_INSTALLER = process.env.MEASURE_INSTALLER === "1";

const OUT_DIR = path.join(ROOT, "bundle-out", LABEL);
fs.mkdirSync(OUT_DIR, { recursive: true });

// ─────────────── 공통 헬퍼 ───────────────
const KB = 1024;
const MB = 1024 * 1024;
const fmtBytes = (b) =>
  b == null ? "—" : b >= MB ? `${(b / MB).toFixed(2)} MB` : `${(b / KB).toFixed(1)} KB`;
const fmt = (v) => (v == null ? "—" : typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(2)) : v);
const mark = (ok) => (ok ? "✓" : "⚠");

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
}

/**
 * 디렉터리의 apparent size (파일 크기 합). du --apparent-size 와 같은 의미로,
 * 파일시스템 블록 단위 반올림을 타지 않아 플랫폼 간 비교가 가능하다.
 *
 * skipNested: 하위 node_modules 를 건너뛴다. npm ls --parseable 은 중첩 패키지도
 * 각각 한 줄로 내놓기 때문에, 건너뛰지 않으면 같은 바이트를 두 번 센다.
 */
function dirStat(dir, { skipNested = true } = {}) {
  let bytes = 0;
  let files = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue; // 권한·심볼릭 링크 깨짐은 건너뛴다
    }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (skipNested && e.name === "node_modules") continue;
        stack.push(p);
      } else if (e.isFile()) {
        try {
          bytes += fs.statSync(p).size;
          files++;
        } catch {
          /* 경쟁 상태로 사라진 파일 */
        }
      }
    }
  }
  return { bytes, files };
}

// ─────────────── 기준 커밋 ───────────────
let head = null;
let dirty = null;
try {
  head = sh("git rev-parse HEAD").trim();
  dirty = sh("git status --porcelain").trim().length > 0;
} catch {
  /* git 없는 환경에서도 측정은 계속한다 */
}

// ─────────────── A · 렌더러 청크 ───────────────
function measureRenderer() {
  if (!NO_BUILD) {
    console.log("── A: vite build ─────────────");
    // BUNDLE_ANALYZE 를 여기서 넘겨 visualizer 를 측정 중에만 켠다.
    // package.json 스크립트에 인라인 환경변수를 쓰면 Windows 에서 깨지고,
    // cross-env 를 새로 넣을 만큼의 일은 아니다.
    sh("npm run build:web", { stdio: "inherit", env: { ...process.env, BUNDLE_ANALYZE: "1" } });
  }
  const assetsDir = path.join(ROOT, "dist", "assets");
  if (!fs.existsSync(assetsDir)) {
    return { error: "dist/assets 가 없습니다. --no-build 를 뺐는지 확인하세요." };
  }
  const chunks = fs
    .readdirSync(assetsDir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => {
      const full = path.join(assetsDir, f);
      const raw = fs.statSync(full).size;
      const gzip = zlib.gzipSync(fs.readFileSync(full)).length;
      // index-DEADBEEF.js → index
      const name = f.replace(/-[A-Za-z0-9_-]{6,}\.js$/, "");
      return { file: f, name, raw, gzip };
    })
    .sort((a, b) => b.raw - a.raw);

  const css = fs
    .readdirSync(assetsDir)
    .filter((f) => f.endsWith(".css"))
    .map((f) => fs.statSync(path.join(assetsDir, f)).size)
    .reduce((a, b) => a + b, 0);

  const distStat = dirStat(path.join(ROOT, "dist"), { skipNested: false });

  // 모듈별 기여도 — BUNDLE_ANALYZE=1 빌드에서만 생성된다 (없으면 생략)
  let modules = null;
  const vizPath = path.join(ROOT, "dist-analyze", "renderer.json");
  if (fs.existsSync(vizPath)) {
    try {
      const viz = JSON.parse(fs.readFileSync(vizPath, "utf8"));
      modules = summarizeVisualizer(viz);
    } catch (e) {
      modules = { error: String(e.message) };
    }
  }

  // ── 초기 로드 세트 ──
  //
  // 이게 A 계층의 1순위 지표다. 청크 하나만 보면 판단을 틀린다.
  //
  // 실제로 겪은 일: AI 컴포넌트를 lazy 로 내렸더니 zod 121.8 KB 가 index 에서
  // 빠졌는데도 index 청크는 355.7 → 373.0 KB 로 "커졌다". Rollup 이 재청킹해
  // config·useQuery·middleware·window-state 를 index 로 합쳤기 때문이다.
  // 그런데 초기 로드 세트 전체로 보면 7개 518.5 KB → 3개 408.4 KB 로 21 % 줄었다.
  // index 만 봤다면 개선을 회귀로 오판했을 것이다.
  //
  // index.html 의 <script src> 와 <link rel=modulepreload href> 가 브라우저가
  // 첫 화면에 실제로 받는 것들이다.
  const initial = (() => {
    const htmlPath = path.join(ROOT, "dist", "index.html");
    if (!fs.existsSync(htmlPath)) return null;
    const html = fs.readFileSync(htmlPath, "utf8");
    const names = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
    let raw = 0;
    let gzip = 0;
    const files = [];
    for (const n of names) {
      const p = path.join(assetsDir, n);
      if (!fs.existsSync(p)) continue;
      const buf = fs.readFileSync(p);
      raw += buf.length;
      gzip += zlib.gzipSync(buf).length;
      files.push(n);
    }
    return { count: files.length, files, raw, gzip };
  })();

  return {
    chunks,
    initial,
    totalRaw: chunks.reduce((s, c) => s + c.raw, 0),
    totalGzip: chunks.reduce((s, c) => s + c.gzip, 0),
    cssBytes: css,
    distBytes: distStat.bytes,
    distFiles: distStat.files,
    modules,
  };
}

/**
 * rollup-plugin-visualizer 의 raw-data 산출물에서 청크별 상위 패키지를 뽑는다.
 * nodeParts(렌더 크기) → nodeMetas(모듈 경로) 를 이어 node_modules 패키지 단위로 합산.
 */
function summarizeVisualizer(viz) {
  const byChunk = {};
  const parts = viz.nodeParts ?? {};
  const metas = viz.nodeMetas ?? {};
  for (const [id, part] of Object.entries(parts)) {
    const meta = metas[part.metaUid ?? id];
    const modPath = meta?.id ?? "";
    const m = modPath.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
    const pkg = m ? m[1] : "(앱 코드)";
    for (const chunkId of Object.keys(meta?.moduleParts ?? {})) {
      byChunk[chunkId] ??= {};
      byChunk[chunkId][pkg] = (byChunk[chunkId][pkg] ?? 0) + (part.renderedLength ?? 0);
    }
  }
  const out = {};
  for (const [chunk, pkgs] of Object.entries(byChunk)) {
    out[chunk] = Object.entries(pkgs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pkg, bytes]) => ({ pkg, bytes }));
  }
  return out;
}

// ─────────────── B · Electron 메인 ───────────────
function measureMain() {
  if (!NO_BUILD) {
    console.log("── B: esbuild (build:ts) ─────────────");
    sh("npm run build:ts", { stdio: "inherit" });
  }
  const mainPath = path.join(ROOT, "dist-electron", "main.js");
  if (!fs.existsSync(mainPath)) {
    return { error: "dist-electron/main.js 가 없습니다." };
  }
  const raw = fs.statSync(mainPath).size;

  // minify 여부를 산출물에서 직접 판정한다. 설정을 읽는 것보다 확실하다.
  // minify 되면 라인당 평균 길이가 폭발적으로 길어진다.
  const src = fs.readFileSync(mainPath, "utf8");
  const lines = src.split("\n").length;
  const avgLineLen = src.length / lines;
  const minified = avgLineLen > 200;

  let inputs = null;
  const metaPath = path.join(ROOT, "dist-electron", "meta.json");
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      const key = Object.keys(meta.outputs ?? {}).find((k) => k.endsWith("main.js"));
      const out = key ? meta.outputs[key] : null;
      if (out) {
        const byPkg = {};
        for (const [modPath, info] of Object.entries(out.inputs ?? {})) {
          const m = modPath.match(/node_modules[/\\]((?:@[^/\\]+[/\\])?[^/\\]+)/);
          const pkg = m ? m[1].replace(/\\/g, "/") : "(앱 코드)";
          byPkg[pkg] = (byPkg[pkg] ?? 0) + (info.bytesInOutput ?? 0);
        }
        inputs = Object.entries(byPkg)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([pkg, bytes]) => ({ pkg, bytes }));
      }
    } catch (e) {
      inputs = { error: String(e.message) };
    }
  }

  const preloadPath = path.join(ROOT, "dist-electron", "preload.js");
  const distElectron = dirStat(path.join(ROOT, "dist-electron"), { skipNested: false });

  return {
    mainRaw: raw,
    mainGzip: zlib.gzipSync(fs.readFileSync(mainPath)).length,
    minified,
    avgLineLen: Math.round(avgLineLen),
    preloadRaw: fs.existsSync(preloadPath) ? fs.statSync(preloadPath).size : null,
    distElectronBytes: distElectron.bytes,
    inputs,
  };
}

// ─────────────── C · 프로덕션 의존성 ───────────────
function measureDeps() {
  console.log("── C: npm ls --prod --all ─────────────");
  let paths;
  // npm ls 가 실패했는지 기록한다. 실패의 대표 원인은 node_modules 가 lockfile 과
  // 어긋난 것(브랜치를 옮긴 뒤 npm ci 를 안 돌린 상태)이고, 그러면 C 계층 수치가
  // 지금 브랜치의 package.json 이 아니라 디스크에 남은 잔여물을 재게 된다.
  // 실제로 이 함정을 밟았다 — 다른 브랜치에서 의존성을 지우고 돌아왔더니 435 대신
  // 410 이 나왔다.
  let lsClean = true;
  try {
    paths = sh("npm ls --prod --all --parseable", { stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (e) {
    lsClean = false;
    // 비정상 종료라도 stdout 은 유효한 경우가 많다
    paths = String(e.stdout ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (paths.length === 0) return { error: "npm ls 출력이 비었습니다." };

  // 첫 줄은 프로젝트 루트 → 패키지 수에서 제외
  const pkgPaths = paths.filter((p) => p.includes("node_modules"));

  let bytes = 0;
  let files = 0;
  const byPkg = [];
  for (const p of pkgPaths) {
    const st = dirStat(p, { skipNested: true });
    bytes += st.bytes;
    files += st.files;
    const m = p.match(/node_modules[/\\]((?:@[^/\\]+[/\\])?[^/\\]+)$/);
    byPkg.push({ pkg: m ? m[1].replace(/\\/g, "/") : p, bytes: st.bytes, files: st.files });
  }

  // 같은 패키지가 중첩 설치로 여러 번 나올 수 있어 이름 기준으로 합산
  const merged = {};
  for (const { pkg, bytes: b, files: f } of byPkg) {
    merged[pkg] ??= { pkg, bytes: 0, files: 0 };
    merged[pkg].bytes += b;
    merged[pkg].files += f;
  }
  const top = Object.values(merged)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 15);

  // 전체 node_modules (dev 포함) — 프로덕션 서브셋과의 대비용
  const all = dirStat(path.join(ROOT, "node_modules"), { skipNested: false });

  return {
    prodPackages: pkgPaths.length,
    prodBytes: bytes,
    prodFiles: files,
    allBytes: all.bytes,
    allFiles: all.files,
    lsClean,
    top,
  };
}

// ─────────────── D · 인스톨러 / asar ───────────────
function measureInstaller() {
  if (!WITH_INSTALLER) {
    return { skipped: "MEASURE_INSTALLER=1 이 아니어서 건너뜀" };
  }
  console.log("── D: electron-builder --dir ─────────────");

  // 직전 패키징 출력을 지운다 — 다만 이것으로 아래 문제가 해결되지는 않는다.
  //
  // electron-builder 의 directories.output 기본값은 `dist` 인데 Vite 의 outDir 도
  // `dist` 다. 그리고 build.files 에 "dist/**/*" 가 있다. electron-builder 는
  // 한 번의 실행 안에서 Electron 런타임을 dist/win-unpacked/ 로 먼저 풀고 그
  // 다음에 asar 를 조립하므로, 조립 시점의 glob 이 자기가 방금 만든
  // dist/win-unpacked/** 를 잡아 app.asar 안에 Electron 런타임을 통째로 다시
  // 집어넣는다.
  //
  // 실측(4ebbf85, win32-x64): app.asar 524.06 MB
  //   = 프로덕션 deps 186.81 + 우리 코드 4.4 + 중복된 Electron 런타임 약 333
  // 깨끗한 빌드에서도 재현되므로 이 정리 코드로는 막히지 않는다. 근본 원인은
  // package.json build.directories.output 이 dist 와 겹치는 설정이다.
  // → docs/bundle-size.md "D · 인스톨러" 참고.
  //
  // 그래도 지우는 이유: 지우지 않으면 중복이 세대마다 누적된다.
  const staleOutputs = ["win-unpacked", "mac-arm64", "mac", "linux-unpacked"].map((d) =>
    path.join(ROOT, "dist", d)
  );
  for (const stale of staleOutputs) {
    if (fs.existsSync(stale)) {
      console.log(`   직전 패키징 출력 제거: ${path.relative(ROOT, stale)}`);
      fs.rmSync(stale, { recursive: true, force: true });
    }
  }

  try {
    sh("npx electron-builder --dir", { stdio: "inherit" });
  } catch (e) {
    return { error: `electron-builder 실패: ${e.message}` };
  }

  // dist_electron / release 등 출력 위치가 설정에 따라 다르므로 app.asar 를 찾아 나선다
  const candidates = [];
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isFile() && e.name === "app.asar") candidates.push(p);
      else if (e.isDirectory() && e.name !== "node_modules") walk(p, depth + 1);
    }
  };
  for (const d of ["dist", "release", "out", "dist_electron"]) {
    const full = path.join(ROOT, d);
    if (fs.existsSync(full)) walk(full, 0);
  }
  if (candidates.length === 0) return { error: "app.asar 를 찾지 못했습니다." };

  const asarPath = candidates[0];
  const asarBytes = fs.statSync(asarPath).size;

  // ── 결정 게이트: asar 안에 node_modules 가 실리는가?
  // docs/bundle-size.md 정정 5 — 이 답이 C 계층 정리의 실효성을 좌우한다.
  let listing = null;
  let hasNodeModules = null;
  let nodeModulesEntries = 0;
  try {
    listing = execFileSync("npx", ["@electron/asar", "list", asarPath], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
      shell: true,
    });
    const lines = listing.split("\n");
    nodeModulesEntries = lines.filter((l) => l.includes("node_modules")).length;
    hasNodeModules = nodeModulesEntries > 0;
    fs.writeFileSync(path.join(OUT_DIR, "asar-list.txt"), listing);
  } catch (e) {
    listing = null;
    hasNodeModules = `판정 실패: ${e.message}`;
  }

  // unpacked 앱 디렉터리 전체 (Electron 런타임 포함)
  const appDir = path.dirname(path.dirname(asarPath)); // .../resources/app.asar → 앱 루트
  const appStat = dirStat(appDir, { skipNested: false });

  return {
    asarPath: path.relative(ROOT, asarPath),
    asarBytes,
    hasNodeModules,
    nodeModulesEntries,
    unpackedBytes: appStat.bytes,
    unpackedFiles: appStat.files,
  };
}

// ─────────────── 실행 ───────────────
const A = measureRenderer();
const B = measureMain();
const C = measureDeps();
const D = measureInstaller();

const raw = {
  label: LABEL,
  measuredAt: new Date().toISOString(),
  commit: head,
  dirty,
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  A,
  B,
  C,
  D,
};
fs.writeFileSync(path.join(OUT_DIR, "raw.json"), JSON.stringify(raw, null, 2));

// ─────────────── 리포트 ───────────────
let md = `# ${LABEL} 번들 크기 측정\n\n`;
md += `- 기준 커밋: \`${head ?? "—"}\`${dirty ? " **(working tree 변경 있음 — 재현 불가)**" : ""}\n`;
md += `- 측정일: ${raw.measuredAt}\n`;
md += `- 환경: Node ${process.version} · ${raw.platform}\n\n`;

// A
md += `## A · 렌더러 청크\n\n`;
if (A.error) {
  md += `⚠ ${A.error}\n\n`;
} else {
  if (A.initial) {
    md += `### 초기 로드 (1순위 지표)\n\n`;
    md += `브라우저가 첫 화면에 실제로 받는 청크. **개별 청크 크기가 아니라 이 값으로 판정한다** — `;
    md += `Rollup 재청킹 때문에 index 가 커지면서도 초기 로드는 줄어들 수 있다.\n\n`;
    md += `| 항목 | 값 |\n|---|---|\n`;
    md += `| 청크 수 | ${A.initial.count} |\n`;
    md += `| **raw** | **${fmtBytes(A.initial.raw)}** |\n`;
    md += `| **gzip** | **${fmtBytes(A.initial.gzip)}** |\n`;
    md += `| 구성 | ${A.initial.files.join(", ")} |\n\n`;
  }
  md += `### 청크 전체\n\n`;
  md += `| 청크 | raw | gzip |\n|---|---|---|\n`;
  for (const c of A.chunks.slice(0, 12)) {
    md += `| ${c.name} | ${fmtBytes(c.raw)} | ${fmtBytes(c.gzip)} |\n`;
  }
  md += `| **합계 (JS ${A.chunks.length}개)** | **${fmtBytes(A.totalRaw)}** | **${fmtBytes(A.totalGzip)}** |\n`;
  md += `\n- CSS: ${fmtBytes(A.cssBytes)}\n`;
  md += `- \`dist/\` 전체: ${fmtBytes(A.distBytes)} (${A.distFiles} 파일)\n\n`;
  if (A.modules && !A.modules.error) {
    md += `<details><summary>청크별 상위 패키지 (visualizer)</summary>\n\n`;
    for (const [chunk, pkgs] of Object.entries(A.modules)) {
      md += `**${chunk}**\n\n`;
      for (const { pkg, bytes } of pkgs) md += `- ${pkg} — ${fmtBytes(bytes)}\n`;
      md += `\n`;
    }
    md += `</details>\n\n`;
  } else {
    md += `> 모듈별 기여도는 \`BUNDLE_ANALYZE=1 npm run build:web\` 후 재실행하면 표시된다.\n\n`;
  }
}

// B
md += `## B · Electron 메인\n\n`;
if (B.error) {
  md += `⚠ ${B.error}\n\n`;
} else {
  md += `| 항목 | 값 |\n|---|---|\n`;
  md += `| main.js raw | ${fmtBytes(B.mainRaw)} |\n`;
  md += `| main.js gzip | ${fmtBytes(B.mainGzip)} |\n`;
  md += `| **minify** | **${B.minified ? "적용됨" : "미적용"}** (평균 줄 길이 ${B.avgLineLen}) |\n`;
  md += `| preload.js | ${fmtBytes(B.preloadRaw)} |\n`;
  md += `| \`dist-electron/\` 전체 | ${fmtBytes(B.distElectronBytes)} |\n`;
  md += `\n`;
  if (Array.isArray(B.inputs)) {
    md += `| 패키지 | main.js 내 기여 |\n|---|---|\n`;
    for (const { pkg, bytes } of B.inputs) md += `| ${pkg} | ${fmtBytes(bytes)} |\n`;
    md += `\n`;
  }
}

// C
md += `## C · 프로덕션 의존성\n\n`;
if (C.error) {
  md += `⚠ ${C.error}\n\n`;
} else {
  md += `| 항목 | 값 |\n|---|---|\n`;
  md += `| 프로덕션 패키지 수 | ${C.prodPackages} |\n`;
  md += `| 프로덕션 용량 (apparent) | ${fmtBytes(C.prodBytes)} |\n`;
  md += `| 프로덕션 파일 수 | ${C.prodFiles} |\n`;
  md += `| node_modules 전체 (dev 포함) | ${fmtBytes(C.allBytes)} (${C.allFiles} 파일) |\n\n`;
  md += `| 패키지 | 용량 | 파일 |\n|---|---|---|\n`;
  for (const { pkg, bytes, files } of C.top) md += `| ${pkg} | ${fmtBytes(bytes)} | ${files} |\n`;
  md += `\n`;
}

// D
md += `## D · 인스톨러 / asar\n\n`;
if (D.skipped) {
  md += `건너뜀 — ${D.skipped}\n\n`;
} else if (D.error) {
  md += `⚠ ${D.error}\n\n`;
} else {
  md += `| 항목 | 값 |\n|---|---|\n`;
  md += `| app.asar | ${fmtBytes(D.asarBytes)} (\`${D.asarPath}\`) |\n`;
  md += `| unpacked 전체 | ${fmtBytes(D.unpackedBytes)} (${D.unpackedFiles} 파일) |\n`;
  md += `| **asar 내 node_modules** | **${D.hasNodeModules === true ? `실림 (${D.nodeModulesEntries} 항목)` : D.hasNodeModules === false ? "실리지 않음" : D.hasNodeModules}** |\n\n`;
  md += `> 이 판정이 C 계층 정리의 실효성을 좌우한다 — docs/bundle-size.md 정정 5.\n\n`;
}

// ─────────────── 자가 점검 ───────────────
const checks = [];

checks.push({
  name: "기준 커밋이 고정됨",
  expected: "clean tree",
  got: head ? (dirty ? "변경 있음" : head.slice(0, 7)) : "git 없음",
  ok: Boolean(head) && dirty === false,
  hint: "working tree 를 커밋하거나 stash 한 뒤 재측정 — 안 하면 수치를 인용할 수 없다",
});

if (!A.error) {
  const index = A.chunks.find((c) => c.name === "index");
  checks.push({
    name: "index 청크 존재",
    expected: "1개",
    got: index ? index.file : "없음",
    ok: Boolean(index),
    hint: "엔트리 청크명이 바뀌었는지 확인",
  });
  const ratio = index ? index.raw / index.gzip : null;
  checks.push({
    name: "index raw/gzip 비율",
    expected: "2.5~5",
    got: ratio ? ratio.toFixed(2) : "—",
    ok: ratio != null && ratio >= 2.5 && ratio <= 5,
    hint: "비율이 벗어나면 gzip 계산 또는 청크 선택이 잘못됐다",
  });
  checks.push({
    name: "초기 로드 세트 집계됨",
    expected: "1개 이상",
    got: A.initial ? `${A.initial.count}개 / ${fmtBytes(A.initial.raw)}` : "실패",
    ok: Boolean(A.initial) && A.initial.count > 0,
    hint: "dist/index.html 파싱 실패 — 엔트리 주입 방식이 바뀌었는지 확인",
  });
  checks.push({
    // 초기 로드가 전체보다 클 수는 없다. 크면 파싱이 같은 청크를 두 번 셌다는 뜻.
    name: "초기 로드 ≤ 전체 JS",
    expected: "initial ≤ total",
    got: A.initial ? `${fmtBytes(A.initial.raw)} ≤ ${fmtBytes(A.totalRaw)}` : "—",
    ok: Boolean(A.initial) && A.initial.raw <= A.totalRaw,
    hint: "index.html 정규식이 같은 파일을 중복 매칭했을 가능성",
  });
}

if (!B.error) {
  checks.push({
    name: "B minify 상태가 기록됨",
    expected: "명시",
    got: B.minified ? "적용됨" : "미적용",
    ok: true, // 값 자체가 아니라 기록 여부가 점검 대상
    hint: "",
  });
}

if (!C.error) {
  checks.push({
    name: "프로덕션 패키지 수",
    expected: "380~500",
    got: C.prodPackages,
    ok: C.prodPackages >= 380 && C.prodPackages <= 500,
    hint: "--prod 가 빠지면 devDependencies 까지 세어 폭증한다",
  });
  checks.push({
    name: "프로덕션 < 전체 node_modules",
    expected: "prod < all",
    got: `${fmtBytes(C.prodBytes)} < ${fmtBytes(C.allBytes)}`,
    ok: C.prodBytes < C.allBytes,
    hint: "중첩 패키지 이중 계산 의심 — dirStat skipNested 확인",
  });
  checks.push({
    name: "node_modules 가 lockfile 과 일치",
    expected: "npm ls 정상 종료",
    got: C.lsClean ? "일치" : "불일치",
    ok: C.lsClean === true,
    hint: "npm ci 를 돌린 뒤 재측정 — 지금 수치는 디스크 잔여물을 재고 있다",
  });
}

checks.push({
  name: "D asar node_modules 판정",
  expected: "판정됨",
  got: D.skipped ? "건너뜀" : String(D.hasNodeModules),
  ok: typeof D.hasNodeModules === "boolean",
  hint: "MEASURE_INSTALLER=1 로 재실행해야 정정 5 를 닫을 수 있다",
});

md += `## 자가 점검\n\n`;
md += `| 항목 | 기대 | 관측 | 결과 | 힌트 |\n|---|---|---|---|---|\n`;
for (const c of checks) {
  md += `| ${c.name} | ${c.expected} | ${fmt(c.got)} | ${mark(c.ok)} | ${c.ok ? "" : c.hint} |\n`;
}

fs.writeFileSync(path.join(OUT_DIR, "summary.md"), md);
console.log("\n" + md);
console.log(`→ ${path.relative(ROOT, path.join(OUT_DIR, "summary.md"))}`);
