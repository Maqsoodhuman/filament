// SKILL: visual-check (FRONTEND MERGE GATE)
// Load a route, capture a Playwright screenshot, and assert the rendered DOM matches the intent.
// Usage: node visual-check.mjs --url <url> --intent "<space separated keywords>" [--out <png>]
// Gate: exits nonzero if any intent keyword is absent from the rendered page.
// The PNG is written for human/vision review (the orchestrator can Read it to vision-verify);
// the keyword presence check is the automated tripwire.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// playwright lives in the frontend lane's node_modules; resolve it explicitly so this skill
// runs from any cwd. The browser binary is in the shared ms-playwright cache (installed once).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(path.resolve(__dirname, "../frontend/node_modules/playwright"));

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

const url = args.url;
const intent = args.intent || "";
const out = args.out || "/tmp/visual-check.png";
if (!url) {
  console.error("usage: node visual-check.mjs --url <url> --intent \"<keywords>\" [--out <png>]");
  process.exit(2);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.screenshot({ path: out, fullPage: true });
  const text = (await page.innerText("body")).toLowerCase();
  const kws = intent.toLowerCase().split(/\s+/).filter(Boolean);
  const missing = kws.filter((k) => !text.includes(k));
  console.log("screenshot:", out);
  if (missing.length) {
    console.log("FAIL: intent keywords missing:", missing.join(", "));
    process.exit(1);
  }
  console.log("PASS: intent keywords present:", kws.join(", "));
} finally {
  await browser.close();
}
