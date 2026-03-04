const BASE = (import.meta.env && import.meta.env.VITE_API_URL) || "http://localhost:4002";

export async function apiLogin(username, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return r.json().then((j) => ({ ok: r.ok, data: j }));
}

export async function apiRegister(username, password) {
  const r = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return r.json().then((j) => ({ ok: r.ok, data: j }));
}

export async function apiAddRestaurant(token, name) {
  const r = await fetch(`${BASE}/api/restaurants`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
  return r.json().then((j) => ({ ok: r.ok, data: j }));
}

export async function apiListRestaurants() {
  const r = await fetch(`${BASE}/api/restaurants`);
  return r.json();
}

export async function apiGetMenu(id) {
  const r = await fetch(`${BASE}/api/restaurants/${id}/menu`);
  return r.json();
}

export async function apiUploadImage(token, id, file) {
  const fd = new FormData();
  fd.append("image", file);
  const r = await fetch(`${BASE}/api/restaurants/${id}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  return r.json().then((j) => ({ ok: r.ok, data: j }));
}

export async function apiUpdateMenuItem(token, id, menuId, name) {
  const r = await fetch(`${BASE}/api/restaurants/${id}/menu/${menuId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
  return r.json().then((j) => ({ ok: r.ok, data: j }));
}

export async function apiSearch(query) {
  const r = await fetch(`${BASE}/api/search?query=${encodeURIComponent(query)}`);
  return r.json();
}
