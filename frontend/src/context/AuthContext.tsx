import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  getAuthToken,
  getStoredUserData,
  removeAuthToken,
  setAuthToken,
  getPanelFromContext,
} from "../services/api/config";

interface User {
  id: string;
  userType?: "Admin" | "Seller" | "Customer" | "Delivery";
  [key: string]: any;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  login: (token: string, userData: User) => void;
  logout: () => void;
  updateUser: (userData: User) => void;
  /** Re-reads auth state for whichever panel the given pathname belongs to.
   *  AuthProvider sits above BrowserRouter (so it can't use useLocation()
   *  itself) and otherwise only computes its panel once at initial mount —
   *  without this, a client-side navigation between panels (e.g. Customer ->
   *  Delivery) without a full page reload leaves isAuthenticated/user/token
   *  stuck referencing the panel that was active on first load. Called from
   *  AuthPanelSync, a tiny component rendered inside BrowserRouter. */
  resyncPanel: (pathname: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const inferLegacyUserType = (
  userData: Record<string, any>,
): User["userType"] | undefined => {
  if (!userData || typeof userData !== "object") {
    return undefined;
  }

  if (userData.userType) {
    return userData.userType;
  }

  if (userData.role === "Admin" || userData.role === "Super Admin") {
    return "Admin";
  }

  if (userData.storeName || userData.sellerName) {
    return "Seller";
  }

  if (
    userData.mobile &&
    userData.city &&
    userData.status &&
    !userData.phone &&
    !userData.storeName &&
    !userData.sellerName &&
    !userData.role
  ) {
    return "Delivery";
  }

  if (userData.phone || userData.walletAmount !== undefined || userData.refCode) {
    return "Customer";
  }

  return undefined;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const currentPanel = getPanelFromContext(undefined, typeof window !== "undefined" ? window.location.pathname : "");

  // Initialize state synchronously from role-isolated localStorage
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const storedToken = getAuthToken(currentPanel);
    const storedUser = getStoredUserData(currentPanel);
    return !!(storedToken && storedUser);
  });

  const [user, setUser] = useState<User | null>(() => {
    const storedUser = getStoredUserData(currentPanel);
    if (storedUser) {
      const inferredUserType = inferLegacyUserType(storedUser);
      if (inferredUserType && !storedUser.userType) {
        storedUser.userType = inferredUserType;
      }
      return storedUser;
    }
    return null;
  });

  const [token, setToken] = useState<string | null>(() => {
    return getAuthToken(currentPanel);
  });

  // Effect to sync state if localStorage changes externally or on mount validation
  useEffect(() => {
    const panel = getPanelFromContext(user?.userType, window.location.pathname);
    const storedToken = getAuthToken(panel);
    const storedUser = getStoredUserData(panel);

    if (storedToken && storedUser) {
      const inferredUserType = inferLegacyUserType(storedUser);
      if (inferredUserType && !storedUser.userType) {
        storedUser.userType = inferredUserType;
      }

      if (!isAuthenticated || token !== storedToken || JSON.stringify(user) !== JSON.stringify(storedUser)) {
        setToken(storedToken);
        setUser(storedUser);
        setIsAuthenticated(true);
      }

      // Ensure FCM token is registered with backend
      import("../services/pushNotificationService").then(({ registerFCMToken }) => {
        registerFCMToken(true).catch(() => {});
      });
    } else if (isAuthenticated && !storedToken) {
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
    }
  }, [currentPanel]);

  const login = (newToken: string, userData: User) => {
    const inferredType = inferLegacyUserType(userData);
    const userType = userData.userType || inferredType;
    const fullUser = { ...userData, ...(userType && { userType }) };

    setToken(newToken);
    setUser(fullUser);
    setIsAuthenticated(true);
    setAuthToken(newToken, userType, fullUser);

    // Register FCM token for push notifications after successful login (silently)
    import("../services/pushNotificationService").then(({ registerFCMToken }) => {
      registerFCMToken(true).catch((error) => {
        console.error("Failed to register FCM token:", error);
      });
    });
  };

  const logout = () => {
    const userType = user?.userType || getPanelFromContext(undefined, window.location.pathname);
    const currentAuthToken = token || getAuthToken(userType);

    // Remove FCM token association from backend on logout before clearing auth
    if (currentAuthToken) {
      import("../services/pushNotificationService").then(({ removeFCMToken }) => {
        removeFCMToken(userType, currentAuthToken).catch((error) => {
          console.error("Failed to remove FCM token on logout:", error);
        });
      });
    }

    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    removeAuthToken(userType);
  };

  const updateUser = (userData: User) => {
    const userType = userData.userType || user?.userType || inferLegacyUserType(userData);
    const fullUser = { ...userData, ...(userType && { userType }) };
    setUser(fullUser);
    setAuthToken(token || getAuthToken(userType) || '', userType, fullUser);
  };

  const resyncPanel = (pathname: string) => {
    const panel = getPanelFromContext(undefined, pathname);
    const storedToken = getAuthToken(panel);
    const storedUser = getStoredUserData(panel);

    if (storedToken && storedUser) {
      const inferredUserType = inferLegacyUserType(storedUser);
      if (inferredUserType && !storedUser.userType) {
        storedUser.userType = inferredUserType;
      }

      if (token !== storedToken || JSON.stringify(user) !== JSON.stringify(storedUser)) {
        setToken(storedToken);
        setUser(storedUser);
        setIsAuthenticated(true);
      }
    } else if (!storedToken && (token || isAuthenticated)) {
      // This panel has no session of its own — don't keep showing another
      // panel's auth state as if it belonged here.
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        token,
        login,
        logout,
        updateUser,
        resyncPanel,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

