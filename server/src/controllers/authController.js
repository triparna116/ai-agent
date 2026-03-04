import { findByUsername, createUser, verifyPassword } from "../repositories/users.js";
import { signToken } from "../middleware/auth.js";

export async function register(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "invalid_body" });
  const exists = findByUsername(username);
  if (exists) return res.status(409).json({ error: "user_exists" });
  const user = await createUser(username, password);
  res.json(user);
}

export async function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "invalid_body" });
  const user = findByUsername(username);
  if (!user) return res.status(401).json({ error: "invalid_credentials" });
  const ok = verifyPassword(user, password);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });
  const token = signToken(user);
  res.json({ token });
}
