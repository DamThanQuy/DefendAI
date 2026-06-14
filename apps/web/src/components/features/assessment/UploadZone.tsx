"use client";

import { useState, useCallback } from "react";

type Props = {
  onFileSelected?: (file: File) => void;
};

/**
 * Stub UploadZone — chọn file rồi gọi callback.
 * Sẽ được nâng cấp để gọi API upload sau.
 */
export function UploadZone({ onFileSelected }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
        setFileName(file.name);
        onFileSelected?.(file);
      }
    },
    [onFileSelected],
  );

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setFileName(file.name);
        onFileSelected?.(file);
      }
    },
    [onFileSelected],
  );

  return (
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
      <p className="text-lg font-medium">Kéo thả file PDF / DOCX / PPTX / ZIP vào đây</p>
      <p className="mt-2 text-sm text-muted-foreground">hoặc</p>

      <label className="mt-4 inline-block cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
        Chọn file
        <input
          type="file"
          accept=".pdf,.docx,.pptx,.zip"
          onChange={onChange}
          className="hidden"
        />
      </label>

      {fileName && (
        <p className="mt-4 text-sm text-foreground">
          Đã chọn: <span className="font-semibold">{fileName}</span>
        </p>
      )}
    </div>
  );
}

export default UploadZone;
