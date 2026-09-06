"use client";

import { useEffect, useRef, useState } from "react";
import { getAnalysisStatus, getAnalysisMatches } from "@/lib/api";
import { AnalysisStatusOut, RequirementMatchesResponse } from "@/types";

const POLL_INTERVAL_MS = 2000;

const STEP_LABELS: Record<string, string> = {
  extracting: "Đang giải nén ZIP",
  indexing: "Đang phân tích source code",
  matching: "Đang đối chiếu requirement…",
  explaining: "Đang phân tích bằng chứng…",
};

const STEPS = ["extracting", "indexing", "matching", "explaining"] as const;

interface AnalysisProgressProps {
  jobId: number;
  onComplete: (matches: RequirementMatchesResponse) => void;
  onError: (error: string) => void;
}

function stepIndex(current: string | null): number {
  if (!current) return -1;
  if (current.includes("explaining")) return 3;
  if (current.includes("matching")) return 2;
  if (current.includes("indexing")) return 1;
  if (current.includes("extracting")) return 0;
  return -1;
}

export function AnalysisProgress({ jobId, onComplete, onError }: AnalysisProgressProps) {
  const [status, setStatus] = useState<AnalysisStatusOut | null>(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const poll = async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    try {
      const { data } = await getAnalysisStatus(jobId);
      if (!mountedRef.current) return;
      setStatus(data);

      if (data.status === "completed" || data.status === "partial") {
        stopPolling();
        // Fetch matches
        const { data: matches } = await getAnalysisMatches(jobId);
        if (mountedRef.current) onComplete(matches);
        return;
      }
      if (data.status === "failed" || data.status === "rejected" || data.status === "timeout") {
        stopPolling();
        if (mountedRef.current) onError(data.error ?? "Phân tích thất bại");
        return;
      }
    } catch {
      // Network errors — keep polling
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    poll(); // immediate first poll
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentIdx = stepIndex(status?.current_step ?? null);
  const progress = status?.progress ?? 0;
  const currentLabel = status?.current_step
    ? (STEP_LABELS[status.current_step.split(":")[0]] ?? status.current_step)
    : "Đang khởi tạo…";

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-sm text-muted-foreground font-medium w-10 text-right shrink-0">
          {progress}%
        </span>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((step, idx) => {
          const isDone = idx < currentIdx;
          const isActive = idx === currentIdx;
          return (
            <div key={step} className="flex items-center gap-2 flex-1">
              {/* Step dot */}
              <div
                className={`
                  w-3 h-3 rounded-full shrink-0 transition-all duration-300
                  ${isDone ? "bg-green-500" : isActive ? "bg-teal-500 animate-pulse" : "bg-muted"}
                `}
              />
              {/* Step label */}
              <span
                className={`
                  text-xs font-medium truncate
                  ${isDone ? "text-green-500" : isActive ? "text-teal-400" : "text-muted-foreground"}
                `}
              >
                {step.charAt(0).toUpperCase() + step.slice(1)}
              </span>
              {/* Connector */}
              {idx < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px ${idx < currentIdx ? "bg-green-500" : "bg-muted"}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Current step text */}
      <p className="text-sm text-muted-foreground text-center">{currentLabel}</p>
    </div>
  );
}
