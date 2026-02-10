"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const BRAND = "#ff006e";

  // Respect ?mode=register
  useEffect(() => {
    const qMode = searchParams.get("mode");
    if (qMode === "register") setMode("register");
  }, [searchParams]);

  // Check existing session
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          router.replace("/analyze");
        }
      } catch (err) {
        console.error("checkSession error", err);
      }
    };
    checkSession();
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const endpoint =
        mode === "login" ? "/api/auth/login" : "/api/auth/register";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }

      if (mode === "register") {
        setSuccess("Registration successful. You can now log in.");
        setMode("login");
        setPassword("");
        return;
      }

      router.replace("/analyze");
    } catch (err) {
      console.error("Login/register error", err);
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next) => {
    if (next === mode) return;
    setError("");
    setSuccess("");
    setPassword("");
    setMode(next);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      {/* Samurai / THC panel sits on top of your global gradient */}
      <div className="samurai-card w-full max-w-md">
        {/* Title + tagline */}
        <div className="text-center mb-6">
          <h1
            className="text-2xl font-bold text-glow"
            style={{ color: BRAND }}
          >
            THC Edge
          </h1>
          <p className="mt-1 text-xs text-zinc-300">
            Sign in to access the analyzer.
          </p>
        </div>

        {/* Toggle: Login / Register */}
        <div className="mb-6">
          <div className="flex text-sm rounded-full bg-black/70 border border-white/10 overflow-hidden">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`flex-1 py-2 transition-colors ${
                mode === "login"
                  ? "font-semibold text-black"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
              style={
                mode === "login"
                  ? {
                      background:
                        "linear-gradient(90deg, #ff006e, #ff2d8b)",
                    }
                  : undefined
              }
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`flex-1 py-2 transition-colors ${
                mode === "register"
                  ? "font-semibold text-black"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
              style={
                mode === "register"
                  ? {
                      background:
                        "linear-gradient(90deg, #ff006e, #ff2d8b)",
                    }
                  : undefined
              }
            >
              Register
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-900/30 border border-red-700 rounded-md px-3 py-2">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 text-sm text-emerald-300 bg-emerald-900/30 border border-emerald-700 rounded-md px-3 py-2">
            {success}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div>
            <label className="block mb-1 text-xs font-medium text-zinc-300">
              Username
            </label>
            <input
              type="text"
              className="w-full text-sm"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          {/* Password + Show/Hide */}
          <div>
            <label className="block mb-1 text-xs font-medium text-zinc-300">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className="w-full text-sm pr-20"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-3 flex items-center text-xs text-zinc-300 hover:text-white"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {/* Primary action – uses your thc-btn style */}
          <button
            type="submit"
            disabled={loading}
            className="thc-btn w-full mt-2 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading
              ? mode === "login"
                ? "Logging in..."
                : "Registering..."
              : "Login"}
          </button>
        </form>

        {/* Small footer text */}
        <p className="mt-3 text-[10px] text-zinc-400 text-center leading-snug">
          After logging in, you still enter your Torn API key inside the app.
          Passwords are hashed (bcrypt) and session cookies are signed with a
          256-bit secret.
        </p>

        {/* Mode switch link at bottom */}
        <button
          type="button"
          onClick={() =>
            switchMode(mode === "login" ? "register" : "login")
          }
          className="mt-4 w-full text-xs text-zinc-300 hover:text-white underline underline-offset-4 text-center"
        >
          {mode === "login"
            ? "Need an account? Register"
            : "Already registered? Login"}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
