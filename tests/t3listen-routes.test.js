// t3listen destinations: each webhook has its own retry queue, failure wave and repeat-hold records (tools/t3listen "destinations").
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const l = require(path.join(__dirname, "..", "tools", "t3listen"));
const fakeT3 = require("./fake-t3");

test("destinations: listen.json's url and headers are the one destination, built once, and every event goes there", () => {
  const config = { url: "https://example.com/hook", headers: { Authorization: "Bearer x" } };
  const [d, ...rest] = l.destsOf(config);
  assert.deepEqual(rest, []);
  assert.deepEqual([d.name, d.url, d.headers, d.queue, d.wave], [null, "https://example.com/hook", { Authorization: "Bearer x" }, [], null]);
  assert.equal(l.destsOf(config)[0], d, "the same object each time, so its queue and wave live as long as the config");
  for (const e of [{ event: "request.opened", requestId: "q", project: "web" }, { event: "thread.failed", runId: "r", project: null },
    { event: "thread.failed.batch", failures: [{ runId: "a", project: "web" }, { runId: "b", project: "api" }] }, { event: "test" }])
    assert.equal(l.destFor(e, config), d, e.event);
  assert.deepEqual(l.newDest(null, "https://example.com/hook").headers, {}, "no headers is an empty set, not undefined");
});

test("retry queue per destination: saved events go back only into their own destination's queue", () => {
  const ev = (event, id, project) => ({ event, project, ...(event.startsWith("request") ? { requestId: id } : { runId: id }) });
  const S = {
    sent: { "req-a": { threadId: "t1", parked: { "request.opened": { e: ev("request.opened", "req-a", "web"), rounds: 2, since: 7 } } } },
    finished: { "run-b": { threadId: "t2", parked: { "thread.finished": { e: ev("thread.finished", "run-b", "api"), rounds: 0, since: 8 } } } },
  };
  const web = [], api = [];
  assert.equal(l.refillFromState(web, S, 100, (e) => e.project === "web"), 1);
  assert.deepEqual(web.map((x) => [x.e.requestId, x.rounds, x.since]), [["req-a", 2, 7]]);
  assert.ok(S.finished["run-b"].parked, "another destination's saved event stays saved");
  const full = Array.from({ length: l.MAX_RETRY_QUEUE }, (_, i) => ({ e: ev("thread.finished", `x${i}`, "web") }));
  assert.equal(l.refillFromState(full, S, 101, (e) => e.project === "web"), 0, "nothing of web's is left");
  assert.equal(l.refillFromState(api, S, 102, (e) => e.project === "api"), 1, "a full queue elsewhere doesn't stop this one");
  assert.deepEqual(api.map((x) => x.e.runId), ["run-b"]);
  assert.ok(!S.sent["req-a"].parked && !S.finished["run-b"].parked);
});

test("repeat holds per destination: a record names its destination only when it isn't listen.json's url", () => {
  const top = l.newDest(null, "https://example.com/a"), named = l.newDest("web", "https://example.com/b");
  const rec = { err: "provider error 503", at: 1, runId: "r1" };
  assert.equal(l.repeatsHere(rec, top), rec, "a record without a destination name belongs to listen.json's url, as every record did before");
  assert.equal(l.repeatsHere(rec, named), undefined);
  assert.deepEqual(l.tagDest(rec, top), rec); assert.ok(!("to" in l.tagDest(rec, top)), "the top-level url's records keep their old shape");
  const tagged = l.tagDest(rec, named);
  assert.deepEqual(tagged, { ...rec, to: "web" });
  assert.equal(l.repeatsHere(tagged, named), tagged); assert.equal(l.repeatsHere(tagged, top), undefined, "a record from another destination counts as none");
  assert.deepEqual(l.tagDest(tagged, top), rec, "moving to another destination drops the old name");
  assert.equal(l.repeatsHere(undefined, top), undefined);
});

const isoNow = () => new Date().toISOString();
const busyT = (id, runId) => ({ id, title: `Thread ${id}`, status: "running", activeRunId: runId, latestRunId: runId });
const failedT = (id, runId) => ({ id, title: `Thread ${id}`, status: "failed", activeRunId: null, latestRunId: runId });
const failRun = (id) => ({ id, status: "failed", startedAt: "2026-11-07T04:00:00Z", completedAt: isoNow() });
test("destinations, live: with one destination listen-state.json keeps its old shape (no destination names on repeat records)", async () => {
  const f = await fakeT3.startFake({ repeatFailureHours: 6 });
  try {
    const fail = async (runId) => {
      f.update(busyT("A", runId), { runs: [{ id: runId, status: "running", startedAt: isoNow() }], turnItems: [] });
      await fakeT3.sleep(150);
      f.update(failedT("A", runId), { runs: [failRun(runId)], turnItems: [{ type: "error", runId, text: "Provider error 503" }] });
      await f.waitFor(() => !!f.state() && !!f.state().finished[runId], 8000, `failure ${runId}`);
    };
    f.setThread(busyT("A", "r0"), { runs: [], turnItems: [] });
    f.start(); await f.waitFor(() => /watching 1 threads/.test(f.out), 8000, "first snapshot");
    await fail("r1"); await f.waitFor(() => f.posts.length === 1, 8000, "the first failure");
    await fail("r2"); await f.waitFor(() => /held back thread\.failed/.test(f.out), 8000, "the repeat to be held");
    const s = f.state();
    assert.deepEqual(Object.keys(s.failRepeat.A).sort(), ["at", "err", "held", "runId"]);
    assert.deepEqual(Object.keys(s).sort(), ["failRepeat", "finished", "lastAlive", "sent"]);
  } finally { await f.close(); }
});

// ---------- routes: listen.json "routes" sends a project's events to its own webhook ----------
const errOf = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
test("routes config: none means no routes; names match without case or outer spaces; bad routes are named, their urls never shown", () => {
  assert.equal(l.compileRoutes(undefined), null); assert.equal(l.compileRoutes(null), null);
  const R = l.compileRoutes({ " iOS-App ": { url: "https://example.com/ios", headers: { Authorization: "Bearer k1" } }, web: { url: "http://127.0.0.1:9/web" } });
  assert.deepEqual(R.list.map((r) => [r.name, r.key, r.url, r.headers]),
    [[" iOS-App ", "ios-app", "https://example.com/ios", { Authorization: "Bearer k1" }], ["web", "web", "http://127.0.0.1:9/web", {}]]);
  assert.deepEqual(R.ignored, []);
  assert.deepEqual(l.compileRoutes({}).list, []);
  const bad = (r) => errOf(() => l.compileRoutes(r));
  assert.match(bad([]), /^routes must be an object/); assert.match(bad("ios"), /^routes must be an object/);
  assert.match(bad({ " ": { url: "https://example.com/x" } }), /^routes has an empty project name/);
  assert.match(bad({ ios: { url: "https://example.com/a" }, IOS: { url: "https://example.com/b" } }), /^routes\["IOS"\] and routes\["ios"\] name the same project/);
  assert.match(bad({ ios: "https://example.com/a" }), /^routes\["ios"\] must be \{ "url"/);
  assert.match(bad({ ios: {} }), /^routes\["ios"\]\.url must start with https:\/\//);
  const plain = bad({ ios: { url: "http://hooks.example.com/hidden-path-123", headers: { Authorization: "Bearer hidden-key-456" } } });
  assert.match(plain, /^routes\["ios"\]\.url must start with https:\/\/ \(http only for localhost\)$/);
  for (const h of [{ Authorization: 5 }, { "Bad Header": "x" }, ["x"], null]) assert.match(bad({ ios: { url: "https://example.com/a", headers: h } }), /^routes\["ios"\]\.headers must be/, JSON.stringify(h));
  assert.ok(!/hidden/.test(bad({ ios: { url: "https://example.com/a", headers: { Authorization: "Bearer hidden-key-456", X: 1 } } })), "a header value is never shown");
  assert.deepEqual(l.compileRoutes({ ios: { url: "https://example.com/a", approvals: true, filters: {} } }).ignored, ['routes["ios"].approvals', 'routes["ios"].filters'], "a newer key is ignored and listed, never fatal");
  assert.equal(l.compileRoutes({ ios: { url: "ftp://example.com/a" } }, false).list.length, 1, "--dry-run doesn't check urls, like the top-level url");
});

test("routes: events go by project; a question keeps the route it opened on; a batch goes with its failures; no project means url", () => {
  const config = { url: "https://example.com/top", headers: { Authorization: "top" }, routes: l.compileRoutes({ "iOS-App": { url: "https://example.com/ios", headers: { Authorization: "ios" } } }) };
  const [top, ios, ...rest] = l.destsOf(config);
  assert.deepEqual([top.name, top.url, ios.name, ios.key, ios.url, ios.headers, rest], [null, "https://example.com/top", "iOS-App", "ios-app", "https://example.com/ios", { Authorization: "ios" }, []]);
  const to = (e, st = { sent: {} }) => l.destFor(e, config, st).name;
  assert.equal(to({ event: "thread.finished", project: "ios-app" }), "iOS-App");
  assert.equal(to({ event: "request.opened", requestId: "q0", project: "  IOS-APP " }), "iOS-App");
  for (const project of ["web", null, undefined, "", "ios"]) assert.equal(to({ event: "thread.finished", project }), null, String(project));
  assert.equal(to({ event: "test" }), null);
  assert.equal(to({ event: "thread.failed.batch", failures: [{ project: "iOS-App" }, { project: "ios-app" }] }), "iOS-App");
  assert.equal(to({ event: "thread.failed.batch", failures: [{ project: "web" }, { project: null }] }), null);
  assert.equal(to({ event: "request.resolved", requestId: "q1", project: null }, { sent: { q1: { to: "iOS-App" } } }), "iOS-App", "closed after its thread is gone: where it opened");
  assert.equal(to({ event: "request.resolved", requestId: "q1", project: "ios-app" }, { sent: { q1: { to: "gone-route" } } }), "iOS-App", "a saved route no longer in listen.json falls back to the project");
  assert.equal(to({ event: "request.resolved", requestId: "q2", project: "ios-app" }, { sent: { q2: { threadId: "t", at: 1, delivered: true } } }), null, "told before its project had a route: its close goes to url too");
  assert.equal(to({ event: "request.resolved", requestId: "q3", project: "ios-app" }, { sent: { q3: { threadId: "t", at: 1 } } }), null, "an entry from before delivered was kept counts as told");
  assert.equal(to({ event: "request.opened", requestId: "q4", project: "ios-app" }, { sent: { q4: { threadId: "t", at: 1, delivered: false } } }), "iOS-App", "not told yet: it goes by project");
  const home = require("os").homedir(), named = `${home}/apps/ios`;
  const cfg = { url: "https://example.com/top", routes: l.compileRoutes({ [named]: { url: "https://example.com/ios" } }) };
  assert.equal(l.destFor({ project: named }, cfg, { sent: {} }).name, named);
  assert.equal(l.destFor({ project: "~/apps/ios" }, cfg, { sent: {} }).name, named, "a title already redacted for listen-state.json still finds its route");
});

test("status: routes lists project names and header counts, never a url or a header value", () => {
  assert.equal(l.routesLine(undefined), "off"); assert.equal(l.routesLine({}), "off");
  const line = l.routesLine({ "ios-app": { url: "https://hooks.example.com/hidden-path", headers: { Authorization: "Bearer hidden-key" } }, web: { url: "https://example.com/w", extra: 1 } });
  assert.equal(line, '"ios-app" (1 header), "web" (0 headers); other projects go to url; ignored: routes["web"].extra');
  assert.match(l.routesLine({ ios: { url: "http://hooks.example.com/hidden-path" } }), /^invalid, the listener won't start: listen\.json routes\["ios"\]\.url must start with https:\/\//);
  assert.ok(!/hidden/.test(l.routesLine({ ios: { url: "http://hooks.example.com/hidden-path" } })));
});

const now = () => new Date().toISOString();
const ROUTE_KEY = "Bearer ios-route-key-123", TOP_KEY = "Bearer top-level-key-456";
async function routedFake(extra = {}) { // project "proj" (p1) goes to /hook; project "ios-app" (p2) has a route to /ios
  const f = await fakeT3.startFake();
  f.projects.push({ id: "p2", title: "ios-app" });
  f.writeConfig({ headers: { Authorization: TOP_KEY }, routes: { "iOS-App": { url: f.hookUrl("/ios"), headers: { Authorization: ROUTE_KEY } } }, ...extra });
  return f;
}
const got = (f, p) => f.hits.filter((h) => h.path === p && h.status === 200).map((h) => h.e);
const question = (id) => ({
  req: { id, kind: "user_input", status: "pending", createdAt: now(), responseCapability: { type: "resumable" } },
  item: { type: "user_input_request", requestId: id, questions: [{ id: "q", header: "Pick", question: `Which one (${id})?`, options: [{ label: "Blue" }] }] },
});
const idleT = (id, runId, projectId) => ({ id, title: `Thread ${id}`, status: "idle", activeRunId: null, latestRunId: runId, projectId });

test("routes, live: each project's questions, closes and finishes reach its own webhook, each with only its own key", async () => {
  const f = await routedFake();
  try {
    const qs = { W: question("req-w"), I: question("req-i") }, proj = { W: "p1", I: "p2" };
    for (const id of ["W", "I"]) f.setThread({ ...busyT(id, `${id}1`), projectId: proj[id], pendingRuntimeRequest: { id: qs[id].req.id } }, { runs: [{ id: `${id}1`, status: "running", startedAt: now() }], turnItems: [qs[id].item], runtimeRequests: [qs[id].req] });
    f.start(); await f.waitFor(() => f.posts.length === 2, 8000, "both questions");
    assert.match(f.out, /routes: "iOS-App" has its own webhook; other projects go to url/);
    for (const id of ["W", "I"]) f.update({ ...busyT(id, `${id}1`), projectId: proj[id], pendingRuntimeRequest: null }, { runs: [{ id: `${id}1`, status: "running", startedAt: now() }], turnItems: [qs[id].item], runtimeRequests: [{ ...qs[id].req, status: "resolved", resolvedAt: now(), answers: { q: "Blue" } }] });
    await f.waitFor(() => f.posts.length === 4, 8000, "both closes");
    for (const id of ["W", "I"]) f.update(idleT(id, `${id}1`, proj[id]), { runs: [{ id: `${id}1`, status: "completed", startedAt: now(), completedAt: now() }], turnItems: [{ type: "assistant_message", runId: `${id}1`, text: "Done." }] });
    await f.waitFor(() => f.posts.length === 6, 8000, "both finishes");
    await fakeT3.sleep(200);
    assert.deepEqual(got(f, "/ios").map((e) => [e.event, e.threadId, e.project]), [["request.opened", "I", "ios-app"], ["request.resolved", "I", "ios-app"], ["thread.finished", "I", "ios-app"]]);
    assert.deepEqual(got(f, "/hook").map((e) => [e.event, e.threadId, e.project]), [["request.opened", "W", "proj"], ["request.resolved", "W", "proj"], ["thread.finished", "W", "proj"]]);
    assert.ok(f.hits.filter((h) => h.path === "/ios").every((h) => h.headers.authorization === ROUTE_KEY));
    assert.ok(f.hits.filter((h) => h.path === "/hook").every((h) => h.headers.authorization === TOP_KEY), "the top-level key never reaches the route, nor the route's key the top-level url");
    assert.equal(f.state().sent["req-i"], undefined, "closed questions are forgotten as before");
  } finally { await f.close(); }
});

test("routes, live: failure waves batch per webhook; a batch never mixes two webhooks' failures", async () => {
  const f = await routedFake({ failureWaveSeconds: 2 });
  try {
    const threads = [["A", "p2"], ["B", "p2"], ["C", "p1"]];
    for (const [id, p] of threads) f.setThread({ ...busyT(id, `${id}1`), projectId: p }, { runs: [{ id: `${id}1`, status: "running", startedAt: now() }], turnItems: [] });
    f.start(); await f.waitFor(() => /watching 3 threads/.test(f.out), 8000, "first snapshot");
    for (const [id, p] of threads) f.update({ ...failedT(id, `${id}1`), projectId: p }, { runs: [failRun(`${id}1`)], turnItems: [{ type: "error", runId: `${id}1`, text: `boom ${id}` }] });
    await f.waitFor(() => f.posts.length === 2, 9000, "one post per webhook");
    await fakeT3.sleep(500);
    const [ios] = got(f, "/ios"), [top] = got(f, "/hook");
    assert.equal(ios.event, "thread.failed.batch"); assert.deepEqual(ios.failures.map((x) => x.runId).sort(), ["A1", "B1"]);
    assert.deepEqual([top.event, top.runId], ["thread.failed", "C1"], "one failure alone on its webhook is a plain thread.failed");
    assert.equal(f.posts.length, 2);
  } finally { await f.close(); }
});

test("routes, live: a question whose thread went away while the listener was stopped is closed on the webhook it opened on", async () => {
  const f = await routedFake();
  try {
    const q = question("req-gone");
    f.setThread({ ...busyT("I", "I1"), projectId: "p2", pendingRuntimeRequest: { id: q.req.id } }, { runs: [], turnItems: [q.item], runtimeRequests: [q.req] });
    f.start(); await f.waitFor(() => f.posts.length === 1, 8000, "the question");
    assert.equal(f.state().sent["req-gone"].to, "iOS-App", "the route is saved with the question");
    await f.stop(); f.threads.delete("I"); f.start();
    await f.waitFor(() => f.posts.length === 2, 8000, "the close after the restart");
    assert.deepEqual(got(f, "/ios").map((e) => [e.event, e.status]), [["request.opened", undefined], ["request.resolved", "archived-or-deleted"]]);
    assert.deepEqual(got(f, "/hook"), []);
  } finally { await f.close(); }
});

test("routes, live: a question sent before its project had a route is still closed on url; a new one opens on the route", async () => {
  const f = await fakeT3.startFake();
  try {
    f.projects.push({ id: "p2", title: "ios-app" });
    f.writeConfig({ headers: { Authorization: TOP_KEY } });
    const old = question("req-old"), fresh = question("req-new");
    f.setThread({ ...busyT("I", "I1"), projectId: "p2", pendingRuntimeRequest: { id: old.req.id } }, { runs: [], turnItems: [old.item], runtimeRequests: [old.req] });
    f.start(); await f.waitFor(() => f.posts.length === 1, 8000, "the question, before any route");
    assert.equal(f.state().sent["req-old"].to, undefined);
    await f.stop();
    f.writeConfig({ headers: { Authorization: TOP_KEY }, routes: { "iOS-App": { url: f.hookUrl("/ios"), headers: { Authorization: ROUTE_KEY } } } });
    f.start(); await f.waitFor(() => /watching 1 threads/.test(f.out), 8000, "the restart with the route");
    f.update({ ...busyT("I", "I1"), projectId: "p2", pendingRuntimeRequest: { id: fresh.req.id } }, { runs: [], turnItems: [old.item, fresh.item],
      runtimeRequests: [{ ...old.req, status: "resolved", resolvedAt: now(), answers: { q: "Blue" } }, fresh.req] });
    await f.waitFor(() => f.posts.length === 3, 8000, "the old question's close and the new question");
    assert.deepEqual(got(f, "/hook").map((e) => [e.event, e.requestId]), [["request.opened", "req-old"], ["request.resolved", "req-old"]], "the card on the first routine is closed there");
    assert.deepEqual(got(f, "/ios").map((e) => [e.event, e.requestId]), [["request.opened", "req-new"]]);
  } finally { await f.close(); }
});
test("routes, live: a route that refuses keeps its own failure; its key and url never reach the log; a restart sends each once to its own webhook", async () => {
  const f = await routedFake();
  try {
    f.setHookStatus((e, req) => (req.url === "/ios" ? { status: 400, body: `bad key ${ROUTE_KEY} for ${f.hookUrl("/ios")}` } : 200));
    for (const [id, p] of [["I", "p2"], ["W", "p1"]]) f.setThread({ ...busyT(id, `${id}1`), projectId: p }, { runs: [{ id: `${id}1`, status: "running", startedAt: now() }], turnItems: [] });
    f.start(); await f.waitFor(() => /watching 2 threads/.test(f.out), 8000, "first snapshot");
    for (const [id, p] of [["I", "p2"], ["W", "p1"]]) f.update({ ...failedT(id, `${id}1`), projectId: p }, { runs: [failRun(`${id}1`)], turnItems: [{ type: "error", runId: `${id}1`, text: `boom ${id}` }] });
    await f.waitFor(() => got(f, "/hook").length === 1 && /webhook answered HTTP 400 for thread\.failed I1 \(route "iOS-App"\)/.test(f.out), 8000, "the refused route and the url's failure");
    assert.ok(f.state().finished.I1.e, "the route's unsent failure is saved"); assert.equal(f.state().finished.W1.e, undefined);
    assert.ok(!f.out.includes("ios-route-key-123") && !f.out.includes(f.hookUrl("/ios")), "the webhook's echo of the key and url is redacted");
    assert.match(f.out, /bad key \[redacted\]/);
    await f.stop(); f.setHookStatus(() => 200); f.start();
    await f.waitFor(() => got(f, "/ios").length === 1, 8000, "the resend after the restart");
    await fakeT3.sleep(300);
    assert.deepEqual(got(f, "/ios").map((e) => e.runId), ["I1"]); assert.deepEqual(got(f, "/hook").map((e) => e.runId), ["W1"]);
  } finally { await f.close(); }
});

test("routes, live: after a restart a route that is down doesn't hold up the url's catch-up", async () => {
  const f = await routedFake();
  try {
    f.setHookStatus(() => 400);
    for (const [id, p] of [["I", "p2"], ["W", "p1"]]) f.setThread({ ...busyT(id, `${id}1`), projectId: p }, { runs: [{ id: `${id}1`, status: "running", startedAt: now() }], turnItems: [] });
    f.start(); await f.waitFor(() => /watching 2 threads/.test(f.out), 8000, "first snapshot");
    for (const [id, p] of [["I", "p2"], ["W", "p1"]]) {
      f.update({ ...failedT(id, `${id}1`), projectId: p }, { runs: [failRun(`${id}1`)], turnItems: [{ type: "error", runId: `${id}1`, text: `boom ${id}` }] });
      await f.waitFor(() => !!(f.state().finished[`${id}1`] || {}).e, 8000, `${id}'s failure to be saved`);
    }
    await f.stop();
    assert.deepEqual(Object.keys(f.state().finished), ["I1", "W1"], "the route's failure is first in line");
    const closed = require("http").createServer(); await new Promise((r) => closed.listen(0, "127.0.0.1", r));
    const down = `http://127.0.0.1:${closed.address().port}/ios`; await new Promise((r) => closed.close(r));
    f.writeConfig({ headers: { Authorization: TOP_KEY }, routes: { "iOS-App": { url: down, headers: { Authorization: ROUTE_KEY } } } });
    f.setHookStatus(() => 200); f.start();
    await f.waitFor(() => got(f, "/hook").length === 1, 6000, "the url's failure while the route is still being tried");
    const tries = (f.out.match(/webhook not reachable \([^)]*\) \(route "iOS-App"\)/g) || []).length;
    assert.ok(tries < 3, `the url's catch-up didn't wait for the route's three tries (saw ${tries})`);
    assert.deepEqual(got(f, "/hook").map((e) => e.runId), ["W1"]);
  } finally { await f.close(); }
});

test("routes, live: a bad route stops the listener at startup with BAD_LISTEN_CONFIG and names the route, not its url", async () => {
  const f = await fakeT3.startFake({ routes: { "ios-app": { url: "http://hooks.example.com/hidden-path" } } });
  try {
    assert.equal(await f.start().exited, 1);
    assert.match(f.out, /BAD_LISTEN_CONFIG: listen\.json routes\["ios-app"\]\.url must start with https:\/\//);
    assert.ok(!/hidden-path/.test(f.out));
  } finally { await f.close(); }
});

// ---------- setup --project: add, replace or remove a route without showing its url or key ----------
test("setup on a terminal: each character shows as *, Enter ends a line, a paste of two lines is two lines, Ctrl-C quits", () => {
  let st = { cur: "", cr: false };
  let r = l.keyLines(st, "https://example.com/hidden-path\r");
  assert.deepEqual(r.lines, ["https://example.com/hidden-path"]); assert.equal(r.echo, "*".repeat(31) + "\n"); assert.ok(!r.echo.includes("hidden"));
  r = l.keyLines(st, "\nAuthorization: Bearer k"); assert.deepEqual(r.lines, [], "the \\n after a \\r is the same Enter");
  r = l.keyLines(st, "x\u007fey\r\n"); assert.deepEqual(r.lines, ["Authorization: Bearer key"]); assert.equal(r.echo, "*\b \b**\n");
  st = { cur: "", cr: false };
  r = l.keyLines(st, "\x1b[200~https://example.com/a\nAuthorization: Bearer b\n\x1b[201~");
  assert.deepEqual(r.lines, ["https://example.com/a", "Authorization: Bearer b"], "bracketed paste marks are dropped");
  r = l.keyLines(st, "ab\x1b[Dc"); assert.equal(st.cur, "abc", "arrow keys are ignored");
  assert.equal(l.keyLines({ cur: "", cr: false }, "abc\u0003def").quit, true);
  r = l.keyLines({ cur: "", cr: false }, "abc\u0004"); assert.deepEqual([r.lines, r.end], [["abc"], true]);
  assert.equal(l.maskUrl("https://user:pw@example.com/hidden/path?key=hidden"), "https://example.com/****", "no user, path or query");
  assert.equal(l.maskUrl("not a url"), "****");
  assert.equal(l.maskHeader("Authorization: Bearer hidden"), "Authorization: ****");
});

const fs = require("fs"), os = require("os"), cp = require("child_process");
function setupDir(listen) { // a temp tools folder with a copy of t3listen and, if given, a listen.json
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t3listen-setup-"));
  fakeT3.copyTools(dir);
  if (listen) fs.writeFileSync(path.join(dir, "listen.json"), JSON.stringify(listen), { mode: 0o600 });
  return dir;
}
const runSetup = (dir, args, input = "") => {
  const r = cp.spawnSync(process.execPath, [path.join(dir, "t3listen"), "setup", ...args], { input, encoding: "utf8", env: { ...process.env, T3_HOME: path.join(dir, "no-t3") } });
  return { code: r.status, out: r.stdout + r.stderr };
};
const conf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "listen.json"), "utf8"));
const MAIN = { url: "https://example.com/hooks/main-hidden", headers: { Authorization: "Bearer main-hidden-key" }, machine: "laptop", approvals: true, skipStaleMinutes: 60, filters: { resolved: false }, catchUpMinutes: 5 };

test("setup --project: adds a route, keeps the rest of listen.json, prints neither the url nor the key", () => {
  const dir = setupDir(MAIN);
  try {
    const r = runSetup(dir, ["--project", "mobile-app"], "https://example.com/hooks/mobile-hidden-path\nAuthorization: Bearer mobile-hidden-key\n");
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^saved listen\.json \(route "mobile-app": url https:\/\/example\.com\/\*\*\*\*, 1 header\(s\); routes: "mobile-app"\)\. The running listener uses the change after a restart: node ".*t3listen" install/);
    assert.ok(!/hidden/.test(r.out), r.out);
    const c = conf(dir);
    assert.deepEqual(c.routes, { "mobile-app": { url: "https://example.com/hooks/mobile-hidden-path", headers: { Authorization: "Bearer mobile-hidden-key" } } });
    const { routes, ...rest } = c; assert.deepEqual(rest, MAIN, "the main webhook and every other setting are kept");
    if (process.platform !== "win32") assert.equal(fs.statSync(path.join(dir, "listen.json")).mode & 0o777, 0o600);
    assert.ok(!fs.existsSync(path.join(dir, "listen.json.part")));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("setup --project: the same project in other case replaces its route; --remove takes it out; the last one removes routes", () => {
  const dir = setupDir(MAIN);
  try {
    assert.equal(runSetup(dir, ["--project", "mobile-app"], "https://example.com/a\nAuthorization: Bearer a-key\n").code, 0);
    assert.equal(runSetup(dir, ["--project=web"], "http://localhost:8080/w\n\n").code, 0, "--project=name works, and a route can have no headers");
    let r = runSetup(dir, ["--project", " Mobile-App "], "https://example.com/b\nAuthorization: Bearer b-key\n");
    assert.equal(r.code, 0, r.out); assert.match(r.out, /routes: "web", "Mobile-App"\)/);
    assert.deepEqual(conf(dir).routes, { web: { url: "http://localhost:8080/w", headers: {} }, "Mobile-App": { url: "https://example.com/b", headers: { Authorization: "Bearer b-key" } } });
    r = runSetup(dir, ["--project", "MOBILE-APP", "--remove"]);
    assert.equal(r.code, 0, r.out); assert.match(r.out, /^removed route "Mobile-App" from listen\.json; its events go to url again\. Routes left: 1\./);
    assert.deepEqual(Object.keys(conf(dir).routes), ["web"]);
    r = runSetup(dir, ["--project", "nope", "--remove"]);
    assert.equal(r.code, 1); assert.match(r.out, /^NOT_FOUND: listen\.json has no route for "nope"/);
    assert.equal(runSetup(dir, ["--project", "web", "--remove"]).code, 0);
    assert.ok(!("routes" in conf(dir)), "no routes left: listen.json is back to its old shape");
    const { routes, ...rest } = conf(dir); assert.deepEqual(rest, MAIN);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("setup --project: refuses without a main webhook, a name or a good url, and saves nothing; plain setup keeps routes", () => {
  const empty = setupDir(null), dir = setupDir(MAIN);
  try {
    let r = runSetup(empty, ["--project", "mobile-app"], "https://example.com/a\n\n");
    assert.equal(r.code, 1); assert.match(r.out, /^NO_LISTEN_CONFIG: set up the main webhook first/); assert.ok(!fs.existsSync(path.join(empty, "listen.json")));
    r = runSetup(dir, ["--project"], "https://example.com/a\n\n"); assert.equal(r.code, 1); assert.match(r.out, /^USAGE: setup --project <T3 project name>/);
    r = runSetup(dir, ["--project", "mobile-app"], "http://hooks.example.com/hidden-path\nAuthorization: Bearer hidden-key\n");
    assert.equal(r.code, 1); assert.match(r.out, /^BAD_URL:/); assert.ok(!/hidden/.test(r.out));
    r = runSetup(dir, ["--project", "mobile-app"], "https://example.com/a\nnot a header\n");
    assert.equal(r.code, 1); assert.match(r.out, /^BAD_HEADER:/);
    assert.deepEqual(conf(dir), MAIN, "nothing was saved");
    assert.equal(runSetup(dir, ["--project", "mobile-app"], "https://example.com/m\nAuthorization: Bearer m-key\n").code, 0);
    r = runSetup(dir, [], "https://example.com/hooks/new-main\nAuthorization: Bearer new-main-key\n");
    assert.equal(r.code, 0, r.out); assert.match(r.out, /^saved listen\.json \(url set, 1 header\(s\), machine "laptop", approvals on\)/);
    const c = conf(dir);
    assert.deepEqual([c.url, c.headers], ["https://example.com/hooks/new-main", { Authorization: "Bearer new-main-key" }]);
    assert.deepEqual(c.routes, { "mobile-app": { url: "https://example.com/m", headers: { Authorization: "Bearer m-key" } } }, "the main webhook's setup keeps the routes");
  } finally { for (const d of [empty, dir]) fs.rmSync(d, { recursive: true, force: true }); }
});
