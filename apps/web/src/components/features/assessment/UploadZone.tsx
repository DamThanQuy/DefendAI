"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocumentWithProgress } from "@/lib/api";
import { ACCEPTED_EXTENSIONS, FILE_INPUT_ACCEPT, MAX_FILE_SIZE } from "@/lib/constants";

type Props = {
  onFileSelected?: (file: File) => void;
  title?: string;
  description?: string;
  accept?: string;
  buttonLabel?: string;
};

export function UploadZone({
  onFileSelected,
  title = "Kéo thả hoặc chọn tệp",
  description = "Hỗ trợ định dạng PDF, DOCX, PPTX, ZIP (Tối đa 100MB)",
  accept = FILE_INPUT_ACCEPT,
  buttonLabel = "Chọn từ máy tính",
}: Props) {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [documentId, setDocumentId] = useState("");
  const [persona, setPersona] = useState("normal");

  const validateFile = (f: File): string | null => {
    const ext = "." + (f.name.split(".").pop() || "").toLowerCase();
    if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
      return `Định dạng ${ext} không được hỗ trợ`;
    }
    if (f.size > MAX_FILE_SIZE) {
      return "Tệp vượt quá 100MB";
    }
    return null;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setErrorMsg("");
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg("");
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const processFile = async () => {
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setErrorMsg(validationError);
      setIsProcessing(false);
      return;
    }

    if (onFileSelected) {
      onFileSelected(file);
    }

    const isZip = file.name.endsWith(".zip");
    setIsProcessing(true);
    setErrorMsg("");

    if (isZip) {
      setStatusText("Đang quét source code...");
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/code/scan", { method: "POST", body: formData });
        const data = await res.json();

        if (data.success) {
          sessionStorage.setItem("codeReviewData", JSON.stringify(data));
          router.push("/code-review");
        } else {
          setErrorMsg(data.error || "Quét source code thất bại");
          setIsProcessing(false);
        }
      } catch (error) {
        console.error(error);
        setErrorMsg("Lỗi mạng khi quét source code");
        setIsProcessing(false);
      }
    } else {
      setStatusText("Đang tải tài liệu lên...");
      try {
        const result = await uploadDocumentWithProgress(file, setProgressPct);
        setDocumentId(String(result.documentId));
        setIsProcessing(false);
        setShowPersonaModal(true);
      } catch (error: any) {
        console.error(error);
        setErrorMsg(error?.message || "Tải tài liệu thất bại");
        setIsProcessing(false);
      }
    }
  };

  const generateQuestions = async () => {
    setShowPersonaModal(false);
    setIsProcessing(true);
    setStatusText("AI đang phân tích và tạo câu hỏi...");

    try {
      const res = await fetch("/api/questions/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, persona })
      });
      const data = await res.json();
      
      if (data.success) {
        sessionStorage.setItem("questionsData", JSON.stringify(data.questions));
        router.push("/questions");
      }
    } catch (error) {
      console.error(error);
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full relative h-full">
      <div
        className={`w-full h-full border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ease-in-out cursor-pointer flex flex-col items-center justify-center min-h-[460px] relative overflow-hidden bg-surface ${
          isDragging
            ? "border-teal-500 bg-teal-950/30 shadow-glow"
            : "border-border hover:border-teal-700"
        } ${isProcessing || showPersonaModal ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (!isProcessing && !showPersonaModal && !file) document.getElementById("file-upload")?.click();
        }}
      >
        <div className={`w-[72px] h-[72px] rounded-full mb-8 flex items-center justify-center transition-all duration-300 bg-teal-950/40 ${isDragging ? "scale-110" : ""}`}>
          <svg className="w-8 h-8 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>

        {file ? (
          <div className="space-y-4 animate-in fade-in zoom-in duration-500 w-full max-w-xs mx-auto">
            <h3 className="text-xl font-bold text-teal-400 truncate px-4 font-mono">{file.name}</h3>
            <div className="inline-block px-4 py-1.5 bg-teal-950/40 text-teal-300 rounded-full text-xs font-semibold font-mono">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </div>

            {!isProcessing && !showPersonaModal && (
              <div className="flex flex-col gap-3 mt-8 pt-6 border-t border-border">
                <button onClick={(e) => { e.stopPropagation(); processFile(); }} className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-600 hover:brightness-110 active:scale-[0.98] text-white font-semibold rounded-full shadow-glow transition-all duration-200 text-sm">
                  Bắt đầu phân tích
                </button>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="w-full py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Hủy & Chọn tệp khác
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="animate-in fade-in duration-500 flex flex-col items-center">
            <h3 className="text-[22px] font-bold mb-3 text-foreground tracking-tight">{title}</h3>
            <p className="text-muted-foreground mb-10 text-[15px] font-medium">
              {description}
            </p>
            <button className="px-8 py-2.5 bg-teal-500 text-primary-foreground font-semibold rounded-full hover:brightness-110 transition-all duration-200 text-sm shadow-glow pointer-events-none">
              {buttonLabel}
            </button>
          </div>
        )}
        <input id="file-upload" type="file" className="hidden" onChange={handleFileChange} accept={accept} />
      </div>

      {/* Loading / Error Overlay */}
      {isProcessing && !errorMsg && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm rounded-2xl animate-in fade-in border border-border">
          <div className="w-14 h-14 border-[3px] border-border border-t-teal-500 rounded-full animate-spin mb-6"></div>
          <h3 className="text-[17px] font-bold text-foreground mb-4">{statusText}</h3>
          <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-cyan-600 transition-all duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-[13px] text-muted-foreground mt-2 font-mono">{progressPct}%</p>
        </div>
      )}

      {errorMsg && !isProcessing && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm rounded-2xl animate-in fade-in border border-border px-6 text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.48 14.7A1 1 0 002.74 21h18.52a1 1 0 00.87-1.44l-8.48-14.7a1 1 0 00-1.74 0z" />
            </svg>
          </div>
          <h3 className="text-[16px] font-bold text-foreground mb-2">Đã xảy ra lỗi</h3>
          <p className="text-[14px] text-red-400 mb-6 max-w-xs">{errorMsg}</p>
          <button
            onClick={() => { setErrorMsg(""); processFile(); }}
            className="px-8 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 hover:brightness-110 text-white font-semibold rounded-full shadow-glow transition-all duration-200 text-sm"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Persona Selection Modal */}
      {showPersonaModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-surface rounded-2xl p-8 max-w-lg w-full shadow-2xl border border-border animate-in zoom-in-95 duration-300 shadow-glow">
            <h3 className="text-2xl font-bold text-teal-400 mb-2">Chọn Giám Khảo AI</h3>
            <p className="text-muted-foreground mb-8 text-[15px]">Hãy chọn phong cách hỏi để AI chuẩn bị những câu hỏi phù hợp nhất với buổi bảo vệ của bạn.</p>

            <div className="space-y-4 mb-8">
              {[
                { id: 'normal', name: 'Giảng viên hướng dẫn', desc: 'Hỏi bao quát, mang tính chất xây dựng và gợi mở.' },
                { id: 'hard', name: 'Hội đồng phản biện khó tính', desc: 'Soi xét kỹ các lỗ hổng, hỏi xoáy đáp xoay.' },
                { id: 'tech', name: 'Chuyên gia kỹ thuật sâu', desc: 'Đi sâu vào architecture, performance và code optimization.' }
              ].map(p => (
                <div
                  key={p.id}
                  onClick={() => setPersona(p.id)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                    persona === p.id
                      ? 'border-teal-500 bg-teal-950/40 shadow-glow'
                      : 'border-border hover:border-zinc-700 hover:bg-muted'
                  }`}
                >
                  <h4 className={`font-bold ${persona === p.id ? 'text-teal-300' : 'text-foreground'}`}>{p.name}</h4>
                  <p className="text-sm text-muted-foreground mt-1">{p.desc}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-4">
              <button onClick={() => setShowPersonaModal(false)} className="flex-1 py-3 bg-muted hover:bg-zinc-800 text-foreground font-semibold rounded-xl transition-all duration-200">
                Hủy bỏ
              </button>
              <button onClick={generateQuestions} className="flex-1 py-3 bg-gradient-to-r from-teal-500 to-cyan-600 hover:brightness-110 active:scale-[0.98] text-white font-bold rounded-xl shadow-glow transition-all duration-200">
                Tạo câu hỏi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
