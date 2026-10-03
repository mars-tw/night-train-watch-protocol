import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const publicRoot = resolve(root, "public");
const report = JSON.parse(readFileSync(resolve(root, "docs/reboot-v22/reports/A07_CLIPS_LOSSLESS_REPORT.json"), "utf8")) as {
  source: string;
  sourceDimensions: [number, number];
  totalBytes: number;
  allRgbaExact: boolean;
  allAlphaExact: boolean;
  assets: Array<{ clipId: string; frameCount: number; sourceBox: [number, number, number, number]; width: number; height: number; path: string; bytes: number; sha256: string; sourceCropRgbaSha256: string; decodedRgbaSha256: string; rgbaExact: boolean; alphaExact: boolean; frameBoxes: Array<{ frame: number; atlasBox: number[]; clipBox: number[]; width: number; height: number }> }>;
};

const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

describe("v22 A-07 lossless clips", () => {
  it("records the exact floor row and column crop contract", () => {
    expect(report).toMatchObject({ sourceDimensions: [1340, 1174], allRgbaExact: true, allAlphaExact: true });
    expect(report.assets.map((asset) => [asset.clipId, asset.frameCount])).toEqual([
      ["sleep", 8], ["turn", 8], ["listen", 8], ["startle", 8], ["sit", 8], ["drink", 6], ["settle", 6],
    ]);
    let bytes = 0;
    report.assets.forEach((asset, row) => {
      const y0 = Math.floor(row * 1174 / 7);
      const y1 = Math.floor((row + 1) * 1174 / 7);
      expect(asset.sourceBox).toEqual([0, y0, 1340, y1]);
      expect([asset.width, asset.height]).toEqual([1340, y1 - y0]);
      expect(asset.sourceCropRgbaSha256).toBe(asset.decodedRgbaSha256);
      expect(asset).toMatchObject({ rgbaExact: true, alphaExact: true });
      const path = resolve(root, asset.path);
      expect(statSync(path).size).toBe(asset.bytes);
      expect(hash(path)).toBe(asset.sha256);
      asset.frameBoxes.forEach((frame, column) => {
        const x0 = Math.floor(column * 1340 / 8);
        const x1 = Math.floor((column + 1) * 1340 / 8);
        expect(frame).toMatchObject({ frame: column, atlasBox: [x0, y0, x1, y1], clipBox: [x0, 0, x1, y1 - y0], width: x1 - x0, height: y1 - y0 });
      });
      bytes += asset.bytes;
    });
    expect(bytes).toBe(report.totalBytes);
  });

  it("browser-decodes every clip crop with byte-identical RGBA and alpha", async () => {
    const server = createServer((request, response) => {
      const relative = decodeURIComponent((request.url ?? "/").replace(/^\//, ""));
      const path = resolve(publicRoot, relative);
      if (!path.startsWith(publicRoot)) { response.writeHead(404).end(); return; }
      response.writeHead(200, { "Content-Type": extname(path) === ".webp" ? "image/webp" : "text/html" });
      if (relative === "") response.end("<!doctype html><canvas></canvas>");
      else createReadStream(path).pipe(response);
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${address.port}/`);
      const results = await page.evaluate(async ({ source, assets }) => {
        const load = (url: string) => new Promise<HTMLImageElement>((done, fail) => { const image = new Image(); image.onload = () => done(image); image.onerror = fail; image.src = url; });
        const atlas = await load(`/${source.replace(/^public\//, "")}`);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        const output = [];
        for (const asset of assets) {
          const clip = await load(`/${asset.path.replace(/^public\//, "")}`);
          canvas.width = asset.width; canvas.height = asset.height;
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(atlas, asset.sourceBox[0], asset.sourceBox[1], asset.width, asset.height, 0, 0, asset.width, asset.height);
          const sourcePixels = context.getImageData(0, 0, asset.width, asset.height).data;
          context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(clip, 0, 0);
          const clipPixels = context.getImageData(0, 0, asset.width, asset.height).data;
          let rgbaMismatches = 0, alphaMismatches = 0;
          for (let index = 0; index < sourcePixels.length; index += 4) {
            if (sourcePixels[index + 3] !== clipPixels[index + 3]) alphaMismatches += 1;
            if (sourcePixels[index] !== clipPixels[index] || sourcePixels[index + 1] !== clipPixels[index + 1] || sourcePixels[index + 2] !== clipPixels[index + 2] || sourcePixels[index + 3] !== clipPixels[index + 3]) rgbaMismatches += 1;
          }
          output.push({ clipId: asset.clipId, naturalWidth: clip.naturalWidth, naturalHeight: clip.naturalHeight, rgbaMismatches, alphaMismatches });
        }
        return output;
      }, { source: report.source, assets: report.assets.map(({ clipId, path, sourceBox, width, height }) => ({ clipId, path, sourceBox, width, height })) });
      expect(results.every((result) => result.rgbaMismatches === 0 && result.alphaMismatches === 0)).toBe(true);
      expect(results.map((result) => [result.naturalWidth, result.naturalHeight])).toEqual(report.assets.map((asset) => [asset.width, asset.height]));
    } finally {
      await browser.close();
      await new Promise<void>((done, fail) => server.close((error) => error ? fail(error) : done()));
    }
  }, 30_000);
});
