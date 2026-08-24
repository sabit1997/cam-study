import { chromium } from "playwright";

const APP_URL = "http://localhost:3000";

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(APP_URL);

console.log("\n브라우저에서 직접 로그인하세요.");
console.log("측정 대상 화면까지 이동한 뒤, 이 터미널에서 Enter를 누르세요.\n");

await new Promise((resolve) => process.stdin.once("data", resolve));

await context.storageState({ path: "perf-auth.json" });
console.log("저장 완료 → perf-auth.json");

await browser.close();
process.exit(0);
