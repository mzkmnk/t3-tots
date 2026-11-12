# t3listen: setup --project で routes を追加・更新・削除する（URL と鍵は伏せ字）

ブランチ: `routes/4-setup`（base: `routes/3-routes-config`）

## 何をしたか

- `node t3listen setup --project "<T3 のプロジェクト名>"`
  - 今の `setup` と同じ2行（Webhook URL、Authorization ヘッダー）を読み、listen.json の `routes["<名前>"]` に保存します。listen.json のほかの値（トップレベルの url と headers、machine、approvals、filters など）はそのまま残します。
  - 同じプロジェクトの route（大文字小文字と前後の空白は無視）がすでにあれば置き換えます。
  - 保存する前に `routes` 全体を listen.json の読み込みと同じ規則で確かめ、だめなら何も保存せずに `BAD_LISTEN_CONFIG` で止まります。
  - トップレベルの url がまだない listen.json には足しません（`NO_LISTEN_CONFIG`。先に普通の `setup`）。
- `node t3listen setup --project "<名前>" --remove`: その route を消します。最後の1つを消したら `routes` のキーごと消し、listen.json を前の形に戻します。ない名前は `NOT_FOUND` です。
- `--project=<名前>` の書き方も使えます（t3ctl と同じ）。
- 伏せ字:
  - 端末（TTY）で入力するとき、入力した文字はすべて `*` で表示します。URL も鍵も画面、画面共有、スクロールバックに残りません。Enter で1行（`\r\n` は1回）、Backspace で1文字消去、Ctrl-C で中止、Ctrl-D で入力の終わり。2行をまとめて貼っても2行として読みます（bracketed paste の印と矢印キーは無視）。
  - 確認の表示は、URL はホスト名だけ（`https://example.com/****`）、ヘッダーは名前だけ（`Authorization: ****`）。パス、クエリ、ユーザー情報、鍵は出しません。
  - パイプで渡したとき（エージェントやテスト）は、もともと何も表示しません。最後の1行にも URL と鍵は出しません。
- 保存したあとに「動いている listener は再起動で読み込む」（`node t3listen install`。status が "installed with --approvals" なら `--approvals` も）と表示します。listener は起動時に listen.json を読むためです。
- 入力の読み取りは普通の `setup` と共通にしたので、普通の `setup` も端末では `*` 表示になります。保存する内容と最後の表示は前と同じです。
- `node t3listen` の使い方の表示、README の Routes の節、`skills/t3-phone-answers/SKILL.md` の Setup に手順（5.）を足しました。

## テスト

- `tests/t3listen-routes.test.js` に足しました（ダミー URL と一時フォルダだけを使います）。
  - 入力の読み取り（`keyLines`）: `*` 表示、Enter、`\r\n`、Backspace、2行まとめての貼り付け、bracketed paste、矢印キー、Ctrl-C、Ctrl-D。`maskUrl` / `maskHeader`。
  - `setup --project`（stdin をパイプで渡す）: route が足され、ほかの値が残り、出力に URL と鍵が出ない。listen.json の権限が 0600。
  - 大文字小文字違いでの置き換え、`--remove`、ない名前で `NOT_FOUND`、最後の1つを消すと `routes` がなくなる。
  - トップレベルがないと `NO_LISTEN_CONFIG`、名前なしで `USAGE`、悪い URL で `BAD_URL`（URL は出ない）、悪いヘッダーで `BAD_HEADER`。どれも何も保存しない。普通の `setup` で routes が残る。
- 手で確かめたこと: Python の pty で本物の端末として `setup --project` を動かし、1行ずつ入力した場合と2行まとめて貼った場合の両方で、画面に出たのは `*` と伏せ字の確認だけで、URL と鍵の文字列は一度も出ませんでした。保存された値は入力どおりでした。
- 全体: 145件すべて通過。`T3TOTS_NO_PRIVATE_WORDS=1 scripts/check.sh` は ALL CHECKS PASSED。`manifest.json` と `PINNED` を作り直しています。

## upstream の #41 / #40 との関係

- `setup()` と使い方の表示は #41 も #40 も触らないので、この PR で増える衝突はありません（`manifest.json` と `PINNED` は毎回作り直し）。

## 決めてほしいこと

- 普通の `setup` も端末では `*` 表示に変わります（同じ読み取りを使うため）。元の表示（貼った文字がそのまま見える）に戻したい場合は、route のときだけ伏せ字にもできます。
- 確認の表示にホスト名を出しています（どの bot の URL を貼ったか分かるように）。ホスト名も伏せたい場合は `****` だけにします。

## VERSION

PR-3 と合わせて上げる提案です（この PR だけでは上げません）。
