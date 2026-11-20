"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { AlignLeft, ChevronUp, Hash, List, Sparkles } from "lucide-react";

export interface MessageSection {
  id: string;
  title: string;
  shortTitle: string;
  level: number;
  type: "heading" | "bullet" | "paragraph";
}

/**
 * Tạo slug chuẩn từ text (hỗ trợ cả tiếng Việt Unicode)
 */
export function generateSectionSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 45);
}

/**
 * Trích xuất các section từ markdown của câu trả lời AI.
 * Ưu tiên:
 * 1. Headings (#, ##, ###, ####)
 * 2. Bullet list items (•, -, *, 1., 2.) có độ dài phù hợp hoặc có in đậm
 * 3. Các đoạn văn dài (nếu không có cấu trúc trên)
 */
export function extractMessageSections(
  content: string,
  messageId: string | number
): MessageSection[] {
  if (!content) return [];

  // Làm sạch các thẻ reasoning <think>...</think> hoặc code block bọc ngoài
  let cleaned = content;
  if (cleaned.includes("</think>")) {
    cleaned = cleaned.split("</think>").pop() || "";
  }
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim();

  const lines = cleaned.split("\n");
  const sections: MessageSection[] = [];
  const slugCounts: Record<string, number> = {};

  const addSection = (
    rawText: string,
    level: number,
    type: "heading" | "bullet" | "paragraph"
  ) => {
    // Loại bỏ markdown format (*, _, `, ~, #)
    const title = rawText
      .replace(/[*_~`#]/g, "")
      .replace(/^[-•*]\s+/, "")
      .trim();

    if (!title || title.length < 2) return;

    let baseSlug = generateSectionSlug(title) || `sec-${sections.length}`;
    const count = (slugCounts[baseSlug] || 0) + 1;
    slugCounts[baseSlug] = count;
    const finalSlug = count > 1 ? `${baseSlug}-${count}` : baseSlug;
    const id = `sec-${messageId}-${finalSlug}`;

    const shortTitle = title.length > 40 ? title.slice(0, 38) + "..." : title;

    sections.push({
      id,
      title,
      shortTitle,
      level,
      type,
    });
  };

  // 1. Kiểm tra xem văn bản có chứa headings (#, ##, ###) không
  const hasHeadings = lines.some((l) => /^#{1,4}\s+/.test(l.trim()));

  if (hasHeadings) {
    for (const line of lines) {
      const match = line.trim().match(/^(#{1,4})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        addSection(match[2], level, "heading");
      }
    }
  } else {
    // 2. Không có heading -> tìm bullet points, danh sách số, hoặc đoạn có tiêu đề in đậm
    for (const line of lines) {
      const trimmed = line.trim();
      const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
      const numMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
      const boldLeadMatch = trimmed.match(/^\*\*([^*:]+)(?::)?\*\*(.*)$/);

      if (bulletMatch) {
        addSection(bulletMatch[1], 3, "bullet");
      } else if (numMatch) {
        addSection(numMatch[1], 3, "bullet");
      } else if (boldLeadMatch && boldLeadMatch[1].length > 2) {
        addSection(
          boldLeadMatch[1] + (boldLeadMatch[2] ? ": " + boldLeadMatch[2] : ""),
          2,
          "paragraph"
        );
      }
    }

    // 3. Nếu vẫn chưa đủ sections và nội dung dài (> 300 ký tự), chia theo đoạn văn
    if (sections.length < 2 && cleaned.length > 300) {
      const paras = cleaned.split(/\n\s*\n/).filter((p) => p.trim().length > 30);
      for (const p of paras) {
        const firstLine = p.trim().split("\n")[0].slice(0, 60);
        addSection(firstLine, 3, "paragraph");
      }
    }
  }

  return sections;
}

interface MessageContentScrollProps {
  content: string;
  messageId: string | number;
  sections?: MessageSection[];
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  turnPrompt?: string;
  onScrollToPrompt?: () => void;
}

export function MessageContentScroll({
  content,
  messageId,
  sections: propSections,
  scrollContainerRef,
  turnPrompt,
  onScrollToPrompt,
}: MessageContentScrollProps) {
  const sections = React.useMemo(() => {
    return propSections || extractMessageSections(content, messageId);
  }, [content, messageId, propSections]);

  const [activeId, setActiveId] = useState<string>("");
  const [hoveredSection, setHoveredSection] = useState<MessageSection | null>(null);
  const [showTocPopover, setShowTocPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Đóng popover khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowTocPopover(false);
      }
    }
    if (showTocPopover) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showTocPopover]);

  // Scroll spy để highlight section đang xem trong viewport
  useEffect(() => {
    if (sections.length === 0) return;

    const container = scrollContainerRef?.current;
    if (!container) return;

    const handleScroll = () => {
      const containerRect = container.getBoundingClientRect();
      const offsetTop = containerRect.top + 80; // Điểm kích hoạt gần đỉnh container

      let currentActive = sections[0].id;
      let minDistance = Infinity;

      for (const sec of sections) {
        const el = document.getElementById(sec.id);
        if (!el) continue;

        const rect = el.getBoundingClientRect();
        // Khoảng cách từ đỉnh section đến offsetTop
        const dist = Math.abs(rect.top - offsetTop);

        if (rect.top <= offsetTop + 150) {
          currentActive = sec.id;
        }
      }

      setActiveId(currentActive);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Kích hoạt lần đầu

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [sections, scrollContainerRef]);

  // Hàm cuộn mượt tới section
  const scrollToSection = useCallback(
    (sectionId: string) => {
      const el = document.getElementById(sectionId);
      if (!el) return;

      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(sectionId);
      setShowTocPopover(false);

      // Hiệu ứng highlight nhẹ xung quanh mục vừa chọn
      el.classList.add(
        "ring-2",
        "ring-primary/60",
        "bg-primary/5",
        "rounded-lg",
        "transition-all",
        "duration-700"
      );
      setTimeout(() => {
        el.classList.remove(
          "ring-2",
          "ring-primary/60",
          "bg-primary/5",
          "rounded-lg"
        );
      }, 1400);
    },
    []
  );

  // Nếu nội dung quá ngắn hoặc ít hơn 2 mục, không cần hiện thanh scrubber
  if (sections.length < 2) {
    return null;
  }

  return (
    <div className="relative flex flex-col items-center select-none py-1 group/scrubber">
      {/* Nút Mục lục (TOC) & số lượng mục */}
      <div className="relative mb-2">
        <button
          onClick={() => setShowTocPopover((prev) => !prev)}
          title={`Xem mục lục phản hồi (${sections.length} mục)`}
          className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
            showTocPopover
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/70 bg-card/60 border border-border/50"
          }`}
        >
          <List className="w-3 h-3" />
          <span className="hidden xl:inline">{sections.length} mục</span>
        </button>

        {/* Popover Menu: Mục lục đầy đủ */}
        {showTocPopover && (
          <div
            ref={popoverRef}
            className="absolute left-full top-0 ml-2 z-50 w-72 max-h-80 overflow-y-auto p-2 bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-xl custom-scrollbar animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-border/60 px-2 text-[11px] font-bold text-foreground">
              <span className="flex items-center gap-1.5">
                <AlignLeft className="w-3.5 h-3.5 text-primary" />
                Mục lục phản hồi ({sections.length})
              </span>
              <span className="text-[10px] font-normal text-muted-foreground">
                Click để chuyển tới
              </span>
            </div>

            <div className="space-y-0.5">
              {sections.map((sec, i) => {
                const isActive = activeId === sec.id;
                return (
                  <button
                    key={sec.id}
                    onClick={() => scrollToSection(sec.id)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors flex items-start gap-2 ${
                      isActive
                        ? "bg-primary/15 text-primary font-semibold"
                        : "text-foreground/80 hover:bg-muted/70 hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`text-[10px] mt-0.5 font-mono shrink-0 ${
                        isActive ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="truncate flex-1 leading-snug">
                      {sec.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Dãy vạch khía Scrubber (Ticks) — Mô phỏng đúng thiết kế trong hình ảnh */}
      <div className="flex flex-col items-center gap-1 py-1 relative">
        {/* Đường ray mờ dọc */}
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[1px] bg-border/40 -z-10" />

        {sections.map((sec, idx) => {
          const isActive = activeId === sec.id;
          const isMajor = sec.level <= 2;

          // Độ rộng của từng vạch khía
          let tickWidthClass = "w-3"; // ~12px
          if (isMajor) tickWidthClass = "w-4"; // ~16px
          if (isActive) tickWidthClass = "w-5"; // ~20px khi active

          return (
            <div
              key={sec.id}
              className="relative py-1 px-1 flex items-center justify-center cursor-pointer group/tick"
              onClick={() => scrollToSection(sec.id)}
              onMouseEnter={() => setHoveredSection(sec)}
              onMouseLeave={() => setHoveredSection(null)}
            >
              {/* Vạch khía ngang (Dash / Notch) */}
              <div
                className={`transition-all duration-200 rounded-full ${tickWidthClass} ${
                  isActive
                    ? "h-[3px] bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.8)]"
                    : isMajor
                    ? "h-[2px] bg-muted-foreground/50 group-hover/tick:bg-primary/80 group-hover/tick:w-5"
                    : "h-[1.5px] bg-muted-foreground/30 group-hover/tick:bg-primary/70 group-hover/tick:w-4"
                }`}
              />

              {/* Tooltip hiển thị tiêu đề khi hover vào vạch */}
              {hoveredSection?.id === sec.id && !showTocPopover && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-40 whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-popover/95 backdrop-blur-sm border border-border text-popover-foreground text-[11px] font-medium shadow-lg flex items-center gap-1.5 pointer-events-none animate-in fade-in zoom-in-95 duration-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    #{idx + 1}
                  </span>
                  <span className="max-w-[200px] truncate">{sec.title}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Nút nhảy nhanh lên đầu câu hỏi của user (nếu có) */}
      {onScrollToPrompt && (
        <button
          onClick={onScrollToPrompt}
          title="Cuộn lên câu hỏi của bạn"
          className="mt-1.5 p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <ChevronUp className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
