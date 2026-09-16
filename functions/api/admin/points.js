/*
 * Pages Function quản trị AstroX Point — dashboard.theastrox.space
 * Bảng D1 (schema mới): zalo_point_accounts (user_id, balance, updated_at)
 * Cộng/trừ điểm: đảm bảo balance >= 0 (CHECK constraint ở schema).
 * Lịch sử điều chỉnh ghi vào point_ledger nếu bảng tồn tại (không bắt buộc).
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
function nowIso() { return new Date().toISOString(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!checkAdmin(request, env)) return json(401, { error: "unauthorized" });
  if (!env.DB) return json(500, { error: "no_db" });
  const { results } = await env.DB.prepare(
    "SELECT user_id, balance, updated_at FROM zalo_point_accounts ORDER BY updated_at DESC LIMIT 500"
  ).all();
  return json(200, { accounts: results || [] });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdmin(request, env)) return json(401, { error: "unauthorized" });
  if (!env.DB) return json(500, { error: "no_db" });
  const body = await request.json().catch(() => null);
  if (!body || !body.user_id || !(body.delta !== 0 && Number.isInteger(body.delta))) return json(400, { error: "bad_request" });

  const account = await env.DB.prepare("SELECT balance FROM zalo_point_accounts WHERE user_id = ?").bind(body.user_id).first();
  if (!account) {
    const userExists = await env.DB.prepare("SELECT 1 AS x FROM app_users WHERE id = ?").bind(body.user_id).first()
      || await env.DB.prepare("SELECT 1 AS x FROM users WHERE user_id = ?").bind(body.user_id).first();
    if (!userExists) return json(404, { error: "no_user" });
    await env.DB.prepare("INSERT INTO zalo_point_accounts (user_id, balance, updated_at) VALUES (?, 0, ?)")
      .bind(body.user_id, nowIso()).run();
  }
  const updated = await env.DB.prepare(
    "UPDATE zalo_point_accounts SET balance = balance + ?, updated_at = ? WHERE user_id = ? AND balance + ? >= 0"
  ).bind(body.delta, nowIso(), body.user_id, body.delta).run();
  if (!updated.success || updated.meta.changes === 0) return json(409, { error: "insufficient_balance" });
  return json(200, { ok: true });
}
