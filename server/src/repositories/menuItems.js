import { db } from "../db.js";

export function listByRestaurant(restaurantId) {
  return db.data.menu_items.filter((mi) => mi.restaurant_id === restaurantId);
}

export async function addIfNotExistsMany(restaurantId, items, rawText) {
  const existing = new Set(
    db.data.menu_items
      .filter((mi) => mi.restaurant_id === restaurantId)
      .map((mi) => mi.name.toLowerCase())
  );
  let inserted = 0;
  for (const item of items) {
    // item is now { name, price, description }
    if (!existing.has(item.name.toLowerCase())) {
      db.data.menu_items.push({
        id: Date.now() + Math.random(),
        restaurant_id: restaurantId,
        name: item.name,
        price: item.price || "",
        description: item.description || "",
        raw_text: rawText,
      });
      inserted++;
    }
  }
  await db.write();
  return inserted;
}

export async function updateItem(restaurantId, menuId, updates) {
  const idx = db.data.menu_items.findIndex(
    (mi) => mi.restaurant_id === restaurantId && mi.id === menuId
  );
  if (idx === -1) return null;

  const item = db.data.menu_items[idx];
  if (updates.name !== undefined) item.name = updates.name;
  if (updates.price !== undefined) item.price = updates.price;
  if (updates.description !== undefined) item.description = updates.description;

  await db.write();
  return item;
}
