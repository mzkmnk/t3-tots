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
