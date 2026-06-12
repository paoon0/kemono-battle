// けものバトル - ユーザー登録/戦績/ランキング サーバー
// 保存先: DATABASE_URL があれば PostgreSQL、なければ users.json（ローカル開発用）
const express = require('express');
const crypto  = require('crypto');
const path    = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname)); // index.html を配信

// ====== 認証ユーティリティ ======
function hashPw(pw, salt) {
  return crypto.pbkdf2Sync(pw, salt, 100000, 32, 'sha256').toString('hex');
}
function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}
// 公開してよいプロフィール情報のみ
function pub(u) {
  const total = u.wins + u.losses + u.draws;
  const rate  = total ? Math.round((u.wins / total) * 100) : 0;
  return { username: u.username, wins: u.wins, losses: u.losses, draws: u.draws, rate };
}

// ====== ストレージ層（Postgres / JSONファイル を切り替え）======
// 共通インターフェイス:
//   getUser(key)            -> user | null
//   createUser(user)        -> void
//   recordResult(key, kind) -> user            (kind: 'win'|'lose'|'draw')
//   addToken(token, key)    -> void
//   keyByToken(token)       -> key | null
//   deleteToken(token)      -> void
//   ranking(limit)          -> [pub,...]
//   init()                  -> Promise
let store;

function createJsonStore() {
  const fs = require('fs');
  const DB_FILE = path.join(__dirname, 'users.json');
  let db = { users: {}, tokens: {} };
  if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
    catch (e) { console.error('DB読込失敗、新規作成します', e.message); }
  }
  db.users = db.users || {}; db.tokens = db.tokens || {};
  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), err => {
        if (err) console.error('DB保存失敗', err.message);
      });
    }, 50);
  };
  return {
    async init() { console.log('ストレージ: JSONファイル (users.json)'); },
    async getUser(key) { return db.users[key] || null; },
    async createUser(u) { db.users[u.key] = u; save(); },
    async recordResult(key, kind) {
      const u = db.users[key];
      if (kind === 'win') u.wins++; else if (kind === 'lose') u.losses++; else u.draws++;
      save(); return u;
    },
    async addToken(token, key) { db.tokens[token] = key; save(); },
    async keyByToken(token) { return db.tokens[token] || null; },
    async deleteToken(token) { delete db.tokens[token]; save(); },
    async ranking(limit) {
      return Object.values(db.users).map(pub)
        .sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.rate - a.rate)
        .slice(0, limit);
    }
  };
}

function createPgStore() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
  });
  return {
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          key      TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          salt     TEXT NOT NULL,
          hash     TEXT NOT NULL,
          wins     INTEGER NOT NULL DEFAULT 0,
          losses   INTEGER NOT NULL DEFAULT 0,
          draws    INTEGER NOT NULL DEFAULT 0,
          created  BIGINT  NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tokens (
          token TEXT PRIMARY KEY,
          key   TEXT NOT NULL REFERENCES users(key) ON DELETE CASCADE
        );
      `);
      console.log('ストレージ: PostgreSQL');
    },
    async getUser(key) {
      const r = await pool.query('SELECT * FROM users WHERE key=$1', [key]);
      return r.rows[0] || null;
    },
    async createUser(u) {
      await pool.query(
        `INSERT INTO users(key,username,salt,hash,wins,losses,draws,created)
         VALUES($1,$2,$3,$4,0,0,0,$5)`,
        [u.key, u.username, u.salt, u.hash, u.created]
      );
    },
    async recordResult(key, kind) {
      const col = kind === 'win' ? 'wins' : kind === 'lose' ? 'losses' : 'draws';
      const r = await pool.query(
        `UPDATE users SET ${col}=${col}+1 WHERE key=$1 RETURNING *`, [key]
      );
      return r.rows[0];
    },
    async addToken(token, key) {
      await pool.query('INSERT INTO tokens(token,key) VALUES($1,$2)', [token, key]);
    },
    async keyByToken(token) {
      const r = await pool.query('SELECT key FROM tokens WHERE token=$1', [token]);
      return r.rows[0] ? r.rows[0].key : null;
    },
    async deleteToken(token) {
      await pool.query('DELETE FROM tokens WHERE token=$1', [token]);
    },
    async ranking(limit) {
      const r = await pool.query(
        `SELECT username,wins,losses,draws,
                CASE WHEN wins+losses+draws=0 THEN 0
                     ELSE ROUND(wins*100.0/(wins+losses+draws)) END AS rate
         FROM users
         ORDER BY wins DESC, losses ASC, rate DESC
         LIMIT $1`, [limit]
      );
      return r.rows.map(x => ({
        username: x.username, wins: x.wins, losses: x.losses, draws: x.draws, rate: Number(x.rate)
      }));
    }
  };
}

async function userFromToken(token) {
  if (!token) return null;
  const key = await store.keyByToken(token);
  if (!key) return null;
  return store.getUser(key);
}

// asyncハンドラの例外を500に変換するラッパ
const wrap = fn => (req, res) => fn(req, res).catch(err => {
  console.error(err);
  res.status(500).json({ error: 'サーバーエラーが発生しました' });
});

// ====== 新規登録 ======
app.post('/api/register', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'ユーザー名とパスワードを入力してください' });

  const name = String(username).trim();
  if (name.length < 2 || name.length > 16)
    return res.status(400).json({ error: 'ユーザー名は2〜16文字にしてください' });
  if (String(password).length < 4)
    return res.status(400).json({ error: 'パスワードは4文字以上にしてください' });

  const key = name.toLowerCase();
  if (await store.getUser(key))
    return res.status(409).json({ error: 'そのユーザー名は既に使われています' });

  const salt = crypto.randomBytes(16).toString('hex');
  const user = { key, username: name, salt, hash: hashPw(password, salt),
                 wins: 0, losses: 0, draws: 0, created: Date.now() };
  await store.createUser(user);
  const token = makeToken();
  await store.addToken(token, key);
  res.json({ token, profile: pub(user) });
}));

// ====== ログイン ======
app.post('/api/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'ユーザー名とパスワードを入力してください' });

  const key = String(username).trim().toLowerCase();
  const u = await store.getUser(key);
  if (!u || u.hash !== hashPw(password, u.salt))
    return res.status(401).json({ error: 'ユーザー名またはパスワードが違います' });

  const token = makeToken();
  await store.addToken(token, key);
  res.json({ token, profile: pub(u) });
}));

// ====== プロフィール取得（トークン検証）======
app.get('/api/me', wrap(async (req, res) => {
  const u = await userFromToken(req.query.token);
  if (!u) return res.status(401).json({ error: 'unauthorized' });
  res.json({ profile: pub(u) });
}));

// ====== 戦績記録 ======
app.post('/api/result', wrap(async (req, res) => {
  const { token, result } = req.body || {};
  const key = await store.keyByToken(token);
  if (!key) return res.status(401).json({ error: 'ログインが必要です' });
  if (!['win', 'lose', 'draw'].includes(result))
    return res.status(400).json({ error: '不正な結果です' });

  const u = await store.recordResult(key, result);
  res.json({ profile: pub(u) });
}));

// ====== ログアウト ======
app.post('/api/logout', wrap(async (req, res) => {
  const { token } = req.body || {};
  if (token) await store.deleteToken(token);
  res.json({ ok: true });
}));

// ====== ランキング（勝利数 上位10）======
app.get('/api/ranking', wrap(async (req, res) => {
  res.json({ ranking: await store.ranking(10) });
}));

// ====== 起動 ======
(async () => {
  store = process.env.DATABASE_URL ? createPgStore() : createJsonStore();
  await store.init();
  app.listen(PORT, () => {
    console.log(`けものバトル サーバー起動: http://localhost:${PORT}`);
  });
})().catch(err => {
  console.error('起動に失敗しました:', err);
  process.exit(1);
});
