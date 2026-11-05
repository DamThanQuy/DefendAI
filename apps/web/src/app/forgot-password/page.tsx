"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, Lock, Mail } from "lucide-react";
import { Label } from "@/components/ui/label";
import { AuthCard, AuthSubmitButton } from "@/components/auth/AuthCard";
import { AuthField, AuthPasswordField } from "@/components/auth/AuthField";
import { clearSession } from "@/lib/auth";
import { detailToMessage, PASSWORD_RULE_HINT, validatePassword } from "@/lib/auth-form";

type Step = "email" | "otp" | "password" | "done";

const OTP_LENGTH = 6;

function FormError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500 border border-red-500/20"
    >
      {message}
    </div>
  );
}

function FormNotice({ message, className = "" }: { message: string; className?: string }) {
  return (
    <div
      role="status"
      className={`rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 ${className}`}
    >
      {message}
    </div>
  );
}

async function postAuth(path: string, body: unknown) {
  const res = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { res, data: await res.json() };
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  // Lưu thời điểm được gửi lại thay vì đếm lùi từng giây: tab chạy nền làm timer chậm đi.
  const [resendAt, setResendAt] = useState(0);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (!resendAt) return;
    const tick = () => setResendIn(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  async function requestOtp() {
    setError("");
    setLoading(true);
    try {
      const { res, data } = await postAuth("forgot-password", { email });
      if (!res.ok) {
        setError(detailToMessage(data.detail, "Không gửi được mã xác nhận. Vui lòng thử lại."));
        return;
      }
      setNotice(data.message);
      setResendAt(Date.now() + data.resend_after_seconds * 1000);
      setOtp(""); // Mã mới làm mã cũ hết hiệu lực.
      setStep("otp");
    } catch {
      setError("Không thể kết nối server");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (otp.length !== OTP_LENGTH) {
      setError(`Vui lòng nhập đủ ${OTP_LENGTH} số của mã xác nhận.`);
      return;
    }

    setLoading(true);
    try {
      const { res, data } = await postAuth("verify-reset-otp", { email, otp });
      if (!res.ok) {
        setError(detailToMessage(data.detail, "Không kiểm tra được mã xác nhận. Vui lòng thử lại."));
        return;
      }
      setNotice("Mã xác nhận hợp lệ. Hãy đặt mật khẩu mới.");
      setStep("password");
    } catch {
      setError("Không thể kết nối server");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const missing = validatePassword(password);
    if (missing.length > 0) {
      setError(`Mật khẩu còn thiếu: ${missing.join(", ")}.`);
      return;
    }
    if (password !== confirm) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }

    setLoading(true);
    try {
      const { res, data } = await postAuth("reset-password", { email, otp, new_password: password });
      if (!res.ok) {
        setError(detailToMessage(data.detail, "Không đặt lại được mật khẩu. Vui lòng thử lại."));
        // 400 = mã không còn dùng được (vd đã yêu cầu mã mới ở tab khác) → phải nhập lại mã.
        if (res.status === 400) {
          setNotice("");
          setOtp("");
          setStep("otp");
        }
        return;
      }
      // Backend đã thu hồi mọi phiên cũ của tài khoản → phiên trong trình duyệt này cũng bỏ.
      clearSession();
      window.dispatchEvent(new Event("storage"));
      setNotice(data.message);
      setStep("done");
    } catch {
      setError("Không thể kết nối server");
    } finally {
      setLoading(false);
    }
  }

  function changeEmail() {
    setError("");
    setNotice("");
    setOtp("");
    setStep("email");
  }

  if (step === "done") {
    return (
      <AuthCard
        eyebrow="Quên mật khẩu"
        title="Đã đổi mật khẩu"
        description="Từ giờ hãy dùng mật khẩu mới để đăng nhập."
      >
        <FormNotice message={notice} className="mb-6" />
        <Link
          href="/login"
          className="flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-primary to-secondary text-base font-semibold text-white shadow-lg shadow-primary/30 transition-all hover:from-primary/90 hover:to-secondary/90 hover:shadow-xl"
        >
          Đến trang đăng nhập
        </Link>
      </AuthCard>
    );
  }

  const heading = {
    email: {
      title: "Lấy lại mật khẩu",
      description: `Nhập email đã đăng ký, chúng tôi sẽ gửi mã ${OTP_LENGTH} số để xác nhận tài khoản.`,
    },
    otp: {
      title: "Nhập mã xác nhận",
      description: `Nhập mã ${OTP_LENGTH} số gửi tới ${email}.`,
    },
    password: {
      title: "Tạo mật khẩu mới",
      description: "Mật khẩu mới sẽ thay thế mật khẩu cũ và đăng xuất tài khoản khỏi các thiết bị khác.",
    },
  }[step];

  return (
    <AuthCard eyebrow="Quên mật khẩu" title={heading.title} description={heading.description}>
      {/* key: nếu không, React dùng lại <input> của bước trước nên autoFocus không chạy. */}
      {step === "email" && (
        <form
          key="email"
          onSubmit={(e) => {
            e.preventDefault();
            requestOtp();
          }}
          className="space-y-5"
        >
          {error && <FormError message={error} />}

          <div className="space-y-2">
            <Label htmlFor="email" className="font-semibold text-slate-700">Email</Label>
            <AuthField
              id="email"
              type="email"
              icon={Mail}
              placeholder="you@company.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <AuthSubmitButton loading={loading}>Gửi mã xác nhận</AuthSubmitButton>
        </form>
      )}

      {step === "otp" && (
        <form key="otp" onSubmit={handleVerifyOtp} className="space-y-5">
          {error ? <FormError message={error} /> : notice && <FormNotice message={notice} />}

          <div className="space-y-2">
            <Label htmlFor="otp" className="font-semibold text-slate-700">Mã xác nhận</Label>
            {/* Không dùng maxLength: dán "123 456" sẽ bị cắt trước khi lọc bỏ dấu cách. */}
            <AuthField
              id="otp"
              type="text"
              icon={KeyRound}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={`Nhập mã ${OTP_LENGTH} số`}
              className="font-mono text-base tracking-[0.3em] placeholder:font-sans placeholder:text-sm placeholder:tracking-normal"
              autoFocus
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
            />
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={requestOtp}
                disabled={loading || resendIn > 0}
                className="font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
              >
                {resendIn > 0 ? `Gửi lại mã sau ${resendIn}s` : "Gửi lại mã"}
              </button>
              <button type="button" onClick={changeEmail} className="text-slate-600 hover:underline">
                Đổi email
              </button>
            </div>
          </div>

          <AuthSubmitButton loading={loading}>Xác nhận mã</AuthSubmitButton>
        </form>
      )}

      {step === "password" && (
        <form key="password" onSubmit={handleReset} className="space-y-5">
          {error ? <FormError message={error} /> : <FormNotice message={notice} />}

          <div className="space-y-2">
            <Label htmlFor="password" className="font-semibold text-slate-700">Mật khẩu mới</Label>
            <AuthPasswordField
              id="password"
              icon={Lock}
              placeholder="Nhập mật khẩu mới"
              autoComplete="new-password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs leading-5 text-slate-600">{PASSWORD_RULE_HINT}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password" className="font-semibold text-slate-700">Nhập lại mật khẩu</Label>
            <AuthPasswordField
              id="confirm-password"
              icon={Lock}
              placeholder="Nhập lại mật khẩu mới"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          <AuthSubmitButton loading={loading}>Đặt mật khẩu mới</AuthSubmitButton>
        </form>
      )}

      <Link
        href="/login"
        className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Quay lại đăng nhập
      </Link>
    </AuthCard>
  );
}
