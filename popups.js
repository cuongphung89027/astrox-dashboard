/*
 * Pages Function quản trị Popup thông báo — dashboard.theastrox.space
 * Bảng D1 (schema mới): module_popups (id, module_id, title, body, active, ends_at, ...)
 * module_slug trả về để hiển thị; popup không gắn module = hiển thị toàn bộ.
 */

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" },
  });
}
function checkAdmin(request, env) {
  const pass = request.headers.get("X-Admin-Password") || "";
  return !!env.ADMIN_PASSWORD && pass === env.ADMIN_PASSWORD;
}
function uuid() { return crypto.randomUUID(); }
function nowIso() { return new Date().toISOString(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!checkAdmin(request, env)) return json(401, { error: "unauthorized" });
  if (!env.DB) return json(500, { error: "no_db" });
  const { results } = await env.DB.prepare(
    `SELECT mp.id, mp.title, mp.body, mp.active, mp.starts_at, mp.ends_at, m.slug AS module_slug
     FROM module_popups mp LEFT JOIN modules m ON mp.module_id = m.id
     ORDER BY mp.created_at DESC`
  ).all();
  return json(200, { popups: results || [] });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdmin(request, env)) return json(401, { error: "unauthorized" });
  if (!env.DB) return json(500, { error: "no_db" });
  const body = await request.json().catch(() => null);
  if (!body || !body.title || !body.body) return json(400, { error: "bad_request" });
  let moduleId = null;
  if (body.module_slug) {
    const mod = await env.DB.prepare("SELECT id FROM modules WHERE slug = ?").bind(body.module_slug).first();
    if (!mod) return json(404, { error: "no_module" });
    moduleId = mod.id;
  }
  const id = uuid();
  await env.DB.prepare(
    "INSERT INTO module_popups (id, module_id, part_id, title, body, active, starts_at, ends_at, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, 1, ?, ?, ?, ?)"
  ).bind(id, moduleId, body.title, body.body, nowIso(), body.ends_at || null, nowIso(), nowIso()).run();
  return json(200, { ok: true, id });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  if (!checkAdmin(request, env)) return json(401, { error: "unauthorized" });
  if (!env.DB) return json(500, { error: "no_db" });
  const body = await request.json().catch(() => null);
  if (!body || !body.id) return json(400, { error: "bad_request" });
  await env.DB.prepare("UPDATE module_popups SET active = ?, updated_at = ? WHERE id = ?")
    .bind(body.active ? 1 : 0, nowIso(), body.id).run();
  return json(200, { ok: true });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!checkAdmin(request, env)) return json(401, { error: "unauthorized" });
  if (!env.DB) return json(500, { error: "no_db" });
  const body = await request.json().catch(() => null);
  if (!body || !body.id) return json(400, { error: "bad_request" });
  await env.DB.prepare("DELETE FROM module_popups WHERE id = ?").bind(body.id).run();
  return json(200, { ok: true });
}
