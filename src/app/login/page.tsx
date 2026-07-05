"use client";
import { useState } from "react";
import { SOULMATE_BUILD_ID } from "@/lib/supabase";
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  async function handleLogin() {
    // Reference build ID so Turbopack keeps the import (forces fresh chunk hash)
    if (!SOULMATE_BUILD_ID) return;
    const mod = await import("@/components/AuthProvider");
    const supabase = mod.useAuth?.()?.supabase;
    if (!supabase) return;
    const r = await supabase.auth.signInWithPassword({ email, password });
    if (r.error) { alert(r.error.message); return; }
    window.location.href = "/gallery";
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="text-2xl font-bold mb-4">Sign In</h1>
      <form onSubmit={(ev) => { ev.stopPropagation(); handleLogin(); }} className="w-full max-w-sm space-y-3">
        <input type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="Email" required className="w-full p-2 border rounded" />
        <input type="password" value={password} onChange={(ev) => setPassword(ev.target.value)} placeholder="Password" required className="w-full p-2 border rounded" />
        <button type="submit" className="w-full p-2 bg-blue-500 t