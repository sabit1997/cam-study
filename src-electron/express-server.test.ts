import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createExpressApp } from "./express-server";

describe("createExpressApp", () => {
  it("registers the SPA fallback under Express 5", () => {
    expect(() => createExpressApp("/tmp/cam-study-test")).not.toThrow();
  });
});

/**
 * 캐시 헤더는 실제로 응답에 실려야 의미가 있다. 설정 객체를 검사하는 대신 앱을
 * 띄워서 헤더를 읽는다 — 데스크탑에서 앱을 켤 때마다 일어나는 일 그대로다.
 *
 * 이 앱은 electron 모듈에 의존하지 않으므로 순수 node 에서 그대로 띄울 수 있다.
 */
describe("정적 자산 캐시 헤더", () => {
  let server: Server;
  let base: string;
  let dir: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cam-study-static-"));
    fs.mkdirSync(path.join(dir, "assets"));
    // Vite 가 내는 형태 — 파일명에 콘텐츠 해시가 들어간다
    fs.writeFileSync(path.join(dir, "assets", "index-A1b2C3d4.js"), "console.log(1)\n");
    fs.writeFileSync(path.join(dir, "assets", "index-Z9y8X7w6.css"), "body{color:red}\n");
    fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>t</title>\n");

    const app = createExpressApp(dir);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("해시가 붙은 /assets 자산은 1년 immutable", async () => {
    const res = await fetch(`${base}/assets/index-A1b2C3d4.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable"
    );
  });

  it("CSS 도 같은 정책을 받는다", async () => {
    const res = await fetch(`${base}/assets/index-Z9y8X7w6.css`);
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable"
    );
  });

  it("index.html 은 항상 재검증한다 — 새 배포의 자산 해시를 담고 있다", async () => {
    const res = await fetch(`${base}/index.html`);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  it("루트도 index.html 과 같은 정책", async () => {
    const res = await fetch(`${base}/`);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  it("SPA 폴백 경로도 재검증 대상", async () => {
    // 정적 파일이 아닌 경로 — 라우터가 index.html 을 내려준다
    const res = await fetch(`${base}/my-page/record`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  it("immutable 자산은 조건부 요청 없이 재사용할 수 있다", async () => {
    // max-age 가 살아 있는 동안 브라우저는 재검증하지 않는다. 서버가 그 신호를
    // 주는지가 여기서의 관심사다 — ETag 만으로는 304 왕복이 계속 일어난다.
    const res = await fetch(`${base}/assets/index-A1b2C3d4.js`);
    const cacheControl = res.headers.get("cache-control") ?? "";
    expect(cacheControl).toContain("immutable");
    expect(cacheControl).toMatch(/max-age=\d{7,}/);
  });
});
