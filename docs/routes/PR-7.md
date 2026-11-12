# skills: t3-project-setup にプロジェクト用 bot の型（テンプレート）を入れる

ブランチ: `routes/7-bot-template`（base: `routes/6-project-setup-skill`）

## 何をしたか

`skills/t3-project-setup/SKILL.md` に、プロジェクト用 bot の型と作り方の手順を入れました。bot 作成係がいない環境でも、T3 Tots が型を埋めて同じ手順で bot を用意できます。

### 型は2種類

| 種類 | 何をするか |
|---|---|
| Notifier（通知だけ） | webhook で届いたそのプロジェクトのイベントを短く伝えるだけ。質問や承認には答えず、スレッドも触らず、コードも書かない |
| Project T3 Tots（プロジェクト専用の T3 Tots） | そのプロジェクトだけを担当し、ユーザーと直接話す。<br>・スレッドの作成と追加指示、一覧、中身の確認（t3-new-thread、t3-status）<br>・状況への答え<br>・質問待ちの手伝い（ユーザーの選択で答える。t3-waiting と t3-tots-rules "Decisions"）<br>・完了報告（UI が変わったらスクショ付き。t3-get-output）<br>・コードは書かず、T3 スレッドに任せる<br>・通知が来たら伝え、必要ならスレッドを読んで次の手を選択肢で提案する<br>・ほかのプロジェクトは「That's for T3 Tots.」と返す |

### 型に入れたもの

- 名前、説明（`ONLY job: ...` と担当範囲）、スキル（t3-tots-rules が先頭）、指示文（種類ごとの部分 + 共通ルール + 話し方）。
- ルーティンの指示文:
  - Notifier: これまでどおり、t3-project-setup "On an event" に従う。
  - Project T3 Tots: t3-phone-answers "On an event" をそのプロジェクトだけに使い、終わった run には次の手を選択肢で提案する。
- 共通ルール:
  - push、merge、PR、TestFlight、App Store Connect、課金、署名・証明書は、毎回ユーザーの OK を取る（スレッドにやらせる場合も含む）。
  - スレッドは消さない。アーカイブはそのスレッドへの OK のときだけ。
  - token、listen.json、T3 の secrets、認証情報のファイルは開かない。`statev2.sqlite` は読み取りだけ。
  - キー、トークン、webhook URL をチャットに出さない。
  - 全プロジェクトの phone answers は T3 Tots のもの。`--project` なしの `setup`、`--machine`、`uninstall` は使わない。t3-phone-answers から使うのは "On an event" と "Answering" だけ。phone answers のオン・オフ・一時停止は「That's for T3 Tots.」と返す。
    - Project T3 Tots は t3-phone-answers を持っています。その Setup は `--machine` を使い、一時停止には `uninstall` があるので、頼まれるとメインの送り先を上書きしたり止めたりできてしまいます。貼り付ける指示文に禁止を入れて塞ぎました。
- 話し方: `{language}` で短く。判断が要るときは選択肢を2〜3個出し、おすすめと理由を言う。
- 埋める値: `{bot_name}`、`{project}`、`{project_id}`、`{path}`、`{machine}`、`{tools_folder}`、`{language}`、`{watch_threads}`（任意。なければその行を消す）。
  - 取り方は表に書きました。`t3ctl projects` の列、ListMachines、memory。
  - 実在の名前や id は型に入れず、すべてプレースホルダーです。

### 作り方の手順（Make a project bot）

1. **値を集める**（読むだけ）。種類と、足りない値（名前、言語、見張るスレッド）だけをユーザーに聞く。
2. **埋めて見せる**。`{...}` が残っていないことを確かめてから、名前・説明・スキル・指示文をユーザーに見せる。「そのプロジェクトの通知（質問を含む）は T3 Tots ではなく新しい bot へ行く」ことも伝えて、OK をもらう。
3. **作る**（OK の後）。
   - bot を作るツールがある環境では、そのツールで作る。
   - ない環境では、ユーザーへの手順を出す: アプリで新しい bot を作り、名前・説明・指示文を貼り、スキルを順に足し、Mac `{machine}` を使えるようにする。
4. **引き継ぐ**。新しい bot に「通知を設定して」と頼んでもらう。そこから先はこれまでの "Setup"（その bot が自分で実行し、ユーザーが Terminal に URL と鍵を貼る）。
   - T3 Tots は新しい bot の "Setup" を代わりに実行しません。route は新しい bot のルーティンを指す必要があり、その URL と鍵はその bot の画面にしか出ないためです。

**格上げ（Notifier → Project T3 Tots）**:

1. T3 Tots が「Project T3 Tots」の型を同じ名前とプロジェクトで埋め、見せて OK をもらう。
2. OK の後、説明と指示文を差し替え、足りないスキルを足す。
3. 格上げした bot は、新しい指示文に従って自分のルーティンの指示文を Project T3 Tots 用に切り替える。
   - ルーティンの URL と鍵は変わらないので、route はそのままです。Terminal も再起動も要りません。
   - `node t3listen test --project` で、まだ届くことを確かめます。

### そのほかの変更

- `skills/t3-tots-rules/SKILL.md`: Writes の表の t3-project-setup の行に「T3 Tots: 型から作るプロジェクト用 bot（埋めた内容への OK の後）」を足しました。
- README の Routes の節、`skills/t3-phone-answers/SKILL.md` の参照文を、型があることに合わせて直しました。
- frontmatter の description を2種類と作り方に合わせて直しました（"make a bot for <project>"、"upgrade <bot> to a project T3 Tots" も対象）。

## 型を別ファイルにしなかった理由

依頼では `skills/t3-project-setup/bot-template.md` のような別ファイルも候補でした。ただ、Grok Bot へのスキル同期（`t3tots_fetch.py skills --write` → UpdateSkill）が運ぶのは、各スキルの `SKILL.md` だけです（fetcher の `if not sid.startswith("t3-") or f["dest"] != sid + "/SKILL.md": continue`）。別ファイルにすると、型を埋める本人である T3 Tots（Grok Bot）に届きません。

そこで型は `SKILL.md` の中に置きました。共通ルールと話し方を1回だけ書いて、2種類で使い回すことで、長さを抑えています（全体で153行）。将来 fetcher が複数ファイルを運べるようになったら、別ファイルに分けられます（そのときはテストが知らせます）。

## テスト

`tests/project-setup-skill.test.js` に6件足しました（全部で11件）。

- 型が `SKILL.md` の中にあること。fetcher が `SKILL.md` だけを運ぶこと。
- プレースホルダー:
  - 表の8つと、スキル全体で使っているものが一致する。
  - 2種類とも、ダミーの値で埋めると `{...}` が残らない。
  - `{watch_threads}` がないときはその行だけが消え、ほかは残る。あるときは値が入る。
- スキル: 型に出てくるスキルはすべて repo にあり、t3-tots-rules が先頭。依頼の一覧（t3-new-thread、t3-status、t3-waiting、t3-phone-answers、t3-thread-actions、t3-get-output）がそろっている。t3code-cli は「その環境にあるときだけ」。
- 共通ルール: push、merge、pull request、TestFlight、App Store Connect、billing、署名、証明書、スレッドを消さない、アーカイブ、token、listen.json、secrets、sqlite は読み取りだけ、キーをチャットに出さない。
- 話し方: 選択肢2〜3個とおすすめ。
- 埋めたあとの Project T3 Tots の文面に、`--project` なしの setup、`--machine`、`uninstall` の禁止と、t3-phone-answers は "On an event" と "Answering" だけを使うことが入っている。
- Project T3 Tots の指示文: コードを書かない、ほかのプロジェクトは T3 Tots へ、スクショ、次の手の提案、ユーザーの選択で答える。
- ルーティンの指示文が、実在する節（t3-project-setup / t3-phone-answers の "On an event"）を指している。
- 作り方の手順が「集める → 埋めて見せる → OK → ツールで作る／貼る手順 → 引き継ぐ → 格上げ」の順に並んでいる。T3 Tots が "Setup" を代わりに実行しないこと。格上げで route が変わらないこと。

試しに、型に未定義の `{repo}` を混ぜる、共通ルールから TestFlight を消す、の2つの崩し方をすると、それぞれのテストが失敗しました（確認後に元に戻しています）。

全体: 161件すべて通過。`T3TOTS_NO_PRIVATE_WORDS=1 scripts/check.sh` は ALL CHECKS PASSED です。さらに、会話に出てきた実在の名前（bot 名、プロジェクト名、ユーザー名など）と、この Mac の OS ユーザー名とホスト名を、環境変数 `T3TOTS_PRIVATE_WORDS` で一時的に渡して `scripts/check.sh` を回しました。public safety は clean でした。一覧はファイルには書いていません。

## upstream の #41 / #40 との関係

スキルの文と新しいテストだけです。衝突は増えません（`manifest.json` は毎回作り直し）。

## 決めてほしいこと

- **bot を作るツール**: このリポジトリのスキルには、bot を作る Grok Bot のツール名が出てきません（UpdateRoutine、UpdateSkill、UpdateAvatar はある）。そのため手順は「ツールがあれば使う、なければ貼る手順」と一般的に書きました。実際のツール名が分かれば、名指しにできます。
- **新しい bot へのスキルの入れ方とコンピューターの共有**: 「T3 Tots と同じスキルを足す」「Mac を T3 Tots と同じ方法で使えるようにする」としか書けていません。アプリでの具体的な操作が決まっていれば、そのとおりに書きます。
- **t3code-cli**: このリポジトリにないので、「その環境にあれば足す」の任意扱いにしました。必須にするなら、どこから入れるかを決める必要があります。
- **T3 Tots 本体との分担**: Project T3 Tots を作ったあとも、T3 Tots 本体はそのプロジェクトのスレッドを操作できます（止めていません）。T3 Tots 側でそのプロジェクトの依頼を新しい bot へ回すかは、決めてもらう必要があります。
- **Project T3 Tots の質問への回答**: 既定はユーザーの選択でだけ答えます。ユーザーが delegated mode にしたときは、T3 Tots と同じ範囲で自分で答えます。

## VERSION

スキルの変更だけなので、routes 一式（PR-3〜7）と一緒に上げる提案です。
