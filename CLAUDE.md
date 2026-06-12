# CLAUDE.md

このファイルは Claude Code が本プロジェクトを素早く把握するためのメモです。

## 概要
「けものバトル」— 動物同士が格闘するブラウザ対戦アクションゲーム。
ユーザー登録・戦績保存・ランキング機能つき。

## 技術構成
- フロント: HTML5 Canvas 単一ファイル（`index.html`、ビルド不要）
- サーバー: Node.js + Express（`server.js`）
- データ保存: ストレージ抽象化で2系統を自動切替
  - `DATABASE_URL` あり → PostgreSQL（`pg`、起動時にテーブル自動作成）
  - なし → `users.json`（ローカル開発用フォールバック）
- 認証: pbkdf2（10万回・SHA-256・ユーザーごとのソルト）＋トークン方式

## ファイル
- `index.html` … ゲーム本体＋ログイン/登録/ランキングUI
- `server.js` … APIサーバー（register/login/me/result/logout/ranking）
- `package.json` … 依存（express, pg）、`npm start` で起動
- `render.yaml` … Render Blueprint（Webサービス＋無料PostgreSQL）
- `README.md` … 人間向けの起動・デプロイ手順
- `users.json` … ローカル時のみ生成される簡易DB（gitignore対象）

## 起動方法（ローカル）
```bash
npm install
npm start            # http://localhost:3000
```
`DATABASE_URL` 未設定なら `users.json` に保存するため PostgreSQL は不要。
※ `index.html` を直接開くとAPIに繋がらない。必ずサーバー経由で開く。

## デプロイ
- GitHub: https://github.com/paoon0/kemono-battle （main ブランチ）
- 本番: Render（Blueprint + 無料PostgreSQL）。`git push` で自動再デプロイ。
- `DATABASE_URL` は `render.yaml` でDBから自動注入。

## 操作（ゲーム）
- 1P: 移動 A/D・ジャンプ W・ガード S・パンチ F・キック G・必殺 H
- 2P: 移動 ←/→・ジャンプ ↑・ガード ↓・パンチ K・キック L・必殺 ;
- 戦績記録は現状「1人プレイ（VS CPU）でログイン中のとき」のみ。

## 注意点 / 既知の課題
- Render無料枠は無アクセスでスリープ → 初回復帰が数十秒。
- Render無料PostgreSQLは一定期間で失効する場合あり。
- スマホ未対応（キーボード操作前提。タッチUIは未実装）。

## 今後の候補
- 2P対戦の戦績記録 / スマホ向けタッチ操作 / 効果音・BGM / キャラ追加・バランス調整
