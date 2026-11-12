# upstream に追いつく手順（このフォーク専用）

このリポジトリは [Deepusleepy/t3-tots](https://github.com/Deepusleepy/t3-tots) のフォークです。

- `origin`: このフォーク。push するのはここだけ（OK が出てから）。
- `upstream`: 元のリポジトリ。fetch するだけで、push、PR、issue はしない。

## 1回だけ: upstream を remote に足す

remote の設定はリポジトリに入らないので、クローンごと・マシンごとに1回ずつ実行します。

```sh
git remote add upstream https://github.com/Deepusleepy/t3-tots.git
git remote set-url --push upstream DISABLED-no-push-to-upstream   # 誤って push しても必ず失敗する
git remote -v   # upstream (push) が DISABLED-no-push-to-upstream になっていること
```

## 毎回: upstream の新しいコミットを確かめる

```sh
git fetch upstream                          # 読むだけ。手元のブランチは何も変わらない
git log --oneline main..upstream/main       # upstream にだけあるコミット（空なら追いついている）
git log --oneline upstream/main..main       # フォークにだけあるコミット
```

upstream で開いている PR も、中身を読むだけなら fetch できます（例: #41）。

```sh
git ls-remote upstream 'refs/pull/*/head'
git fetch upstream "+refs/pull/41/head:refs/remotes/upstream/pr/41"
git diff --stat upstream/main...upstream/pr/41
```

## main を追いつかせる（OK が出てから）

main を checkout している作業ツリーで実行します。

```sh
git switch main
git merge --ff-only upstream/main           # フォーク独自のコミットがなければ早送りだけで済む
# 早送りできない（フォークにも独自のコミットがある）ときは git merge upstream/main で取り込み、衝突を解く
T3TOTS_NO_PRIVATE_WORDS=1 scripts/check.sh  # private words を設定済みなら環境変数はいらない
git push origin main                        # origin（フォーク）へだけ。upstream は push できない設定
```

## 積み上げたブランチを新しい main に載せ替える

`routes/1-upstream` から `routes/5-verify` のように積み上げたブランチは、一番上のブランチで `--update-refs` を付けて rebase すると、途中のブランチもまとめて動きます（git 2.38 以降）。

```sh
git switch routes/5-verify
git rebase --update-refs main
```

衝突しやすいのは次の場所です。

- `tools/t3listen`: `post()` の冒頭と fetch の行、末尾の `module.exports` の行。
- `manifest.json` と `skills/t3-install-tools/SKILL.md` の `PINNED`: ファイルの sha256 なので、手で直さず作り直す。

```sh
# PINNED を今のファイルの sha256 に付け直してから、manifest.json を作り直す（SKILL.md の hash も変わるため）
python3 - <<'PY'
import hashlib, pathlib, re
p = pathlib.Path("skills/t3-install-tools/SKILL.md")
s = p.read_bytes().decode("utf-8")
pin = lambda m: f' "{m[1]}": ["{m[2]}", "{hashlib.sha256(pathlib.Path(m[1]).read_bytes()).hexdigest()}"]'
p.write_bytes(re.sub(r'^ "([^"]+)": \["([^"]+)", "[0-9a-f]{64}"\]', pin, s, flags=re.M).encode("utf-8"))
PY
python3 scripts/make-manifest.py
T3TOTS_NO_PRIVATE_WORDS=1 scripts/check.sh
```

`PINNED` は本来 `VERSION` のリリースに合わせるものです。`VERSION` を上げずに付け直すと、その組み合わせのリリースは存在しません。フォーク内で確かめるためだけの状態として扱い、リリースするときに `VERSION` と一緒に揃えます。
