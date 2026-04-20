"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchMe } from "@/lib/auth";

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const user = await fetchMe();
      if (!user || user.role !== "admin") {
        router.replace("/login");
        setAuthorized(false);
      } else {
        setAuthorized(true);
      }
      setLoading(false);
    }
    void checkAuth();
  }, [router]);

  if (loading) {
    return (
      <section className="card">
        <div className="cardBody">
          <h1 className="title">Loading...</h1>
        </div>
      </section>
    );
  }

  if (!authorized) {
    return null;
  }

  return <>{children}</>;
}
