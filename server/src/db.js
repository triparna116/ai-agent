import path from "path";
import { fileURLToPath } from "url";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbFile = path.join(__dirname, "..", "db.json");
const adapter = new JSONFile(dbFile);
export const db = new Low(adapter, { users: [], restaurants: [], menu_items: [] });
await db.read();
if (!db.data) db.data = { users: [], restaurants: [], menu_items: [] };
if (!db.data.users) db.data.users = [];
if (!db.data.restaurants) db.data.restaurants = [];
if (!db.data.menu_items) db.data.menu_items = [];
await db.write();
