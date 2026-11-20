"use client";

import { AuthSlider } from "@/components/auth/AuthSlider";

export default function LoginPage() {
  return (
    <div className="container mx-auto flex min-h-[calc(100svh-4.5rem)] items-center justify-center px-3 py-4 sm:px-4 sm:py-6">
      <AuthSlider initialMode="login" />
    </div>
  );
}
