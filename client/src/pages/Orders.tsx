import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState, useCallback } from "react";
import {
  FaMinus,
  FaPlus,
  FaBoxOpen,
  FaCopy,
  FaCheck,
  FaSyncAlt,
  FaReceipt,
  FaCalendarAlt,
} from "react-icons/fa";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";

import { auth, db } from "../lib/firebase";
import { store } from "../lib/store";
import Container from "../ui/Container";
import FormattedPrice from "../ui/FormattedPrice";
import Loading from "../ui/Loading";
import type { OrderTypes, ProductProps } from "../../type";

const Orders = () => {
  const { currentUser } = store();
  const [orders, setOrders] = useState<OrderTypes[]>([]);
  const [loading, setLoading] = useState(true);
  const [authResolved, setAuthResolved] = useState(false);
  const [activeEmail, setActiveEmail] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const getLocalOrders = useCallback((email: string): OrderTypes[] => {
    try {
      const raw = localStorage.getItem(`supergear_orders_${email.toLowerCase().trim()}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, []);

  const combineAndSortOrders = useCallback(
    (cloud: OrderTypes[], local: OrderTypes[]): OrderTypes[] => {
      const map = new Map<string, OrderTypes>();
      // Put local first
      local.forEach((o) => {
        if (o?.paymentId) map.set(o.paymentId, o);
      });
      // Cloud overrides/enriches
      cloud.forEach((o) => {
        if (o?.paymentId) map.set(o.paymentId, o);
      });

      const combined = Array.from(map.values());
      return combined.sort((a, b) => {
        if (a?.createdAt && b?.createdAt) {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return 0;
      });
    },
    []
  );

  // Monitor auth status and ensure authStateReady is checked
  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      try {
        if (typeof auth.authStateReady === "function") {
          await auth.authStateReady();
        }
      } catch (e) {
        console.warn("Auth state ready check:", e);
      }

      if (auth.currentUser?.email) {
        if (isMounted) {
          setActiveEmail(auth.currentUser.email.trim().toLowerCase());
          setAuthResolved(true);
        }
        return;
      }

      if (currentUser?.email) {
        if (isMounted) {
          setActiveEmail(currentUser.email.trim().toLowerCase());
          setAuthResolved(true);
        }
        return;
      }

      const unsub = onAuthStateChanged(auth, (user) => {
        if (!isMounted) return;
        const email = (user?.email || currentUser?.email || "").trim().toLowerCase();
        setActiveEmail(email);
        setAuthResolved(true);
      });

      return () => unsub();
    };

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.email]);

  // Real-time Firestore sync with local cache fallback
  useEffect(() => {
    if (!authResolved) return;

    if (!activeEmail) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const localSnapshot = getLocalOrders(activeEmail);
    if (localSnapshot.length > 0) {
      setOrders(localSnapshot);
    }

    const docRef = doc(db, "orders", activeEmail);

    const unsubscribe = onSnapshot(
      docRef,
      async (docSnap) => {
        if (docSnap.exists()) {
          const cloudOrders: OrderTypes[] = docSnap.data()?.orders || [];
          const merged = combineAndSortOrders(cloudOrders, getLocalOrders(activeEmail));
          setOrders(merged);
          setLoading(false);
        } else {
          // Check un-normalized email legacy document if applicable
          try {
            if (currentUser?.email && currentUser.email !== activeEmail) {
              const legacyRef = doc(db, "orders", currentUser.email);
              const legacySnap = await getDoc(legacyRef);
              if (legacySnap.exists()) {
                const legacyOrders: OrderTypes[] = legacySnap.data()?.orders || [];
                const merged = combineAndSortOrders(legacyOrders, getLocalOrders(activeEmail));
                setOrders(merged);
                setLoading(false);
                return;
              }
            }
          } catch (e) {
            console.error(e);
          }
          // If no cloud doc, show local orders
          setOrders(getLocalOrders(activeEmail));
          setLoading(false);
        }
      },
      (error) => {
        console.error("Firestore orders snapshot error:", error);
        // On error (e.g. permission-denied), keep showing local orders
        setOrders(getLocalOrders(activeEmail));
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [activeEmail, authResolved, currentUser?.email, combineAndSortOrders, getLocalOrders]);

  const handleCopy = (paymentId: string) => {
    navigator.clipboard.writeText(paymentId);
    setCopiedId(paymentId);
    toast.success("Tracking number copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleManualRefresh = async () => {
    if (!activeEmail) return;
    setLoading(true);
    try {
      if (typeof auth.authStateReady === "function") {
        await auth.authStateReady();
      }
      const docRef = doc(db, "orders", activeEmail);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const cloudOrders: OrderTypes[] = docSnap.data()?.orders || [];
        const merged = combineAndSortOrders(cloudOrders, getLocalOrders(activeEmail));
        setOrders(merged);
        toast.success("Orders synchronized successfully!");
      } else {
        setOrders(getLocalOrders(activeEmail));
        toast.success("Orders refreshed!");
      }
    } catch (err) {
      console.error(err);
      setOrders(getLocalOrders(activeEmail));
      toast.success("Orders refreshed from local cache!");
    } finally {
      setLoading(false);
    }
  };

  // 1. Loading state
  if (!authResolved || loading) {
    return (
      <Container className="py-20">
        <Loading />
        <p className="text-center text-gray-500 mt-4 text-sm animate-pulse">
          Loading your orders...
        </p>
      </Container>
    );
  }

  // 2. Unauthenticated state
  if (!activeEmail) {
    return (
      <Container className="py-16">
        <div className="max-w-md mx-auto bg-white border border-gray-200 rounded-3xl p-8 text-center shadow-lg space-y-5">
          <div className="w-16 h-16 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center mx-auto text-2xl">
            <FaBoxOpen />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            Sign In to View Orders
          </h2>
          <p className="text-gray-600 text-sm">
            Please log in with the email address used during checkout to view your order history and track shipments.
          </p>
          <Link
            to="/profile"
            className="inline-block w-full py-3 bg-black text-white font-semibold rounded-full hover:bg-gray-800 duration-200 shadow-md"
          >
            Go to Account Login
          </Link>
        </div>
      </Container>
    );
  }

  // 3. Authenticated - Calculate statistics
  const totalSpent = orders.reduce((sum, order) => {
    if (order.totalAmount) return sum + Number(order.totalAmount);
    const itemsTotal = (order?.orderItems || []).reduce(
      (subSum, item) =>
        subSum +
        Number(item?.discountedPrice || item?.regularPrice || 0) *
          Number(item?.quantity || 1),
      0
    );
    return sum + itemsTotal;
  }, 0);

  return (
    <Container className="py-10">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header & Stats Banner */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-widest text-emerald-400 font-bold">
              Account Overview
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Order History & Tracking
            </h1>
            <p className="text-sm text-gray-300">
              Customer:{" "}
              <span className="text-white font-semibold">
                {currentUser?.firstName
                  ? `${currentUser.firstName} ${currentUser?.lastName || ""}`
                  : activeEmail}
              </span>{" "}
              <span className="text-xs text-gray-400">({activeEmail})</span>
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-white/10 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 text-center">
              <span className="block text-xs uppercase tracking-wider text-gray-400">
                Total Orders
              </span>
              <span className="text-2xl font-black text-white">
                {orders?.length}
              </span>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 text-center">
              <span className="block text-xs uppercase tracking-wider text-gray-400">
                Total Spent
              </span>
              <span className="text-2xl font-black text-emerald-400">
                <FormattedPrice amount={totalSpent} />
              </span>
            </div>
            <button
              onClick={handleManualRefresh}
              type="button"
              className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl border border-white/10 transition-colors cursor-pointer"
              title="Refresh Orders"
            >
              <FaSyncAlt className={`text-base ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Orders Listing */}
        {orders && orders.length > 0 ? (
          <div className="space-y-5">
            {orders.map((order: OrderTypes, idx: number) => {
              const totalAmt =
                order?.totalAmount ||
                (order?.orderItems || []).reduce(
                  (acc, item) =>
                    acc +
                    (Number(item?.discountedPrice || item?.regularPrice || 0) *
                      (item?.quantity || 1) || 0),
                  0
                );

              const formattedDate = order?.createdAt
                ? new Date(order.createdAt).toLocaleString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : `Order #${orders.length - idx}`;

              const isCopied = copiedId === order?.paymentId;

              return (
                <Disclosure
                  as="div"
                  key={order?.paymentId || idx}
                  defaultOpen={idx === 0}
                  className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                >
                  {({ open }) => (
                    <>
                      <dt>
                        <DisclosureButton className="w-full p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-left hover:bg-gray-50/75 transition-colors cursor-pointer">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-black text-white flex items-center justify-center text-lg flex-shrink-0 shadow-sm">
                              <FaReceipt />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-gray-900 text-base">
                                  Tracking:
                                </span>
                                <span className="font-mono text-sm font-semibold text-sky-600 max-w-[200px] sm:max-w-xs truncate">
                                  {order?.paymentId}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopy(order?.paymentId);
                                  }}
                                  className="text-gray-400 hover:text-black p-1 transition-colors cursor-pointer"
                                  title="Copy Tracking ID"
                                >
                                  {isCopied ? (
                                    <FaCheck className="text-emerald-600 text-xs" />
                                  ) : (
                                    <FaCopy className="text-xs" />
                                  )}
                                </button>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                <span className="flex items-center gap-1">
                                  <FaCalendarAlt className="text-gray-400 text-[10px]" />
                                  {formattedDate}
                                </span>
                                <span>•</span>
                                <span>{order?.orderItems?.length || 0} item(s)</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4">
                            <div className="text-left sm:text-right">
                              <span className="block text-xs uppercase tracking-wider text-gray-500 font-medium">
                                Total
                              </span>
                              <span className="text-lg font-bold text-gray-900">
                                <FormattedPrice amount={totalAmt} />
                              </span>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full uppercase tracking-wider">
                                {order?.status || "Paid"}
                              </span>
                              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600">
                                {open ? <FaMinus className="text-xs" /> : <FaPlus className="text-xs" />}
                              </div>
                            </div>
                          </div>
                        </DisclosureButton>
                      </dt>

                      <DisclosurePanel as="dd" className="border-t border-gray-100 px-5 sm:px-6 py-5 bg-gray-50/50">
                        <div className="space-y-4">
                          {/* Order Summary Subhead */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-4 rounded-xl border border-gray-200/80 text-xs text-gray-600">
                            <div>
                              <span className="block text-gray-400 uppercase font-semibold">Payment Method</span>
                              <span className="font-bold text-gray-900 capitalize">
                                {order?.paymentMethod || "Stripe"} (Verified)
                              </span>
                            </div>
                            <div>
                              <span className="block text-gray-400 uppercase font-semibold">Date Placed</span>
                              <span className="font-bold text-gray-900">
                                {order?.createdAt
                                  ? new Date(order.createdAt).toLocaleString()
                                  : "Completed"}
                              </span>
                            </div>
                            <div>
                              <span className="block text-gray-400 uppercase font-semibold">Status</span>
                              <span className="font-bold text-emerald-600">
                                Payment Confirmed
                              </span>
                            </div>
                          </div>

                          {/* Items List */}
                          <div className="space-y-3">
                            {order?.orderItems?.map((item: ProductProps, itemIdx: number) => {
                              const imageSrc =
                                Array.isArray(item?.images) && item.images.length > 0
                                  ? item.images[0]
                                  : (item as any)?.image || "";
                              const unitPrice = Number(
                                item?.discountedPrice || item?.regularPrice || 0
                              );
                              const qty = Number(item?.quantity || 1);
                              const subtotal = unitPrice * qty;

                              return (
                                <div
                                  key={item?._id || itemIdx}
                                  className="flex items-center gap-4 bg-white p-4 rounded-xl border border-gray-200/60 shadow-2xs hover:border-gray-300 transition-colors"
                                >
                                  <Link
                                    to={`/product/${item?._id}`}
                                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden flex-shrink-0"
                                  >
                                    {imageSrc ? (
                                      <img
                                        src={imageSrc}
                                        alt={item?.name || "Product"}
                                        className="h-full w-full object-cover hover:scale-105 duration-200"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                                        <FaBoxOpen />
                                      </div>
                                    )}
                                  </Link>

                                  <div className="flex-1 min-w-0">
                                    <Link
                                      to={`/product/${item?._id}`}
                                      className="font-bold text-sm sm:text-base text-gray-900 hover:text-sky-600 transition-colors line-clamp-1"
                                    >
                                      {item?.name}
                                    </Link>
                                    <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                                      {item?.description || item?.category || ""}
                                    </p>

                                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
                                      <span className="text-gray-600">
                                        Quantity: <span className="font-bold text-gray-900">{qty}</span>
                                      </span>
                                      <span className="text-gray-400">•</span>
                                      <span className="text-gray-600">
                                        Price:{" "}
                                        <span className="font-bold text-gray-900">
                                          <FormattedPrice amount={unitPrice} />
                                        </span>
                                      </span>
                                    </div>
                                  </div>

                                  <div className="text-right flex-shrink-0">
                                    <span className="block text-xs text-gray-400 font-medium">Subtotal</span>
                                    <span className="text-sm sm:text-base font-extrabold text-gray-900">
                                      <FormattedPrice amount={subtotal} />
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </DisclosurePanel>
                    </>
                  )}
                </Disclosure>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center shadow-sm space-y-4">
            <div className="w-20 h-20 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mx-auto text-3xl">
              <FaBoxOpen />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">No Orders Placed Yet</h2>
            <p className="text-gray-600 max-w-md mx-auto text-sm">
              Your order history is currently empty. Complete checkout for any products and your tracking details will appear here immediately.
            </p>
            <div className="pt-2">
              <Link
                to="/product"
                className="inline-block px-8 py-3 bg-black text-white font-semibold rounded-full hover:bg-gray-800 duration-200 shadow-md"
              >
                Start Shopping
              </Link>
            </div>
          </div>
        )}
      </div>
    </Container>
  );
};

export default Orders;