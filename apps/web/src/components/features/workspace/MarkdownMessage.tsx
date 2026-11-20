"use client";

import React, { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { generateSectionSlug } from "@/components/features/mock-room/MessageContentScroll";

/**
 * Trích xuất text thuần từ ReactNode
 */
function extractTextFromReactNode(node: React.ReactNode): string {
  if (!node) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractTextFromReactNode).join("");
  if (React.isValidElement(node) && node.props && (node.props as any).children) {
    return extractTextFromReactNode((node.props as any).children);
  }
  return "";
}

/**
 * Code Block với nút Copy mã tiện lợi giống ChatGPT
 */
function CodeBlock({ children, className, ...props }: any) {
  const [copied, setCopied] = useState(false);
  const codeText = extractTextFromReactNode(children);

  // Lấy ngôn ngữ từ className (vd: language-typescript -> typescript)
  const langMatch = /language-(\w+)/.exec(className || "");
  const lang = langMatch ? langMatch[1] : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-border/70 bg-muted/40 shadow-sm">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-muted/80 border-b border-border/60 text-[11px] text-muted-foreground font-mono">
        <span className="uppercase tracking-wider font-semibold">{lang || "code"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-background/80 text-foreground/80 hover:text-foreground transition-colors"
          title="Sao chép đoạn mã"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-500 font-medium">Đã sao chép</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Sao chép</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 text-xs font-mono overflow-x-auto text-foreground/90 leading-relaxed custom-scrollbar">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

/**
 * Render câu trả lời LLM dạng Markdown đẹp (heading, bold, list, bảng...)
 * giống ChatGPT — hỗ trợ gán ID để nhảy mục scroll cho từng prompt.
 */
export function MarkdownMessage({
  content,
  messageId,
}: {
  content: string;
  messageId?: string | number;
}) {
  let cleaned = (content ?? "").trim();

  // 1. Loại bỏ toàn bộ khối suy nghĩ của mô hình reasoning (<think>...</think> hoặc mồ côi </think>)
  if (cleaned.includes("</think>")) {
    cleaned = cleaned.split("</think>").pop() || "";
  }
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>\s*/gi, "");
  cleaned = cleaned.trim();

  // 2. Loại bỏ cặp mở/đóng code block ```markdown hoặc ``` bọc ngoài toàn bộ phản hồi
  cleaned = cleaned.replace(/^```(?:markdown|md)?\s*[\r\n]+/i, "");
  cleaned = cleaned.replace(/[\r\n]+\s*```\s*$/i, "");
  cleaned = cleaned.trim();

  // 3. Nếu vẫn còn sót ```markdown ở đầu (trường hợp không có newline liền kề)
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:markdown|md)?\s*/i, "");
    cleaned = cleaned.replace(/\s*```\s*$/i, "");
    cleaned = cleaned.trim();
  }

  // 4. Xoá khoảng trắng thụt lề 1-4 spaces ở đầu dòng
  cleaned = cleaned.replace(/^[ ]{1,4}/gm, "");
  cleaned = cleaned.trim();

  // Kiểm tra văn bản có headings không để xác định gán id cho heading hay list items
  const hasHeadings = /^#{1,4}\s+/m.test(cleaned);

  // Bộ đếm slug cho lần render này
  const slugCounts: Record<string, number> = {};

  const getSectionId = (text: string) => {
    if (!messageId) return undefined;
    const rawTitle = text.replace(/[*_~`#]/g, "").trim();
    if (!rawTitle || rawTitle.length < 2) return undefined;

    let baseSlug = generateSectionSlug(rawTitle) || "sec";
    const count = (slugCounts[baseSlug] || 0) + 1;
    slugCounts[baseSlug] = count;
    const finalSlug = count > 1 ? `${baseSlug}-${count}` : baseSlug;
    return `sec-${messageId}-${finalSlug}`;
  };

  return (
    <div className="prose dark:prose-invert prose-neutral prose-sm max-w-none leading-relaxed space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, children, ...props }) => {
            const id = getSectionId(extractTextFromReactNode(children));
            return (
              <h1
                id={id}
                className="scroll-mt-20 text-xl font-bold text-foreground mt-4 mb-2 pb-1 border-b border-border/60 transition-colors"
                {...props}
              >
                {children}
              </h1>
            );
          },
          h2: ({ node, children, ...props }) => {
            const id = getSectionId(extractTextFromReactNode(children));
            return (
              <h2
                id={id}
                className="scroll-mt-20 text-lg font-bold text-foreground mt-3.5 mb-2 transition-colors"
                {...props}
              >
                {children}
              </h2>
            );
          },
          h3: ({ node, children, ...props }) => {
            const id = getSectionId(extractTextFromReactNode(children));
            return (
              <h3
                id={id}
                className="scroll-mt-20 text-base font-semibold text-foreground mt-3 mb-1.5 transition-colors"
                {...props}
              >
                {children}
              </h3>
            );
          },
          h4: ({ node, children, ...props }) => {
            const id = getSectionId(extractTextFromReactNode(children));
            return (
              <h4
                id={id}
                className="scroll-mt-20 text-sm font-semibold text-foreground mt-2 mb-1 transition-colors"
                {...props}
              >
                {children}
              </h4>
            );
          },
          p: ({ node, ...props }) => (
            <p className="text-foreground/90 leading-relaxed mb-2.5 last:mb-0" {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul className="list-disc pl-5 space-y-1.5 my-2.5 text-foreground/90" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal pl-5 space-y-1.5 my-2.5 text-foreground/90" {...props} />
          ),
          li: ({ node, children, ...props }) => {
            // Nếu bài viết không có heading thì gán id cho từng li
            const id = !hasHeadings ? getSectionId(extractTextFromReactNode(children)) : undefined;
            return (
              <li id={id} className="scroll-mt-20 leading-relaxed transition-colors" {...props}>
                {children}
              </li>
            );
          },
          strong: ({ node, ...props }) => (
            <strong className="font-semibold text-foreground" {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-4 border-primary/60 pl-4 py-1.5 my-3 bg-muted/20 rounded-r-lg text-muted-foreground italic text-sm"
              {...props}
            />
          ),
          code: ({ node, inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-muted/60 font-mono text-xs text-primary font-medium border border-border/40"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <CodeBlock className={className} {...props}>
                {children}
              </CodeBlock>
            );
          },
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-3 border border-border rounded-xl shadow-sm">
              <table className="min-w-full divide-y divide-border text-xs" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th className="px-3 py-2 bg-muted/60 text-left font-semibold text-foreground" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-3 py-2 border-t border-border text-foreground/85" {...props} />
          ),
        }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}
