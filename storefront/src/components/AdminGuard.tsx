"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchMe, type AuthUser } from "@/lib/auth";

type AdminGuardProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

/**
 * AdminGuard wraps pages/components that require admin role.
 * Redirects non-admin users to /login.
 * Shows fallback content while checking authentication.
 */
export default function AdminGuard({ children, fallback }: AdminGuardProps) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    async function checkAdmin() {
      const me = await fetchMe();
      setUser(me);
      if (!me || me.role !== "admin") {
        setAuthorized(false);
        router.replace("/login");
      } else {
        setAuthorized(true);
      }
      setLoading(false);
    }
    void checkAdmin();
  }, [router]);

  if (loading) {
    return fallback || <div className="card"><div className="cardBody">Loading...</div></div>;
  }

  if (!authorized) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Hook to check admin status in components
 */
export function useAdminCheck() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      const me = await fetchMe();
      setUser(me);
      setLoading(false);
    }
    void check();
  }, []);

  return {
    isAdmin: user?.role === "admin",
    user,
    loading,
  };
}
