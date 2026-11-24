// Runs tests/index.html in headless Chromium and exits non-zero if any test fails.
// Usage: pnpm test. Set CHROMIUM_PATH to use an already-installed Chromium.
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const TIMEOUT_MS = 120_000;
const server = await startServer(0);
const url = `http://localhost:${server.address().port}/tests/index.html`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let code = 1;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => document.title === 'PASS' || document.title === 'FAIL', null, { timeout: TIMEOUT_MS });
  const results = await page.$$eval('#results li', (lis) => lis.map((li) => ({ cls: li.className, text: li.textContent })));
  for (const r of results) console.log(r.cls === 'pass' ? r.text : r.cls === 'todo' ? `\x1b[33m${r.text}\x1b[0m` : `\x1b[31m${r.text}\x1b[0m`);
  for (const e of errors) console.log(`\x1b[31mpage error: ${e}\x1b[0m`);
  console.log(await page.textContent('#summary'));
  code = (await page.title()) === 'PASS' && results.length > 0 ? 0 : 1;
} catch (e) {
  console.error(`Test run failed: ${e.message}`);
} finally {
  await browser.close();
  server.close();
}
process.exit(code);
