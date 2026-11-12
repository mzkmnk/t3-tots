#!/usr/bin/env node
// Dummy webhooks for checking t3listen routes by hand. `node tests/dummy-webhook.js main mobile-app`
// starts one webhook per name on 127.0.0.1, prints each one's URL, then one line per POST it gets: which webhook, the event, its
// project and title, and the Authorization header's last 4 characters only. It answers 200 and forwards nothing. Ctrl-C stops it.
const http = require("http");
const names = process.argv.slice(2);
if (!names.length) { console.error("usage: node tests/dummy-webhook.js <name> [<name> ...]"); process.exit(2); }
const tail = (v) => (v && String(v).length >= 12 ? `****${String(v).slice(-4)}` : v ? "****" : "none");
(async () => {
  for (const name of names) {
    const s = http.createServer((req, res) => {
      let b = ""; req.on("data", (c) => (b += c));
      req.on("end", () => {
        let e = {}; try { e = JSON.parse(b); } catch {}
        console.log(`[${name}] ${e.event || "?"} project=${JSON.stringify(e.project ?? null)} title=${JSON.stringify(e.title || "")} auth=${tail(req.headers.authorization)}`);
        res.end("ok");
      });
    });
    await new Promise((r) => s.listen(0, "127.0.0.1", r));
    console.log(`${name}: http://127.0.0.1:${s.address().port}/${encodeURIComponent(name)}`);
  }
})();
