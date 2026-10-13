"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Render câu trả lời LLM dạng Markdown đẹp (heading, bold, list, bảng...)
 * giống ChatGPT — dùng chung cho chat workspace.
 *
 * remark-gfm: hỗ trợ bảng (|...|), strikethrough, task list — LLM hay trả
 * lời bằng bảng nên bắt buộc phải có.
 */
export function MarkdownMessage({ content }: { content: string }) {
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

  // 4. Xoá khoảng trắng thụt lề 1-4 spaces ở đầu dòng (để CommonMark không hiểu nhầm văn bản thành indented code block)
  cleaned = cleaned.replace(/^[ ]{1,4}/gm, "");
  cleaned = cleaned.trim();

  return (
    <div className="prose dark:prose-invert prose-neutral prose-sm max-w-none leading-relaxed space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => (
            <h1 className="text-xl font-bold text-foreground mt-4 mb-2 pb-1 border-b border-border/60" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-lg font-bold text-foreground mt-3.5 mb-2" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-base font-semibold text-foreground mt-3 mb-1.5" {...props} />
          ),
          h4: ({ node, ...props }) => (
            <h4 className="text-sm font-semibold text-foreground mt-2 mb-1" {...props} />
          ),
          p: ({ node, ...props }) => (
            <p className="text-foreground/90 leading-relaxed mb-2.5 last:mb-0" {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul className="list-disc pl-5 space-y-1.5 my-2.5 text-foreground/90" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal pl-5 space-y-1.5 my-2.5 text-foreground/90" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="leading-relaxed" {...props} />
          ),
          strong: ({ node, ...props }) => (
            <strong className="font-semibold text-foreground" {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 border-primary/60 pl-4 py-1.5 my-3 bg-muted/20 rounded-r-lg text-muted-foreground italic text-sm" {...props} />
          ),
          code: ({ node, inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code className="px-1.5 py-0.5 rounded bg-muted/60 font-mono text-xs text-primary font-medium border border-border/40" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <div className="my-3 rounded-xl overflow-hidden border border-border/60 bg-muted/30">
                <pre className="p-3.5 text-xs font-mono overflow-x-auto text-foreground/90 leading-relaxed">
                  <code {...props}>{children}</code>
                </pre>
              </div>
            );
          },
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-3 border border-border rounded-xl">
              <table className="min-w-full divide-y divide-border text-xs" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th className="px-3 py-2 bg-muted/50 text-left font-semibold text-foreground" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-3 py-2 border-t border-border text-foreground/80" {...props} />
          ),
        }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}
