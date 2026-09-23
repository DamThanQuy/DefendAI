"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { GoogleLogin } from "@react-oauth/google";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  GraduationCap,
  Sparkles,
  Loader2,
  Lock,
  Mail,
  User,
  CheckCircle2,
  FileSearch,
  MessagesSquare,
  Search,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AuthField, AuthPasswordField } from "@/components/auth/AuthField";

/* ---------- Floating illustration for the promo panel ---------- */
function PromoArt() {
  return (
    <div className="relative mb-10 flex items-center justify-center">
      <div className="relative flex h-40 w-40 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/20 to-secondary/20 backdrop-blur-sm ring-1 ring-white/30 shadow-2xl overflow-hidden">
        <Image
          src="/avatar.jpg"
          alt="GraduAI"
          width={160}
          height={160}
          className="w-full h-full object-cover"
        />
      </div>
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -right-2 top-2 flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-emerald-600 shadow-lg"
      >
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        Sẵn sàng
      </motion.div>
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
        className="absolute -left-2 bottom-2 flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-violet-600 shadow-lg"
      >
        <FileSearch className="h-4 w-4 text-violet-500" />
        AI Review
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
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/30">
          <Image
            src="/avatar.jpg"
            alt="GraduAI"
            width={48}
            height={48}
            className="w-full h-full object-cover rounded-2xl"
          />
        </div>
        <span className="text-2xl font-extrabold tracking-tight text-foreground">
          GraduAI
        </span>
      </div>

      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Đăng nhập
        </p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-foreground">
          Chào mừng trở lại
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Đăng nhập để tiếp tục luyện tập bảo vệ đồ án của bạn.
        </p>
      </div>

      <form onSubmit={props.onSubmit} className="space-y-5">
        {props.error && (
          <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500 border border-red-500/20">
            {props.error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email" className="text-foreground">Địa chỉ email</Label>
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
            <Label htmlFor="password" className="text-foreground">Mật khẩu</Label>
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary hover:underline"
            >
              Quên mật khẩu?
            </Link>
          </div>
          <AuthPasswordField
            id="password"
            icon={Lock}
            placeholder="Nhập mật khẩu"
            required
            value={props.password}
            onChange={(e) => props.setPassword(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={props.remember}
              onChange={(e) => props.setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            Ghi nhớ đăng nhập
          </label>
        </div>

        <Button
          type="submit"
          disabled={props.loading}
          className="h-12 w-full rounded-xl bg-gradient-to-r from-primary to-secondary text-base font-semibold text-white shadow-lg shadow-primary/30 transition-all hover:from-primary/90 hover:to-secondary/90 hover:shadow-xl disabled:opacity-50"
        >
          {props.loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
          Đăng nhập
        </Button>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-3 text-muted-foreground">hoặc tiếp tục với</span>
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
      <p className="mt-6 text-center text-sm text-muted-foreground lg:hidden">
        Chưa có tài khoản?{" "}
        <button
          type="button"
          onClick={props.onSwitch}
          className="font-semibold text-primary hover:underline"
        >
          Tạo tài khoản
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
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/30">
          <Image
            src="/avatar.jpg"
            alt="GraduAI"
            width={48}
            height={48}
            className="w-full h-full object-cover rounded-2xl"
          />
        </div>
        <span className="text-2xl font-extrabold tracking-tight text-foreground">
          GraduAI
        </span>
      </div>

      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Bắt đầu ngay
        </p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-foreground">
          Tạo tài khoản của bạn
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Đăng ký để trải nghiệm luyện tập bảo vệ với hội đồng AI.
        </p>
      </div>

      <div className="space-y-5">
        {props.error && (
          <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500 border border-red-500/20">
            {props.error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="name" className="text-foreground">Họ và tên</Label>
          <AuthField id="name" type="text" icon={User} placeholder="Nguyễn Văn A" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-foreground">Địa chỉ email</Label>
          <AuthField id="email" type="email" icon={Mail} placeholder="you@company.com" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-foreground">Mật khẩu</Label>
          <AuthPasswordField id="password" icon={Lock} placeholder="Nhập mật khẩu" />
        </div>

        <Button
          type="button"
          className="h-12 w-full rounded-xl bg-gradient-to-r from-primary to-secondary text-base font-semibold text-white shadow-lg shadow-primary/30 transition-all hover:from-primary/90 hover:to-secondary/90 hover:shadow-xl"
        >
          Tạo tài khoản
        </Button>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-3 text-muted-foreground">hoặc tiếp tục với</span>
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
      <p className="mt-6 text-center text-sm text-muted-foreground lg:hidden">
        Đã có tài khoản?{" "}
        <button
          type="button"
          onClick={props.onSwitch}
          className="font-semibold text-primary hover:underline"
        >
          Đăng nhập
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
      console.log("Google login - credential received:", r.credential);
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: r.credential }),
      });
      const data = await res.json();
      console.log("Google login - response status:", res.status);
      console.log("Google login - response data:", data);
      if (!res.ok) {
        setError(data.detail || "Đăng nhập Google thất bại");
        return;
      }
      localStorage.setItem("access_token", data.token);
      localStorage.setItem("refresh_token", data.refresh_token || "");
      localStorage.setItem("user", JSON.stringify(data.user));
      window.dispatchEvent(new Event("storage"));
      const roles: string[] = data.user?.roles ?? [];
      console.log("Google login - user roles:", roles);
      if (roles.includes("mentor") || roles.includes("admin")) {
        router.push("/mentor/dashboard");
      } else {
        router.push("/documents");
      }
    } catch (error) {
      console.error("Google login - error:", error);
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

      {/* Sliding panel — contained inside the box, desktop only */}
      <motion.div
        initial={false}
        animate={{ x: isRegister ? "0%" : "100%" }}
        transition={{ type: "spring", stiffness: 55, damping: 20 }}
        className="absolute inset-y-0 left-0 z-20 hidden w-1/2 flex-col justify-center overflow-hidden bg-gradient-to-br from-primary via-secondary to-accent px-10 py-10 lg:flex"
      >
        <div className="pointer-events-none absolute -left-10 -top-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-10 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />

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
                  Đã có tài khoản
                </p>
                <h2 className="mt-3 text-4xl font-extrabold leading-tight">
                  Chào mừng trở lại
                </h2>
                <p className="mt-4 text-base leading-relaxed text-white/85">
                  Đăng nhập để tiếp tục buổi luyện tập và theo dõi tiến độ của bạn.
                </p>
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="group mt-8 inline-flex items-center gap-2 rounded-xl border border-white/70 px-6 py-3 text-base font-semibold text-white transition-all hover:bg-white hover:text-primary"
                >
                  Đăng nhập
                </button>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                  Bạn mới?
                </p>
                <h2 className="mt-3 text-4xl font-extrabold leading-tight">
                  Bắt đầu luyện tập ngay
                </h2>
                <p className="mt-4 text-base leading-relaxed text-white/85">
                  Tải đồ án, nhận phân tích AI và đối mặt với câu hỏi phản biện như hội đồng thật.
                </p>
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className="group mt-8 inline-flex items-center gap-2 rounded-xl border border-white/70 px-6 py-3 text-base font-semibold text-white transition-all hover:bg-white hover:text-primary"
                >
                  Tạo tài khoản
                </button>
              </>
            )}

            <p className="mt-3 flex items-center gap-1.5 text-sm text-white/70">
              <Sparkles className="h-4 w-4" />
              Miễn phí để bắt đầu
            </p>
          </motion.div>
        </AnimatePresence>
      </motion.div>
      </div>
    </div>
  );
}
