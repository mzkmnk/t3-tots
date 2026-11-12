# t3listen: routes を確かめる手順とテスト（test --project / --all、preview-finish、ダミー webhook）

ブランチ: `routes/5-verify`（base: `routes/4-setup`）

## 何をしたか

- `node t3listen test --project "<名前>"`: そのプロジェクトのイベントと同じ道筋で test イベントを1件送り、どの webhook が答えたかを表示します（`OK: route "mobile-app" answered HTTP 200`、route がなければ `OK: webhook (no route for "web", so url) answered HTTP 200`）。url と鍵は出しません。
- `node t3listen test --all`: url と各 route に1件ずつ送ります。断られた webhook があっても残りは試し、最後に終了コード1で終わります（どの route が断ったかと、伏せ字済みの返事を表示）。
- T3 に聞けるとき（T3 が動いていてトークンがある）は、その名前のプロジェクトが T3 にないと `note: no T3 project is named "x" right now ...` と出します。イベントはプロジェクト名で振り分けるので、綴りの間違いに気づけるようにしました。
- `--dry-run` を付けると送らずに、`DRY-RUN payload (route "mobile-app") {...}` の形でどこへ行くかだけ表示します。
- 引数なしの `test` は前と同じで、routes があるときだけ「`--project` か `--all` で試せます」と1行足します。
- `node t3listen preview-finish --thread <id>`: routes があるとき、`would send to: route "mobile-app"`、`would send to: url (project "web" has no route)`、`would send to: url (no project)` のどれかを足します。routes がなければ出力は前と同じです。
- `setup --project` の最後の表示に「`test --project` で試せます」を足しました。
- `tests/dummy-webhook.js`: 手で確かめるためのダミー webhook です。名前ごとに `127.0.0.1` で待ち受け、受け取ったイベントを1行ずつ表示します（鍵は最後の4文字だけ）。どこにも転送しません。
- 手順書 `docs/routes/VERIFY.md`:
  1. 自動テスト
  2. ダミー webhook と一時フォルダで、`setup` → `status` → `test --all` / `--project` → `--dry-run`（本物の T3 にも webhook にも触れない。`T3_HOME` と `T3LISTEN_LABEL` を一時的なものにして、常駐の listener も見に行かない）
  3. 本番の tools フォルダで読むだけの確認（`status`、`preview-finish`、`run --dry-run --once`）と、最後に本物の bot へ `test --project`
- README の Routes の節、`skills/t3-phone-answers/SKILL.md` の Setup 5. に `test --project` を足しました。`docs/upstream-sync.md` の「衝突しやすい場所」を実際の結果に合わせて直しました。

## テスト

`tests/t3listen-routes.test.js` に足しました（全部で23件。ダミーのローカル webhook と fake T3 だけを使います）。

- `test --project`: route へ、route のない名前は url へ（T3 にない名前は `note:`）、route のない T3 プロジェクトは url へ（`note:` なし）。届いたパスと鍵、出力の全文を確かめます。
- `test --all`: 3つの webhook に1件ずつ届く。T3 にない route 名には `note:`。引数なしの `test` は url だけで、routes があることを1行で知らせる。
- `test --all` で route が 401 を返す: その route を名指しし、返事の中の鍵と url は `[redacted]`、残りの2つは OK、終了コード1。`--dry-run` は何も送らず、payload に route 名が付く。
- routes がないとき、`test` と `preview-finish` の出力が前と同じ。
- `preview-finish` の `would send to:`（route、route のないプロジェクト、プロジェクトなし）。何も送らない。
- 手順書 2 と同じ流れ: `tests/dummy-webhook.js` を立て、一時フォルダで `setup`、`setup --project`、`status`、`test --all`、`test --project` を実行し、ダミー webhook が受け取った行（どの webhook に、どのプロジェクトのイベントが、どの鍵の末尾4文字で届いたか）を確かめます。
- 手で: 手順書 2 をそのままターミナルで実行し、書いてあるとおりの出力になることを確かめました。
- 全体: 150件すべて通過。`T3TOTS_NO_PRIVATE_WORDS=1 scripts/check.sh` は ALL CHECKS PASSED。`manifest.json` と `PINNED` を作り直しています。

## upstream の #41 / #40 との関係

- `test()` と `previewFinish()` は #41 も #40 も触らないので、この PR で増える衝突はありません。積み上げ全体で #41 と衝突するのは `post()` と `loadConfig()` の return の行の2か所だけです（`git merge-tree` で確認）。
- 使い捨ての worktree で `routes/5-verify` に #41（`2af6ab7`）を実際にマージし、`docs/upstream-sync.md` に書いた解き方で2か所を解いて `PINNED` と `manifest.json` を作り直したところ、#41 のテストも含めて 163件すべて通りました。

## VERSION

routes 一式（PR-3〜5）で上げる提案です。新しい設定とコマンドが増えるので v1.5.0、小さく扱うなら v1.4.32。
