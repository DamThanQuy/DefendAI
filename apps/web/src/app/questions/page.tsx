"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function QuestionsPage() {
  const router = useRouter();

  useEffect(() => {
    // Try to find document_id from sessionStorage to redirect to the new /documents/[id] page
    const raw = sessionStorage.getItem("questionsData");
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (data.document_id) {
          router.replace(`/documents/${data.document_id}`);
          return;
        }
      } catch { /* ignore */ }
    }
    // Fallback: redirect to documents list
    router.replace("/documents");
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-zinc-500 text-[14px]">Đang chuyển hướng...</p>
      </div>
    </div>
  );
}
