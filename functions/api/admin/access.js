/*
 * Cloudflare Pages Function cho trang quản trị dashboard.theastrox.space.
 *
 * Bảo mật: mật khẩu admin KHÔNG được nhúng trong dashboard/index.html (nếu
 * nhúng thẳng vào HTML/JS thì bất kỳ ai bấm "Xem nguồn trang" cũng đọc được).
 * Thay vào đó, dashboard gửi mật khẩu người dùng vừa nhập lên trong header
 * "X-Admin-Password" của mỗi request, và Function này so sánh với biến môi
 * trường ADMIN_PASSWORD (đặt trong Cloudflare Pages > Settings > Environment
 * variables, đánh dấu Secret) — vì vậy mật khẩu thật không nằm trong mã
 * nguồn công khai. Hãy đặt ADMIN_PASSWORD = Cuong@1211 khi cấu hình.
 *
 * Binding cần đặt (giống project AstroX chính, TRỎ VÀO CÙNG D1 DATABASE
 * "astrox-db" để đọc/ghi chung dữ liệu người dùng):
 *   DB (D1 database binding)
 * Biến môi trường cần đặt:
 *   ADMIN_PASSWORD - mật khẩu quản trị (Cuong@1211)
 */

const ALL_MODULES = ["tuvi", "zodiac", "kinhdich", "batu", "numerology", "tarot"];

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store"
    }
  });
}

function checkAdmin(request, env) {
  const pass = request.headers.get("X-Admin-Password") || "";
  return !!env.ADMIN_PASSWORD && pass === env.ADMIN_PASSWORD;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!checkAdmin(request, env)) return json(401, { error: "Sai mật khẩu quản trị." });
  if (!env.DB) return json(500, { error: "Máy chủ chưa cấu hình D1 database (binding DB)." });

  try {
    // Nguồn chính: bảng `users` (ghi bởi user-data.js mỗi khi ai đó xác thực
    // thành công bằng token của chính họ — có email thật, không cần Supabase
    // Service Role Key). `user_data` chỉ dùng để lấy tên hồ sơ đã đặt (nếu có)
    // cho các tài khoản có từ trước khi bảng `users` tồn tại.
    const { results: userRows } = await env.DB.prepare(
      "SELECT user_id, email, name, first_seen, last_seen FROM users ORDER BY last_seen DESC"
    ).all();
    const { results: dataRows } = await env.DB.prepare(
      "SELECT user_id, payload, updated_at FROM user_data"
    ).all();
    const { results: accessRows } = await env.DB.prepare(
      "SELECT user_id, module, enabled FROM user_module_access"
    ).all();

    const profileByUser = {};
    (dataRows || []).forEach((row) => {
      let name = "";
      try {
        const payload = JSON.parse(row.payload || "{}");
        name = (payload.profile && payload.profile.name) || "";
      } catch { /* bo qua payload loi */ }
      profileByUser[row.user_id] = { name, updatedAt: row.updated_at };
    });
    const accessByUser = {};
    (accessRows || []).forEach((row) => {
      (accessByUser[row.user_id] ||= {})[row.module] = !!row.enabled;
    });

    const seenIds = new Set();
    const users = (userRows || []).map((row) => {
      seenIds.add(row.user_id);
      const profile = profileByUser[row.user_id];
      const access = Object.fromEntries(ALL_MODULES.map((m) => [m, true]));
      Object.assign(access, accessByUser[row.user_id] || {});
      return {
        userId: row.user_id,
        email: row.email || "",
        name: row.name || (profile && profile.name) || "",
        hasProfile: !!profile,
        lastSeen: row.last_seen,
        access
      };
    });
    // Tài khoản có dữ liệu (user_data) từ trước khi bảng `users` tồn tại,
    // chưa từng gọi lại API sau khi có bảng này — vẫn hiện, chỉ thiếu email.
    (dataRows || []).forEach((row) => {
      if (seenIds.has(row.user_id)) return;
      const profile = profileByUser[row.user_id];
      const access = Object.fromEntries(ALL_MODULES.map((m) => [m, true]));
      Object.assign(access, accessByUser[row.user_id] || {});
      users.push({
        userId: row.user_id, email: "", name: (profile && profile.name) || "",
        hasProfile: true, lastSeen: row.updated_at, access
      });
    });
    users.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

    return json(200, { modules: ALL_MODULES, users });
  } catch {
    return json(500, { error: "Không đọc được danh sách người dùng." });
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  if (!checkAdmin(request, env)) return json(401, { error: "Sai mật khẩu quản trị." });
  if (!env.DB) return json(500, { error: "Máy chủ chưa cấu hình D1 database (binding DB)." });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: "JSON không hợp lệ." }); }
  const { userId, module, enabled } = body || {};
  if (!userId || !ALL_MODULES.includes(module) || typeof enabled !== "boolean")
    return json(400, { error: "Thiếu userId/module/enabled hợp lệ." });

  try {
    await env.DB.prepare(
      `INSERT INTO user_module_access (user_id, module, enabled, updated_at) VALUES (?1,?2,?3,?4)
       ON CONFLICT(user_id, module) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`
    ).bind(userId, module, enabled ? 1 : 0, Date.now()).run();
    return json(200, { ok: true });
  } catch {
    return json(500, { error: "Không lưu được thay đổi." });
  }
}

export async function onRequestPost() { return json(405, { error: "Phương thức không được hỗ trợ." }); }
export async function onRequestDelete() { return json(405, { error: "Phương thức không được hỗ trợ." }); }

