# docs: upstream に追いつく手順を足す

ブランチ: `routes/1-upstream`（base: `main`）

## 何をしたか

- `docs/upstream-sync.md` を足しました。フォークを upstream（Deepusleepy/t3-tots）に追いつかせる手順です。
  - upstream を remote に足し、push 先を `DISABLED-no-push-to-upstream` にして、誤って push しても失敗するようにする。
  - `git fetch upstream` で新しいコミットや開いている PR を読む（読むだけ）。
  - main の早送り、積み上げたブランチの `rebase --update-refs`、衝突したときの `manifest.json` と `PINNED` の作り直し。
- `AGENTS.md` は upstream の導入手順なので変えていません。手順は新しいファイルに置き、upstream を取り込むときに衝突しないようにしました。

## 確かめたこと（2026-11-12）

- `upstream/main` は `ea9f21e`（#39）で、フォークの `main` と同じでした。新しいコミットはないので、以降のブランチは `ea9f21e` の上に作っています。
- upstream で開いているもの:
  - #41（PR, `refs/pull/41/head` = `2af6ab7`）: 使用中は通知しない設定（`suppressWhileActive`）。`post()`、`markDelivered()`、`deliver()` と再送ループの `post` 直後、`module.exports` を書き換えます。
  - #40（issue, PR はまだない）: 長い停止の後のキャッチアップで大量に送られる問題。直すなら送信の上限、レート制限での一時停止、まとめ送りになりそうです。
- この作業ツリーの git 設定に `upstream` を足しました（push 先は無効）。remote の設定はリポジトリに入らないので、ほかのクローンでは手順の「1回だけ」を実行してください。

## テスト

コードは変えていません。`T3TOTS_NO_PRIVATE_WORDS=1 scripts/check.sh` は ALL CHECKS PASSED でした（private words は未設定なので、その項目は飛ばしています）。

## VERSION

変更なし（ドキュメントだけ）。
