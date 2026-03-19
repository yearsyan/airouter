import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import ThemeSwitcher from "../components/ThemeSwitcher";
import LangSwitcher from "../components/LangSwitcher";

const OTP_TTL = 30;

export default function LoginPage({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const codeRef = useRef<HTMLInputElement>(null);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [countdown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSendOtp = useCallback(async () => {
    if (!username.trim() || sending || countdown > 0) return;
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "invalid username"
            ? t("auth.invalidUsername")
            : t("auth.sendFailed"),
        );
        return;
      }
      setCountdown(OTP_TTL);
      setCode("");
      setTimeout(() => codeRef.current?.focus(), 100);
    } catch {
      setError(t("auth.sendFailed"));
    } finally {
      setSending(false);
    }
  }, [username, sending, countdown, t]);

  const handleVerify = useCallback(async () => {
    if (!username.trim() || !code.trim() || verifying) return;
    setError("");
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          code: code.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(t("auth.invalidCode"));
        return;
      }
      if (data.ok) {
        onSuccess();
      }
    } catch {
      setError(t("auth.invalidCode"));
    } finally {
      setVerifying(false);
    }
  }, [username, code, verifying, t, onSuccess]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (code.trim().length === 6) {
        handleVerify();
      } else if (!countdown && username.trim()) {
        handleSendOtp();
      }
    }
  };

  return (
    <div className="login-page">
      <div className="login-card" onKeyDown={handleKeyDown}>
        <div className="login-header">
          <h1 className="login-title">airouter</h1>
          <p className="login-subtitle">{t("auth.title")}</p>
        </div>

        <div className="login-form">
          <div className="login-field">
            <label>{t("auth.username")}</label>
            <div className="login-input-row">
              <input
                type="text"
                className="login-input"
                placeholder={t("auth.usernamePlaceholder")}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
              <button
                className="btn-send-otp"
                onClick={handleSendOtp}
                disabled={!username.trim() || sending || countdown > 0}
              >
                {countdown > 0
                  ? `${t("auth.codeSent")} (${countdown}s)`
                  : t("auth.sendCode")}
              </button>
            </div>
          </div>

          <div className="login-field">
            <label>{t("auth.code")}</label>
            <input
              ref={codeRef}
              type="text"
              className="login-input login-input-code"
              placeholder={t("auth.codePlaceholder")}
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(v);
              }}
              maxLength={6}
              inputMode="numeric"
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            className="btn-login"
            onClick={handleVerify}
            disabled={
              verifying || !username.trim() || code.trim().length !== 6
            }
          >
            {t("auth.login")}
          </button>
        </div>

        <div className="login-footer">
          <LangSwitcher />
          <ThemeSwitcher />
        </div>
      </div>
    </div>
  );
}
