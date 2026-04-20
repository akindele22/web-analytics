"use client";

export type AuthUser = {
  user_id: string;
  name: string;
  email: string;
  gender?: string | null;
  role?: string | null;
};

// Get API base with fallback and better error messaging
const API_BASE = (() => {
  const base = (process.env.NEXT_PUBLIC_API_BASE || "").trim().replace(/\/+$/, "");
  if (!base) {
    console.error("⚠️ NEXT_PUBLIC_API_BASE is not configured. Auth will fail.");
    console.error("Please add NEXT_PUBLIC_API_BASE=http://localhost:8000 to .env.local");
  }
  return base;
})();

const PROFILE_KEY = "ea_user_profile";

export function readProfile(): AuthUser | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function writeProfile(user: AuthUser | null) {
  if (!user) {
    localStorage.removeItem(PROFILE_KEY);
    return;
  }
  localStorage.setItem(PROFILE_KEY, JSON.stringify(user));
  localStorage.setItem("ea_user_id", user.user_id);
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  gender?: string;
  role?: string;
}): Promise<AuthUser> {
  if (!API_BASE) {
    throw new Error("API base URL not configured. Check NEXT_PUBLIC_API_BASE in .env.local");
  }

  const url = `${API_BASE}/api/auth/register`;
  console.log("Registering user at:", url);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Registration failed:", response.status, errorText);
      throw new Error(errorText || `Registration failed with status ${response.status}`);
    }

    const data = (await response.json()) as { ok: boolean; user: AuthUser };
    if (!data.user) {
      throw new Error("Invalid response: missing user data");
    }

    writeProfile(data.user);
    return data.user;
  } catch (error) {
    if (error instanceof TypeError) {
      console.error("Network error - is the backend running?", error);
      throw new Error("Cannot connect to backend. Is it running on " + API_BASE + "?");
    }
    throw error;
  }
}

export async function loginUser(input: { email: string; password: string }): Promise<AuthUser> {
  if (!API_BASE) {
    throw new Error("API base URL not configured. Check NEXT_PUBLIC_API_BASE in .env.local");
  }

  const url = `${API_BASE}/api/auth/login`;
  console.log("Logging in at:", url);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Login failed:", response.status, errorText);
      throw new Error(errorText || `Login failed with status ${response.status}`);
    }

    const data = (await response.json()) as { ok: boolean; user: AuthUser };
    if (!data.user) {
      throw new Error("Invalid response: missing user data");
    }

    writeProfile(data.user);
    return data.user;
  } catch (error) {
    if (error instanceof TypeError) {
      console.error("Network error - is the backend running?", error);
      throw new Error("Cannot connect to backend. Is it running on " + API_BASE + "?");
    }
    throw error;
  }
}

export async function logoutUser(): Promise<void> {
  if (!API_BASE) return;
  try {
    await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
  } catch (error) {
    console.error("Logout error:", error);
  }
  writeProfile(null);
}

export async function fetchMe(): Promise<AuthUser | null> {
  if (!API_BASE) return null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { user: AuthUser | null };
    if (data.user) writeProfile(data.user);
    return data.user;
  } catch (error) {
    console.error("fetchMe error:", error);
    return null;
  }
}
