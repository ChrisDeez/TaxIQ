const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

async function verifyStripeSignature(body, signature, secret) {
  const encoder = new TextEncoder();
  const parts = signature.split(",");
  let timestamp = "";
  let sig = "";
  for (const part of parts) {
    if (part.startsWith("t=")) timestamp = part.slice(2);
    if (part.startsWith("v1=")) sig = part.slice(3);
  }

  const payload = `${timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expectedSig = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  return expectedSig === sig;
}

async function upsertSubscription(userId, plan, stripeCustomerId, stripeSubscriptionId, status, periodEnd) {
  const headers = {
    "Content-Type": "application/json",
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    Prefer: "resolution=merge-duplicates",
  };

  await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      user_id: userId,
      plan,
      status,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      current_period_end: periodEnd,
      updated_at: new Date().toISOString(),
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const signature = req.headers["stripe-signature"];
  const body = await new Promise((resolve) => {
    let data = "";
    req.on("data", chunk => data += chunk);
    req.on("end", () => resolve(data));
  });

  try {
    const valid = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET);
    if (!valid) return res.status(400).json({ error: "Invalid signature" });

    const event = JSON.parse(body);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.user_id;
      const plan = session.metadata?.plan;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      if (userId && plan) {
        // Get subscription period end
        let periodEnd = null;
        if (subscriptionId) {
          const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
            headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` }
          });
          const sub = await subRes.json();
          periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        }

        await upsertSubscription(userId, plan, customerId, subscriptionId, "active", periodEnd);
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const subId = subscription.id;

      // Find and update subscription in Supabase
      const headers = {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      };

      await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?stripe_subscription_id=eq.${subId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "cancelled", updated_at: new Date().toISOString() }),
      });
    }

    return res.status(200).json({ received: true });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}

export const config = { api: { bodyParser: false } };
