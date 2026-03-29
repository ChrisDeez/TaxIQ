import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FREE_LIMIT = 12;

function hashIP(ip) {
  return crypto.createHash("sha256").update(ip + "taxiq_salt_2024").digest("hex");
}

function getIP(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = getIP(req);
  const ipHash = hashIP(ip);
  const currentMonth = getCurrentMonth();

  const headers = {
    "Content-Type": "application/json",
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  };

  try {
    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/question_limits?ip_hash=eq.${ipHash}&select=count,month`,
      { headers }
    );
    const rows = await getRes.json();
    const record = rows?.[0];

    // Reset if new month
    const current = (record && record.month === currentMonth) ? record.count : 0;

    if (current >= FREE_LIMIT) {
      return res.status(200).json({ allowed: false, count: current, limit: FREE_LIMIT });
    }

    await fetch(`${SUPABASE_URL}/rest/v1/question_limits`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        ip_hash: ipHash,
        count: current + 1,
        month: currentMonth,
        updated_at: new Date().toISOString(),
      }),
    });

    return res.status(200).json({ allowed: true, count: current + 1, limit: FREE_LIMIT });
  } catch (e) {
    return res.status(200).json({ allowed: true, count: 0, limit: FREE_LIMIT });
  }
}
