const express = require("express");
const cors = require("cors");
const path = require("path");
const mysql = require("mysql2");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
require("dotenv").config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "dist")));
app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
  })
);

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
  } else {
    console.log("✅ Database connected successfully!");
    connection.release();
  }
});

function query(sql, params, cb) {
  db.getConnection((err, connection) => {
    if (err) return cb(err);
    connection.query(sql, params, (queryErr, results) => {
      connection.release();
      cb(queryErr, results);
    });
  });
}

function authMiddleware(req, res, next) {
  const h = req.headers["authorization"] || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!t) return res.status(401).json({ ok: false, message: "No token" });
  jwt.verify(t, process.env.JWT_SECRET, (e, user) => {
    if (e) return res.status(403).json({ ok: false, message: "Invalid token" });
    req.user = user;
    next();
  });
}

function xpToNext(level) {
  return 100 + Math.floor(level * 10);
}

app.get("/api/ping", (req, res) => {
  res.json({ message: "pong" });
});

app.get("/api/users", authMiddleware, (req, res) => {
  query("SELECT user_id, email, first_name, last_name FROM users", [], (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    res.json({ ok: true, users: rows });
  });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, rows) => {
    if (err) return res.status(500).json({ ok: false, message: err.message });
    if (!rows.length) return res.status(401).json({ ok: false, message: "Invalid credentials" });
    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ ok: false, message: "Invalid credentials" });
    const token = jwt.sign({ user_id: u.user_id, email: u.email }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ ok: true, token });
  });
});

app.post("/api/goals", authMiddleware, (req, res) => {
  const { title, description, end_goal, first_step } = req.body;
  const userId = req.user.user_id;
  if (!title || !description || !end_goal || !first_step) {
    return res.status(400).json({ ok: false, message: "All fields required" });
  }
  db.query(
    "INSERT INTO goals (user_id, title, description, end_goal, level, xp) VALUES (?, ?, ?, ?, 1, 0)",
    [userId, title, description, end_goal],
    (err, result) => {
      if (err) return res.status(500).json({ ok: false, message: err.message });
      const goalId = result.insertId;
      db.query(
        "INSERT INTO steps (goal_id, description, xp_value) VALUES (?, ?, ?)",
        [goalId, first_step, 10],
        (e2) => {
          if (e2) return res.status(500).json({ ok: false, message: e2.message });
          res.json({ ok: true, goal_id: goalId });
        }
      );
    }
  );
});

app.get("/api/goals", authMiddleware, (req, res) => {
  const uid = req.user.user_id;
  db.query(
    "SELECT goal_id, title, description, end_goal, level, xp, created_at FROM goals WHERE user_id = ? ORDER BY created_at DESC",
    [uid],
    (e, goals) => {
      if (e) return res.status(500).json({ ok: false, message: e.message });
      if (!goals.length) return res.json({ ok: true, goals: [] });
      const ids = goals.map(g => g.goal_id);
      const ph = ids.map(() => "?").join(",");
      db.query(
        `SELECT s.* FROM steps s
         JOIN (
           SELECT goal_id, MAX(created_at) AS max_created
           FROM steps
           GROUP BY goal_id
         ) x ON x.goal_id = s.goal_id AND x.max_created = s.created_at
         WHERE s.goal_id IN (${ph})`,
        ids,
        (e2, steps) => {
          if (e2) return res.status(500).json({ ok: false, message: e2.message });
          const map = {};
          goals.forEach(g => (map[g.goal_id] = null));
          steps.forEach(s => (map[s.goal_id] = s));
          const out = goals.map(g => {
            const threshold = xpToNext(g.level);
            return {
              ...g,
              current_step: map[g.goal_id],
              xp_info: { current: g.xp, threshold, progress: Math.min(g.xp / threshold, 1) }
            };
          });
          res.json({ ok: true, goals: out });
        }
      );
    }
  );
});

app.patch("/api/goals/:goalId/step", authMiddleware, (req, res) => {
  const uid = req.user.user_id;
  const goalId = parseInt(req.params.goalId, 10);
  const { description } = req.body;
  if (!description) return res.status(400).json({ ok: false, message: "Description required" });
  db.query("SELECT goal_id FROM goals WHERE goal_id = ? AND user_id = ? LIMIT 1", [goalId, uid], (e, r) => {
    if (e || !r.length) return res.status(404).json({ ok: false });
    db.query(
      "SELECT step_id FROM steps WHERE goal_id = ? ORDER BY created_at DESC LIMIT 1",
      [goalId],
      (e2, r2) => {
        if (e2 || !r2.length) return res.status(404).json({ ok: false });
        db.query("UPDATE steps SET description = ? WHERE step_id = ?", [description, r2[0].step_id], e3 => {
          if (e3) return res.status(500).json({ ok: false, message: e3.message });
          res.json({ ok: true });
        });
      }
    );
  });
});

app.post("/api/goals/:goalId/complete", authMiddleware, (req, res) => {
  const uid = req.user.user_id;
  const goalId = parseInt(req.params.goalId, 10);
  const { next_step, xp_value } = req.body;
  const xpVal = Number.isFinite(+xp_value) ? +xp_value : 60;
  if (!next_step) return res.status(400).json({ ok: false, message: "Next step required" });
  db.query("SELECT goal_id FROM goals WHERE goal_id = ? AND user_id = ? LIMIT 1", [goalId, uid], (e, r) => {
    if (e || !r.length) return res.status(404).json({ ok: false });
    db.query("SELECT step_id FROM steps WHERE goal_id = ? ORDER BY created_at DESC LIMIT 1", [goalId], (e2, r2) => {
      if (e2 || !r2.length) return res.status(404).json({ ok: false });
      const stepId = r2[0].step_id;
      db.query("UPDATE steps SET completed_at = NOW() WHERE step_id = ?", [stepId], e3 => {
        if (e3) return res.status(500).json({ ok: false, message: e3.message });
        db.query("UPDATE goals SET xp = xp + ? WHERE goal_id = ?", [xpVal, goalId], e4 => {
          if (e4) return res.status(500).json({ ok: false, message: e4.message });
          db.query(
            "INSERT INTO steps (goal_id, description, xp_value) VALUES (?, ?, ?)",
            [goalId, next_step, xpVal],
            e5 => {
              if (e5) return res.status(500).json({ ok: false, message: e5.message });
              res.json({ ok: true });
            }
          );
        });
      });
    });
  });
});

app.delete("/api/goals/:goalId", authMiddleware, (req, res) => {
  const uid = req.user.user_id;
  const goalId = parseInt(req.params.goalId, 10);
  if (!Number.isInteger(goalId)) return res.status(400).json({ ok: false });
  db.query("DELETE FROM goals WHERE goal_id = ? AND user_id = ?", [goalId, uid], (e, r) => {
    if (e) return res.status(500).json({ ok: false, message: e.message });
    if (r.affectedRows === 0) return res.status(404).json({ ok: false });
    res.json({ ok: true });
  });
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
