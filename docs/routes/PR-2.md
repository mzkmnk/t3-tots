# t3listen: 再送キュー、失敗のまとめ送り、同じ失敗の保留を「届け先ごと」に持つ（下準備）

ブランチ: `routes/2-per-destination-state`（base: `routes/1-upstream`）

届け先はまだ1つ（listen.json の `url` と `headers`）のままです。動作、ログ、`listen-state.json` の形は変えていません。次の PR で `routes` を足すための下準備です。

## 何をしたか

`tools/t3listen` に「届け先（destination）」を足しました。届け先は webhook 1つ分で、`{ name, url, headers, queue, wave }` を持ちます。

| 状態 | 前 | 後 |
|---|---|---|
| どこへ送るか | `post()` が `C.url` / `C.headers` へ | `destFor(e)` が届け先を決め、`post()` はそこへ送る。分岐はこの1か所だけ |
| 再送キュー | プロセスに1本（上限100） | 届け先ごとに1本（それぞれ上限100）。1分ごとの再送も届け先ごとに回す（`retryRound(d)`） |
| 満杯で state に退避した分の戻し | 全部を1本のキューへ | 自分の届け先のキューにだけ戻す（`refillFromState` に省略できる4つ目の引数 `mine` を追加） |
| 失敗のまとめ送り（failure wave） | プロセスに1つ | 届け先ごとに1つ。`thread.failed.batch` には同じ届け先の失敗しか入らない |
| 同じ失敗の保留（failRepeat） | `failRepeat[threadId]` | 置き場所は同じ `failRepeat[threadId]`。名前付きの届け先で作った記録にだけ `to` を付け、別の届け先の記録は「記録なし」として扱う（`repeatsHere` / `tagDest`） |
| 再起動時の未送信分の再送 | 全部を1列で順に | 届け先ごとに順に送り、届け先どうしは並べて送る（`resendSaved`）。止まっている届け先が別の届け先を待たせない |
| ログに出さない値 | `C.url` と `C.headers` | すべての届け先の url と headers |

### キャッチアップの状態をどう分けたか

- 届け先ごとにしたもの: 再起動時に送り直す「保存済みで未送信のイベント」。再送キューと wave も届け先ごとなので、キャッチアップで作られたイベントも届け先ごとに並びます。
- 1つのままにしたもの: `lastAlive`（最後に T3 とつながっていた時刻）と `catchUpMinutes`。この2つは「listener が止まっている間に T3 で何が起きたか」の基準で、webhook が何を受け取ったかとは関係がないためです。届け先ごとに変えたい場合は決めてもらう必要があります。

### listen-state.json の形

変えていません。届け先が1つなら `failRepeat` の記録に `to` は付かず、`sent` / `finished` / `failRepeat` / `lastAlive` 以外のキーも増えません（新しいテストで確かめています）。古い listener に戻しても同じ state を読めます。

## テスト

- 既存のテスト 127件はそのまま全部通りました（テストは1行も変えていません）。
- `tests/t3listen-routes.test.js` を新しく足しました（#41 が `tests/t3listen.test.js` に追記するので、別ファイルにしています）。
  - 届け先は1つ、一度だけ作られ、どのイベント（batch を含む）もそこへ行く。
  - 退避した分は自分の届け先のキューにだけ戻り、別の届け先のキューが満杯でも止まらない。
  - `failRepeat` の記録の届け先の判定（`to` がなければ listen.json の url）。
  - live: 届け先が1つのとき、`listen-state.json` のキーと `failRepeat` の記録の形が前と同じ。
- `T3TOTS_NO_PRIVATE_WORDS=1 scripts/check.sh`: ALL CHECKS PASSED（131件。private words は未設定なので、その項目は飛ばしています）。
- `manifest.json` と `skills/t3-install-tools/SKILL.md` の `PINNED`（t3listen の sha256）を作り直しています。

## upstream の #41 / #40 との関係

- #41 と重なるのは `post()` の冒頭と fetch の行だけです（#41 は `post(e, { config, state, ... })` で config を受け取ります）。取り込むときは `const d = destFor(e, config)` にして、`send(d.url, ... ...d.headers)` にします。`destsOf(config)` は config に `dests` がなければ `url` / `headers` から作るので、#41 のテストのように手で作った config でも動きます。
- `markDelivered()` と、`deliver()` / 再送ループの `await post(e)` の直後の行（#41 が行を足す場所）は触っていません。exports は既存の行を変えず、別の行で足しています。
- #40（キャッチアップで大量に送られる問題）の直し方（送信数の上限、レート制限中の一時停止、まとめ送り）は webhook ごとの話なので、この届け先オブジェクトに持たせるのが自然です。

## 気になる点

- 送信の中の再試行（最大3回、合計で最大70秒ほど）はイベント処理の流れの中で待つので、届け先の1つが落ちていると、その間はほかの届け先への送信も待たされます。これは届け先が1つの今も同じ動きで、この PR では変えていません。直すなら届け先ごとの送信列が要るので、#40 の送信制限と一緒に考えるのがよいと思います。

## VERSION

変更なし。この PR だけでは動作が変わらないので、上げるなら routes が入る PR-3 以降でまとめて上げる提案です。
