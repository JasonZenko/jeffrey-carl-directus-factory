import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/Users/jasonsibley/vault/20-Accounts/Clients/Marketly/jobs/sanity-demo/node_modules/playwright/index.mjs';

const root = path.resolve(import.meta.dirname, '..');
const pages = JSON.parse(fs.readFileSync(path.join(root, 'manifests/pages.json'), 'utf8'));
const outDir = path.join(root, 'capture/screenshots');
fs.mkdirSync(outDir, {recursive: true});

const desired = ['home', 'about-team', 'service-detail', 'patient-resource', 'conversion', 'location'];
const reps = [];
for (const family of desired) {
  const page = pages.find(p => p.templateFamily === family);
  if (page) reps.push({family, url: page.sitemapUrl});
}
const viewports = [
  {name: 'desktop', width: 1440, height: 1000},
  {name: 'tablet', width: 768, height: 1024},
  {name: 'mobile', width: 390, height: 844},
];
const browser = await chromium.launch({headless: true});
const results = [];
for (const rep of reps) {
  for (const vp of viewports) {
    const context = await browser.newContext({viewport: {width: vp.width, height: vp.height}, deviceScaleFactor: 1});
    const page = await context.newPage();
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
    page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
    let status = null;
    try {
      const response = await page.goto(rep.url, {waitUntil: 'domcontentloaded', timeout: 60000});
      status = response?.status() ?? null;
      await page.addStyleTag({content: `
        *, *::before, *::after { animation-delay: 0s !important; animation-duration: 0s !important; transition: none !important; }
        [data-aos], .aos-init, .aos-animate { opacity: 1 !important; transform: none !important; visibility: visible !important; }
      `});
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 700) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 25));
        }
        window.scrollTo(0, 0);
        await document.fonts?.ready;
      });
      await page.waitForTimeout(750);
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        h1Count: document.querySelectorAll('h1').length,
        title: document.title,
      }));
      const file = `${rep.family}-${vp.name}-${vp.width}x${vp.height}.png`;
      await page.screenshot({path: path.join(outDir, file), fullPage: true});
      results.push({...rep, viewport: vp, status, ...metrics, horizontalOverflow: metrics.scrollWidth > metrics.clientWidth, errors, localPath: `capture/screenshots/${file}`});
    } catch (error) {
      results.push({...rep, viewport: vp, status, error: error.message, errors});
    }
    await context.close();
    process.stdout.write(`captured ${rep.family} ${vp.name}\n`);
  }
}
await browser.close();
fs.writeFileSync(path.join(root, 'manifests/screenshots.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({representatives: reps.length, screenshots: results.filter(r => r.localPath).length, failures: results.filter(r => r.error).length, overflow: results.filter(r => r.horizontalOverflow).length}, null, 2));
