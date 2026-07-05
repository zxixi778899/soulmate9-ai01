"use client";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useTranslation } from "@/lib/i18n/context";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [agree, setAgree] = useState(false);
  const { supabase } = useAuth();
  const { t } = useTranslation();
  async function handleRegister(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, username }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
        setLoading(false);
        return;
      }
      if (data.auto_signin_error) {
        setError(data.auto_signin_error);
        setLoading(false);
        return;
      }
      if (!supabase) {
        setError("Service temporarily unavailable. Please refresh.");
        setLoading(false);
        return;
      }
      await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      window.location.href = "/gallery";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setLoading(false);
    }
  }
  return (
    <main style={{padding: 32}}>
      <h1>Register</h1>
      <form onSubmit={handleRegister}>
        <p>
          <label>Username: <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required /></label>
        </p>
        <p>
          <label>Email: <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        </p>
        <p>
          <label>Password: <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /></label>
        </p>
        <p>
          <label><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I agree to terms</label>
        </p>
        {error && <p style={{color: "red"}}>{error}</p>}
        <button type="submit" disabled={loading || !agree}>{loading ? "..." : "Register"}</button>
      </form>
      <p>Have an account? <a href="/login">Login</a></p>
    </main>
  );
}
