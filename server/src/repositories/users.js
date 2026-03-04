import bcrypt from "bcryptjs";
import { db } from "../db.js";

export function findByUsername(username) {
  return db.data.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
}

export async function createUser(username, password) {
  const hash = bcrypt.hashSync(password, 10);
  const id = Date.now();
  db.data.users.push({ id, username, passwordHash: hash });
  await db.write();
  return { id, username };
}

export function verifyPassword(user, password) {
  return bcrypt.compareSync(password, user.passwordHash);
}
