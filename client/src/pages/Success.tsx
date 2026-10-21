import { useEffect, useState, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { arrayUnion, doc, getDoc, setDoc } from "firebase/firestore";
import toast from "react-hot-toast";
import {
  FaCheckCircle,
  FaCopy,
  FaCheck,
  FaShoppingBag,
  FaArrowRight,
  FaReceipt,
  FaExclamationTriangle,
  FaSyncAlt,
} from "react-icons/fa";

import { auth, db } from "../lib/firebase";
import { store } from "../lib/store";
import { config } from "../../config";
import Container from "../ui/Container";
import FormattedPrice from "../ui/FormattedPrice";
import Loading from "../ui/Loading";
import type { OrderTypes, ProductProps } from "../../type";

const Success = () => {
  const { currentUser, cartProduct, resetCart } = store();
  const location = useLocation();
  const navigate = useNavigate();
  const sessionId = new URLSearchParams(location.search).get("session_id");

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [permissionNotice, setPermissionNotice] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedOrder, setSavedOrder] = useState<OrderTypes | null>(null);

  // Prevent multiple executions in React 18 Strict Mode
  const processedRef = useRef(false);

  // Helper to save order to localStorage fallback
  const saveOrderLocally = (order: OrderTypes, email: string) => {
    try {
      const key = `supergear_orders_${email.toLowerCase().trim()}`;
      const existingRaw = localStorage.getItem(key);
      const existingOrders: OrderTypes[] = existingRaw ? JSON.parse(existingRaw) : [];
      const isAlreadySaved = existingOrders.some((o) => o?.paymentId === order.paymentId);
      if (!isAlreadySaved) {
        existingOrders.unshift(order);
        localStorage.setItem(key, JSON.stringify(existingOrders));
      }
    } catch (e) {
      console.warn("Could not save order locally:", e);
    }
  };

  const syncOrderToFirestore = async (order: OrderTypes) => {
    setSyncing(true);
    try {
      if (typeof auth.authStateReady === "function") {
        await auth.authStateReady();
      }
      const orderRef = doc(db, "orders", order.userEmail);
      await setDoc(orderRef, { orders: arrayUnion(order) }, { merge: true });
      setPermissionNotice(false);
      toast.success("Order synchronized with cloud database successfully!");
    } catch (err: any) {
      console.error("Firestore sync error:", err);
      if (err?.code === "permission-denied" || err?.message?.includes("permissions")) {
        setPermissionNotice(true);
        toast.error("Cloud database access restricted by Firestore security rules");
      } else {
        toast.error(err?.message || "Failed to synchronize with cloud database");
      }
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!sessionId) {
      navigate("/");
      return;
    }

    if (processedRef.current) return;

    let isMounted = true;

    const processOrder = async (resolvedEmail: string, resolvedUserId: string) => {
      try {
        setLoading(true);

        // 1. Recover items from Zustand cart or localStorage backup
        let itemsToSave: ProductProps[] = [];
        if (cartProduct && cartProduct.length > 0) {
          itemsToSave = [...cartProduct];
        } else {
          try {
            const rawPending = localStorage.getItem("supergear_pending_order");
            if (rawPending) {
              const parsed = JSON.parse(rawPending);
              if (Array.isArray(parsed?.items) && parsed.items.length > 0) {
                itemsToSave = parsed.items;
              }
            }
          } catch (e) {
            console.error("Error reading pending order from storage:", e);
          }
        }

        // 2. Fetch session details from server if available
        let stripeEmail = "";
        let stripeAmount = 0;
        try {
          const res = await fetch(
            `${config?.baseUrl}/checkout/session/${sessionId}`
          );
          if (res.ok) {
            const sessionData = await res.json();
            stripeEmail = sessionData?.customer_email || sessionData?.metadata?.email || "";
            if (sessionData?.amount_total) {
              stripeAmount = Number(sessionData.amount_total);
            }
          }
        } catch {
          // Graceful fallback if backend is offline
        }

        const finalEmail = (
          resolvedEmail ||
          stripeEmail ||
          currentUser?.email ||
          auth.currentUser?.email ||
          ""
        ).trim().toLowerCase();

        const finalUserId =
          resolvedUserId ||
          currentUser?.id ||
          auth.currentUser?.uid ||
          "";

        // Calculate total amount
        const totalAmount =
          stripeAmount > 0
            ? stripeAmount
            : itemsToSave.reduce((sum, item) => {
                const price = Number(
                  item?.discountedPrice || item?.regularPrice || 0
                );
                const qty = Number(item?.quantity || 1);
                return sum + price * qty;
              }, 0);

        const orderData: OrderTypes = {
          paymentId: sessionId,
          userEmail: finalEmail || "customer@supergear.com",
          userId: finalUserId,
          paymentMethod: "stripe",
          orderItems: itemsToSave,
          totalAmount: totalAmount,
          createdAt: new Date().toISOString(),
          status: "Paid",
        };

        // Always save to local backup immediately so user never loses order
        if (finalEmail) {
          saveOrderLocally(orderData, finalEmail);
        }

        if (isMounted) {
          setSavedOrder(orderData);
          processedRef.current = true;
          resetCart();
          localStorage.removeItem("supergear_pending_order");
          localStorage.removeItem("supergear_pending_session_id");
        }

        // 3. Attempt to synchronize with Cloud Firestore
        if (finalEmail) {
          try {
            if (typeof auth.authStateReady === "function") {
              await auth.authStateReady();
            }
            const orderRef = doc(db, "orders", finalEmail);
            const docSnap = await getDoc(orderRef);

            let alreadyExists = false;
            if (docSnap.exists()) {
              const cloudOrders: OrderTypes[] = docSnap.data()?.orders || [];
              alreadyExists = cloudOrders.some((o) => o?.paymentId === sessionId);
            }

            if (!alreadyExists) {
              await setDoc(orderRef, { orders: arrayUnion(orderData) }, { merge: true });
            }

            if (isMounted) {
              toast.success("Payment confirmed and order recorded successfully!");
            }
          } catch (cloudErr: any) {
            console.error("Firestore cloud sync notice:", cloudErr);
            if (cloudErr?.code === "permission-denied" || cloudErr?.message?.includes("permissions")) {
              if (isMounted) {
                setPermissionNotice(true);
              }
            }
          }
        }
      } catch (err: any) {
        console.error("Order processing error:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    // Ensure auth state is checked properly
    const initProcess = async () => {
      try {
        if (typeof auth.authStateReady === "function") {
          await auth.authStateReady();
        }
      } catch (e) {
        console.warn("Auth state ready check:", e);
      }

      if (auth.currentUser?.email) {
        processOrder(auth.currentUser.email, auth.currentUser.uid);
        return;
      }

      if (currentUser?.email) {
        processOrder(currentUser.email, currentUser.id);
        return;
      }

      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user?.email) {
          processOrder(user.email, user.uid);
        } else {
          try {
            const rawPending = localStorage.getItem("supergear_pending_order");
            if (rawPending) {
              const parsed = JSON.parse(rawPending);
              if (parsed?.email) {
                processOrder(parsed.email, parsed?.userId || "");
                return;
              }
            }
          } catch (e) {
            console.error(e);
          }
          processOrder("", "");
        }
      });

      return () => unsubscribe();
    };

    initProcess();

    return () => {
      isMounted = false;
    };
  }, [sessionId, currentUser, cartProduct, navigate, resetCart]);

  const handleCopy = () => {
    if (sessionId) {
      navigator.clipboard.writeText(sessionId);
      setCopied(true);
      toast.success("Tracking number copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Container className="py-12">
      {loading ? (
        <div className="min-h-[450px] flex flex-col items-center justify-center gap-4">
          <Loading />
          <p className="text-lg font-medium text-gray-700 animate-pulse">
            Verifying your payment and finalizing your order...
          </p>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Top Success Badge Banner */}
          <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-sky-500/10 border border-emerald-500/20 rounded-3xl p-8 text-center shadow-lg backdrop-blur-sm">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-500 text-white rounded-full shadow-lg shadow-emerald-500/30 mb-4 animate-bounce">
              <FaCheckCircle className="text-4xl" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
              Payment Confirmed!
            </h1>
            <p className="mt-2 text-lg text-emerald-800 font-semibold">
              Your transaction has been approved and your order is placed.
            </p>
            <p className="mt-1 text-sm text-gray-600">
              A confirmation record has been generated and added to your account order history.
            </p>

            {/* Tracking ID Box */}
            <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-2 bg-white px-4 py-2.5 rounded-full border border-gray-200 shadow-sm">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Order Tracking ID:
              </span>
              <span className="text-xs sm:text-sm font-mono font-bold text-gray-800 max-w-[260px] sm:max-w-none truncate">
                {sessionId}
              </span>
              <button
                onClick={handleCopy}
                type="button"
                className="ml-1 p-1.5 text-gray-500 hover:text-black hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
                title="Copy Tracking ID"
              >
                {copied ? (
                  <FaCheck className="text-emerald-600 text-sm" />
                ) : (
                  <FaCopy className="text-sm" />
                )}
              </button>
            </div>
          </div>

          {/* Firestore Security Rules Notice (If Permission Denied) */}
          {permissionNotice && savedOrder && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-lg mt-0.5">
                  <FaExclamationTriangle className="text-lg" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-amber-900">
                    Cloud Database Sync Notice
                  </h3>
                  <p className="text-xs sm:text-sm text-amber-800 mt-1">
                    Your payment was successful and your order is safely preserved. To enable cloud synchronization with Firebase, update your Firestore Security Rules in the Firebase Console to permit read/write on the <code className="bg-amber-100 px-1 rounded font-mono font-semibold">orders</code> collection.
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={() => savedOrder && syncOrderToFirestore(savedOrder)}
                      disabled={syncing}
                      type="button"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold duration-200 shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      <FaSyncAlt className={`text-xs ${syncing ? "animate-spin" : ""}`} />
                      <span>{syncing ? "Syncing..." : "Retry Cloud Sync"}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Order Details Card */}
          {savedOrder && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 pb-5 gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gray-100 rounded-xl text-gray-800 text-xl">
                    <FaReceipt />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">
                      Order Summary
                    </h2>
                    <p className="text-xs text-gray-500">
                      {savedOrder?.createdAt
                        ? new Date(savedOrder.createdAt).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "Just now"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full uppercase tracking-wider">
                    {savedOrder?.status || "Paid"}
                  </span>
                  <span className="px-3 py-1 bg-sky-100 text-sky-800 text-xs font-semibold rounded-full capitalize">
                    {savedOrder?.paymentMethod || "Stripe"}
                  </span>
                </div>
              </div>

              {/* Items List */}
              <div className="divide-y divide-gray-100">
                {savedOrder?.orderItems?.map((item: ProductProps, idx: number) => {
                  const imageSrc =
                    Array.isArray(item?.images) && item.images.length > 0
                      ? item.images[0]
                      : (item as any)?.image || "";
                  const itemPrice = Number(
                    item?.discountedPrice || item?.regularPrice || 0
                  );
                  const qty = Number(item?.quantity || 1);

                  return (
                    <div
                      key={item?._id || idx}
                      className="py-4 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-200 overflow-hidden flex-shrink-0">
                          {imageSrc ? (
                            <img
                              src={imageSrc}
                              alt={item?.name || "Product"}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                              <FaShoppingBag />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 line-clamp-1">
                            {item?.name}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Quantity: <span className="font-bold text-gray-800">{qty}</span> ×{" "}
                            <FormattedPrice amount={itemPrice} />
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-sm font-bold text-gray-900">
                          <FormattedPrice amount={itemPrice * qty} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total Row */}
              <div className="border-t border-gray-100 pt-5 flex items-center justify-between text-base">
                <span className="font-semibold text-gray-700">Total Amount Paid</span>
                <span className="text-2xl font-extrabold text-gray-900">
                  <FormattedPrice
                    amount={
                      savedOrder?.totalAmount ||
                      savedOrder?.orderItems?.reduce(
                        (sum, it) =>
                          sum +
                          Number(it?.discountedPrice || it?.regularPrice || 0) *
                            Number(it?.quantity || 1),
                        0
                      ) ||
                      0
                    }
                  />
                </span>
              </div>
            </div>
          )}

          {/* Action Navigation Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Link to="/orders" className="w-full sm:w-auto">
              <button
                type="button"
                className="w-full sm:w-64 h-12 bg-black text-white rounded-full text-base font-semibold hover:bg-gray-800 duration-300 flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer"
              >
                <span>View My Orders</span>
                <FaArrowRight className="text-sm" />
              </button>
            </Link>
            <Link to="/product" className="w-full sm:w-auto">
              <button
                type="button"
                className="w-full sm:w-64 h-12 bg-white text-gray-800 border-2 border-gray-300 rounded-full text-base font-semibold hover:border-black hover:text-black duration-300 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <FaShoppingBag className="text-sm" />
                <span>Continue Shopping</span>
              </button>
            </Link>
          </div>
        </div>
      )}
    </Container>
  );
};

export default Success;