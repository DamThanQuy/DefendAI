"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { PersonaPicker } from "@/components/features/assessment/PersonaPicker";
import { PERSONAS } from "@/lib/constants";

type Props = {
  open: boolean;
  filename: string;
  onClose: () => void;
  onConfirm: (persona: string) => void;
};

/** Popup chọn persona trước khi phân tích 1 tài liệu đã upload (từ list). */
export function AnalyzeModal({ open, filename, onClose, onConfirm }: Props) {
  const [persona, setPersona] = useState<string>(PERSONAS[0].key);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="bg-card rounded-2xl p-6 md:p-8 max-w-lg w-full shadow-2xl border border-zinc-800/60"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-bold text-foreground">Chọn Giám Khảo AI</h3>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-zinc-800/60 text-zinc-500 transition-colors"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-[13px] text-zinc-500 mb-5 truncate">
              Phân tích <span className="font-semibold text-zinc-300">{filename}</span>
            </p>

            <PersonaPicker value={persona} onChange={setPersona} />

            <div className="flex gap-3 pt-5 mt-5 border-t border-zinc-800/60">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 text-sm font-medium text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-full transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={() => onConfirm(persona)}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-full shadow-md transition-colors text-sm"
              >
                Bắt đầu phân tích
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}