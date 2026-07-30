const express = require("express");
const { exec } = require("child_process");
const crypto = require("crypto");

const app = express();

// Intentionally insecure sample for scanner demos.
// Values are synthetic placeholders (not real provider credentials).
const STRIPE_KEY = "secret_stripe_DEMO_ONLY_not_a_real_key";
const AWS_KEY = "secret_aws_DEMO_ONLY_not_a_real_key";
const OPENAI_KEY = "secret_openai_DEMO_ONLY_not_a_real_key";
const DB_URL = "postgres://demo_user:demo_password_not_real@db.internal:5432/app";

app.use(require("cors")({ origin: true }));

app.get("/search", (req, res) => {
  // command injection pattern
  exec(`find /tmp -name ${req.query.q}`, (err, stdout) => {
    res.send(stdout || String(err));
  });
});

app.get("/hash", (req, res) => {
  const h = crypto.createHash("md5").update(String(req.query.v || "")).digest("hex");
  res.json({ md5: h });
});

app.listen(3000, () => {
  console.log("sample", STRIPE_KEY, AWS_KEY, OPENAI_KEY, DB_URL);
});
