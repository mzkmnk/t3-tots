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
