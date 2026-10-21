import { doc, getDoc } from "firebase/firestore";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { db } from "./firebase";
import type { ProductProps } from "../../type";


interface CartProduct extends ProductProps {
  quantity: number;
}

interface UserType {
  firstName: string;
  lastName: string;
  password: string;
  email: string;
  avatar: string;
  id: string;
}

interface StoreType {
  // user
  currentUser: UserType | null;
  isLoading: boolean;
  setCurrentUser: (user: UserType | null) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getUserInfo: (uid: any) => Promise<void>;
  logout: () => Promise<void>;
  // cart
  cartProduct: CartProduct[];
  addToCart: (product: ProductProps) => Promise<void>;
  decreaseQuantity: (productId: number) => void;
  removeFromCart: (productId: number) => void;
  resetCart: () => void;
  // // favorite
  favoriteProduct: CartProduct[];
  addToFavorite: (product: ProductProps) => Promise<void>;
  removeFromFavorite: (productId: number) => void;
  resetFavorite: () => void;
}

const customStorage = {
  getItem: (name: string) => {
    const item = localStorage.getItem(name);
    return item ? JSON.parse(item) : null;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setItem: (name: string, value: any) => {
    localStorage.setItem(name, JSON.stringify(value));
  },
  removeItem: (name: string) => {
    localStorage.removeItem(name);
  },
};
export const store = create<StoreType>()(
  persist(
    (set) => ({
      currentUser: null,
      isLoading: true,
      cartProduct: [],
      favoriteProduct: [],

      setCurrentUser: (user: UserType | null) => set({ currentUser: user }),

      logout: async () => {
        try {
          const { auth } = await import("./firebase");
          await auth.signOut();
        } catch (e) {
          console.error("Sign out error", e);
        }
        set({ currentUser: null });
      },

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getUserInfo: async (uid: any) => {
        if (!uid) {
          set({ currentUser: null, isLoading: false });
          return;
        }

        try {
          const { auth } = await import("./firebase");
          const docRef = doc(db, "users", uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data() as UserType;
            set({
              currentUser: {
                ...data,
                avatar: data.avatar || auth.currentUser?.photoURL || "",
              },
              isLoading: false,
            });
          } else {
            if (auth.currentUser) {
              const u = auth.currentUser;
              const names = (u.displayName || "").split(" ");
              set((state) => ({
                currentUser: state.currentUser || {
                  id: u.uid,
                  email: u.email || "",
                  firstName: names[0] || "",
                  lastName: names.slice(1).join(" ") || "",
                  avatar: u.photoURL || "",
                  password: "",
                },
                isLoading: false,
              }));
            } else {
              set({ currentUser: null, isLoading: false });
            }
          }
        } catch (error) {
          console.log("getUserInfo error (retaining current user session):", error);
          const { auth } = await import("./firebase");
          if (auth.currentUser) {
            const u = auth.currentUser;
            const names = (u.displayName || "").split(" ");
            set((state) => ({
              currentUser: state.currentUser && state.currentUser.id === u.uid
                ? state.currentUser
                : {
                    id: u.uid,
                    email: u.email || "",
                    firstName: names[0] || "",
                    lastName: names.slice(1).join(" ") || "",
                    avatar: u.photoURL || "",
                    password: "",
                  },
              isLoading: false,
            }));
          } else {
            set({ isLoading: false });
          }
        }
      },
      addToCart: (product: ProductProps) => {
        return new Promise<void>((resolve) => {
          set((state: StoreType) => {
            const existingProduct = state.cartProduct.find(
              (p) => p._id === product._id
            );

            if (existingProduct) {
              return {
                cartProduct: state.cartProduct.map((p) =>
                  p._id === product._id
                    ? { ...p, quantity: (p.quantity || 0) + 1 }
                    : p
                ),
              };
            } else {
              return {
                cartProduct: [
                  ...state.cartProduct,
                  { ...product, quantity: 1 },
                ],
              };
            }
          });
          resolve();
        });
      },
      decreaseQuantity: (productId: number) => {
        set((state: StoreType) => {
          const existingProduct = state.cartProduct.find(
            (p) => p._id === productId
          );

          if (existingProduct) {
            return {
              cartProduct: state.cartProduct.map((p) =>
                p._id === productId
                  ? { ...p, quantity: Math.max(p.quantity - 1, 1) }
                  : p
              ),
            };
          } else {
            return state;
          }
        });
      },
      removeFromCart: (productId: number) => {
        set((state: StoreType) => ({
          cartProduct: state.cartProduct.filter(
            (item) => item._id !== productId
          ),
        }));
      },
      resetCart: () => {
        set({ cartProduct: [] });
      },
      addToFavorite: (product: ProductProps) => {
        return new Promise<void>((resolve) => {
          set((state: StoreType) => {
            const isFavorite = state.favoriteProduct.some(
              (item) => item._id === product._id
            );
            return {
              favoriteProduct: isFavorite
                ? state.favoriteProduct.filter(
                    (item) => item._id !== product._id
                  )
                : [...state.favoriteProduct, { ...product }],
            };
          });
          resolve();
        });
      },

      removeFromFavorite: (productId: number) => {
        set((state: StoreType) => ({
          favoriteProduct: state.favoriteProduct.filter(
            (item) => item._id !== productId
          ),
        }));
      },
      resetFavorite: () => {
        set({ favoriteProduct: [] });
      },
    }),
    {
      name: "supergear-storage",
      storage: customStorage,
    }
  )
);