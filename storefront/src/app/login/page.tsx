"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PageTracker from "@/components/PageTracker";
import { loginUser, registerUser } from "@/lib/auth";
import { TrackedLink } from "@/components/TrackedLink";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const user = mode === "register"
        ? await registerUser({ name, email, password, gender, role })
        : await loginUser({ email, password });

      const destination = user?.role === "admin" ? "/admin" : "/store";
      router.replace(destination);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to authenticate.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTracker />
      <section className="card authCard">
        <div className="cardBody">
          <div className="pill">User Access</div>
          <h1 className="title">{mode === "register" ? "Create account" : "Sign in"}</h1>
          <p className="subtitle">
            Admin pages require an admin account. Standard users can browse the store and checkout.
          </p>

          <div className="authTabs">
            <button className={`btn ${mode === "login" ? "" : "btnMuted"}`} onClick={() => setMode("login")} type="button">
              Login
            </button>
            <button className={`btn ${mode === "register" ? "" : "btnMuted"}`} onClick={() => setMode("register")} type="button">
              Register
            </button>
          </div>

          <form className="authForm" onSubmit={handleSubmit}>
            {mode === "register" ? (
              <>
                <label>
                  <span>Name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} required />
                </label>
                <label>
                  <span>Gender</span>
                  <input value={gender} onChange={(e) => setGender(e.target.value)} placeholder="Optional" />
                </label>
                <label>
                  <span>Account Type</span>
                  <select value={role} onChange={(e) => setRole(e.target.value as "user" | "admin")}>
                    <option value="user">Standard User (Browse & Checkout)</option>
                    <option value="admin">Admin (KPI Dashboard Access)</option>
                  </select>
                </label>
              </>
            ) : null}
            <label>
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              <span>Password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Working..." : mode === "register" ? "Create Account" : "Login"}
            </button>
          </form>

          {message ? <p className="subtitle">{message}</p> : null}

          <div className="authSectionDivider">
            <span>Or explore without signing in</span>
          </div>

          <div className="authLinks">
            <TrackedLink href="/store" className="btn btnSecondary authLinkBtn" eventLabel="login_go_store">
              🛍️ Continue to Store
            </TrackedLink>
            <TrackedLink href="/admin" className="btn btnSecondary authLinkBtn" eventLabel="login_go_admin">
              📊 Go to Admin
            </TrackedLink>
          </div>
        </div>
      </section>
    </>
  );
}
