import { db } from "../db.js";
import { fuzzySearch } from "../services/ocr.js";

export function search(req, res) {
  const q = (req.query.query || "").trim();
  if (!q) return res.json({ query: q, results: [] });
  const rows = db.data.menu_items.map((mi) => ({
    restaurantName: db.data.restaurants.find((r) => r.id === mi.restaurant_id)?.name || "",
    itemName: mi.name,
    name: mi.name,
    price: mi.price || "",
    description: mi.description || "",
    restaurant_id: mi.restaurant_id,
  }));
  const matched = fuzzySearch(rows, q);
  matched.sort((a, b) =>
    a.restaurantName.localeCompare(b.restaurantName) ||
    a.itemName.localeCompare(b.itemName)
  );
  const grouped = {};
  for (const row of matched) {
    if (!grouped[row.restaurantName]) grouped[row.restaurantName] = [];
    grouped[row.restaurantName].push({
      name: row.itemName,
      price: row.price,
      description: row.description
    });
  }
  const results = Object.entries(grouped).map(([restaurantName, items]) => ({
    restaurantName,
    items,
  }));
  res.json({ query: q, results });
}
