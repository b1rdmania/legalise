// Safari/WebKit pass — drives the key surfaces in Playwright WebKit and
// reports console errors, render basics, and editor behaviour.
// Run AFTER the P27 fleet lands (vite hot-reloads under their edits).
import { webkit } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/legalise-webkit";
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";
const findings = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await webkit.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e).slice(0, 200)));

// Sign in
await page.goto(`${BASE}/auth/signin`);
await page.fill('input[type="email"]', "scan-demo@example.com");
await page.fill('input[type="password"]', "scan-demo-pass-2026");
await page.click('button:has-text("Sign in")');
await page.waitForURL("**/matters", { timeout: 20000 });
findings.push("signin: OK");

const SURFACES = [
  ["landing", "/", "h1"],
  ["matters", "/matters", "h1"],
  ["skills", "/skills", "h1"],
  ["register", "/register", "h1"],
  ["lawve", "/skills/lawve", "h1"],
  ["settings", "/settings/profile", "h1"],
  ["help", "/help", "h1"],
  ["demo", "/demo", "h1"],
  ["demo-audit", "/demo/audit", "main"],
  ["matter-chat", "/matters/khan-v-acme-trading-2026/assistant", "main"],
];

for (const [name, path, sel] of SURFACES) {
  errors.length = 0;
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(sel, { timeout: 15000 });
    await sleep(1200);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    findings.push(`${name}: rendered${errors.length ? " · CONSOLE ERRORS: " + errors.join(" | ") : ""}`);
  } catch (e) {
    findings.push(`${name}: FAILED — ${String(e).slice(0, 160)}`);
  }
}

// Editor behaviour: open a document, type, check decorations CSS applies,
// exercise find (Cmd+F is Meta on webkit/mac).
errors.length = 0;
try {
  const docs = await page.evaluate(async () => {
    const r = await fetch("/api/matters/khan-v-acme-trading-2026/documents", { credentials: "include" });
    return (await r.json()).map((d) => d.id);
  });
  await page.goto(`${BASE}/matters/khan-v-acme-trading-2026/documents/${docs[1] ?? docs[0]}`);
  await page.waitForSelector(".ProseMirror", { timeout: 20000 });
  await sleep(1000);
  // Type into the editor
  await page.click(".ProseMirror");
  await page.keyboard.type(" WebKit typing check.", { delay: 20 });
  await sleep(800);
  const typed = await page.evaluate(() => document.querySelector(".ProseMirror")?.textContent?.includes("WebKit typing check"));
  findings.push(`editor-typing: ${typed ? "OK" : "FAILED"}`);
  // Tracked-changes CSS computed check (synthetic, outside PM)
  const css = await page.evaluate(() => {
    const wrap = document.createElement("div");
    wrap.className = "legalise-document-editor";
    wrap.innerHTML = '<span class="legalise-track-delete">x</span><span class="legalise-track-insert">y</span>';
    document.body.appendChild(wrap);
    const d = getComputedStyle(wrap.querySelector(".legalise-track-delete"));
    const i = getComputedStyle(wrap.querySelector(".legalise-track-insert"));
    const out = { del: d.textDecorationLine + "/" + d.color, ins: i.textDecorationLine + "/" + i.color };
    wrap.remove();
    return out;
  });
  findings.push(`track-css: del=${css.del} ins=${css.ins}`);
  // Find panel via keyboard
  await page.keyboard.press("Meta+f");
  await sleep(500);
  const findOpen = await page.evaluate(() => !!document.querySelector('input[placeholder*="ind"], [data-testid*="find"]'));
  findings.push(`find-shortcut: ${findOpen ? "OK" : "not visible (check binding on webkit)"}`);
  // Reset the draft so the typing check leaves no residue
  const more = await page.$('[data-testid="document-editor-more"] summary');
  if (more) { await more.click(); await sleep(300); }
  const reset = await page.$('button:has-text("Reset")');
  if (reset) { await reset.click(); await sleep(600); findings.push("draft-reset: OK"); }
  await page.screenshot({ path: `${OUT}/editor.png` });
  if (errors.length) findings.push("editor console errors: " + errors.join(" | "));
} catch (e) {
  findings.push("editor: FAILED — " + String(e).slice(0, 200));
}

await browser.close();
console.log(findings.join("\n"));
