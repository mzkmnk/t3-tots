# routes の確かめ方

プロジェクトごとに正しい webhook へ届くかを確かめる手順です。1〜2 は本物の webhook にも本物の T3 にも触れません。3 は本番の tools フォルダで読むだけの確認で、最後の1つだけが本物の bot に test イベントを送ります。

## 1. 自動テスト（ダミーのローカル webhook だけ）

```sh
node --test tests/t3listen-routes.test.js     # routes のテストだけ（20秒ほど）
T3TOTS_NO_PRIVATE_WORDS=1 scripts/check.sh   # 全部
```

`tests/t3listen-routes.test.js` が確かめていること:

- 届け先の決め方: プロジェクト名（大文字小文字と前後の空白は無視、伏せ字済みのタイトルも同じ扱い）、プロジェクトなし、`thread.failed.batch`、質問の close は open と同じ route。
- fake T3 とダミー webhook で listener を実際に動かして:
  - 質問、close、finish がそれぞれのプロジェクトの webhook へ届き、それぞれ自分の鍵だけが付いている。
  - 失敗のまとめ送りが webhook ごとに分かれる。
  - 止まっている間にスレッドが消えた質問の close が、open と同じ route へ届く。
  - route が断っても url 側は届く。返事に含まれた route の鍵と url はログに出ない。再起動後にそれぞれ1回だけ届く。
  - 再起動後、route が落ちていても url 側のキャッチアップは待たされない。
  - 不正な route は起動時に `BAD_LISTEN_CONFIG` になり、url は出ない。
- `setup --project` の追加、置き換え、削除。出力に url と鍵が出ず、listen.json のほかの値が残る。
- `test --project` / `--all` / `--dry-run`、`preview-finish` の `would send to:`。routes がないときは前と同じ出力。
- 下の手順 2 と同じ流れ（ダミー webhook、`setup`、`status`、`test`）。

## 2. 手で: ダミー webhook と一時フォルダ（T3 もトークンも要らない）

ターミナル1でダミー webhook を2つ立てます。受け取ったイベントを1行ずつ表示し、どこにも転送しません。

```sh
node tests/dummy-webhook.js main mobile-app
# main: http://127.0.0.1:54236/main
# mobile-app: http://127.0.0.1:54237/mobile-app
```

ターミナル2で、一時フォルダに t3listen を写して試します（ポートはターミナル1の表示に合わせる）。

```sh
tmp=$(mktemp -d)
cp tools/t3listen tools/thread-match.js "$tmp"/
export T3_HOME="$tmp/no-t3" T3LISTEN_LABEL=t3tots-verify   # 本物の T3 と常駐の listener を見に行かないように
printf '%s\n' 'http://127.0.0.1:54236/main' 'Authorization: Bearer dummy-main-AAAA' | node "$tmp/t3listen" setup --machine verify
printf '%s\n' 'http://127.0.0.1:54237/mobile-app' 'Authorization: Bearer dummy-mobile-BBBB' | node "$tmp/t3listen" setup --project mobile-app
node "$tmp/t3listen" status | grep -E '^(running|routes):'   # routes: "mobile-app" (1 header); other projects go to url
node "$tmp/t3listen" test --all                     # OK: webhook ... / OK: route "mobile-app" ...
node "$tmp/t3listen" test --project mobile-app      # OK: route "mobile-app" answered HTTP 200
node "$tmp/t3listen" test --project other-project   # OK: webhook (no route for "other-project", so url) answered HTTP 200
node "$tmp/t3listen" test --all --dry-run           # 送らずに、どの route へ行くかだけ表示
rm -rf "$tmp"
```

ターミナル1にはこう出るはずです（鍵は最後の4文字だけ）。

```
[main] test project=null title="t3listen test" auth=****AAAA
[mobile-app] test project="mobile-app" title="t3listen test" auth=****BBBB
[mobile-app] test project="mobile-app" title="t3listen test" auth=****BBBB
[main] test project="other-project" title="t3listen test" auth=****AAAA
```

一時フォルダでも `install` と `uninstall` は実行しないでください。LaunchAgent やタスクを作ったり消したりします（ラベルを変えずに実行すると、常駐している listener を止めてしまいます）。

## 3. 本番の tools フォルダで（新しい版を入れたあと）

listen.json の中身は開かずに、t3listen に聞きます。

| コマンド | 送るか | 見るところ |
|---|---|---|
| `node t3listen status` | 送らない | `routes:` の行に route の名前とヘッダーの数 |
| `node t3listen preview-finish --thread <id>` | 送らない | `would send to: route "mobile-app"`、ほかのプロジェクトなら `would send to: url (...)` |
| `node t3listen run --dry-run --once --timeout 600` | 送らない（state も書かない） | 次に起きたイベントが `DRY-RUN payload (route "mobile-app") {...}` の形で出る。常駐の listener と並べて動かせる |
| `node t3listen test --project mobile-app` | route の bot に test イベントを1件送る | `OK: route "mobile-app" answered HTTP 200`。T3 に同じ名前のプロジェクトがなければ `note:` が出る（綴りの確認） |

route を足したり変えたりしたあとは、常駐の listener を再起動するまで前の設定のままです（`node t3listen install`。status が "installed with --approvals" なら `--approvals` も付ける）。
