"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GoogleLogin } from "@react-oauth/google";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Code2,
  Loader2,
  Lock,
  Mail,
  User,
  ArrowRight,
  CheckCircle2,
  IdCard,
  UserCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AuthField, AuthPasswordField } from "@/components/auth/AuthField";

/* ---------- Floating illustration for the promo panel ---------- */
function PromoArt() {
  return (
    <div className="relative mb-10 flex items-center justify-center">
      <div className="relative flex h-40 w-40 items-center justify-center rounded-3xl bg-white/15 backdrop-blur-sm ring-1 ring-white/30 shadow-2xl">
        <UserCircle2 className="h-24 w-24 text-white/90" strokeWidth={1.4} />
      </div>
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -right-2 top-2 flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-emerald-600 shadow-lg"
      >
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        Verified
      </motion.div>
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
        className="absolute -left-2 bottom-2 flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-violet-600 shadow-lg"
      >
        <IdCard className="h-4 w-4 text-violet-500" />
        ID
      </motion.div>
    </div>
  );
}

/* ---------- Login form ---------- */
function LoginForm(props: {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  remember: boolean;
  setRemember: (v: boolean) => void;
  error: string;
  loading: boolean;
  onSwitch: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onGoogle: (r: { credential?: string }) => void;
  setError: (v: string) => void;
}) {
  return (
    <>
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-600/30">
          <Code2 className="h-6 w-6" />
        </span>
        <span className="text-2xl font-extrabold tracking-tight text-zinc-900">
          Code Candy
        </span>
      </div>

      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600">
          Your workspace awaits
        </p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-zinc-900">
          Welcome back
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Sign in to continue to your account.
        </p>
      </div>

      <form onSubmit={props.onSubmit} className="space-y-5">
        {props.error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-200">
            {props.error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email" className="text-zinc-700">Email address</Label>
          <AuthField
            id="email"
            type="email"
            icon={Mail}
            placeholder="you@company.com"
            required
            value={props.email}
            onChange={(e) => props.setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-zinc-700">Password</Label>
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-violet-600 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <AuthPasswordField
            id="password"
            icon={Lock}
            placeholder="Enter your password"
            required
            value={props.password}
            onChange={(e) => props.setPassword(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={props.remember}
              onChange={(e) => props.setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
            />
            Remember me
          </label>
        </div>

        <Button
          type="submit"
          disabled={props.loading}
          className="h-12 w-full rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-base font-semibold text-white shadow-lg shadow-violet-600/30 transition-all hover:from-violet-500 hover:to-purple-500 hover:shadow-xl disabled:opacity-50"
        >
          {props.loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
          Sign in
        </Button>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-zinc-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-3 text-zinc-400">or continue with</span>
          </div>
        </div>

        <GoogleLogin
          onSuccess={props.onGoogle}
          onError={() => props.setError("Đăng nhập Google thất bại")}
          useOneTap={false}
          theme="outline"
          shape="rectangular"
          width="100%"
        />
      </form>

      {/* Mobile-only switch (desktop uses the sliding panel) */}
      <p className="mt-6 text-center text-sm text-zinc-500 lg:hidden">
        New here?{" "}
        <button
          type="button"
          onClick={props.onSwitch}
          className="font-semibold text-violet-600 hover:underline"
        >
          Create account
        </button>
      </p>
    </>
  );
}

/* ---------- Register form ---------- */
function RegisterForm(props: {
  error: string;
  onSwitch: () => void;
  onGoogle: (r: { credential?: string }) => void;
  setError: (v: string) => void;
}) {
  return (
    <>
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-600/30">
          <Code2 className="h-6 w-6" />
        </span>
        <span className="text-2xl font-extrabold tracking-tight text-zinc-900">
          Code Candy
        </span>
      </div>

      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600">
          Make it yours
        </p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-zinc-900">
          Create your account
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Sign up to start building your workspace.
        </p>
      </div>

      <div className="space-y-5">
        {props.error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-200">
            {props.error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="name" className="text-zinc-700">Full name</Label>
          <AuthField id="name" type="text" icon={User} placeholder="Nguyễn Văn A" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-zinc-700">Email address</Label>
          <AuthField id="email" type="email" icon={Mail} placeholder="you@company.com" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-zinc-700">Password</Label>
          <AuthPasswordField id="password" icon={Lock} placeholder="Enter your password" />
        </div>

        <Button
          type="button"
          className="h-12 w-full rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-base font-semibold text-white shadow-lg shadow-violet-600/30 transition-all hover:from-violet-500 hover:to-purple-500 hover:shadow-xl"
        >
          Create account
        </Button>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-zinc-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-3 text-zinc-400">or continue with</span>
          </div>
        </div>

        <GoogleLogin
          onSuccess={props.onGoogle}
          onError={() => props.setError("Đăng nhập Google thất bại")}
          useOneTap={false}
          theme="outline"
          shape="rectangular"
          width="100%"
        />
      </div>

      {/* Mobile-only switch (desktop uses the sliding panel) */}
      <p className="mt-6 text-center text-sm text-zinc-500 lg:hidden">
        Already have an account?{" "}
        <button
          type="button"
          onClick={props.onSwitch}
          className="font-semibold text-violet-600 hover:underline"
        >
          Sign in
        </button>
      </p>
    </>
  );
}

/* ---------- Main slider ---------- */
export function AuthSlider({
  initialMode = "login",
}: {
  initialMode?: "login" | "register";
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const isRegister = mode === "register";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Đăng nhập thất bại");
        return;
      }
      localStorage.setItem("access_token", data.token);
      localStorage.setItem("refresh_token", data.refresh_token || "");
      localStorage.setItem("user", JSON.stringify(data.user));
      window.dispatchEvent(new Event("storage"));
      const roles: string[] = data.user?.roles ?? [];
      if (roles.includes("mentor") || roles.includes("admin")) {
        router.push("/mentor/dashboard");
      } else {
        router.push("/documents");
      }
    } catch {
      setError("Không thể kết nối server");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle(r: { credential?: string }) {
    setError("");
    if (!r.credential) {
      setError("Không nhận được token từ Google");
      return;
    }
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: r.credential }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Đăng nhập Google thất bại");
        return;
      }
      localStorage.setItem("access_token", data.token);
      localStorage.setItem("refresh_token", data.refresh_token || "");
      localStorage.setItem("user", JSON.stringify(data.user));
      window.dispatchEvent(new Event("storage"));
      const roles: string[] = data.user?.roles ?? [];
      if (roles.includes("mentor") || roles.includes("admin")) {
        router.push("/mentor/dashboard");
      } else {
        router.push("/documents");
      }
    } catch {
      setError("Không thể kết nối server");
    }
  }

  return (
    <div className="flex min-h-[80vh] w-full items-center justify-center p-4">
      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-3xl shadow-2xl ring-1 ring-black/5 lg:grid-cols-2">
      {/* LEFT — login form (visible when NOT register) */}
      <div
        className={`flex flex-col justify-center bg-white px-6 py-10 sm:px-10 ${
          isRegister ? "hidden lg:flex" : "flex"
        }`}
      >
        <LoginForm
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          remember={remember}
          setRemember={setRemember}
          error={error}
          loading={loading}
          onSwitch={() => setMode("register")}
          onSubmit={handleLogin}
          onGoogle={handleGoogle}
          setError={setError}
        />
      </div>

      {/* RIGHT — register form (visible when register) */}
      <div
        className={`flex flex-col justify-center bg-white px-6 py-10 sm:px-10 ${
          isRegister ? "flex" : "hidden lg:flex"
        }`}
      >
        <RegisterForm
          error={error}
          onSwitch={() => setMode("login")}
          onGoogle={handleGoogle}
          setError={setError}
        />
      </div>

      {/* Sliding purple panel — contained inside the box, desktop only */}
      <motion.div
        initial={false}
        animate={{ x: isRegister ? "0%" : "100%" }}
        transition={{ type: "spring", stiffness: 55, damping: 20 }}
        className="absolute inset-y-0 left-0 z-20 hidden w-1/2 flex-col justify-center overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-emerald-500 px-10 py-10 lg:flex"
      >
        <div className="pointer-events-none absolute -left-10 -top-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-10 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />

        <AnimatePresence mode="wait">
          <motion.div
            key={isRegister ? "login-promo" : "register-promo"}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3 }}
            className="relative z-10 max-w-md text-white"
          >
            <PromoArt />

            {isRegister ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                  Your workspace awaits
                </p>
                <h2 className="mt-3 text-4xl font-extrabold leading-tight">
                  Welcome back
                </h2>
                <p className="mt-4 text-base leading-relaxed text-white/85">
                  Sign in to continue to your account and pick up right where you left off.
                </p>
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="group mt-8 inline-flex items-center gap-2 rounded-xl border border-white/70 px-6 py-3 text-base font-semibold text-white transition-all hover:bg-white hover:text-purple-700"
                >
                  Sign in
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </button>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                  Make it yours
                </p>
                <h2 className="mt-3 text-4xl font-extrabold leading-tight">
                  New here?
                </h2>
                <p className="mt-4 text-base leading-relaxed text-white/85">
                  Create a workspace, save your projects, and keep every bright idea within reach.
                </p>
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className="group mt-8 inline-flex items-center gap-2 rounded-xl border border-white/70 px-6 py-3 text-base font-semibold text-white transition-all hover:bg-white hover:text-purple-700"
                >
                  Create account
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </button>
              </>
            )}

            <p className="mt-3 text-sm text-white/70">Free to start - No card needed</p>
          </motion.div>
        </AnimatePresence>
      </motion.div>
      </div>
    </div>
  );
}
