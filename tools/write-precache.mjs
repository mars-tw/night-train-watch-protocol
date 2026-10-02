import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";

const root = "dist";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
async function collect(dir) {
  const files = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, item.name);
    if (item.isDirectory()) files.push(...await collect(full));
    else files.push(relative(root, full).replaceAll("\\", "/"));
  }
  return files;
}
// Precache the shipping runtime, not historical screenshots/source PNGs.
const files = (await collect(root)).filter(file =>
  ["index.html", "manifest.webmanifest"].includes(file)
  || /^icons\/.*\.png$/.test(file)
  || /^assets\/[^/]+\.(js|css)$/.test(file)
  || /^assets\/art\/v2\/(characters|equipment|threats)\/.*\.webp$/.test(file)
  || /^assets\/art\/v21\/(carriages|ui|props|effects)\/.*\.webp$/.test(file)
  || /^assets\/art\/v21\/ui\/app-icon-(192|512)\.png$/.test(file)
  || /^assets\/art\/(crops|decor)\/.*\.png$/.test(file),
).sort();
const digest = createHash("sha256");
digest.update(version);
for (const file of files) digest.update(file).update(await readFile(join(root, file)));
const build = digest.digest("hex").slice(0, 16);
await writeFile(join(root, "precache.json"), JSON.stringify({ version, build, files }, null, 2));
const worker = (await readFile(join(root, "sw.js"), "utf8"))
  .replaceAll("__NTWP_BUILD__", build).replaceAll("__NTWP_VERSION__", version);
await writeFile(join(root, "sw.js"), worker);
console.log(`Offline build ${build}: ${files.length} coherent assets`);
