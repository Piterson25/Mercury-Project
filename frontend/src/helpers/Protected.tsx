import { createContext, useContext, useEffect } from "react";

import User from "../models/User";
import { useUser } from "./UserContext";

export interface ProtectedContextValue {
  user: User;
}

const ProtectedContext = createContext<ProtectedContextValue | null>(null);

function useProtected() {
  const context = useContext(ProtectedContext);
  if (!context) {
    throw new Error("useProtected must be used within a Protected tag");
  }

  return context;
}

export interface ProtectedProps {
  loadingElement?: React.ReactNode;
  children: React.ReactNode;
}

function Protected({ loadingElement, children }: ProtectedProps) {
  const { userState, redirectToLogin } = useUser();

  useEffect(() => {
    if (userState.status == "anonymous") {
      redirectToLogin();
    }
  }, [userState]);

  if (userState.status != "logged_in") {
    return loadingElement;
  }

  return (
    <ProtectedContext.Provider
      value={{
        user: userState.user,
      }}
    >
      {children}
    </ProtectedContext.Provider>
  );
}

export { useProtected };
export default Protected;
