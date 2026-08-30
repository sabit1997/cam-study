#!/usr/bin/env node
/**
 * 사람 손이 들어가지 않는 Electron 데스크탑 앱 경량화 실측 파이프라인.
 *
 * 사용법:
 *   node scripts/perf-measure-electron.mjs before   # 변경 전 스냅샷
 *   node scripts/perf-measure-electron.mjs after    # 변경 후 스냅샷
 *   node scripts/perf-measure-electron.mjs diff     # 두 스냅샷 비교 → perf-out/electron/diff.md
 *
 * 각 라벨 실행:
 *   1. dist/, dist-electron/ 정리
 *   2. npm run build:ts + build:web
 *   3. electron-builder --dir --mac (서명 없이 dir 산출물만; dmg/zip 스킵 → 훨씬 빠름)
 *   4. .app 폴더 · app.asar · app.asar.unpacked · Electron Framework · 로케일 스캔
 *   5. asar 내부를 임시 추출해 안에 든 파일 크기 top-N 계산
 *   6. perf-out/electron/<label>/ 에 electron.json + summary.md 저장
 *
 * diff 는 두 스냅샷 지표를 표로 비교 → perf-out/electron/diff.md. 회귀 시 exit 1.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

// ─────────────── 상수 ───────────────
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_ROOT = path.join(ROOT, "perf-out", "electron");
const RELEASE_DIR = path.join(ROOT, "release"); // electron-builder --dir 산출물 기본 위치
const LABELS = ["before", "after"];
const MODE = process.argv[2];
const REGRESSION_THRESHOLD_PCT = 5;

const usage = () => {
  console.error("usage: node scripts/perf-measure-electron.mjs <before|after|diff>");
  process.exit(1);
};
if (!MODE || !["before", "after", "diff"].includes(MODE)) usage();

// ─────────────── 유틸 ───────────────
const b = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : String(n));
const mb = (n) => (typeof n === "number" ? (n / 1024 / 1024).toFixed(2) + " MB" : "—");
const pct = (a, bref) => {
  if (!Number.isFinite(a) || !Number.isFinite(bref) || bref === 0) return "—";
  const d = ((a - bref) / bref) * 100;
  return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
};

function dirSize(p) {
  let total = 0;
  let files = 0;
  try {
    const s = fs.statSync(p);
    if (s.isFile()) return { bytes: s.size, files: 1 };
  } catch {
    return { bytes: 0, files: 0 };
  }
  const stack = [p];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const child = path.join(cur, e.name);
      if (e.isSymbolicLink()) continue; // asar.unpacked 등의 symlink 는 이중 계산 방지로 skip
      if (e.isDirectory()) stack.push(child);
      else {
        try {
          total += fs.statSync(child).size;
          files += 1;
        } catch {}
      }
    }
  }
  return { bytes: total, files };
}

function runAsync(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: "inherit", ...opts });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exit ${code}`))));
  });
}

// ─────────────── 산출물 위치 감지 ───────────────
function findAppBundle() {
  // release/mac-arm64/외요의 캠스터디.app 또는 release/mac/... 같은 형태를 찾는다.
  if (!fs.existsSync(RELEASE_DIR)) return null;
  const candidates = [];
  const stack = [RELEASE_DIR];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const child = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (e.name.endsWith(".app")) candidates.push(child);
        else stack.push(child);
      }
    }
  }
  return candidates[0] ?? null;
}

// ─────────────── asar 내부 스캔 ───────────────
function scanAsar(asarPath, outJson) {
  // @electron/asar CLI 로 파일 목록 뽑기. 없거나 실패하면 스킵.
  const asarCli = path.join(ROOT, "node_modules", ".bin", "asar");
  if (!fs.existsSync(asarCli)) return null;
  const r = spawnSync(asarCli, ["list", "--is-pack", asarPath], { encoding: "utf8" });
  if (r.status !== 0) return null;
  // 각 파일 크기는 asar 헤더 없이는 직접 못 뽑음 → 임시 추출해서 폴더 크기 잰다.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asar-scan-"));
  try {
    const ext = spawnSync(asarCli, ["extract", asarPath, tmp], { encoding: "utf8" });
    if (ext.status !== 0) return null;
    // 최상위 하위 폴더별 크기.
    const rows = [];
    for (const name of fs.readdirSync(tmp)) {
      const p = path.join(tmp, name);
      rows.push({ path: name, ...dirSize(p) });
    }
    // node_modules 안 dep 별 크기.
    const nm = path.join(tmp, "node_modules");
    const depRows = [];
    if (fs.existsSync(nm)) {
      for (const name of fs.readdirSync(nm)) {
        if (name.startsWith("@")) {
          const scoped = path.join(nm, name);
          for (const sub of fs.readdirSync(scoped)) {
            depRows.push({ path: `${name}/${sub}`, ...dirSize(path.join(scoped, sub)) });
          }
        } else {
          depRows.push({ path: name, ...dirSize(path.join(nm, name)) });
        }
      }
    }
    rows.sort((a, b) => b.bytes - a.bytes);
    depRows.sort((a, b) => b.bytes - a.bytes);
    const report = { topDirs: rows, deps: depRows };
    fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
    return report;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ─────────────── 로케일 스캔 ───────────────
function scanLocales(appPath) {
  // Electron Framework 안 *.lproj (macOS)
  const fwRes = path.join(
    appPath,
    "Contents",
    "Frameworks",
    "Electron Framework.framework",
    "Versions",
    "A",
    "Resources"
  );
  const rows = [];
  if (fs.existsSync(fwRes)) {
    for (const name of fs.readdirSync(fwRes)) {
      if (name.endsWith(".lproj")) {
        rows.push({ path: name, ...dirSize(path.join(fwRes, name)) });
      }
    }
  }
  // Electron *.pak 로케일 파일도 존재 (Contents/Frameworks/... Resources/*.pak)
  const paks = [];
  if (fs.existsSync(fwRes)) {
    for (const name of fs.readdirSync(fwRes)) {
      if (name.endsWith(".pak")) {
        const p = path.join(fwRes, name);
        paks.push({ path: name, bytes: fs.statSync(p).size });
      }
    }
  }
  return { lproj: rows.sort((a, b) => b.bytes - a.bytes), paks: paks.sort((a, b) => b.bytes - a.bytes) };
}

// ─────────────── 스냅샷 ───────────────
async function snapshot(label) {
  const outDir = path.join(OUT_ROOT, label);
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`[${label}] dist/, dist-electron/, release/ 정리`);
  fs.rmSync(path.join(ROOT, "dist"), { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, "dist-electron"), { recursive: true, force: true });
  fs.rmSync(RELEASE_DIR, { recursive: true, force: true });

  console.log(`[${label}] build:ts`);
  await runAsync("npm", ["run", "build:ts"]);
  console.log(`[${label}] build:web`);
  await runAsync("npm", ["run", "build:web"]);

  // electron-builder --dir 로 서명·dmg 없이 앱 폴더만 산출. 훨씬 빠름.
  console.log(`[${label}] electron-builder --dir --mac`);
  await runAsync("npx", [
    "electron-builder",
    "--dir",
    "--mac",
    "-c.mac.identity=null",
    "-c.directories.output=release",
  ]);

  const appPath = findAppBundle();
  if (!appPath) throw new Error("Electron .app 산출물을 찾지 못했습니다.");
  const asarPath = path.join(appPath, "Contents", "Resources", "app.asar");
  const unpackedPath = path.join(appPath, "Contents", "Resources", "app.asar.unpacked");
  const fwPath = path.join(appPath, "Contents", "Frameworks");

  const appSize = dirSize(appPath);
  const asarStat = fs.existsSync(asarPath) ? fs.statSync(asarPath).size : 0;
  const unpackedSize = fs.existsSync(unpackedPath) ? dirSize(unpackedPath) : { bytes: 0, files: 0 };
  const fwSize = fs.existsSync(fwPath) ? dirSize(fwPath) : { bytes: 0, files: 0 };
  const locales = scanLocales(appPath);
  const asarReport = fs.existsSync(asarPath)
    ? scanAsar(asarPath, path.join(outDir, "asar-contents.json"))
    : null;

  const report = {
    appPath,
    appBytes: appSize.bytes,
    appFiles: appSize.files,
    asarBytes: asarStat,
    unpackedBytes: unpackedSize.bytes,
    unpackedFiles: unpackedSize.files,
    frameworksBytes: fwSize.bytes,
    localesLproj: locales.lproj,
    localesPak: locales.paks,
    localesLprojBytes: locales.lproj.reduce((s, r) => s + r.bytes, 0),
    localesPakBytes: locales.paks.reduce((s, r) => s + r.bytes, 0),
    asarTopDirs: asarReport?.topDirs ?? [],
    asarDeps: asarReport?.deps ?? [],
  };
  fs.writeFileSync(path.join(outDir, "electron.json"), JSON.stringify(report, null, 2));

  const md = renderSnapshotMd(label, report);
  fs.writeFileSync(path.join(outDir, "summary.md"), md);
  console.log("\n" + md);
  console.log(`→ ${outDir}/summary.md`);
}

function renderSnapshotMd(label, r) {
  const topDirs = r.asarTopDirs.slice(0, 8).map((d) => `| ${d.path} | ${mb(d.bytes)} | ${d.files} |`).join("\n");
  const topDeps = r.asarDeps.slice(0, 15).map((d) => `| ${d.path} | ${mb(d.bytes)} | ${d.files} |`).join("\n");
  const lproj = r.localesLproj.slice(0, 8).map((l) => `| ${l.path} | ${mb(l.bytes)} |`).join("\n");
  const pakTop = r.localesPak.slice(0, 8).map((l) => `| ${l.path} | ${mb(l.bytes)} |`).join("\n");
  return `# ${label} Electron 스냅샷

- 측정 시각: ${new Date().toISOString()}
- .app 경로: \`${r.appPath}\`

## 최상위 크기

| 항목 | 값 |
|---|---|
| .app 총합 | ${mb(r.appBytes)} (${r.appFiles} files) |
| app.asar | ${mb(r.asarBytes)} |
| app.asar.unpacked | ${mb(r.unpackedBytes)} (${r.unpackedFiles} files) |
| Contents/Frameworks | ${mb(r.frameworksBytes)} |
| 로케일 .lproj 합계 | ${mb(r.localesLprojBytes)} (${r.localesLproj.length}개) |
| 로케일 .pak 합계 | ${mb(r.localesPakBytes)} (${r.localesPak.length}개) |

## app.asar 최상위 폴더 (top 8)

| 경로 | 크기 | 파일 |
|---|---|---|
${topDirs || "| — | — | — |"}

## app.asar 내부 node_modules dep top 15

| 패키지 | 크기 | 파일 |
|---|---|---|
${topDeps || "| — | — | — |"}

## Electron 로케일 .lproj top 8

| 폴더 | 크기 |
|---|---|
${lproj || "| — | — |"}

## Electron 로케일 .pak top 8

| 파일 | 크기 |
|---|---|
${pakTop || "| — | — |"}
`;
}

// ─────────────── diff ───────────────
function loadSnapshot(label) {
  const dir = path.join(OUT_ROOT, label);
  return JSON.parse(fs.readFileSync(path.join(dir, "electron.json"), "utf8"));
}
function diffMode() {
  for (const label of LABELS) {
    if (!fs.existsSync(path.join(OUT_ROOT, label, "electron.json"))) {
      console.error(`스냅샷 없음: ${label}. 먼저 \`node scripts/perf-measure-electron.mjs ${label}\`.`);
      process.exit(1);
    }
  }
  const before = loadSnapshot("before");
  const after = loadSnapshot("after");
  const line = (name, a, bref) => `| ${name} | ${mb(bref)} | ${mb(a)} | ${pct(a, bref)} |`;
  const md = [];
  md.push(`# Electron before ↔ after 비교`);
  md.push(``);
  md.push(`- 임계값: 주요 지표 회귀 ${REGRESSION_THRESHOLD_PCT}% 이상 시 fail.`);
  md.push(``);
  md.push(`## 최상위 크기`);
  md.push(``);
  md.push(`| 지표 | before | after | Δ |`);
  md.push(`|---|---|---|---|`);
  md.push(line(".app 총합", after.appBytes, before.appBytes));
  md.push(line("app.asar", after.asarBytes, before.asarBytes));
  md.push(line("app.asar.unpacked", after.unpackedBytes, before.unpackedBytes));
  md.push(line("Frameworks", after.frameworksBytes, before.frameworksBytes));
  md.push(line("로케일 .lproj 합계", after.localesLprojBytes, before.localesLprojBytes));
  md.push(line("로케일 .pak 합계", after.localesPakBytes, before.localesPakBytes));
  md.push(``);
  md.push(`## asar 내부 dep top 지문`);
  md.push(``);
  const beforeDeps = new Map(before.asarDeps.map((d) => [d.path, d.bytes]));
  const afterDeps = new Map(after.asarDeps.map((d) => [d.path, d.bytes]));
  const allDeps = new Set([...beforeDeps.keys(), ...afterDeps.keys()]);
  md.push(`| dep | before | after | Δ |`);
  md.push(`|---|---|---|---|`);
  const rows = [...allDeps].map((d) => ({
    d,
    a: afterDeps.get(d) ?? 0,
    b: beforeDeps.get(d) ?? 0,
  }));
  rows.sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
  for (const { d, a, b: bref } of rows.slice(0, 15)) {
    md.push(line(d, a, bref));
  }
  md.push(``);
  md.push(`## 판정`);
  const primary = [
    { name: ".app 총합", a: after.appBytes, b: before.appBytes },
    { name: "app.asar", a: after.asarBytes, b: before.asarBytes },
    { name: "app.asar.unpacked", a: after.unpackedBytes, b: before.unpackedBytes },
  ];
  let fail = false;
  for (const c of primary) {
    const delta = c.b ? ((c.a - c.b) / c.b) * 100 : 0;
    const regressed = delta > REGRESSION_THRESHOLD_PCT;
    const emoji = regressed ? "⚠" : delta < -REGRESSION_THRESHOLD_PCT ? "✓" : "·";
    if (regressed) fail = true;
    md.push(`- ${emoji} ${c.name}: ${pct(c.a, c.b)}`);
  }
  md.push(``);
  md.push(fail ? `**결과: FAIL — 주요 지표가 임계값을 넘어 회귀했습니다.**` : `**결과: OK**`);
  const text = md.join("\n") + "\n";
  fs.writeFileSync(path.join(OUT_ROOT, "diff.md"), text);
  console.log(text);
  console.log(`→ ${path.join(OUT_ROOT, "diff.md")}`);
  process.exit(fail ? 1 : 0);
}

// ─────────────── 실행 ───────────────
if (MODE === "diff") diffMode();
else snapshot(MODE).catch((e) => { console.error(e); process.exit(1); });
