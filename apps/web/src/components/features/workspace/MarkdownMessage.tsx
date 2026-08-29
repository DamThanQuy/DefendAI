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
  return (
    <div className="prose prose-invert prose-sm max-w-none leading-relaxed markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
