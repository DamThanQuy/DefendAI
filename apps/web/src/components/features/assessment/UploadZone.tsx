"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";


export function UploadZone() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [documentId, setDocumentId] = useState("");
  const [persona, setPersona] = useState("normal");

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

type Props = {
  onFileSelected?: (file: File) => void;
  title?: string;
  description?: string;
  accept?: string;
  buttonLabel?: string;
};

/** UploadZone — chọn file rồi gọi callback. */
export function UploadZone({
  onFileSelected,
  title,
  description,
  accept,
  buttonLabel,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
 ([FEAT]: Tich hop AI de scan file")

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const processFile = async () => {
    if (!file) return;

    const isZip = file.name.endsWith('.zip') || file.name.endsWith('.rar');
    setIsProcessing(true);

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
        }
      } catch (error) {
        console.error(error);
        setIsProcessing(false);
      }
    } else {
      setStatusText("Đang tải tài liệu lên...");
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
        const data = await res.json();
        
        if (data.success) {
          setDocumentId(data.documentId);
          setIsProcessing(false);
          setShowPersonaModal(true);
        }
      } catch (error) {
        console.error(error);
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
 feature/AI-integration

    <div className="w-full">

    <div className="w-full relative h-full">

      <div
        className={`w-full h-full border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ease-in-out cursor-pointer flex flex-col items-center justify-center min-h-[460px] relative overflow-hidden bg-white ${
          isDragging
            ? "border-[#0f2e82] bg-[#e8effd]/30"
            : "border-gray-300 hover:border-[#0f2e82]/40"
        } ${isProcessing || showPersonaModal ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (!isProcessing && !showPersonaModal && !file) document.getElementById("file-upload")?.click();
        }}
      >
        <div className={`w-[72px] h-[72px] rounded-full mb-8 flex items-center justify-center transition-all duration-300 ${isDragging ? "bg-[#e8effd] scale-110" : "bg-[#e8effd]"}`}>
          <svg className="w-8 h-8 text-[#0f2e82]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        
        {file ? (
          <div className="space-y-4 animate-in fade-in zoom-in duration-500 w-full max-w-xs mx-auto">
            <h3 className="text-xl font-bold text-[#0f2e82] truncate px-4">{file.name}</h3>
            <div className="inline-block px-4 py-1.5 bg-[#e8effd] text-[#0f2e82] rounded-full text-xs font-semibold">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </div>
            
            {!isProcessing && !showPersonaModal && (
              <div className="flex flex-col gap-3 mt-8 pt-6 border-t border-gray-100">
                <button onClick={(e) => { e.stopPropagation(); processFile(); }} className="w-full py-3 bg-[#0f2e82] hover:bg-[#0f2e82]/90 text-white font-semibold rounded-full shadow-md transition-colors text-sm">
                  Bắt đầu phân tích
                </button>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="w-full py-3 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors">
                  Hủy & Chọn tệp khác
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="animate-in fade-in duration-500 flex flex-col items-center">
            <h3 className="text-[22px] font-bold mb-3 text-gray-900 tracking-tight">Kéo thả hoặc chọn tệp</h3>
            <p className="text-[#5f6368] mb-10 text-[15px] font-medium">
              Hỗ trợ định dạng PDF, DOCX (Tối đa 50MB)
            </p>
            <button className="px-8 py-2.5 bg-[#0f2e82] text-white font-semibold rounded-full hover:bg-[#0f2e82]/90 transition-colors text-sm shadow-sm pointer-events-none">
              Chọn từ máy tính
            </button>
          </div>
        )}
        
=======
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={[
        "rounded-xl border-2 border-dashed p-10 text-center transition-colors",
        dragOver ? "border-primary bg-muted" : "border-border",
      ].join(" ")}
    >
      <p className="text-lg font-medium">
        {title ?? "Kéo thả file PDF / DOCX / PPTX / ZIP vào đây"}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {description ?? "hoặc"}
      </p>

      <label className="mt-4 inline-block cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
        {buttonLabel ?? "Chọn file"}
 ([FEAT]: Tich hop AI de scan file")
        <input
 feature/AI-integration
          id="file-upload"
          type="file"
          accept={accept ?? ".pdf,.docx,.pptx,.zip"}
          onChange={onChange}
 ([FEAT]: Tich hop AI de scan file")
          className="hidden"
          onChange={handleFileChange}
          accept=".pdf,.docx,.zip,.rar"

          id="file-upload" type="file" className="hidden"
          onChange={handleFileChange} accept=".pdf,.docx,.zip,.rar"

        />
      </div>

      {/* Loading Overlay */}
      {isProcessing && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm rounded-2xl animate-in fade-in border border-gray-100">
          <div className="w-14 h-14 border-[3px] border-[#e8effd] border-t-[#0f2e82] rounded-full animate-spin mb-6"></div>
          <h3 className="text-[17px] font-bold text-gray-900">{statusText}</h3>
        </div>
      )}

      {/* Persona Selection Modal */}
      {showPersonaModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-300">
            <h3 className="text-2xl font-bold text-[#0f2e82] mb-2">Chọn Giám Khảo AI</h3>
            <p className="text-gray-500 mb-8 text-[15px]">Hãy chọn phong cách hỏi để AI chuẩn bị những câu hỏi phù hợp nhất với buổi bảo vệ của bạn.</p>
            
            <div className="space-y-4 mb-8">
              {[
                { id: 'normal', name: 'Giảng viên hướng dẫn', desc: 'Hỏi bao quát, mang tính chất xây dựng và gợi mở.' },
                { id: 'hard', name: 'Hội đồng phản biện khó tính', desc: 'Soi xét kỹ các lỗ hổng, hỏi xoáy đáp xoay.' },
                { id: 'tech', name: 'Chuyên gia kỹ thuật sâu', desc: 'Đi sâu vào architecture, performance và code optimization.' }
              ].map(p => (
                <div 
                  key={p.id}
                  onClick={() => setPersona(p.id)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    persona === p.id ? 'border-[#0f2e82] bg-[#e8effd]' : 'border-gray-200 hover:border-[#0f2e82]/30'
                  }`}
                >
                  <h4 className={`font-bold ${persona === p.id ? 'text-[#0f2e82]' : 'text-gray-900'}`}>{p.name}</h4>
                  <p className="text-sm text-gray-500 mt-1">{p.desc}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-4">
              <button onClick={() => setShowPersonaModal(false)} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-xl transition-colors">
                Hủy bỏ
              </button>
              <button onClick={generateQuestions} className="flex-1 py-3 bg-[#0f2e82] hover:bg-[#0f2e82]/90 text-white font-bold rounded-xl shadow-lg transition-colors">
                Tạo câu hỏi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
