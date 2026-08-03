"use client";

import React from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { UploadZone } from "@/components/features/assessment/UploadZone";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function UploadModal({ open, onClose }: Props) {
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
            className="bg-white rounded-2xl p-6 md:p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-[#0f2e82]">Tải lên tài liệu mới</h3>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <UploadZone />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}