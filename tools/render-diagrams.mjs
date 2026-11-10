import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "docs/architecture/diagrams");
const outputDir = path.join(root, "docs/architecture/rendered");
const previewDir = path.join(root, ".tools/diagram-previews");
const bundle = process.env.MERMAID_BUNDLE || path.join(root, "node_modules/mermaid/dist/mermaid.min.js");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
});

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });
const report = [];
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1 });
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:24px;background:white"><div id="diagram"></div></body></html>');
  await page.addScriptTag({ path: bundle });
  await page.evaluate(() => window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    htmlLabels: false,
    theme: "default",
    fontFamily: "Arial, sans-serif",
    flowchart: { htmlLabels: false, useMaxWidth: false, nodeSpacing: 40, rankSpacing: 65, curve: "linear" },
    sequence: { useMaxWidth: false, wrap: true, mirrorActors: false, messageMargin: 30 },
    er: { useMaxWidth: false, layoutDirection: "LR" },
  }));
  const names = (await fs.readdir(sourceDir)).filter(name => name.endsWith(".mmd")).sort();
  for (const name of names) {
    const source = await fs.readFile(path.join(sourceDir, name), "utf8");
    const svg = await page.evaluate(async ({ source, id }) => {
      await window.mermaid.parse(source);
      const { svg } = await window.mermaid.render(id, source);
      document.getElementById("diagram").innerHTML = svg;
      return svg;
    }, { source, id: "diagram" + report.length });
    const base = name.slice(0, -4);
    await fs.writeFile(path.join(outputDir, base + ".svg"), svg + "\n");
    const dimensions = await page.locator("#diagram svg").evaluate(svg => {
      const box = svg.getBBox();
      return { width: box.width, height: box.height, textNodes: svg.querySelectorAll("text").length };
    });
    if (!dimensions.width || !dimensions.height || !dimensions.textNodes) throw new Error("Empty diagram: " + name);
    await page.locator("#diagram svg").screenshot({ path: path.join(previewDir, base + ".png") });
    report.push({ file: name, ...dimensions });
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ diagrams: report.length, rendered: report }, null, 2));
