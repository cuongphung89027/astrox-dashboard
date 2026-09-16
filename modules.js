/*
 * Pages Function quản trị Module (khóa/mở, chế độ truy cập, giá Point)
 * Bảng D1 (schema mới): modules (id, slug, name, access_mode, enabled)
 * Giá lưu ở module_prices — bảng rời, bản ghi active mới nhất là giá hiện hành.
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
  const { results: modules } = await env.DB.prepare(
    "SELECT id, slug, name, description, access_mode, enabled FROM modules ORDER BY slug"
  ).all();
  const { results: prices } = await env.DB.prepare(
    "SELECT module_id, points FROM module_prices WHERE part_id IS NULL AND active = 1"
  ).all();
  const priceByModule = {};
  (prices || []).forEach(p => { priceByModule[p.module_id] = p.points; });
  const modulesOut = (modules || []).map(m => ({ ...m, price_points: priceByModule[m.id] ?? 0 }));
  return json(200, { modules: modulesOut });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  if (!checkAdmin(request, env)) return json(401, { error: "unauthorized" });
  if (!env.DB) return json(500, { error: "no_db" });
  const body = await request.json().catch(() => null);
  if (!body || !body.id) return json(400, { error: "bad_request" });

  if (typeof body.enabled === "boolean") {
    await env.DB.prepare("UPDATE modules SET enabled = ?, updated_at = ? WHERE id = ?")
      .bind(body.enabled ? 1 : 0, nowIso(), body.id).run();
  }
  if (body.access_mode && ["public", "login", "paid", "disabled"].includes(body.access_mode)) {
    await env.DB.prepare("UPDATE modules SET access_mode = ?, updated_at = ? WHERE id = ?")
      .bind(body.access_mode, nowIso(), body.id).run();
  }
  if (body.price_points !== undefined && Number.isInteger(body.price_points) && body.price_points >= 0) {
    // Vô hiệu hóa giá cũ và tạo giá mới (append-only, bản ghi active mới nhất là giá hiện hành)
    await env.DB.prepare("UPDATE module_prices SET active = 0 WHERE module_id = ? AND part_id IS NULL").bind(body.id).run();
    await env.DB.prepare("INSERT INTO module_prices (id, module_id, part_id, points, active, created_at) VALUES (?, ?, NULL, ?, 1, ?)")
      .bind(uuid(), body.id, body.price_points, nowIso()).run();
  }
  return json(200, { ok: true });
}
