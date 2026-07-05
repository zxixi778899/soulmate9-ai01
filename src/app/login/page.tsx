"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useTranslation } from "@/lib/i18n/context";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { supabase, user, isLoading } = useAuth();
  const { t } = useTranslation();
  useEffect(() => {
    if (!isLoading && user) {
      window.location.href = "/gallery";
    }
  }, [user, isLoading]);
  async function handleLogin(e) {
    if (e && e.preventDefault) e.preventDefault();
    setLoading(true);
    setError("");
    if (!supabase) {
      setError("Service temporarily unavailable. Please refresh.");
      setLoading(false);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    window.location.href = "/gallery";
  }
  return (
    <main style={{padding: 32}}>
      <h1>Login</h1>
      <form onSubmit={handleLogin}>
        <p>
          <label>Email: <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        </p>
        <p>
          <label>Password: <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        </p>
        {error && <p style={{color: "red"}}>{error}</p>}
        <button type="submit" disabled={loading}>{loading ? "..." : "Sign in"}</button>
      </form>
      <p>No account? <a href="/register">Register</a></p>
    </main>
  );
}
