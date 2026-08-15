"use client";

import { AuthSlider } from "@/components/auth/AuthSlider";

export default function LoginPage() {
  return (
    <div className="container mx-auto flex min-h-[80vh] items-center justify-center px-4 py-10">
      <AuthSlider initialMode="login" />
    </div>
  );
}
