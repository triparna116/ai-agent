import { db } from "../db.js";

export function listByRestaurant(restaurantId) {
  return db.data.menu_items.filter((mi) => mi.restaurant_id === restaurantId);
}

export async function addIfNotExistsMany(restaurantId, items, rawText) {
  const existing = new Set(
    db.data.menu_items.filter((mi) => mi.restaurant_id === restaurantId).map((mi) => mi.name.toLowerCase())
  );
  let inserted = 0;
  for (const name of items) {
    if (!existing.has(name.toLowerCase())) {
      db.data.menu_items.push({
        id: Date.now() + Math.random(),
        restaurant_id: restaurantId,
        name,
        raw_text: rawText,
      });
      inserted++;
    }
  }
  await db.write();
  return inserted;
}

export async function updateItem(restaurantId, menuId, name) {
  const idx = db.data.menu_items.findIndex((mi) => mi.restaurant_id === restaurantId && mi.id === menuId);
  if (idx === -1) return null;
  db.data.menu_items[idx].name = name;
  await db.write();
  return db.data.menu_items[idx];
}
