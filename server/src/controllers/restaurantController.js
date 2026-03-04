import { createRestaurant, existsByName, listRestaurants, findRestaurantById } from "../repositories/restaurants.js";
import { listByRestaurant, updateItem } from "../repositories/menuItems.js";

export async function addRestaurant(req, res) {
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "name_required" });
  const exists = existsByName(name);
  if (exists) return res.status(409).json({ error: "restaurant_exists" });
  const r = await createRestaurant(name);
  res.json(r);
}

export async function getRestaurants(req, res) {
  const list = listRestaurants();
  res.json({ restaurants: list });
}

export async function getMenu(req, res) {
  const id = Number(req.params.id);
  const r = findRestaurantById(id);
  if (!r) return res.status(404).json({ error: "not_found" });
  const items = listByRestaurant(id);
  res.json({ restaurant: { id: r.id, name: r.name, images: r.images || [] }, items });
}

export async function updateMenu(req, res) {
  const id = Number(req.params.id);
  const mid = Number(req.params.menuId);
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "name_required" });
  const item = await updateItem(id, mid, name);
  if (!item) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true, item });
}
