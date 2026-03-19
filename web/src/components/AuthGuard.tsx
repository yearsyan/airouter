import { useState, useEffect } from "react";
import LoginPage from "../pages/LoginPage";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<"loading" | "ok" | "login">("loading");

  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((data) => {
        if (!data.enabled || data.authenticated) {
          setStatus("ok");
        } else {
          setStatus("login");
        }
      })
      .catch(() => setStatus("ok")); // If auth endpoint fails, allow access
  }, []);

  if (status === "loading") {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-secondary)",
        }}
      />
    );
  }

  if (status === "login") {
    return <LoginPage onSuccess={() => setStatus("ok")} />;
  }

  return <>{children}</>;
}
