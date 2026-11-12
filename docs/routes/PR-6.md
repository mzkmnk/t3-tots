# skills: t3-project-setup（通知係 bot が自分のプロジェクトの route を登録する、お試し）

ブランチ: `routes/6-project-setup-skill`（base: `routes/5-verify`）

## 何をしたか

新しいスキル `skills/t3-project-setup/SKILL.md` を足しました。T3 の1つのプロジェクトの通知だけを受け取る bot（通知係）が、T3 Tots を通さずに、自分の webhook を t3listen の routes に登録・確認・削除するためのスキルです。t3-phone-answers とは別のスキルで、書き方と frontmatter は既存の t3-* スキルに合わせました（本文は英語、ユーザーへの通知の例文だけ日本語）。

スキルの中身:

1. **Rules**: URL と鍵はルーティン画面から Terminal へ直接貼り、bot もチャットも受け取らない。listen.json と token は開かない。`--project` なしの `setup` と `--machine` は使わない（メインの送り先を上書きするため）。`uninstall` は使わない。書き込み（setup、remove、再起動）はユーザーの OK の後。同じコンピューターで同時に setup しない。
2. **Before you start**（読むだけ）:
   - ListMachines と `node t3ctl projects` で、プロジェクトがある Mac を選ぶ。
   - `node t3listen help` に `setup --project` があるか確かめる（下の「古い版の危険」）。
   - `node t3listen status` でメインの送り先があるか、listener が動いているか、既存の routes を確かめる。
3. **Setup**:
   1. webhook のルーティン（名前 **T3 notices: <project>**、プロンプトはスキルの「Routine prompt」のまま）。
   2. プロジェクト名の確認（`t3ctl projects` と `test --project <name> --dry-run` の `note:`）。
   3. OK の後、osascript で Terminal を開いて `setup --project` を実行した状態にする。フォルダとプロジェクト名は引数で渡す。ウィンドウのコマンドは先に `node t3listen help` に `setup --project` があるかを確かめ、なければ `OLD_T3LISTEN` と表示して何もしない。
   4. `test --project` で `OK: route "<name>"` が出て、test イベントが届くことを確かめる。
   5. `status` の approvals の行を見て、`install --approvals` か `install` で再起動。`running: yes` と `routes:` を確かめる。
4. **Remove**: `setup --project <name> --remove` と再起動。通知係で伝えた質問がまだ開いていれば、その close は T3 Tots へ行くことも伝える。
5. **Errors**: `help` に `setup --project` がない、`NO_LISTEN_CONFIG`、`BAD_URL`、`BAD_HEADER`、`BAD_LISTEN_CONFIG`、`USAGE`、`NOT_FOUND`、`WEBHOOK_REJECTED`（401/403 とレート制限）、`WEBHOOK_UNREACHABLE`、`note:`、test は通るのに届かない、など。
6. **Routine prompt / On an event**:
   - 届いた通知を短く伝える（既定は日本語。memory で別の言語にできる）。
   - 担当外のプロジェクトは無視する（batch は担当分だけ残す）。
   - 同じ `eventId`（再送でも変わらない）は二度伝えず、まとめて届いたものは1通にする。
   - 質問や承認には答えない（T3 で答えてもらう）。

ほかの変更:

- `skills/t3-tots-rules/SKILL.md`: Writes の表に t3-project-setup（route の追加・削除と、再起動のための `install`。OK の後）を足しました。t3listen のコマンド一覧に `setup --project` と `test --project | --all` を足しました。
- `skills/t3-phone-answers/SKILL.md`（Setup 5.）と README の Routes の節から、このスキルを参照するようにしました。
- `manifest.json`: スキルが 22 → 23 になりました（`make-manifest.py` で作り直し）。ツールは変えていないので `PINNED` はそのままです。

## 古い版の危険（スキルが最初に確かめる理由）

`VERSION` を上げていないので、routes 対応の t3listen と古い t3listen はどちらも `v1.4.31` です。古い t3listen は `--project` を知らず、`setup --project <name>` を普通の `setup` として実行します。一時フォルダで実際に試すと、メインの url が通知係の webhook に置き換わりました。そこで、ガードを2か所に入れました。

- bot が最初に `node t3listen help` を確かめる（Mac ごと）。
- Terminal で実行するコマンド自体に `if node t3listen help | grep -q setup.--project; then ... setup --project ...; else echo OLD_T3LISTEN ...; fi` を入れる。bot が確認を飛ばしても、古い版では setup が始まりません。

## テスト

`tests/project-setup-skill.test.js` を足しました（5件）。

- frontmatter: repo 自身の検査（`scripts/sync-skills` の `frontmatter_problem`）を通ること。manifest に載っていること、em dash がないこと。
- スキルが実行させる `node t3listen ...` はすべて t3listen にあるサブコマンドとフラグであること。`--machine` を渡すものや、`--project` なしの `setup` がないこと（「never」の文の中の警告は除く）。osascript がプロジェクト名を引数で渡していること。
  - 試しに、スキルに `setup --machine` の手順を混ぜると、このテストは失敗しました。
- Terminal のコマンドのガード: スキルの `do script` の文字列を、AppleScript の `quoted form of` と同じ方法で組み立てて `sh` で実行します。
  - 古い t3listen の代わりのスタブ（usage に `--project` がない）では `OLD_T3LISTEN` と出て、setup は実行されず、listen.json も変わらない。
  - 今の t3listen では route が保存され、メインの url と鍵は変わらない。`$(...)` やバッククォートを含むプロジェクト名もそのまま保存される。
- スキルが引用している出力（`config: no listen.json yet`、`OK: route "`、`note: no T3 project is named "`、`removed route "` など）が、t3listen の実際の出力と一致すること。t3listen の文言が変わると、このテストが落ちて知らせます。
- 通しの流れ（fake T3 とダミー webhook、一時フォルダ）: `help` → `status` → `t3ctl projects` → `--dry-run` の `note:`（綴り違いでは出る、大文字小文字違いでは出ない、何も送らない）→ `setup --project`（標準入力で2行、出力に URL と鍵が出ない）→ `status` の `routes:` → `test --project` が通知係のパスに通知係の鍵で届く、メインの url は変わらない → `--remove` → `routes:` の行が消える → `test --project` が url へ。osascript と `install` は本物の Mac に触るので、ここでは実行していません。

手で確かめたこと:

- 古い t3listen での上書き（上の「古い版の危険」）。
- osascript の引数とガード: 本物の osascript に文字列を返させて組み立てたコマンドを zsh で実行しました。古い t3listen（main の版）を置いた一時フォルダでは `OLD_T3LISTEN` と出て listen.json は変わらず、今の版では route だけが保存されました。空白、`'`、`$(...)` を含むフォルダ名とプロジェクト名も、そのまま1つの値として届きました（Terminal は開いていません）。

実行していないもの: 実際に Terminal を開く osascript、`install` による再起動、Grok Bot 側の UpdateRoutine と ListMachines、private words のチェック。

全体: 155件すべて通過。`T3TOTS_NO_PRIVATE_WORDS=1 scripts/check.sh` は ALL CHECKS PASSED。

## upstream の #41 / #40 との関係

新しいファイルと、スキルの文の1〜2行の追加だけです。#41 も #40 も触らない場所なので、衝突は増えません（`manifest.json` は毎回作り直し）。

## 決めてほしいこと

- **通知係 bot への入れ方**: このスキルは `skills/` にあるので、`t3ctl skills install` と T3 Tots 側のスキル同期で T3 Tots 本体にも入ります。通知係 bot だけに入れたい場合は、配り方を分ける必要があります。また、`scripts/sync-skills --prune` を live のスキルから実行すると、live にないこのスキルは消えます。
- **通知係 bot の前提**: その bot から Mac が見えて（ListMachines）、Shell を実行できる必要があります。
- **質問の扱い**: route を足すと、そのプロジェクトの質問は T3 Tots に届かなくなります。T3 Tots の「チャットから答える」もそのプロジェクトでは使えません。通知係は答えないので、ユーザーは T3 で答えることになります。スキルは OK を取るときにこれを伝えます。通知係にも答えさせたいかは決めてもらう必要があります。
- **言語**: ユーザーへの通知は日本語を既定にしました（memory で変えられる）。upstream に出す場合は、ユーザーの言語に合わせる書き方にします。
- **対応 OS**: macOS だけです（依頼どおり）。Windows と Linux は、t3-phone-answers の Setup 2. の `--machine` を `--project` に変えれば同じ流れになります。

## VERSION

スキルだけの追加なので、routes 一式（PR-3〜5）と一緒に上げる提案です。PR-6 単独では上げません。
