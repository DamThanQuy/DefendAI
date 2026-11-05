"use client";

import Image from "next/image";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Khung một cột cho các trang auth phụ (quên mật khẩu), cùng kiểu với AuthSlider. */
export function AuthCard(props: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="container mx-auto flex min-h-[80vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-white px-6 py-10 shadow-2xl ring-1 ring-black/5 sm:px-10">
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
          <span className="text-2xl font-extrabold tracking-tight text-slate-900">
            GraduAI
          </span>
        </div>

        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
            {props.eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
            {props.title}
          </h1>
          <p className="mt-2 break-words text-sm text-slate-600">{props.description}</p>
        </div>

        {props.children}
      </div>
    </div>
  );
}

export function AuthSubmitButton(props: { loading: boolean; children: React.ReactNode }) {
  return (
    <Button
      type="submit"
      disabled={props.loading}
      className="h-12 w-full rounded-xl bg-gradient-to-r from-primary to-secondary text-base font-semibold text-white shadow-lg shadow-primary/30 transition-all hover:from-primary/90 hover:to-secondary/90 hover:shadow-xl disabled:opacity-50"
    >
      {props.loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
      {props.children}
    </Button>
  );
}
