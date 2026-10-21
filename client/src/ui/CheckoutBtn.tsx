import { useState } from "react";
import toast from "react-hot-toast";
import { store } from "../lib/store";
import { config } from "../../config";
import type { ProductProps } from "../../type";

const CheckoutBtn = ({ products }: { products: ProductProps[] }) => {
  const { currentUser } = store();
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    if (!currentUser) {
      toast.error("Please log in to proceed with checkout");
      return;
    }

    if (!products || products.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    try {
      setLoading(true);
      // Save pending order snapshot so it cannot be lost if memory/state reloads
      const pendingOrder = {
        items: products,
        email: (currentUser?.email || "").trim().toLowerCase(),
        userId: currentUser?.id || "",
        timestamp: Date.now(),
      };
      localStorage.setItem("supergear_pending_order", JSON.stringify(pendingOrder));

      const response = await fetch(`${config?.baseUrl}/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: products,
          email: currentUser?.email,
        }),
      });

      const checkoutSession = await response?.json();

      if (!response.ok) {
        throw new Error(checkoutSession?.error || "Failed to create checkout session");
      }

      if (checkoutSession?.url) {
        if (checkoutSession?.id) {
          localStorage.setItem("supergear_pending_session_id", checkoutSession.id);
        }
        // Redirect directly to Stripe Hosted Checkout page
        window.location.href = checkoutSession.url;
        return;
      } else {
        throw new Error("No checkout URL returned from payment server");
      }
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast.error(error?.message || "Failed to initiate Stripe checkout");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6">
      {currentUser ? (
        <button
          onClick={handleCheckout}
          disabled={loading}
          type="button"
          className="w-full rounded-md border border-transparent bg-gray-800 px-4 py-3 text-base font-medium text-white shadow-sm hover:bg-black focus:outline-none focus:ring-2 focus:ring-skyText focus:ring-offset-2 focus:ring-offset-gray-50 duration-200 disabled:bg-gray-500 cursor-pointer transition-colors"
        >
          {loading ? "Redirecting to Stripe..." : "Checkout"}
        </button>
      ) : (
        <button
          disabled
          type="button"
          className="w-full text-base text-white text-center rounded-md border border-transparent bg-gray-500 px-4 py-3 cursor-not-allowed"
        >
          Checkout
        </button>
      )}
      {!currentUser && (
        <p className="mt-2 text-sm font-medium text-red-500 text-center">
          Need to sign in to make checkout
        </p>
      )}
    </div>
  );
};

export default CheckoutBtn;