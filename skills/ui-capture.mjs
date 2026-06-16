// ui-capture — capture a route at desktop / tablet / mobile widths for a responsive QA sweep.
// Usage: node ui-capture.mjs --url <url> [--name <slug>] [--out-dir /tmp] [--full]
// Writes <out-dir>/<slug>-{desktop,tablet,mobile}.png and prints the paths (one per line).
// The UI/UX QA reviewer then Reads each PNG and judges it. Resolves playwright from the
// frontend lane's node_modules so it runs from any cwd.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(path.resolve(__dirname, "../frontend/node_modules/playwright"));

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]?.startsWith("--") || arr[i + 1] === undefined ? "true" : arr[i + 1]]);
    return acc;
  }, [])
);
const url = args.url;
const slug = args.name || "screen";
const outDir = args["out-dir"] || "/tmp";
const fullPage = args.full === "true";
if (!url) {
  console.error('usage: node ui-capture.mjs --url <url> [--name <slug>] [--out-dir <dir>] [--full]');
  process.exit(2);
}

const VIEWPORTS = [
  { tag: "wide", width: 1920, height: 1080 }, // real desktop monitors — catches dead-space / narrow-column layout
  { tag: "desktop", width: 1280, height: 900 },
  { tag: "tablet", width: 768, height: 1024 },
  { tag: "mobile", width: 320, height: 720 }, // 320px is the WCAG reflow floor
];

const browser = await chromium.launch();
try {
  for (const v of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: v.width, height: v.height } });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() =>
      page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
    );
    await page.waitForTimeout(600); // let client-only chunks (ssr:false) mount
    const out = path.join(outDir, `${slug}-${v.tag}.png`);
    await page.screenshot({ path: out, fullPage });
    // detect horizontal overflow at this width (a common responsive defect)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    console.log(`${out}\t${v.width}x${v.height}\toverflow=${overflow}`);
    await page.close();
  }
} finally {
  await browser.close();
}
