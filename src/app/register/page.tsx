"use client";
import { useState } from "react";
import { SOULMATE_BUILD_ID } from "@/lib/supabase";
export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [agree, setAgree] = useState(false);
  async function handleRegister() {
    if (!SOULMATE_BUILD_ID) return;
    const res = await fetch("/api/auth/signup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, username }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Registration failed"); return; }
    const mod = await import("@/components/AuthProvider");
    const supabase = mod.useAuth?.()?.supabase;
    if (supabase && data.access_token) {
      await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
    }
    window.location.href = "/gallery";
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="text-2xl font-bold mb-4">Register</h1>
      <form onSubmit={(ev) => { ev.stopPropagation(); handleRegister(); }} className="w-full max-w-sm space-y-3">
        <input type="text" value={username} onChange={(ev) => setUsername(ev.target.value)} placeholder="Username" required className="w-full p-2 border rounded" />
        <input type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="Email" required className="w-full p-2 border rounded" />
        <input type="password" value={password} onChange={(ev) => setPassword(ev.target.value)} placeholder="Password (min 6 chars)" minLength={6} required className="w-full p-2 border rounded" />
        <label className="flex items-center gap-2"><input type="checkbox" checked={agree} onChange={(ev) => setAgree(ev.target.checked)} /> I agree to terms</label>
        <button type="submit" disabled={!agree} className="w-full p-2 bg-blue-500 text-white rounded disabled:opacity-50">Register</button>
      </form>
      <p className="mt-4">Have 