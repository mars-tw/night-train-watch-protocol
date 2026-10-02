import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const catalog = JSON.parse(read('spec/reboot-v2/mission-catalog.json'));
const errors = [];
let checks = 0;
const check = (condition, message) => { checks++; if (!condition) errors.push(message); };
const expected = { main: 21, tutorial: 5, relationship: 10, facility: 8, exploration: 6, challenge: 6 };
const routes = ['R01', 'R02', 'R03'];
const missions = catalog.missions;
const ids = new Map(missions.map(m => [m.id, m]));
check(catalog.status === 'proposed', 'Catalog must be marked proposed');
check(missions.length === 56 && ids.size === 56, '56 unique missions required');
for (const [category, count] of Object.entries(expected)) {
  check(missions.filter(m => m.category === category).length === count, `Category count: ${category}`);
  check(catalog.counts[category] === count, `Declared count: ${category}`);
}
for (const m of missions) {
  const prefix = m.id;
  check(Boolean(m.title && m.description && expected[m.category]), `${prefix}: content/category`);
  check(m.routes.length > 0 && m.routes.every(r => routes.includes(r)), `${prefix}: routes`);
  check(Number.isInteger(m.dayMin) && Number.isInteger(m.dayMax) && m.dayMin >= 1 && m.dayMax <= 7 && m.dayMin <= m.dayMax, `${prefix}: day window`);
  check(m.deadline.afterNight === m.dayMax && m.deadline.evaluationPhase === 'aftermath-before-day-advance', `${prefix}: deadline`);
  check(m.completionMode === 'all' && m.objectives.length > 0, `${prefix}: completion`);
  check(m.costs.accept.length === 0 && m.costs.execution === 'original-operation-costs', `${prefix}: double charge`);
  check(['continue', 'expire', 'fallback'].includes(m.failure.policy) && Boolean(m.failure.description), `${prefix}: failure`);
  check(['run', 'profile'].includes(m.scope) && m.repeat === `once-per-${m.scope}`, `${prefix}: scope/repeat`);
  check(Number.isInteger(m.priority), `${prefix}: priority`);
  for (const o of m.objectives) {
    const event = catalog.eventContract.events[o.event];
    check(Boolean(event), `${prefix}: unknown event ${o.event}`);
    const allowed = [...catalog.eventContract.envelope.required, ...(event?.matchFields ?? [])];
    check(Object.keys(o.match).every(k => allowed.includes(k)), `${prefix}: unsupported match fields`);
    check(Number.isInteger(o.count) && o.count > 0, `${prefix}: objective count`);
  }
  for (const reward of m.rewards) {
    check(Boolean(reward.id) && ['journal', 'blueprint', 'cosmetic', 'title', 'decoration'].includes(reward.type), `${prefix}: reward id/type`);
  }
  for (const p of m.prerequisites) {
    if (p.missionId) {
      const prior = ids.get(p.missionId);
      check(Boolean(prior) && prior.dayMin <= m.dayMin, `${prefix}: missing/future prerequisite`);
      check(p.acceptedResults.includes('compromised') && p.acceptedResults.includes('expired'), `${prefix}: failure must continue`);
    }
  }
}
const active = new Set(), done = new Set();
function visit(id) {
  if (active.has(id)) { errors.push(`Prerequisite cycle: ${id}`); return; }
  if (done.has(id)) return;
  active.add(id);
  for (const p of ids.get(id)?.prerequisites ?? []) if (p.missionId) visit(p.missionId);
  active.delete(id); done.add(id);
}
for (const id of ids.keys()) visit(id);
for (const route of routes) {
  const main = missions.filter(m => m.category === 'main' && m.routes.includes(route));
  check(main.length === 7 && new Set(main.map(m => m.dayMin)).size === 7, `${route}: seven distinct nights`);
  check(main.every(m => m.prerequisites.length === 0 && m.dayMin === m.dayMax), `${route}: no main quest deadlock`);
}
const groups = new Map();
for (const m of missions.filter(m => m.category === 'facility')) {
  const g = m.branchGroup;
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(m);
}
check(groups.size === 4 && [...groups.values()].every(g => g.length === 2 && new Set(g.map(m => m.branchChoice)).size === 2), 'Four facility groups with distinct alternatives');
const plan = read('plan/design-night-train-reboot-v2.md');
for (const header of ['# Introduction', '## 1. Requirements & Constraints', '## 2. Implementation Steps', '## 3. Alternatives', '## 4. Dependencies', '## 5. Files', '## 6. Testing', '## 7. Risks & Assumptions', '## 8. Related Specifications / Further Reading']) check(plan.includes(header), `Plan section ${header}`);
const declarations = [...plan.matchAll(/^\| ((?:TASK|GOAL)-\d+) \|/gm), ...plan.matchAll(/^- \*\*([A-Z]+-\d+)\*\*:/gm)].map(m => m[1]);
check(new Set(declarations).size === declarations.length, 'Unique plan declarations');
check(declarations.filter(id => id.startsWith('TASK-')).length === 30, '30 implementation tasks');
const refs = [...plan.matchAll(/\b(?:REQ|SEC|CON|GUD|PAT|GOAL|TASK|ALT|DEP|FILE|TEST|RISK|ASSUMPTION)-\d+\b/g)].map(m => m[0]);
check(refs.every(id => declarations.includes(id)), 'All plan references declared');
for (const file of ['docs/reboot-v2/GAME_DESIGN.md', 'docs/reboot-v2/ART_DIRECTION.md', 'docs/reboot-v2/BASELINE_AUDIT.md', 'plan/design-night-train-reboot-v2.md']) {
  const value = read(file);
  check(!/TODO|TBD|\[placeholder\]|\$\{input/.test(value), `${file}: no placeholders`);
  for (const link of value.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
    if (/^(https?:|#)/.test(link[1])) continue;
    check(fs.existsSync(path.resolve(root, path.dirname(file), link[1])), `${file}: broken link ${link[1]}`);
  }
}
const report = { status: errors.length ? 'FAIL' : 'PASS', date: '2026-10-02', checkedArtifact: 'v2 design documents, not runtime', checks, missions: missions.length, categories: expected, implementationTasks: 30, prerequisiteCycles: errors.filter(e => e.includes('cycle')), errors };
fs.writeFileSync(path.join(root, 'docs/reboot-v2/PLAN_VALIDATION.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = errors.length ? 1 : 0;
