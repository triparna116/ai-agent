import { db } from "../db.js";

export function listRestaurants() {
  return db.data.restaurants.map((r) => ({ id: r.id, name: r.name }));
}

export function findRestaurantById(id) {
  return db.data.restaurants.find((r) => r.id === id);
}

export async function createRestaurant(name) {
  const id = Date.now();
  db.data.restaurants.push({ id, name, images: [] });
  await db.write();
  return { id, name };
}

export function existsByName(name) {
  return db.data.restaurants.find((r) => r.name.toLowerCase() === name.toLowerCase());
}

export async function addImage(id, url) {
  const r = findRestaurantById(id);
  if (!r) return null;
  r.images = r.images || [];
  r.images.push({ url });
  await db.write();
  return url;
}
