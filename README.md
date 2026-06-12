# けものバトル 🐯🐻🐰🐸

動物同士で格闘するブラウザ対戦アクションゲーム。ユーザー登録・戦績保存・ランキング付き。

- フロント: HTML5 Canvas（`index.html`、ビルド不要）
- サーバー: Node.js + Express（`server.js`）
- データ保存: PostgreSQL（本番） / `users.json`（ローカル開発時の自動フォールバック）

---

## ローカルで動かす

```bash
npm install
npm start
```

ブラウザで <http://localhost:3000> を開く。
`DATABASE_URL` が未設定のときは自動的に `users.json` に保存するので、PostgreSQL は不要です。

> 注意: `index.html` を直接ダブルクリックするとAPIに繋がりません。必ずサーバー経由で開いてください。

---

## Render へデプロイ（おすすめ）

### A. Blueprint で一括作成（このリポジトリの `render.yaml` を使用）

1. このプロジェクトを GitHub にpushする
   ```bash
   git init
   git add .
   git commit -m "けものバトル 初回コミット"
   git branch -M main
   git remote add origin https://github.com/<あなた>/kemono-battle.git
   git push -u origin main
   ```
2. <https://render.com> にGitHubでログイン
3. **New +** → **Blueprint** → このリポジトリを選択
4. `render.yaml` が読み込まれ、Webサービス + 無料PostgreSQL が自動で作られる
5. 数分でデプロイ完了。発行されたURL（`https://kemono-battle.onrender.com` など）で公開

### B. 手動で作成する場合

1. **New +** → **PostgreSQL** を作成（plan: Free）。作成後の **Internal Database URL** をコピー
2. **New +** → **Web Service** → 対象のGitHubリポジトリを選択
   - Build Command: `npm install`
   - Start Command: `node server.js`
3. Web Service の **Environment** に環境変数を追加
   - `DATABASE_URL` = 手順1でコピーしたURL
4. デプロイ実行。`DATABASE_URL` を検出すると自動でテーブルを作成します

---

## Railway へデプロイ（代替）

1. <https://railway.app> でGitHubリポジトリをデプロイ
2. **New** → **Database** → **PostgreSQL** を追加
3. Webサービスの Variables に `DATABASE_URL`（PostgreSQLの接続文字列）を設定
4. 起動コマンドは `package.json` の `start`（`node server.js`）が自動で使われます

---

## 環境変数

| 変数 | 説明 | 既定 |
|------|------|------|
| `PORT` | 待ち受けポート（PaaSが自動設定） | `3000` |
| `DATABASE_URL` | PostgreSQL接続文字列。未設定なら `users.json` を使用 | なし |
| `PGSSL` | `disable` にするとDB接続のSSLを無効化（社内DB等向け） | SSL有効 |

---

## 補足

- Render無料枠はアクセスが無いとスリープし、次アクセス時の初回起動が遅くなります（数十秒）。
- パスワードは pbkdf2（10万回・SHA-256・ユーザーごとのソルト）でハッシュ化して保存。平文は保存しません。
