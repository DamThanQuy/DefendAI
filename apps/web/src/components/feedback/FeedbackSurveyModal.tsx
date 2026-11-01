"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  X,
  Star,
  Gift,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Crown,
  Heart,
  Lightbulb,
  DollarSign,
  TrendingUp,
  AlertCircle,
  FolderKanban,
  FileSearch,
  CalendarClock,
  MonitorPlay,
  FileBarChart,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface FeedbackUserContext {
  user_id: number;
  email: string;
  full_name: string | null;
  current_plan: string;
  has_submitted: boolean;
  detected_features: string[];
  feature_counts: Record<string, number>;
  mock_ai_trial_tickets: number;
}

interface FeedbackSurveyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// 5 tiêu chí cốt lõi của GraduAI / DefendAI
const CORE_CRITERIA = [
  {
    key: "ui_ux",
    label: "Giao diện & Trải nghiệm (UI/UX)",
    desc: "Độ mượt mà, trực quan và dễ thao tác trên hệ thống",
  },
  {
    key: "ai_quality",
    label: "Chất lượng câu hỏi & Đánh giá của AI",
    desc: "Độ sát thực tế bảo vệ đồ án, độ sâu chuyên môn và phản biện",
  },
  {
    key: "performance",
    label: "Tốc độ xử lý & Phản hồi",
    desc: "Thời gian phân tích đồ án, tải trang và tương tác phòng mock",
  },
  {
    key: "rubric_alignment",
    label: "Bám sát thang điểm & Tiêu chí hội đồng",
    desc: "Mức độ phù hợp với barem chấm đồ án tốt nghiệp chuẩn",
  },
  {
    key: "practical_value",
    label: "Giá trị thực tiễn & Sự tự tin",
    desc: "Giúp bạn vững tâm lý và phản biện tốt hơn trước hội đồng",
  },
];

// Danh sách các tính năng hệ thống theo dõi
const SYSTEM_FEATURES: {
  key: string;
  name: string;
  route: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}[] = [
  {
    key: "workspaces",
    name: "Quản lý Đề tài & Workspace",
    route: "/workspaces",
    icon: FolderKanban,
    description: "Tải tài liệu, quản lý đề tài và mục tiêu đồ án",
  },
  {
    key: "analysis",
    name: "Phân tích đồ án & Quét mã nguồn",
    route: "/code-review",
    icon: FileSearch,
    description: "Code Review và đánh giá tự động cấu trúc đồ án",
  },
  {
    key: "bookings",
    name: "Đặt lịch luyện tập cùng Mentor",
    route: "/bookings",
    icon: CalendarClock,
    description: "Kết nối chuyên gia, lịch rảnh và cố vấn 1-1",
  },
  {
    key: "meetings",
    name: "Phòng Mock Room (Trực tuyến)",
    route: "/mock-room",
    icon: MonitorPlay,
    description: "Mô phỏng hội đồng phản biện đồ án thực tế",
  },
  {
    key: "reports",
    name: "Báo cáo đánh giá & Xuất PDF",
    route: "/report",
    icon: FileBarChart,
    description: "Tổng hợp điểm số, lời khuyên và xuất phiếu đánh giá",
  },
];

// Quick tags cho đề xuất cải tiến
const QUICK_TAGS = [
  "⚡ Tăng tốc độ AI phản hồi",
  "📚 Bổ sung kho đề tài mẫu",
  "👨‍🏫 Thêm nhiều mentor chuyên ngành",
  "🎯 Tùy chỉnh độ khó câu hỏi",
  "📱 Tối ưu trải nghiệm mobile",
  "📊 Báo cáo phân tích chi tiết hơn",
  "🎙️ Cải thiện nhận diện giọng nói",
  "💰 Thêm gói theo từng kỳ đồ án",
];

// NPS 4 mức
const NPS_OPTIONS = [
  {
    score: 10,
    label: "Rất sẵn lòng",
    desc: "Chắc chắn giới thiệu cho bạn bè & nhóm đồ án (9-10đ)",
    color: "border-teal-500/50 bg-teal-500/10 text-teal-400 hover:border-teal-400",
  },
  {
    score: 8,
    label: "Có thể sẽ giới thiệu",
    desc: "Dịch vụ tốt, có thể cân nhắc giới thiệu (7-8đ)",
    color: "border-blue-500/50 bg-blue-500/10 text-blue-400 hover:border-blue-400",
  },
  {
    score: 5,
    label: "Cần cải thiện thêm",
    desc: "Tạm ổn, cần khắc phục một số điểm hạn chế (4-6đ)",
    color: "border-amber-500/50 bg-amber-500/10 text-amber-400 hover:border-amber-400",
  },
  {
    score: 2,
    label: "Chưa hài lòng",
    desc: "Chưa đáp ứng được kỳ vọng hiện tại (0-3đ)",
    color: "border-rose-500/50 bg-rose-500/10 text-rose-400 hover:border-rose-400",
  },
];

// Tùy chọn sẵn sàng chi trả
const PAY_WILLINGNESS_OPTIONS = [
  { id: "free_only", label: "Chỉ muốn dùng bản Miễn phí (0đ)" },
  { id: "under_50k", label: "Dưới 50.000đ / tháng" },
  { id: "50k_99k", label: "50.000đ - 99.000đ / tháng (Gói Starter)" },
  { id: "100k_199k", label: "100.000đ - 199.000đ / tháng (Gói Pro)" },
  { id: "200k_plus", label: "Từ 200.000đ trở lên / tháng (Gói VIP)" },
];

export function FeedbackSurveyModal({ isOpen, onClose, onSuccess }: FeedbackSurveyModalProps) {
  const router = useRouter();

  // Trạng thái tải ngữ cảnh người dùng
  const [context, setContext] = useState<FeedbackUserContext | null>(null);
  const [loadingContext, setLoadingContext] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Modal Step: 1 = Đánh giá trải nghiệm; 2 = Góp ý & Định giá; 3 = Quà tặng
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form states - Bước 1
  const [csatScore, setCsatScore] = useState<number | null>(null); // 1-10 scale (null khi chưa chọn)
  const [aspectRatings, setAspectRatings] = useState<Record<string, number>>({});
  const [featureRatings, setFeatureRatings] = useState<Record<string, number>>({});
  const [featureLowReasons, setFeatureLowReasons] = useState<Record<string, string>>({});

  // Form states - Bước 2
  const [bestThing, setBestThing] = useState<string>("");
  const [suggestedChange, setSuggestedChange] = useState<string>("");
  const [npsScore, setNpsScore] = useState<number>(10);
  const [payWillingness, setPayWillingness] = useState<string>("50k_99k");

  // Kết quả sau khi submit
  const [newTicketsCount, setNewTicketsCount] = useState<number>(1);

  // Load user context khi modal mở
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function fetchUserContext() {
      setLoadingContext(true);
      try {
        const res = await api.get<FeedbackUserContext>("/api/feedback/user-context");
        if (!isMounted) return;
        setContext(res.data);

        // Tính năng để trống, người dùng tự đánh giá (không gán sẵn 5 sao)
        setFeatureRatings({});
      } catch (err: any) {
        if (!isMounted) return;
        // Nếu chưa đăng nhập hoặc lỗi, fallback context mặc định
        const fallbackPlan = localStorage.getItem("membership_plan") || "free";
        setContext({
          user_id: 0,
          email: "",
          full_name: "",
          current_plan: fallbackPlan,
          has_submitted: false,
          detected_features: [],
          feature_counts: {},
          mock_ai_trial_tickets: 0,
        });
      } finally {
        if (isMounted) setLoadingContext(false);
      }
    }

    fetchUserContext();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Reset khi đóng
  function handleClose() {
    onClose();
    setTimeout(() => {
      setStep(1);
      setCsatScore(null);
      setAspectRatings({});
      setFeatureRatings({});
      setFeatureLowReasons({});
    }, 300);
  }

  // Toggle quick tag vào suggestedChange
  function toggleQuickTag(tag: string) {
    if (suggestedChange.includes(tag)) {
      setSuggestedChange((prev) =>
        prev
          .replace(tag, "")
          .replace(/\n\s*\n/g, "\n")
          .trim()
      );
    } else {
      setSuggestedChange((prev) => (prev ? `${prev.trim()}\n${tag}` : tag));
    }
  }

  // Chuyển step 1 -> step 2
  function handleNextStep() {
    if (context && context.detected_features && context.detected_features.length === 0) {
      toast.error("Chưa đủ điều kiện tham gia", {
        description: "Bạn cần trải nghiệm ít nhất 1 tính năng (như hỏi đáp đề tài trong Workspace hoặc phân tích đồ án) trước khi đánh giá.",
      });
      return;
    }
    setStep(2);
  }

  // Gửi feedback
  async function handleSubmit() {
    setSubmitting(true);
    try {
      // Chuẩn hóa CSAT 1-10 về overall_rating 1-5 theo đúng schema backend (mặc định 4 nếu chưa chọn)
      const overallRating = Math.max(1, Math.min(5, Math.ceil((csatScore ?? 8) / 2)));

      // Thu thập các lý do <= 3 sao
      const reasonsList: string[] = [];
      Object.entries(featureRatings).forEach(([feat, rating]) => {
        if (rating <= 3) {
          const customReason = featureLowReasons[feat]?.trim();
          if (customReason) {
            reasonsList.push(`[${feat}] ${customReason}`);
          } else {
            reasonsList.push(`[${feat}] Đánh giá ${rating}/5 sao`);
          }
        }
      });

      const payload = {
        overall_rating: overallRating,
        current_plan: context?.current_plan || "free",
        aspect_ratings: {
          ...aspectRatings,
          csat_10: csatScore,
        },
        detected_features: context?.detected_features || [],
        feature_ratings: featureRatings,
        low_rating_reasons: reasonsList,
        best_thing: bestThing.trim() || undefined,
        suggested_change: suggestedChange.trim() || undefined,
        will_recommend: npsScore,
        pay_willingness: payWillingness,
      };

      const res = await api.post("/api/feedback", payload);
      const tickets = res.data?.mock_ai_trial_tickets ?? 1;
      setNewTicketsCount(tickets);

      // Cập nhật localStorage để các trang khác (mock-room) nhận ngay lập tức
      try {
        localStorage.setItem("mock_ai_trial_tickets", String(tickets));
        window.dispatchEvent(new Event("storage"));
      } catch {}

      toast.success("Gửi khảo sát thành công!", {
        description: "Bạn đã nhận được 01 vé trải nghiệm Mock Room AI.",
      });

      if (onSuccess) onSuccess();
      setStep(3); // Chuyển sang màn hình nhận quà
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Gửi phản hồi thất bại. Vui lòng thử lại.";
      toast.error("Lỗi khi gửi phản hồi", { description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  // Đi đến phòng Mock AI từ màn hình quà tặng
  function handleGoToMockRoom() {
    handleClose();
    router.push("/mock-room");
  }

  // Map tên gói sang badge hiển thị
  const planBadge = useMemo(() => {
    const plan = (context?.current_plan || "free").toLowerCase();
    switch (plan) {
      case "vip":
        return {
          label: "Gói VIP Member",
          color: "bg-amber-500/15 text-amber-400 border-amber-500/30",
          icon: Crown,
        };
      case "pro":
        return {
          label: "Gói Pro Member",
          color: "bg-purple-500/15 text-purple-400 border-purple-500/30",
          icon: Sparkles,
        };
      case "starter":
        return {
          label: "Gói Starter",
          color: "bg-blue-500/15 text-blue-400 border-blue-500/30",
          icon: TrendingUp,
        };
      default:
        return {
          label: "Gói Tài Khoản Free",
          color: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
          icon: Tag,
        };
    }
  }, [context?.current_plan]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-card border border-border/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-teal-500/20">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-serif font-bold text-foreground">
                  Khảo sát Trải nghiệm & Nhận Quà
                </h2>
                {/* Badge gói tài khoản tự động */}
                {context && (
                  <Badge
                    className={`flex items-center gap-1 text-[11px] font-semibold py-0.5 px-2 ${planBadge.color}`}
                  >
                    <planBadge.icon className="w-3 h-3" />
                    {planBadge.label}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Đóng góp ý kiến để nhận ngay 01 vé trải nghiệm Mock Room AI
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loadingContext ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
              <p className="text-sm text-muted-foreground">Đang tải thông tin khảo sát...</p>
            </div>
          ) : step === 1 ? (
            /* ========================================================
               BƯỚC 1: CSAT 1-10, 5 TIÊU CHÍ CỐT LÕI & ĐÁNH GIÁ TÍNH NĂNG
               ======================================================== */
            <div className="space-y-6">
              {/* Thanh tiến trình */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-semibold text-teal-400">Bước 1: Đánh giá chất lượng dịch vụ</span>
                <span>Bước 1 / 2</span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 w-1/2 transition-all duration-300" />
              </div>

              {/* Cảnh báo khi chưa trải nghiệm tính năng nào */}
              {context && context.detected_features && context.detected_features.length === 0 && (
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1.5 text-amber-200">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Bạn chưa hoàn thành tương tác tính năng nào của hệ thống</span>
                  </div>
                  <p className="text-[11px] text-amber-200/80 leading-relaxed">
                    Để đánh giá chính xác và nhận vé Mock AI, bạn vui lòng trải nghiệm ít nhất 1 tính năng (như đặt câu hỏi đề tài hoặc sinh câu hỏi trong Workspace) trước nhé.
                  </p>
                </div>
              )}

              {/* 1. CSAT 1-10 */}
              <div className="bg-muted/30 border border-border/70 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <span>Mức độ hài lòng tổng quan (CSAT 1 - 10)</span>
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Bạn đánh giá trải nghiệm chung trên DefendAI như thế nào?
                    </p>
                  </div>
                  <div className="text-right">
                    {csatScore !== null ? (
                      <>
                        <span className="text-lg font-bold text-teal-400">{csatScore}</span>
                        <span className="text-xs text-muted-foreground">/10</span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground/70 italic">Chưa đánh giá</span>
                    )}
                  </div>
                </div>

                {/* Dãy nút chọn từ 1 đến 10 */}
                <div className="grid grid-cols-10 gap-1.5 pt-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => setCsatScore(score)}
                      className={`h-9 rounded-lg text-xs font-bold transition-all border ${
                        csatScore === score
                          ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white border-teal-400 shadow-md shadow-teal-500/20 scale-105"
                          : "bg-card border-border text-muted-foreground hover:border-teal-500/40 hover:text-foreground"
                      }`}
                    >
                      {score}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground px-1">
                  <span>1: Rất không hài lòng</span>
                  <span>10: Cực kỳ hài lòng</span>
                </div>
              </div>

              {/* 2. Đánh giá 5 tiêu chí cốt lõi */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  Đánh giá 5 tiêu chí cốt lõi của nền tảng
                </h3>
                <div className="space-y-2.5">
                  {CORE_CRITERIA.map((criterion) => (
                    <div
                      key={criterion.key}
                      className="p-3 bg-card border border-border/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:border-border transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-foreground">{criterion.label}</div>
                        <div className="text-[11px] text-muted-foreground">{criterion.desc}</div>
                      </div>
                      {/* 5 sao interactive */}
                      <div className="flex items-center gap-1 shrink-0">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() =>
                              setAspectRatings((prev) => ({
                                ...prev,
                                [criterion.key]: star,
                              }))
                            }
                            className="p-1 text-muted-foreground/40 hover:text-amber-400 transition-colors"
                          >
                            <Star
                              className={`w-5 h-5 ${
                                star <= (aspectRatings[criterion.key] || 0)
                                  ? "text-amber-400 fill-amber-400"
                                  : "text-muted-foreground/30"
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Đánh giá các tính năng (đã dùng vs chưa dùng) */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-teal-400" />
                    Trải nghiệm các tính năng trong hệ thống
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    Hệ thống tự động phát hiện tính năng bạn đã thao tác
                  </span>
                </div>

                <div className="space-y-3">
                  {SYSTEM_FEATURES.map((feature) => {
                    const isUsed = context?.detected_features?.includes(feature.key);
                    const currentRating = featureRatings[feature.key] || 0;
                    const isLowRating = isUsed && currentRating > 0 && currentRating <= 3;
                    const Icon = feature.icon;

                    return (
                      <div
                        key={feature.key}
                        className={`p-3.5 border rounded-xl transition-all ${
                          isUsed
                            ? "bg-card border-border/80"
                            : "bg-muted/20 border-dashed border-border/50 opacity-90"
                        }`}
                      >
                        <div className="flex items-start sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                isUsed
                                  ? "bg-teal-500/10 text-teal-400"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-foreground">
                                  {feature.name}
                                </span>
                                {isUsed ? (
                                  <Badge className="bg-teal-500/10 text-teal-400 border-none text-[10px] px-1.5 py-0 font-medium">
                                    Đã trải nghiệm
                                  </Badge>
                                ) : (
                                  <Badge
                                    className="text-[10px] px-1.5 py-0 text-muted-foreground border-border bg-transparent"
                                  >
                                    Chưa dùng
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground">{feature.description}</p>
                            </div>
                          </div>

                          {/* Phía phải: Đánh giá sao nếu đã dùng, nút Thử ngay nếu chưa dùng */}
                          <div className="shrink-0 pt-1 sm:pt-0">
                            {isUsed ? (
                              <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    key={star}
                                    type="button"
                                    onClick={() =>
                                      setFeatureRatings((prev) => ({
                                        ...prev,
                                        [feature.key]: star,
                                      }))
                                    }
                                    className="p-1 hover:text-amber-400 transition-colors"
                                  >
                                    <Star
                                      className={`w-4 h-4 ${
                                        star <= currentRating
                                          ? "text-amber-400 fill-amber-400"
                                          : "text-muted-foreground/30"
                                      }`}
                                    />
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2.5 gap-1 text-teal-400 hover:text-teal-300 border-teal-500/30 hover:border-teal-500/60"
                                onClick={() => {
                                  handleClose();
                                  router.push(feature.route);
                                }}
                              >
                                <span>Thử ngay</span>
                                <ExternalLink className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Tự động bung ô lý do nếu đánh giá <= 3 sao */}
                        {isLowRating && (
                          <div className="mt-3 pt-3 border-t border-border/50 animate-in fade-in slide-in-from-top-1 duration-200">
                            <label className="text-[11px] font-medium text-amber-400 flex items-center gap-1 mb-1">
                              <AlertCircle className="w-3 h-3" />
                              Lý do bạn đánh giá {currentRating} sao cho tính năng này:
                            </label>
                            <input
                              type="text"
                              value={featureLowReasons[feature.key] || ""}
                              onChange={(e) =>
                                setFeatureLowReasons((prev) => ({
                                  ...prev,
                                  [feature.key]: e.target.value,
                                }))
                              }
                              placeholder="Ví dụ: Tốc độ chậm, thiếu tùy chọn, câu hỏi chưa sát..."
                              className="w-full h-8 px-2.5 text-xs bg-muted/40 border border-amber-500/30 rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : step === 2 ? (
            /* ========================================================
               BƯỚC 2: LỜI KHEN, GÓP Ý VỚI QUICK TAGS, NPS 4 MỨC, CHI TRẢ
               ======================================================== */
            <div className="space-y-6">
              {/* Thanh tiến trình */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-semibold text-teal-400">Bước 2: Ý kiến đóng góp & Sẵn sàng chi trả</span>
                <span>Bước 2 / 2</span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 w-full transition-all duration-300" />
              </div>

              {/* 1. Lời khen */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400/20" />
                  Điều bạn hài lòng hoặc ấn tượng nhất về DefendAI?
                </label>
                <textarea
                  rows={2}
                  value={bestThing}
                  onChange={(e) => setBestThing(e.target.value)}
                  placeholder="Ví dụ: Giao diện trực quan, câu hỏi mock phản xạ rất thực tế, báo cáo chi tiết..."
                  className="w-full p-2.5 text-xs bg-muted/30 border border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
                />
              </div>

              {/* 2. Đề xuất cải tiến có Quick Tags */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                  Đề xuất cải tiến cho các phiên bản tiếp theo
                </label>
                {/* Quick tags */}
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_TAGS.map((tag) => {
                    const isSelected = suggestedChange.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleQuickTag(tag)}
                        className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                          isSelected
                            ? "bg-teal-500/20 border-teal-500/60 text-teal-300 font-medium"
                            : "bg-muted/40 border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  rows={3}
                  value={suggestedChange}
                  onChange={(e) => setSuggestedChange(e.target.value)}
                  placeholder="Bấm chọn nhanh các tag phía trên hoặc nhập ý kiến chi tiết của bạn..."
                  className="w-full p-2.5 text-xs bg-muted/30 border border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
                />
              </div>

              {/* 3. NPS 4 mức */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                  Bạn có sẵn sàng giới thiệu DefendAI cho bạn bè hoặc nhóm khác?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {NPS_OPTIONS.map((opt) => (
                    <button
                      key={opt.score}
                      type="button"
                      onClick={() => setNpsScore(opt.score)}
                      className={`p-3 text-left border rounded-xl transition-all ${
                        npsScore === opt.score
                          ? `${opt.color} shadow-sm ring-1 ring-teal-500/40`
                          : "bg-card border-border text-muted-foreground hover:border-border/80"
                      }`}
                    >
                      <div className="text-xs font-semibold text-foreground">{opt.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Sẵn sàng chi trả */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  Mức chi phí bạn sẵn sàng chi trả để luyện tập bảo vệ đồ án?
                </label>
                <div className="space-y-1.5">
                  {PAY_WILLINGNESS_OPTIONS.map((opt) => (
                    <label
                      key={opt.id}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                        payWillingness === opt.id
                          ? "bg-teal-500/10 border-teal-500/50 text-foreground font-medium"
                          : "bg-card border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <input
                        type="radio"
                        name="pay_willingness"
                        value={opt.id}
                        checked={payWillingness === opt.id}
                        onChange={(e) => setPayWillingness(e.target.value)}
                        className="text-teal-500 focus:ring-teal-500"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================
               BƯỚC 3: MÀN HÌNH NHẬN QUÀ (GIFT SCREEN)
               ======================================================== */
            <div className="py-6 text-center space-y-6 animate-in zoom-in-95 duration-300">
              {/* Animation icon quà tặng */}
              <div className="relative mx-auto w-20 h-20 rounded-3xl bg-gradient-to-tr from-teal-500 via-emerald-400 to-cyan-400 flex items-center justify-center text-white shadow-xl shadow-teal-500/25 animate-bounce">
                <Gift className="w-10 h-10" />
                <Sparkles className="w-5 h-5 absolute -top-1 -right-1 text-amber-300 animate-pulse" />
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Hoàn thành khảo sát
                </div>
                <h3 className="text-xl font-serif font-bold text-foreground">
                  Cảm ơn bạn đã đóng góp ý kiến!
                </h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                  DefendAI trân trọng từng chia sẻ của bạn để hoàn thiện hệ thống tốt hơn. Bạn đã được cộng thêm{" "}
                  <span className="font-semibold text-teal-400">01 vé trải nghiệm Mock Room AI</span> vào tài khoản.
                </p>
              </div>

              {/* Card vé quà tặng */}
              <div className="max-w-sm mx-auto p-4 rounded-2xl bg-gradient-to-br from-card to-muted border border-teal-500/30 shadow-md">
                <div className="flex items-center justify-between text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                      <MonitorPlay className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-foreground">Vé Mock Room AI 1-on-1</div>
                      <div className="text-[11px] text-muted-foreground">Phỏng vấn giả định không giới hạn tính năng</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-1 text-xs font-bold bg-teal-500/20 text-teal-400 rounded-md">
                      +1 Vé
                    </span>
                  </div>
                </div>
              </div>

              {/* Nút CTA: Kích hoạt & Trải nghiệm ngay */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <Button
                  onClick={handleGoToMockRoom}
                  className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white font-semibold text-sm shadow-lg shadow-teal-500/25 gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Kích hoạt & Trải nghiệm ngay
                </Button>
                <Button
                  variant="outline"
                  onClick={handleClose}
                  className="w-full sm:w-auto px-5 py-2.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Để sau
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer (Chỉ hiển thị cho Step 1 & Step 2) */}
        {step !== 3 && !loadingContext && (
          <div className="px-6 py-3.5 border-t border-border bg-muted/30 flex items-center justify-between shrink-0">
            {step === 1 ? (
              <>
                <Button variant="ghost" size="sm" onClick={handleClose} className="text-xs text-muted-foreground">
                  Bỏ qua
                </Button>
                <Button
                  size="sm"
                  onClick={handleNextStep}
                  className="text-xs gap-1.5 bg-gradient-to-r from-teal-500 to-cyan-500 text-white hover:from-teal-400 hover:to-cyan-400"
                >
                  <span>Tiếp tục</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep(1)}
                  className="text-xs gap-1 text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Quay lại</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="text-xs gap-1.5 bg-gradient-to-r from-teal-500 to-cyan-500 text-white hover:from-teal-400 hover:to-cyan-400 shadow-md shadow-teal-500/20"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang gửi...</span>
                    </>
                  ) : (
                    <>
                      <Gift className="w-3.5 h-3.5" />
                      <span>Hoàn tất & Nhận quà</span>
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
export default FeedbackSurveyModal;
