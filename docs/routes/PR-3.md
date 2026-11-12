# t3listen: listen.json の routes でプロジェクトごとに webhook を分ける

ブランチ: `routes/3-routes-config`（base: `routes/2-per-destination-state`）

## 何をしたか

listen.json に任意の `routes`（プロジェクト名 → `{ url, headers }`）を足しました。`routes` がなければ今と同じ動きです。

```json
{
 "url": "https://example.com/hooks/main", "headers": { "Authorization": "Bearer MAIN-KEY" },
 "routes": {
  "mobile-app": { "url": "https://example.com/hooks/mobile", "headers": { "Authorization": "Bearer MOBILE-KEY" } }
 }
}
```

- 届け先の決め方（`destFor(e)` の1か所だけ）:
  1. 質問の close（`request.resolved`）は、その質問の open が行った webhook へ。open のときに route 名を `listen-state.json` の `sent[id].to` に残します（route へ行ったときだけ）。listener が止まっている間にスレッドがアーカイブ／削除されると、再起動後の close はプロジェクト名が分からないので、これがないと既定の url へ行ってしまいます。
     `to` がなく、もう送ってある質問（route を足す前に url へ送った質問や、古い listener が送った質問）の close は url へ送ります。これがないと、routes を足して再起動した直後に、メインの bot に出ているカードの close が新しい route の bot へ行ってしまいます。
  2. それ以外は、イベントの `project`（T3 のプロジェクト名）が route のキーと一致すればその route へ。大文字小文字と前後の空白は無視します（`autoresume.json` と同じ）。`listen-state.json` に保存されたイベントはタイトルが伏せ字処理済みなので、両側を同じ処理（`clean`）にかけてから比べます。
  3. `thread.failed.batch` は届け先ごとの wave から作られるので、中の失敗はすべて同じ届け先です。最初の失敗の `project` で決めます。
  4. どれにも当たらない、またはプロジェクトがないイベントは、今の `url` へ。
- route は自分の `headers` だけを送ります。トップレベルの `headers` は引き継ぎません（別の bot にメインの鍵が渡らないように）。
- 再送キュー、失敗のまとめ送り、同じ失敗の保留、再起動時の再送は PR-2 で届け先ごとになっているので、route ごとに分かれます。`thread.failed.batch` は届け先ごとに別々に送られます。
- 設定の確認（`compileRoutes`）:
  - route の `url` はトップレベルと同じ規則（`https://`、localhost だけ `http://`）。`--dry-run` ではトップレベルと同じく url の形は確かめません。
  - 名前が空、大文字小文字違いの重複、`headers` が `{ "Name": "value" }` でない、などは `BAD_LISTEN_CONFIG` で起動時に止まります。メッセージには route 名だけを出し、url や鍵は出しません。
  - route の中の知らないキーは filters と同じく無視して、ログと status に並べます（新しい listen.json で古い listener が止まらないように）。
- ログと status:
  - 起動時に `routes: "mobile-app" has its own webhook; other projects go to url` を1行出します（routes があるときだけ）。
  - 送信に失敗したときのログ（`webhook answered HTTP ...`、`webhook not reachable`、`retry N`、`giving up`、`retry queue is full`、`held back`）と `--dry-run` の `DRY-RUN payload` に、route 名を ` (route "mobile-app")` の形で付けます。既定の url へのイベントには何も付けないので、routes がなければログは前と同じです。
  - 成功の `sent ...` 行には付けていません。#41 が `await post(e)` の直後に行を足すので、その次の行を変えると衝突するためです。
  - `node t3listen status` に `routes:` の行を足しました（listen.json に `routes` があるときだけ）。名前とヘッダーの数だけで、url と鍵は出しません。
  - webhook の返事をログに出す前に伏せる値（`redact`）に、すべての route の url と headers を入れています。
- README に「Routes (optional)」の節、`skills/t3-phone-answers/SKILL.md` の「How it works」に1文を足しました。

## テスト

`tests/t3listen-routes.test.js` に足しました（14件。うち PR-2 からの4件を含む）。ダミーのローカル webhook（`127.0.0.1`）だけを使い、外には送りません。

- 設定: なし／空、名前の一致（大文字小文字、前後の空白）、不正な設定のメッセージに url や鍵が出ないこと、知らないキーの扱い。
- 届け先の決め方: プロジェクトごと、プロジェクトなし、batch、`sent[id].to`、route を足す前に送った質問、listen.json から消えた route、伏せ字済みのタイトル。
- status の行: url と鍵が出ないこと。
- live（fake T3 + ダミー webhook。fake-t3.js に、パスとヘッダー付きで受信を記録する `hits` などを足しました。既存の `posts` はそのまま）:
  - 質問、close、finish がそれぞれのプロジェクトの webhook に届き、それぞれ自分の鍵だけが付いている。
  - 失敗のまとめ送りが webhook ごとに分かれる（route 側は batch、url 側は1件なので普通の `thread.failed`）。
  - 止まっている間にスレッドが消えた質問の close が、open と同じ route に届く。
  - route を足す前に url へ送った質問の close は、route を足して再起動したあとも url に届く。新しい質問は route へ行く。
  - route が 400 を返しても url 側は届く。route の鍵と url が返事に含まれていてもログには出ない。再起動後にそれぞれ1回だけ届く。
  - 再起動後、route が落ちていても url 側のキャッチアップは待たされない。
  - 不正な route で起動時に `BAD_LISTEN_CONFIG` になり、url は出ない。
- 上の「スレッドが消えた質問の close」と「キャッチアップが待たされない」の2件は、実装を一時的に戻すと失敗することを確かめました。「route を足す前に送った質問」のテストは、直す前のコードで失敗することを確かめてから直しました。
- 全体: 141件すべて通過。`T3TOTS_NO_PRIVATE_WORDS=1 scripts/check.sh` は ALL CHECKS PASSED。`manifest.json` と `PINNED` を作り直しています。

## upstream の #41 / #40 との関係

- `loadConfig()` の return の2行目（`filters: ..., ...reliability(c)`）に `routes: configRoutes(c.routes)` を足しました。#41 も同じ行に `...configPresence(c)` を足すので、ここは1行の衝突になります（両方残せば解けます）。ほかの書き方では行を余計に動かすことになるので、この形にしました。
- そのほかに #41 と重なるのは PR-2 と同じ `post()` だけです。失敗時のログ行は `await post(e)` の2行あとなので、#41 の追加とは衝突しません（`git merge-tree` で確認）。
- #41 の「使用中は送らない」が入ると、route へのイベントも同じく止まります。届け先によって変えたい（例: route だけは使用中でも送る）なら、route に設定を持たせる形で追える作りにしてあります。

## 気になる点

- 古い t3listen は `routes` を知らないので、route のプロジェクトのイベントもメインの url へ送ります。routes を足す前に tools を更新する必要があります（README に書きました）。
- 同じ url を複数の route に書くと、それぞれ別の届け先として扱います（キューも batch も別）。まとめたい場合は決めてもらう必要があります。
- 同じ名前の T3 プロジェクトが2つあると、両方とも同じ route へ行きます（名前で決めるため）。

## VERSION

新しい設定が増えるので、上げる提案です（例: v1.4.32、または機能追加として v1.5.0）。上げる場合は `VERSION`、`PIN`、本文のリリース名、`manifest.json` を一緒に揃えます。
