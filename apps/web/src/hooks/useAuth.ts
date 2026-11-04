"use client";

import { useContext } from "react";
import {
  AuthContext,
  AuthUser,
  AuthContextType,
} from "@/providers/AuthProvider";

export type { AuthUser, AuthContextType };

const fallbackContext: AuthContextType = {
  user: null,
  roles: [],
  hasRole: () => false,
  isAuthed: false,
  loading: true,
  logout: () => {},
  refreshUser: async () => {},
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("useAuth must be used within an AuthProvider. Using fallback empty auth state.");
    }
    return fallbackContext;
  }
  return context;
}
