const { renameSync, writeFileSync, chmodSync, openSync, writeSync, closeSync } = require("fs");
const { join } = require("path");
const { execSync } = require("child_process");

/**
 * afterPack hook: macOS 26 (Tahoe) V8 crash workarounds.
 *
 * Two patches applied:
 *
 * 1. Shell wrapper: renames the Electron binary and creates a shell launcher
 *    that passes --js-flags=--jitless (disables V8 JIT in the main process).
 *    Needed because Electron ignores NODE_OPTIONS in packaged apps.
 *
 * 2. BRK #0 patch: NOPs out the V8 DCHECK at the exact crash offset inside
 *    the Electron Framework binary. The DCHECK fires during Node.js
 *    bootstrapping on macOS 26 even with --jitless because it runs during
 *    snapshot deserialization before flags take effect. After patching the
 *    binary we ad-hoc re-sign it so macOS accepts the modification.
 *
 * Related: https://github.com/electron/electron/issues/49522
 */
exports.default = async function ({ appOutDir, packager }) {
  if (packager.platform.name !== "mac") return;

  const appName = packager.appInfo.productFilename;
  const contentsDir = join(appOutDir, `${appName}.app`, "Contents");
  const macOSDir = join(contentsDir, "MacOS");
  const frameworkPath = join(
    contentsDir,
    "Frameworks",
    "Electron Framework.framework",
    "Electron Framework"
  );

  // ── 1. Shell wrapper ──────────────────────────────────────────────────────
  const binaryPath = join(macOSDir, appName);
  const realBinaryName = `${appName}-bin`;
  const realBinaryPath = join(macOSDir, realBinaryName);

  renameSync(binaryPath, realBinaryPath);

  const script =
    ["#!/bin/sh", `exec "$(dirname "$0")/${realBinaryName}" --js-flags=--jitless "$@"`].join(
      "\n"
    ) + "\n";

  writeFileSync(binaryPath, script, "utf8");
  chmodSync(binaryPath, 0o755);
  console.log(`  • macOS 26 [1/2]: shell wrapper → ${realBinaryName} --js-flags=--jitless`);

  // ── 2. BRK #0 patch in Electron Framework ────────────────────────────────
  // The crash is a V8 DCHECK (BRK #0 + HLT #0 + BRK #1) at a fixed offset
  // inside the Electron Framework binary. We NOP all three instructions so
  // execution continues past the check instead of hard-aborting.
  //
  // Offset 0x12a8db0 is specific to electron-nightly 44.0.0-nightly.20260701.
  // If you update Electron, re-derive the offset from the crash report.
  const DCHECK_OFFSET = 0x12a8db0;
  const BRK0  = 0xd4200000;   // BRK #0
  const HLT0  = 0xd4400000;   // HLT #0
  const BRK1  = 0xd4200020;   // BRK #1
  const NOP   = 0xd503201f;   // NOP

  const nopBuf = Buffer.alloc(4);
  nopBuf.writeUInt32LE(NOP, 0);

  // Read the 12 bytes at the offset to verify they match the expected pattern
  const checkBuf = Buffer.alloc(12);
  const fd = openSync(frameworkPath, "r+");
  const bytesRead = require("fs").readSync(fd, checkBuf, 0, 12, DCHECK_OFFSET);

  const w0 = checkBuf.readUInt32LE(0);
  const w1 = checkBuf.readUInt32LE(4);
  const w2 = checkBuf.readUInt32LE(8);

  if (w0 === BRK0 && w1 === HLT0 && w2 === BRK1) {
    writeSync(fd, nopBuf, 0, 4, DCHECK_OFFSET);
    writeSync(fd, nopBuf, 0, 4, DCHECK_OFFSET + 4);
    writeSync(fd, nopBuf, 0, 4, DCHECK_OFFSET + 8);
    closeSync(fd);

    // Ad-hoc re-sign so macOS accepts the modified binary
    execSync(`codesign -f -s - "${frameworkPath}"`, { stdio: "inherit" });
    console.log(`  • macOS 26 [2/2]: patched BRK#0 at 0x${DCHECK_OFFSET.toString(16)} in Electron Framework + ad-hoc re-signed`);
  } else {
    closeSync(fd);
    console.warn(
      `  • macOS 26 [2/2]: SKIP patch — unexpected bytes at 0x${DCHECK_OFFSET.toString(16)}: ` +
        `${hex(w0)} ${hex(w1)} ${hex(w2)} (expected BRK#0 + HLT#0 + BRK#1)`
    );
  }
};

function hex(n) {
  return "0x" + n.toString(16).padStart(8, "0");
}
