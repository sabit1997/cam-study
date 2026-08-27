import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Vercel 서버리스 함수가 로드될 수 있는 모듈 포맷으로 컴파일되는지 지킨다.
 *
 * ## 무엇을 막는 테스트인가
 *
 * @vercel/node는 진입점에서 가장 가까운 tsconfig로 api/*.ts를 컴파일한다.
 * 루트 tsconfig.json은 Vite 프론트엔드용이라 "module": "esnext"이고, 그걸로 뽑으면
 * import 문이 그대로 남은 .js가 나온다. 루트 package.json에 "type": "module"이 없으니
 * Node는 그 파일을 CommonJS로 읽고 첫 줄에서 죽는다:
 *
 *   SyntaxError: Cannot use import statement outside a module
 *
 * 핸들러에 들어가기도 전에 죽으므로 클라이언트에는 Vercel 플랫폼의
 * {"error":{"code":"500","message":"A server error has occurred"}}만 도착한다.
 * 우리 코드가 만든 응답이 아니라서 원인을 짚기가 유난히 어렵다.
 *
 * 실제로 **api/ 함수 4개 전부**가 이 상태로 배포돼 있었다. onboarding-chat만 로그에
 * 남은 건 첫 실행 온보딩이 자동으로 호출해서다. check-youtube는 값 import가 없어서
 * (import type만 있어서) import 문이 남지 않지만 `export default`가 남으므로 CJS
 * 로더에서 똑같이 죽는다 — ESM 문법은 import만이 아니다.
 *
 * ## 왜 로컬 테스트로 잡히지 않았나
 *
 * vitest는 Vite의 변환기를 쓰므로 ESM으로 잘 돌아간다. 이 불일치는 Vercel의
 * 컴파일 결과와 Node의 로더 사이에서만 드러난다. 그래서 코드가 아니라 **설정의
 * 합의**를 검사한다.
 */

const repoRoot = path.resolve(import.meta.dirname, "..");

interface TsConfigShape {
  compilerOptions?: { module?: string };
  include?: string[];
}

/** tsconfig는 JSONC다 — 주석 줄을 걷어내고 파싱한다. 주석이 이 설정의 핵심 문서라 지울 수 없다. */
const readJsonc = <T>(file: string): T => {
  const text = readFileSync(path.join(repoRoot, file), "utf8");
  const stripped = text
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  return JSON.parse(stripped) as T;
};

/** 테스트가 아닌 api/ 진입점 — 각각이 배포되는 서버리스 함수 하나다. */
const functionEntries = (): string[] =>
  readdirSync(path.join(repoRoot, "api")).filter(
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts")
  );

describe("Vercel 함수 모듈 포맷", () => {
  it("api/tsconfig.json이 CommonJS로 뽑도록 되어 있다", () => {
    const tsconfig = readJsonc<TsConfigShape>("api/tsconfig.json");
    expect(tsconfig.compilerOptions?.module?.toLowerCase()).toBe("commonjs");
  });

  it("package.json은 CJS 기본값을 유지한다 — Electron 메인이 CJS라 바꿀 수 없다", () => {
    // scripts/build-electron.js가 dist-electron/을 format: "cjs"로 뽑는다.
    // 루트에 "type": "module"을 넣으면 데스크탑 앱이 깨진다.
    const pkg = readJsonc<{ type?: string }>("package.json");
    expect(pkg.type).toBeUndefined();
  });

  it("api/tsconfig.json이 함수가 끌어오는 그래프 전체를 덮는다", () => {
    // api/만 담으면 ../server/*.ts가 루트 설정(esnext)으로 되돌아가 같은 사고가 난다.
    const include = readJsonc<TsConfigShape>("api/tsconfig.json").include ?? [];
    expect(include.some((entry) => entry.includes("server"))).toBe(true);
    expect(include.some((entry) => entry.includes("types"))).toBe(true);
  });

  it("api/ 안의 모든 파일이 default export 핸들러를 갖는다", () => {
    // 소스 텍스트로 확인한다. 실제 import는 Gemini SDK까지 끌어와 느리고,
    // 여기서 알고 싶은 건 "이 파일이 함수 진입점 모양인가" 하나다.
    const entries = functionEntries();
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      const source = readFileSync(path.join(repoRoot, "api", entry), "utf8");
      expect(source, `api/${entry}`).toMatch(/export default/);
    }
  });

  it("export const config 가 리터럴만 담는다 — as const·satisfies 금지", () => {
    // @vercel/static-config는 ts-morph로 이 객체를 읽는데 문자열·숫자·불리언·배열·
    // 객체 리터럴만 이해한다. `as const`를 붙이면 AsExpression이 되어
    //
    //   Unhandled type: "AsExpression" "edge" as const
    //
    // 로 죽는다. 타입만 거들려던 한 글자가 runtime 지정 전체를 무효로 만들고,
    // 함수는 Edge가 아니라 Node로 배포된다 — SSE 버퍼링이 그대로 되살아난다.
    // 타입스크립트도 vitest도 잡지 못한다. 배포 로그에만 남는 종류의 사고라
    // 여기서 소스 텍스트로 지킨다.
    for (const entry of functionEntries()) {
      const source = readFileSync(path.join(repoRoot, "api", entry), "utf8");
      const match = source.match(/export const config\s*=\s*(\{[\s\S]*?\})\s*;/);
      if (!match) continue;
      expect(match[1], `api/${entry}`).not.toMatch(/\bas\s+const\b|\bsatisfies\b/);
    }
  });

  it("api/ 안에 테스트 파일이 없다 — 있으면 엔드포인트로 배포된다", () => {
    // /api/check-youtube.test 같은 엔드포인트가 생기고, 그 파일은 vitest(devDependency)를
    // import하므로 배포본에서 로드에 실패한다. .vercelignore가 막지만 여기서도 지킨다.
    const tests = readdirSync(path.join(repoRoot, "api")).filter((file) =>
      file.endsWith(".test.ts")
    );
    expect(tests).toEqual([]);
  });
});
