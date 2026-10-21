import { Router } from "express";
import Stripe from "stripe";

const router = Router();

router.post("/checkout", async (req, res) => {
  try {
    const { items, email } = req.body;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();

    if (!stripeSecretKey) {
      return res.status(400).json({
        error: "Stripe Secret Key is missing! Please set STRIPE_SECRET_KEY in admin/.env file.",
      });
    }

    const stripe = new Stripe(stripeSecretKey);

    if (!items || !items.length) {
      return res.status(400).json({ error: "No products in cart" });
    }

    const line_items = items.map((item) => {
      const price = Number(item.discountedPrice || item.regularPrice || item.price || 1);
      const imageUrl = Array.isArray(item.images) && item.images.length > 0
        ? item.images[0]
        : (typeof item.image === "string" ? item.image : undefined);

      return {
        quantity: Number(item.quantity) || 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(price * 100),
          product_data: {
            name: item.name || "Product",
            description: (item.description || item.name || "").substring(0, 500),
            ...(imageUrl ? { images: [imageUrl] } : {}),
          },
        },
      };
    });

    const origin = req.headers.origin || "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      line_items,
      mode: "payment",
      customer_email: email || undefined,
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cart`,
      metadata: {
        email: email || "",
      },
    });

    res.json({ id: session.id, url: session.url });
  } catch (error) {
    console.error("Stripe Checkout Error:", error);
    res.status(500).json({
      error: error.message || "Failed to create Stripe checkout session",
    });
  }
});

router.get("/checkout/session/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();

    if (!stripeSecretKey) {
      return res.status(400).json({
        error: "Stripe Secret Key is missing! Please set STRIPE_SECRET_KEY in admin/.env file.",
      });
    }

    const stripe = new Stripe(stripeSecretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items"],
    });

    res.json({
      id: session.id,
      payment_status: session.payment_status,
      customer_email: session.customer_email || session.metadata?.email || null,
      amount_total: session.amount_total ? session.amount_total / 100 : 0,
      currency: session.currency,
      metadata: session.metadata,
      line_items: session.line_items?.data || [],
    });
  } catch (error) {
    console.error("Retrieve Session Error:", error);
    res.status(500).json({
      error: error.message || "Failed to retrieve checkout session",
    });
  }
});

export default router;
