import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";

const root = "dist";
async function collect(dir) {
  const files = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, item.name);
    if (item.isDirectory()) files.push(...await collect(full));
    else files.push(relative(root, full).replaceAll("\\", "/"));
  }
  return files;
}
const files = (await collect(root)).filter(file =>
  !["sw.js", "precache.json"].includes(file)
  && !file.endsWith(".map")
  && !file.startsWith("assets/video/")
  && !file.startsWith("assets/screenshots/")
  && !file.startsWith("assets/qa/")
  && !file.startsWith("assets/art/v2/source/")
  && !file.startsWith("assets/source/")
  && !/\.blend\d*$/.test(file)
  && !file.endsWith("pipeline-report.json"),
).sort();
const digest = createHash("sha256");
for (const file of files) digest.update(file).update(await readFile(join(root, file)));
const build = digest.digest("hex").slice(0, 16);
await writeFile(join(root, "precache.json"), JSON.stringify({ version: "2.0.0", build, files }, null, 2));
const worker = (await readFile(join(root, "sw.js"), "utf8")).replaceAll("__NTWP_BUILD__", build);
await writeFile(join(root, "sw.js"), worker);
console.log(`Offline build ${build}: ${files.length} coherent assets`);
