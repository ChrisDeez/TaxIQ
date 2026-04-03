const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

const PRICE_IDS = {
  plus: "price_1TIABuCvvaLE3uadnZ3iXU7q",
  professional: "price_1TIAClCvvaLE3uadvHA93Qca",
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { plan, user_id, email } = req.body || {};

  if (!plan || !PRICE_IDS[plan]) {
    return res.status(400).json({ error: "Invalid plan" });
  }

  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "payment_method_types[]": "card",
        "line_items[0][price]": PRICE_IDS[plan],
        "line_items[0][quantity]": "1",
        "mode": "subscription",
        "success_url": `https://taxiq.com.gr?payment=success&plan=${plan}`,
        "cancel_url": `https://taxiq.com.gr?payment=cancelled`,
        "customer_email": email || "",
        "metadata[user_id]": user_id || "",
        "metadata[plan]": plan,
      }),
    });

    const session = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: session.error?.message || "Stripe error" });
    }

    return res.status(200).json({ url: session.url });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
