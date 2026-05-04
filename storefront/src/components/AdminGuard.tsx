"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchMe, hasAdminAccessCode, validateAdminAccessCode, type AuthUser } from "@/lib/auth";

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
  const [accessCode, setAccessCode] = useState("");
  const [accessError, setAccessError] = useState<string | null>(null);
  const [codeValidated, setCodeValidated] = useState(() => hasAdminAccessCode());

  useEffect(() => {
    if (!codeValidated) {
      setLoading(false);
      return;
    }

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
  }, [router, codeValidated]);

  function handleCodeSubmit(event: React.FormEvent) {
    event.preventDefault();
    setAccessError(null);
    if (validateAdminAccessCode(accessCode.trim())) {
      setCodeValidated(true);
      setLoading(true);
      setAccessCode("");
      return;
    }
    setAccessError("Invalid admin access code. Please try again.");
  }

  if (!codeValidated) {
    return (
      <section className="card">
        <div className="cardBody">
          <div className="pill">Admin Access</div>
          <h1 className="title">Enter admin secret code</h1>
          <p className="subtitle">This admin area requires a secret passcode to proceed.</p>
          <form onSubmit={handleCodeSubmit} className="authForm">
            <label>
              <span>Secret Code</span>
              <input
                type="password"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                required
                autoFocus
              />
            </label>
            <button className="btn" type="submit">
              Unlock Admin
            </button>
            {accessError ? <p className="subtitle">{accessError}</p> : null}
          </form>
        </div>
      </section>
    );
  }

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
