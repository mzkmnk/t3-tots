// skills/t3-project-setup: what it tells a notifier bot to run exists in t3listen, the output it quotes is what t3listen prints,
// and its steps work end to end against a fake T3 and a dummy webhook (osascript and install are left out: they touch the real Mac).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), cp = require("child_process");
const fakeT3 = require("./fake-t3");
const ROOT = path.join(__dirname, ".."), SKILL = fs.readFileSync(path.join(ROOT, "skills", "t3-project-setup", "SKILL.md"), "utf8");
const T3LISTEN = fs.readFileSync(path.join(ROOT, "tools", "t3listen"), "utf8");
const usage = cp.execFileSync(process.execPath, [path.join(ROOT, "tools", "t3listen"), "help"], { encoding: "utf8" });

test("t3-project-setup: frontmatter, listed in the manifest, no em dashes", () => {
  const fm = SKILL.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(fm, "starts with frontmatter");
  assert.match(fm[1], /^name: t3-project-setup$/m);
  assert.match(fm[1], /Use for /);
  assert.ok(!SKILL.includes("—"));
  const check = "import importlib.machinery, importlib.util, sys; L = importlib.machinery.SourceFileLoader('s', sys.argv[1]); m = importlib.util.module_from_spec(importlib.util.spec_from_loader('s', L)); L.exec_module(m); print(m.frontmatter_problem('t3-project-setup', open(sys.argv[2], encoding='utf-8').read()))";
  assert.equal(cp.execFileSync("python3", ["-I", "-c", check, path.join(ROOT, "scripts", "sync-skills"), path.join(ROOT, "skills", "t3-project-setup", "SKILL.md")], { encoding: "utf8" }).trim(), "None", "scripts/sync-skills accepts its frontmatter");
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  assert.ok(m.files.some((f) => f.path === "skills/t3-project-setup/SKILL.md" && f.dest === "t3-project-setup/SKILL.md" && f.kind === "skill"));
});

test("t3-project-setup: every t3listen command it gives exists, and none can replace the main webhook", () => {
  // commands the skill tells the bot to run; one named in a "never ..." sentence is a warning, not a step
  const sentence = (i) => SKILL.slice(Math.max(SKILL.lastIndexOf(". ", i), SKILL.lastIndexOf("\n", i)) + 1, i);
  const cmds = [...SKILL.matchAll(/`(node t3listen [^`]*)`/g)].filter((m) => !/\bnever\b/i.test(sentence(m.index))).map((m) => m[1]);
  assert.ok([...SKILL.matchAll(/`node t3listen setup`/g)].every((m) => /\bnever\b/i.test(sentence(m.index))), "a bare setup only appears in a warning");
  assert.ok(cmds.length >= 8, cmds.join("\n"));
  for (const c of cmds) {
    const [, sub, ...flags] = c.split(/\s+/).slice(1);
    assert.ok(sub === "help" || new RegExp(`\\b${sub}\\b`).test(usage), `${c}: t3listen has no ${sub} command`); // help prints the usage
    for (const f of flags.filter((x) => x.startsWith("--"))) assert.ok(usage.includes(f), `${c}: ${f} is not in t3listen's usage`);
    assert.ok(!c.includes("--machine"), `${c} must not pass --machine`);
    if (sub === "setup") assert.ok(c.includes("--project"), `${c} must name a project`);
    assert.ok(!["uninstall"].includes(sub), c);
  }
  assert.match(SKILL, /`osascript [^`]*then node t3listen setup --project " & quoted form of \(item 2 of argv\)[^`]*-- "<tools folder>" "<project>"`/, "the project name goes in as an argument");
  assert.match(SKILL, /never pass `--machine`/); assert.match(SKILL, /Never open, print or copy `listen\.json`/);
  assert.match(usage, /^t3listen setup --project name \[--remove\]/m, "the version check in the skill looks for this line");
});

test("t3-project-setup: the setup window starts setup only on a t3listen that knows routes, so an old one can't replace the main webhook", () => {
  // the window's command, built as AppleScript does: the literal parts from the skill, the folder and name through `quoted form of`
  const m = SKILL.match(/do script ("[^"]*") & quoted form of \(item 1 of argv\) & ("[^"]*") & quoted form of \(item 2 of argv\) & ("[^"]*")'/);
  assert.ok(m, "the skill's do script line");
  const lit = (x) => JSON.parse(x), quoted = (x) => `'${x.replace(/'/g, "'\\''")}'`;
  const windowCmd = (dir, name) => lit(m[1]) + quoted(dir) + lit(m[2]) + quoted(name) + lit(m[3]);
  const os = require("os"), main = { url: "https://example.com/hooks/main", headers: { Authorization: "Bearer main" } }, name = "My App's $(id) `x`";
  const folder = (t3listen) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "t3-project-setup-")); fakeT3.copyTools(d); if (t3listen) fs.writeFileSync(path.join(d, "t3listen"), t3listen); fs.writeFileSync(path.join(d, "listen.json"), JSON.stringify(main)); return d; };
  const paste = "https://example.com/hooks/notifier\nAuthorization: Bearer notifier\n";
  const sh = (d) => cp.spawnSync("sh", ["-c", windowCmd(d, name)], { input: paste, encoding: "utf8", env: { ...process.env, T3_HOME: path.join(d, "no-t3") } });
  // an older t3listen: its usage has no --project, and its setup would overwrite url (left here as a marker file)
  const old = folder('if (process.argv[2] === "setup") require("fs").writeFileSync(require("path").join(__dirname, "SETUP_RAN"), "");\nelse console.log("t3listen setup [--machine name]   read the webhook URL");\n');
  const now = folder(null);
  try {
    let r = sh(old);
    assert.match(r.stdout, /^OLD_T3LISTEN: this t3listen has no routes, nothing was changed$/m);
    assert.ok(!fs.existsSync(path.join(old, "SETUP_RAN")), "an old t3listen's setup never runs"); assert.deepEqual(JSON.parse(fs.readFileSync(path.join(old, "listen.json"), "utf8")), main);
    r = sh(now);
    assert.equal(r.status, 0, r.stdout + r.stderr); assert.doesNotMatch(r.stdout, /OLD_T3LISTEN/);
    const c = JSON.parse(fs.readFileSync(path.join(now, "listen.json"), "utf8"));
    assert.deepEqual([c.url, c.headers], [main.url, main.headers], "the main webhook is untouched");
    assert.deepEqual(Object.keys(c.routes), [name], "the name arrives as typed: no $( ) or backquote ran");
  } finally { for (const d of [old, now]) fs.rmSync(d, { recursive: true, force: true }); }
});
test("t3-project-setup: the output it quotes is what t3listen prints", () => {
  const quoted = ['config: no listen.json yet', 'autostart: not installed', 'running: yes', 'installed with --approvals', 'routes:', 'routes: invalid',
    'OK: route "', 'no route for "', 'note: no T3 project is named "', 'saved listen.json (route "', 'removed route "', 'its events go to url again',
    'T3 Tots listener setup for project "', 'Line 1: Webhook URL starting https://', 'Line 2: Authorization header starting Authorization:', 'nothing was saved'];
  for (const q of quoted) assert.ok(SKILL.includes(q), `the skill no longer quotes ${q}`);
  const inCode = ['no listen.json yet', 'autostart: ${inst}', 'running: ${running ? `yes', 'installed with --approvals', '\\nroutes: ${routesLine', "invalid, the listener won't start",
    'OK: ${where} answered', 'route "${clean(d.name)}"', 'no route for "${clean(project)}", so url', 'note: no T3 project is named "', 'saved listen.json (route "', 'removed route "', 'its events go to url again',
    'T3 Tots listener setup${what}', ' for project "${clean(name)}"', 'Line 1: Webhook URL starting https://', 'Line 2: Authorization header starting Authorization:', 'nothing was saved', 'let inst = "not installed"'];
  for (const q of inCode) assert.ok(T3LISTEN.includes(q), `t3listen no longer prints ${q}`);
});

test("t3-project-setup, end to end: the skill's checks, setup, test, status and remove against a fake T3 and a dummy webhook", async () => {
  const f = await fakeT3.startFake();
  try {
    fs.copyFileSync(path.join(ROOT, "tools", "t3ctl"), path.join(f.dir, "t3ctl"));
    f.projects.push({ id: "p2", title: "mobile-app", workspaceRoot: "/srv/mobile-app" });
    f.writeConfig({ headers: { Authorization: "Bearer main-key-AAAA" } });
    const env = { ...process.env, T3_HOME: path.join(f.dir, "t3"), T3LISTEN_LABEL: "t3tots-skill-test" };
    const run = (tool, args, input) => new Promise((done) => {
      const c = cp.execFile(process.execPath, [path.join(f.dir, tool), ...args], { env }, (err, out, errOut) => done({ code: err ? err.code : 0, out: out + errOut }));
      if (input !== undefined) c.stdin.end(input);
    });
    // Before you start
    assert.match((await run("t3listen", ["help"])).out, /setup --project/);
    let r = await run("t3listen", ["status"]);
    assert.match(r.out, /^config: listen\.json present$/m); assert.doesNotMatch(r.out, /^routes:/m);
    assert.match((await run("t3ctl", ["projects"])).out, /^p2 {2}mobile-app {2}/m);
    // Setup step 2: the dry run notes a misspelling, sends nothing, and is quiet for the right name in any case
    r = await run("t3listen", ["test", "--project", "mobile-ap", "--dry-run"]);
    assert.match(r.out, /^note: no T3 project is named "mobile-ap" right now/m);
    r = await run("t3listen", ["test", "--project", " Mobile-App ", "--dry-run"]);
    assert.equal(r.code, 0, r.out); assert.doesNotMatch(r.out, /note:/); assert.match(r.out, /^DRY-RUN payload \{/m);
    assert.deepEqual(f.hits, [], "dry runs send nothing");
    // Setup step 3: what the user pastes into the Terminal window (piped here)
    r = await run("t3listen", ["setup", "--project", "mobile-app"], `${f.hookUrl("/notifier")}\nAuthorization: Bearer notifier-key-BBBB\n`);
    assert.equal(r.code, 0, r.out); assert.match(r.out, /^saved listen\.json \(route "mobile-app": url http:\/\/127\.0\.0\.1:\d+\/\*\*\*\*, 1 header\(s\)/);
    assert.ok(!r.out.includes("notifier-key") && !r.out.includes("/notifier"));
    assert.match((await run("t3listen", ["status"])).out, /^routes: "mobile-app" \(1 header\); other projects go to url$/m);
    // Setup step 4
    r = await run("t3listen", ["test", "--project", "mobile-app"]);
    assert.equal(r.out, 'OK: route "mobile-app" answered HTTP 200\n');
    assert.deepEqual(f.hits.map((h) => [h.path, h.e.event, h.e.project, h.headers.authorization]), [["/notifier", "test", "mobile-app", "Bearer notifier-key-BBBB"]]);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir, "listen.json"), "utf8")).url, f.hookUrl(), "the main webhook is untouched");
    // Remove
    r = await run("t3listen", ["setup", "--project", "mobile-app", "--remove"]);
    assert.match(r.out, /^removed route "mobile-app" from listen\.json; its events go to url again\./);
    assert.doesNotMatch((await run("t3listen", ["status"])).out, /^routes:/m, "no routes left: no routes line");
    r = await run("t3listen", ["test", "--project", "mobile-app"]);
    assert.match(r.out, /^OK: webhook \(no route for "mobile-app", so url\) answered HTTP 200$/m);
    assert.equal(f.hits.at(-1).path, "/hook");
  } finally { await f.close(); }
});

// ---------- project bot templates: T3 Tots fills one to make a notifier or a project T3 Tots ----------
const between = (from, to) => { const a = SKILL.indexOf(from), b = SKILL.indexOf(to, a + 1); assert.ok(a >= 0 && b > a, `${from} .. ${to}`); return SKILL.slice(a, b); };
const TEMPLATES = between("## Project bot templates", "## Before you start");
const part = (h) => { const a = TEMPLATES.indexOf(`### ${h}\n`); assert.ok(a >= 0, h); const b = TEMPLATES.indexOf("\n### ", a + 1); return TEMPLATES.slice(a, b < 0 ? undefined : b); };
const DUMMY = { bot_name: "Example Helper", project: "mobile-app", project_id: "proj-0001", path: "~/apps/mobile-app", machine: "office-computer", tools_folder: "~/t3-tots", language: "English" };
function fill(kind, values) { // what T3 Tots does in "Make a project bot" step 2
  let text = [part(kind), part("Shared rules"), part("Style")].join("\n");
  if (!values.watch_threads) text = text.split("\n").filter((l) => !l.includes("{watch_threads}")).join("\n");
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
}

test("templates live in SKILL.md, because Grok Bot's skill sync carries only each skill's SKILL.md", () => {
  assert.deepEqual(fs.readdirSync(path.join(ROOT, "skills", "t3-project-setup")), ["SKILL.md"]);
  assert.match(fs.readFileSync(path.join(ROOT, "skills", "t3-install-tools", "SKILL.md"), "utf8"), /f\["dest"\] != sid \+ "\/SKILL\.md": continue/, "if the fetcher syncs more files, the templates may move to a file of their own");
});

test("templates: every placeholder is in the table and used, and filling either kind leaves none", () => {
  const defined = [...TEMPLATES.matchAll(/^\| `\{(\w+)\}` \|/gm)].map((m) => m[1]);
  assert.deepEqual(defined.sort(), ["bot_name", "language", "machine", "path", "project", "project_id", "tools_folder", "watch_threads"]);
  const used = new Set([...SKILL.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
  assert.deepEqual([...used].sort(), defined, "every {placeholder} in the skill is defined, and every defined one is used");
  for (const kind of ["Notifier", "Project T3 Tots"]) {
    const filled = fill(kind, DUMMY);
    assert.doesNotMatch(filled, /\{\w+\}/, `${kind}: a placeholder is left`);
    for (const v of ["Example Helper", "mobile-app", "office-computer", "English"]) assert.ok(filled.includes(v), `${kind} uses ${v}`);
    assert.match(filled, /^- Name: Example Helper$/m); assert.match(filled, /^- Description: ONLY job: /m);
  }
  const project = fill("Project T3 Tots", DUMMY);
  assert.ok(project.includes("(id proj-0001, folder ~/apps/mobile-app)") && project.includes("`--project proj-0001`") && project.includes("`node t3ctl threads --project proj-0001`"));
  assert.ok(!project.includes("Threads to keep an eye on"), "no threads to watch: that line is dropped");
  assert.match(fill("Project T3 Tots", { ...DUMMY, watch_threads: "Login screen, Release notes" }), /Threads to keep an eye on: Login screen, Release notes\. Offer a watch/);
  assert.match(project, /Never write or edit code yourself/, "dropping the watch line keeps the rest");
});

test("templates: each kind's skills exist with t3-tots-rules first; a T3 CLI skill is only added where the environment has one", () => {
  const skills = (kind) => [...part(kind).match(/^- Skills: (.*)$/m)[1].matchAll(/\bt3-[a-z-]+\b/g)].map((m) => m[0]);
  assert.deepEqual(skills("Notifier"), ["t3-tots-rules", "t3-project-setup"]);
  const p = skills("Project T3 Tots");
  assert.equal(p[0], "t3-tots-rules");
  for (const s of ["t3-project-setup", "t3-new-thread", "t3-status", "t3-waiting", "t3-phone-answers", "t3-thread-actions", "t3-get-output", "t3-watch"]) assert.ok(p.includes(s), s);
  for (const s of [...skills("Notifier"), ...p]) assert.ok(fs.existsSync(path.join(ROOT, "skills", s, "SKILL.md")), `${s} is a skill in this repo`);
  assert.match(part("Project T3 Tots"), /t3code-cli\) only if this environment has one/);
});

test("templates: shared rules need the user's OK for releases and money, keep secrets out, and the style gives 2 or 3 choices", () => {
  const rules = part("Shared rules");
  for (const w of ["push", "merge", "pull request", "TestFlight", "App Store Connect", "billing", "sign a build", "certificates", "Never delete threads",
    "Archive one only after the user's OK", "`token`", "`listen.json`", "`secrets/`", "`statev2.sqlite` only read-only", "Never put a key"]) assert.ok(rules.includes(w), w);
  assert.match(part("Style"), /Write in \{language\}, short and plain\. When the user has to decide, give 2 or 3 choices and say which one you recommend/);
  const project = part("Project T3 Tots"), notifier = part("Notifier");
  for (const w of ["Never write or edit code yourself", "That's for T3 Tots.", "screenshot", "t3-get-output", "propose the next step", "answer only with the user's pick"]) assert.ok(project.includes(w), w);
  for (const w of ["Never answer questions or approvals", "never write code", "That's for T3 Tots."]) assert.ok(notifier.includes(w), w);
  // the project T3 Tots has t3-phone-answers, whose own setup uses --machine and whose pause uninstalls: the pasted rules forbid both
  const pasted = fill("Project T3 Tots", DUMMY);
  for (const w of ["Never run `node t3listen setup` without `--project`", "never pass `--machine`", "never run `uninstall`", 'From t3-phone-answers use only "On an event" and "Answering"', "To turn phone answers on or off, or pause them, say: \"That's for T3 Tots.\""])
    assert.ok(pasted.includes(w), `the pasted project T3 Tots rules say: ${w}`);
});

test("templates: each kind's routine prompt points at a section that exists", () => {
  const prompts = between("## Routine prompt", "## On an event").match(/^> .*$/gm);
  assert.equal(prompts.length, 2);
  assert.match(prompts[0], /for the T3 project "<project>"\. Follow t3-project-setup "On an event" for that project only\.$/);
  assert.match(prompts[1], /You are that project's T3 Tots: follow t3-phone-answers "On an event" for that project only/);
  assert.match(SKILL, /^## On an event \(routine runs\)$/m);
  assert.match(fs.readFileSync(path.join(ROOT, "skills", "t3-phone-answers", "SKILL.md"), "utf8"), /^## On an event \(routine runs\)$/m);
});

test("make a project bot: fill and show, OK, then create with a tool or paste steps; the new bot runs Setup itself; upgrade keeps the route", () => {
  const make = between("## Make a project bot (T3 Tots)", "## Project bot templates");
  const order = ["**Kind and values (read only).**", "**Fill and show.**", "Ask for an OK.", "**Create (after the OK).**", "If it has none, give the user these steps", "**Hand over.**", "**Upgrade a notifier to a project T3 Tots.**"];
  const at = order.map((s) => make.indexOf(s));
  assert.ok(at.every((i) => i >= 0), order.filter((_, i) => at[i] < 0).join(", "));
  assert.deepEqual([...at].sort((a, b) => a - b), at, "the steps come in this order");
  assert.match(make, /T3 Tots never runs "Setup" for the new bot/);
  assert.match(make, /check that no `\{` is left/);
  assert.match(make, /The routine's URL and key stay the same, so the route doesn't change: no Terminal window and no restart/);
});
