"use client";

import React, { useState, useEffect } from "react";
import { MessageSquareHeart, Gift, Sparkles } from "lucide-react";
import { FeedbackSurveyModal } from "./FeedbackSurveyModal";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

export function FeedbackFloatingButton() {
  const { isAuthed, user, loading } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState<boolean | null>(null);
  const [isEligible, setIsEligible] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isAuthed || !user) {
      setHasSubmitted(null);
      setIsEligible(null);
      return;
    }

    let cancelled = false;

    const checkEligibility = () => {
      // 1. Kiểm tra nhanh từ profile_data đã lưu trong session user
      const profile = (user.profile_data as any) || {};
      if (profile.feedback_status?.submitted) {
        setHasSubmitted(true);
      }

      // 2. Đồng bộ chính xác với backend qua endpoint user-context (kiểm tra điều kiện trải nghiệm tính năng)
      api
        .get("/api/feedback/user-context")
        .then((res) => {
          if (!cancelled && res.data) {
            setHasSubmitted(!!res.data.has_submitted);
            // User đủ điều kiện khi đã tương tác tính năng
            const hasFeatures =
              (Array.isArray(res.data.detected_features) && res.data.detected_features.length > 0) ||
              !!res.data.eligible_for_feedback;
            setIsEligible(hasFeatures);
          }
        })
        .catch(() => {
          if (!cancelled) {
            const hasProfileSubmitted = !!profile.feedback_status?.submitted;
            setHasSubmitted(hasProfileSubmitted);
            setIsEligible(hasProfileSubmitted);
          }
        });
    };

    checkEligibility();

    window.addEventListener("feedback-refresh", checkEligibility);
    const handleOpenModal = () => setModalOpen(true);
    window.addEventListener("open-feedback-modal", handleOpenModal);

    return () => {
      cancelled = true;
      window.removeEventListener("feedback-refresh", checkEligibility);
      window.removeEventListener("open-feedback-modal", handleOpenModal);
    };
  }, [isAuthed, user]);

  // Chỉ hiển thị cho user đã đăng nhập
  if (loading || !isAuthed || !user) {
    return null;
  }

  return (
    <>
      {isEligible === true && (
        <div className="fixed bottom-5 right-5 z-[95] print:hidden">
          <button
            onClick={() => setModalOpen(true)}
            className="group relative flex items-center gap-2.5 px-4 py-2.5 bg-gradient-to-r from-teal-600 via-teal-500 to-cyan-500 hover:from-teal-500 hover:to-cyan-400 text-white rounded-full shadow-lg shadow-teal-500/25 hover:shadow-xl hover:shadow-teal-500/35 border border-white/20 transition-all duration-300 hover:scale-105 active:scale-95"
            title={hasSubmitted ? "Đóng góp ý kiến cho GraduAI" : "Đóng góp ý kiến & Nhận vé Mock Room AI"}
            aria-label={hasSubmitted ? "Đóng góp ý kiến" : "Khảo sát ý kiến người dùng"}
          >
            {/* Badge nhận quà chỉ hiển thị khi CHƯA từng nhận quà */}
            {!hasSubmitted && (
              <span className="absolute -top-2.5 -right-2 flex items-center gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md animate-pulse">
                <Gift className="w-3 h-3" />
                +1 Vé Mock
              </span>
            )}

            <div className="relative">
              <MessageSquareHeart className="w-5 h-5 text-white group-hover:rotate-12 transition-transform duration-300" />
              {!hasSubmitted && (
                <Sparkles className="w-2.5 h-2.5 text-amber-300 absolute -top-1 -right-1" />
              )}
            </div>

            <span className="text-xs font-semibold tracking-wide hidden sm:inline-block">
              {hasSubmitted ? "Góp ý" : "Góp ý & Nhận quà"}
            </span>
          </button>
        </div>
      )}

      <FeedbackSurveyModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => setHasSubmitted(true)}
      />
    </>
  );
}

export default FeedbackFloatingButton;
