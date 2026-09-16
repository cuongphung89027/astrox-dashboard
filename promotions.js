/*
 * Pages Function quản trị Promotion code — dashboard.theastrox.space
 * Bảo mật: header X-Admin-Password so với biến môi trường ADMIN_PASSWORD (Secret).
 * Bảng D1: promotion_codes (id, code, points, max_redemptions, redeemed_count, active, created_at)
 * Ghi chú: bảng này nằm trong schema mới (migration 0001) — nếu chưa có trên D1
 * production, chạy migration trước khi dùng panel này.
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
    "SELECT id, code, points, max_redemptions, redeemed_count, active, created_at FROM promotion_codes ORDER BY created_at DESC"
  ).all();
  return json(200, { promotions: results || [] });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdmin(request, env)) return json(401, { error: "unauthorized" });
  if (!env.DB) return json(500, { error: "no_db" });
  const body = await request.json().catch(() => null);
  if (!body || !body.code || !(body.points > 0)) return json(400, { error: "bad_request" });
  const code = String(body.code).trim().toUpperCase();
  const existing = await env.DB.prepare("SELECT id FROM promotion_codes WHERE code = ?").bind(code).first();
  if (existing) return json(409, { error: "conflict" });
  const id = uuid();
  await env.DB.prepare(
    "INSERT INTO promotion_codes (id, code, points, max_redemptions, redeemed_count, active, created_at) VALUES (?, ?, ?, ?, 0, 1, ?)"
  ).bind(id, code, body.points, body.max_redemptions || null, nowIso()).run();
  return json(200, { ok: true, id });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  if (!checkAdmin(request, env)) return json(401, { error: "unauthorized" });
  if (!env.DB) return json(500, { error: "no_db" });
  const body = await request.json().catch(() => null);
  if (!body || !body.id) return json(400, { error: "bad_request" });
  await env.DB.prepare("UPDATE promotion_codes SET active = ? WHERE id = ?")
    .bind(body.active ? 1 : 0, body.id).run();
  return json(200, { ok: true });
}
