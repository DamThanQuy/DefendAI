"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "@/lib/constants";
import { useAuth } from "@/hooks/useAuth";
import { getMeetingMessages, postMeetingMessage, type MeetingMessageItem } from "@/lib/api";
import {
  Mic,
  Hand,
  MoreHorizontal,
  MessageSquare,
  Settings,
  Users,
  Send,
  Loader2,
  X,
  MicOff,
  ScreenShare,
  ScreenShareOff,
  PhoneOff,
  Play,
  Pause,
  RotateCcw,
  Clock,
  Maximize2,
  Minimize2,
} from "lucide-react";

type Message = {
  id?: number;
  sender_name: string;
  sender_role: string;
  content: string;
  created_at?: string;
};

type QAMessage = {
  type: string;
  question_id?: string;
  question?: string;
  clo?: string;
  qa_type?: string;
  q_type?: string;
  type?: string;
  difficulty?: string;
  feedback?: string;
  quality_criteria_met?: string[];
  criteria_not_met?: string[];
  confidence?: number;
  hint?: string;
  level?: number;
  coverage?: Record<string, number>;
  summary?: any;
  message?: string;
  session_id?: string;
};

// ICE servers công khai (Google STUN). Đủ cho kết nối P2P trong hầu hết mạng.
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export default function MockRoomPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawMeeting = searchParams.get("meeting");
  const meetingId = rawMeeting ? Number(rawMeeting) : 0;
  const { hasRole, user } = useAuth();

  // Không có ?meeting= → quay về trang chọn mentor/phòng thay vì vào thẳng phòng 1
  useEffect(() => {
    if (!meetingId) {
      router.replace("/mock-room");
    }
  }, [meetingId, router]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<{question_id: string; question: string; clo: string; type: string; difficulty: string} | null>(null);
  // KHÔNG chấm điểm số — chỉ theo dõi CLO coverage (theo rubric)
  const [coverage, setCoverage] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // --- Sidebar tabs: trò chuyện / mọi người / hỏi & đáp ---
  type TabKey = "chat" | "people" | "qa";
  const [activeTab, setActiveTab] = useState<TabKey>("chat");

  // --- Danh sách người có mặt trong phòng (presence) ---
  type Participant = { user_id: number; name: string; role: string };
  const [participants, setParticipants] = useState<Participant[]>([]);

  // --- Tile đang được phóng to (click vào màn hình share để xem full) ---
  const [expandedTile, setExpandedTile] = useState<number | null>(null);

  // --- Modal xác nhận rời phòng ---
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // --- Hỏi & Đáp: mentor đặt câu hỏi trong giai đoạn chất vấn ---
  type QAItem = { id: number; question: string; asked_by: string; created_at: string };
  const [qaList, setQaList] = useState<QAItem[]>([]);
  const [qaInput, setQaInput] = useState("");

  // --- Timer: thời gian đã tham gia phòng ---
  const [elapsed, setElapsed] = useState(0); // giây
  const joinedAtRef = useRef<number>(Date.now());

  // --- WebRTC state ---
  const [micOn, setMicOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [signalStatus, setSignalStatus] = useState<"idle" | "connecting" | "ready" | "peer-left">("idle");

  // Đồng bộ srcObject vào video overlay mỗi khi phóng to hoặc stream thay đổi.
  // (Tránh lỗi màn hình đen do tile gốc bị ẩn → ref chuyển sang overlay nhưng thiếu stream)
  useEffect(() => {
    if (expandedTile === null) return;
    const localStream = localStreamRef.current || screenStreamRef.current;
    if (expandedLocalVideoRef.current && localStream) {
      expandedLocalVideoRef.current.srcObject = localStream;
      expandedLocalVideoRef.current.play().catch(() => {});
    }
    // Remote stream được gán trong ontrack; ở đây chỉ gán lại nếu đã có
    if (expandedRemoteVideoRef.current && remoteVideoRef.current?.srcObject) {
      expandedRemoteVideoRef.current.srcObject = remoteVideoRef.current.srcObject;
      expandedRemoteVideoRef.current.play().catch(() => {});
    }
  }, [expandedTile, peerConnected, micOn, sharing]);

  // --- 3 giai đoạn bảo vệ (countdown) ---
  // Thuyết trình 15p → Chất vấn 10p → Nhận xét 5p
  type Phase = { key: string; label: string; minutes: number };
  const PHASES: Phase[] = [
    { key: "present", label: "Thuyết trình", minutes: 15 },
    { key: "defense", label: "Chất vấn", minutes: 10 },
    { key: "feedback", label: "Nhận xét", minutes: 5 },
  ];
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [phaseRemaining, setPhaseRemaining] = useState(PHASES[0].minutes * 60); // giây
  const [phaseRunning, setPhaseRunning] = useState(false);
  const phaseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Vai trò của user hiện tại trong phòng (student / mentor)
  const myRole: "student" | "mentor" | "other" = hasRole("mentor")
    ? "mentor"
    : hasRole("student")
      ? "student"
      : "other";

  // Ref luôn giữ vai trò mới nhất (để STT capture tại mount vẫn đúng role)
  const myRoleRef = useRef<"student" | "mentor" | "other">(myRole);
  myRoleRef.current = myRole;

  // Ref giữ user mới nhất (dùng cho fallback persist khi WS chưa sẵn sàng)
  const userRef = useRef(user);
  userRef.current = user;

  const recognitionRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isIntentionalStopRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // WebRTC refs
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const signalWsRef = useRef<WebSocket | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  // Ref riêng cho video trong overlay phóng to (tránh conflict với tile gốc)
  const expandedLocalVideoRef = useRef<HTMLVideoElement | null>(null);
  const expandedRemoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const isInitiatorRef = useRef(false);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);

  // Perfect-negotiation refs (cho phép BẤT KỲ peer nào khởi tạo kết nối)
  const politeRef = useRef(false); // peer vào sau = polite (nhường quyền khi tranh chấp)
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const signalingWsReadyRef = useRef(false);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Timer: đếm thời gian đã tham gia phòng
  useEffect(() => {
    joinedAtRef.current = Date.now();
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - joinedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [meetingId]);

  const fmtElapsed = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  };

  const fmtPhase = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(m)}:${pad(sec)}`;
  };

  // Đếm ngược giai đoạn hiện tại
  useEffect(() => {
    if (!phaseRunning) return;
    phaseTimerRef.current = setInterval(() => {
      setPhaseRemaining((prev) => {
        if (prev <= 1) {
          // Hết giờ giai đoạn → chuyển sang giai đoạn tiếp theo (nếu còn)
          if (phaseIdx < PHASES.length - 1) {
            const next = phaseIdx + 1;
            setPhaseIdx(next);
            return PHASES[next].minutes * 60;
          }
          setPhaseRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (phaseTimerRef.current) clearInterval(phaseTimerRef.current);
    };
  }, [phaseRunning, phaseIdx]);

  const startPhase = () => setPhaseRunning(true);
  const pausePhase = () => setPhaseRunning(false);
  const resetPhase = () => {
    setPhaseRunning(false);
    setPhaseIdx(0);
    setPhaseRemaining(PHASES[0].minutes * 60);
  };

  // ===========================================================================
  // WebRTC signaling
  // ===========================================================================
  const createPeerConnection = useCallback(async () => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        if (localStreamRef.current) pc.addTrack(track, localStreamRef.current);
      });
    }

    // Perfect negotiation: BẤT KỲ peer nào thêm track (bật mic / share) đều tự
    // tạo offer. Tránh lỗi "2 người ở 2 phòng khác nhau" do chỉ initiator mới
    // được phép bắt đầu kết nối.
    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current = true;
        await pc.setLocalDescription(await pc.createOffer());
        if (signalingWsReadyRef.current) {
          signalWsRef.current?.send(
            JSON.stringify({ type: "offer", payload: pc.localDescription }),
          );
        }
      } catch (err) {
        console.error("negotiationneeded error", err);
      } finally {
        makingOfferRef.current = false;
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && signalingWsReadyRef.current) {
        signalWsRef.current?.send(
          JSON.stringify({ type: "ice-candidate", payload: e.candidate.toJSON() }),
        );
      }
    };

    pc.ontrack = (e) => {
      const [remoteStream] = e.streams;
      if (!remoteStream) return;
      const hasVideo = remoteStream.getVideoTracks().length > 0;
      if (hasVideo && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch(() => {});
      }
      // Nếu đang phóng to → gán stream vào video overlay luôn (tránh màn hình đen)
      if (hasVideo && expandedRemoteVideoRef.current) {
        expandedRemoteVideoRef.current.srcObject = remoteStream;
        expandedRemoteVideoRef.current.play().catch(() => {});
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(() => {});
      }
      setPeerConnected(true);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setPeerConnected(true);
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        setPeerConnected(false);
      }
    };

    pcRef.current = pc;
    return pc;
  }, []);

  const makeOffer = useCallback(async () => {
    const pc = pcRef.current ?? (await createPeerConnection());
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (signalingWsReadyRef.current) {
      signalWsRef.current?.send(JSON.stringify({ type: "offer", payload: offer }));
    }
  }, [createPeerConnection]);

  const handleSignalMessage = useCallback(
    async (data: any) => {
      const pc = pcRef.current ?? (await createPeerConnection());
      switch (data.type) {
        case "joined":
          // Peer vào sau = polite (nhường khi tranh chấp offer). Peer đầu = impolite.
          politeRef.current = data.you_are !== "initiator";
          isInitiatorRef.current = data.you_are === "initiator";
          signalingWsReadyRef.current = true;
          setSignalStatus("ready");
          // Cập nhật danh sách người có mặt (presence) ngay khi join —
          // KHÔNG cần chờ bên kia bật mic mới hiện 2/2.
          if (data.presence) setParticipants(data.presence);
          // Nếu đã có sẵn media (mic/share bật trước khi peer vào) → tự offer
          if (localStreamRef.current && pc.signalingState === "stable") {
            await makeOffer();
          }
          break;
        case "peer-joined":
          // Peer mới vào; nếu mình đã có media → chủ động offer lại
          if (localStreamRef.current && pc.signalingState === "stable") {
            await makeOffer();
          }
          break;
        case "presence":
          // Server broadcast danh sách người có mặt (khi có người join/leave)
          if (data.participants) setParticipants(data.participants);
          break;
        case "offer": {
          const offerCollision =
            makingOfferRef.current ||
            (pc.signalingState !== "stable" && !politeRef.current);
          ignoreOfferRef.current = !politeRef.current && offerCollision;
          if (ignoreOfferRef.current) break;
          await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
          for (const c of pendingIceRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
          pendingIceRef.current = [];
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (signalingWsReadyRef.current) {
            signalWsRef.current?.send(JSON.stringify({ type: "answer", payload: answer }));
          }
          break;
        }
        case "answer": {
          await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
          for (const c of pendingIceRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
          pendingIceRef.current = [];
          break;
        }
        case "ice-candidate": {
          const cand = new RTCIceCandidate(data.payload);
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(cand).catch(() => {});
          } else {
            pendingIceRef.current.push(data.payload);
          }
          break;
        }
        case "peer-left":
          setPeerConnected(false);
          setSignalStatus("peer-left");
          if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
          }
          break;
        case "chat": {
          // Tin nhắn / speech-to-text từ peer (hoặc echo từ chính mình).
          // Đã được server lưu DB → chỉ cần hiển thị. Tránh trùng với optimistic
          // update (cùng content + cùng sender_role + chưa có id).
          setMessages(prev => {
            const exists = prev.some(
              (m) => m.content === data.content && m.sender_role === data.sender_role && (m.id !== undefined || m.sender_name === data.sender_name)
            );
            if (exists) return prev;
            return [...prev, {
              id: undefined,
              sender_name: data.sender_name || (data.sender_role === "student" ? "Sinh viên" : "Mentor"),
              sender_role: data.sender_role,
              content: data.content,
              created_at: data.created_at || new Date().toISOString(),
            } as Message];
          });
          break;
        }
        case "qa_question": {
          // Câu hỏi từ Mentor (relay từ peer hoặc echo từ chính mình)
          setQaList(prev => {
            if (prev.some((q) => q.question === data.question && q.asked_by === data.asked_by)) return prev;
            return [...prev, {
              id: Date.now(),
              question: data.question,
              asked_by: data.asked_by || "Mentor",
              created_at: data.created_at || new Date().toISOString(),
            }];
          });
          break;
        }
        case "room-full":
          setSignalStatus("peer-left");
          break;
      }
    },
    [createPeerConnection, makeOffer],
  );

  const connectSignaling = useCallback(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    // Đã có WS signaling (đang mở hoặc đang kết nối) → KHÔNG tạo thêm.
    // Tránh 1 trình duyệt chiếm 2 slot phòng → peer kia bị "room-full"
    // (lỗi "2 người ở 2 phòng khác nhau" khi bật mic/STT quá sớm).
    if (
      signalWsRef.current &&
      signalWsRef.current.readyState !== WebSocket.CLOSED &&
      signalWsRef.current.readyState !== WebSocket.CLOSING
    ) {
      return;
    }
    const wsUrl = `${API_BASE_URL.replace("http", "ws")}/api/meetings/${meetingId}/signal?token=${token}`;
    const ws = new WebSocket(wsUrl);
    signalWsRef.current = ws;
    setSignalStatus("connecting");
    ws.onopen = () => {
      // Nếu WS đã bị thay thế (trường hợp hiếm) → bỏ qua
      if (signalWsRef.current !== ws) return;
      signalingWsReadyRef.current = true;
      // Nếu đã có media trước khi WS mở → tự offer ngay
      if (localStreamRef.current && pcRef.current && pcRef.current.signalingState === "stable") {
        makeOffer();
      }
    };
    ws.onmessage = async (ev) => {
      try {
        const data = JSON.parse(ev.data);
        await handleSignalMessage(data);
      } catch (err) {
        console.error("Signal parse error", err);
      }
    };
    ws.onclose = () => {
      signalingWsReadyRef.current = false;
      setSignalStatus("idle");
    };
    ws.onerror = () => setSignalStatus("idle");
  }, [meetingId, handleSignalMessage, makeOffer]);

  // ===========================================================================
  // Voice chat (mic)
  // ===========================================================================
  const toggleMic = async () => {
    if (!micOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true;
        }
        if (!pcRef.current) await createPeerConnection();
        const pc = pcRef.current!;
        stream.getAudioTracks().forEach((track) => {
          const exists = pc.getSenders().some((s) => s.track === track);
          if (!exists) pc.addTrack(track, stream);
        });
        // onnegotiationneeded sẽ tự tạo offer khi thêm track; nếu WS chưa mở thì kết nối
        connectSignaling();
        setMicOn(true);
        // Tích hợp STT vào mic: bật mic → bật nhận dạng giọng nói (nếu trình duyệt hỗ trợ)
        startSTT();
      } catch (err) {
        alert("Không thể truy cập microphone. Vui lòng cấp quyền.");
        console.error(err);
      }
    } else {
      localStreamRef.current?.getAudioTracks().forEach((t) => t.stop());
      if (localStreamRef.current?.getVideoTracks().length === 0) {
        localStreamRef.current = null;
      }
      setMicOn(false);
      // Tắt mic → tắt nhận dạng giọng nói
      stopSTT();
    }
  };

  // ===========================================================================
  // Screen share
  // ===========================================================================
  const toggleScreenShare = async () => {
    if (!sharing) {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        screenStreamRef.current = screen;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screen;
          localVideoRef.current.muted = true;
        }
        if (!pcRef.current) await createPeerConnection();
        const pc = pcRef.current!;
        const videoTrack = screen.getVideoTracks()[0];
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (sender) {
          await sender.replaceTrack(videoTrack);
        } else {
          pc.addTrack(videoTrack, screen);
        }
        videoTrack.onended = () => stopScreenShare();
        // onnegotiationneeded sẽ tự offer khi track video được thêm/thay thế
        connectSignaling();
        setSharing(true);
      } catch (err) {
        console.error("Screen share error", err);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    setSharing(false);
  };

  // Khởi tạo signaling khi mount
  useEffect(() => {
    if (!meetingId) return; // chưa chọn phòng → không kết nối
    connectSignaling();
    return () => {
      signalWsRef.current?.close();
      pcRef.current?.close();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  // Tải lịch sử tin nhắn / speech-to-text đã lưu (để xem lại sau reload)
  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;
    getMeetingMessages(meetingId)
      .then((res) => {
        if (cancelled) return;
        const history: Message[] = (res.data || []).map((m: MeetingMessageItem) => ({
          id: m.id,
          sender_name: m.sender_name,
          sender_role: m.sender_role,
          content: m.content,
          created_at: m.created_at,
        }));
        if (history.length > 0) setMessages(history);
      })
      .catch((e) => console.error("Failed to load meeting messages", e));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!meetingId) return; // chưa chọn phòng → không kết nối
    const token = localStorage.getItem("access_token");
    if (!token) {
      console.error("No auth token found");
      return;
    }

    const wsUrl = `${API_BASE_URL.replace("http", "ws")}/api/mock-qa/${meetingId}/ws?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWSMessage(data);
      } catch (err) {
        console.error("Failed to parse WS message", err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log("WebSocket disconnected");
    };

    ws.onerror = (err) => {
      console.error("WebSocket error", err);
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [meetingId]);

  const handleWSMessage = (data: QAMessage) => {
    switch (data.type) {
      case "connected":
        setSessionId(data.session_id);
        break;
      case "question":
        setCurrentQuestion({
          question_id: data.question_id!,
          question: data.question!,
          clo: data.clo!,
          type: (data.q_type || data.type || "Deep-dive") as string,
          difficulty: data.difficulty!,
        });
        setIsLoading(false);
        break;
      case "feedback":
        // Cập nhật CLO coverage (KHÔNG chấm điểm số)
        setCoverage(data.coverage || {});
        // Add feedback as a message (nhận xét định tính theo rubric)
        const feedbackMsg = {
          sender_name: "AI Hội đồng",
          sender_role: "assistant",
          content: `${data.feedback}`,
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, feedbackMsg as Message]);
        break;
      case "coverage_update":
        setCoverage(data.coverage || {});
        break;
      case "hint":
        // Add hint as a message
        const hintMsg = {
          sender_name: "AI Mentor",
          sender_role: "assistant",
          content: `💡 **Gợi ý (Level ${data.level})**: ${data.hint}`,
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, hintMsg as Message]);
        break;
      case "done":
        // Session completed
        const summaryMsg = {
          sender_name: "AI Hội đồng",
          sender_role: "assistant",
          content: `✅ **Phiên Mock Room hoàn tất!**\n\n **Điểm mạnh**:\n${data.summary?.strengths?.map((s: string) => `- ${s}`).join("\n") || "-"}\n\n⚠️ **Cần cải thiện**:\n${data.summary?.weaknesses?.map((w: string) => `- ${w}`).join("\n") || "-"}\n\n🎯 **Hành động tiếp theo**:\n${data.summary?.action_items?.map((a: string) => `- ${a}`).join("\n") || "-"}`,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, summaryMsg as Message]);
        break;
      case "error":
        console.error("WS Error:", data.message);
        break;
      case "pong":
        // Keep alive
        break;
    }
  };

  // Gửi tin nhắn / câu trả lời. Student → AI đánh giá (type "answer");
  // Gửi tin nhắn / speech-to-text.
  // - Student: vẫn gửi "answer" cho AI đánh giá (qua mock-qa WS).
  // - Cả student & mentor: gửi "chat" qua signaling WS để LƯU vào DB
  //   (MeetingMessage) và RELAY cho peer đối diện → cả 2 đều thấy đoạn STT
  //   của nhau, và có thể xem lại sau khi reload.
  const sendAnswer = async (content: string) => {
    if (!content.trim()) return;

    const isStudentSender = myRoleRef.current === "student";
    const answerMsg = {
      sender_name: "Bạn",
      sender_role: isStudentSender ? "student" : "mentor",
      content: content,
    };

    // Optimistic update (hiện ngay trong chat của mình)
    setMessages(prev => [...prev, { ...answerMsg, created_at: new Date().toISOString() } as Message]);

    // 1) Student → AI evaluation (mock-qa WS)
    if (isStudentSender && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "answer", content: content }));
    }

    // 2) Chat / STT → signaling WS (lưu DB + relay cho peer)
    if (signalWsRef.current && signalWsRef.current.readyState === WebSocket.OPEN) {
      signalWsRef.current.send(JSON.stringify({ type: "chat", content: content }));
    } else {
      // Fallback: WS chưa sẵn sàng → lưu trực tiếp qua REST (vẫn lưu được lịch sử)
      try {
        const me = userRef.current;
        const sender_name = me?.full_name || me?.email || "Bạn";
        const sender_role = isStudentSender ? "student" : "mentor";
        await postMeetingMessage(meetingId, { sender_name, sender_role, content });
      } catch (e) {
        console.error("Failed to persist message", e);
      }
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;
    await sendAnswer(inputValue);
    setInputValue("");
  };

  // Mentor đặt câu hỏi trong tab Hỏi & Đáp (giai đoạn chất vấn).
  // Gửi qua signaling WS dưới dạng "qa_question" → server relay + lưu lại
  // (đơn giản: lưu local + relay peer; có thể mở rộng lưu DB sau).
  const handleAskQuestion = () => {
    const q = qaInput.trim();
    if (!q) return;
    const asked_by = userRef.current?.full_name || userRef.current?.email || "Mentor";
    const item: QAItem = {
      id: Date.now(),
      question: q,
      asked_by,
      created_at: new Date().toISOString(),
    };
    setQaList(prev => [...prev, item]);
    if (signalWsRef.current && signalWsRef.current.readyState === WebSocket.OPEN) {
      signalWsRef.current.send(JSON.stringify({ type: "qa_question", question: q, asked_by }));
    }
    setQaInput("");
  };

  const handleHintRequest = (level: number = 1) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: "hint_request",
      level: level,
    }));
  };

  const handleGetStatus = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "get_status" }));
    }
  };

  // STT được tích hợp vào nút mic (không tách riêng). Bật/tắt cùng với mic.
  const startSTT = () => {
    if (!recognitionRef.current) {
      // Trình duyệt không hỗ trợ STT — mic voice chat vẫn hoạt động bình thường.
      return;
    }
    isIntentionalStopRef.current = false;
    try {
      recognitionRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start STT", err);
    }
  };

  const stopSTT = () => {
    if (recognitionRef.current) {
      isIntentionalStopRef.current = true;
      try {
        recognitionRef.current.stop();
      } catch (e) {
        /* ignore */
      }
    }
    setIsRecording(false);
  };

  // Speech recognition setup
  useEffect(() => {
    if (typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "vi-VN";

      recognition.onresult = async (event: any) => {
        const transcript = event.results[event.results.length - 1][0].transcript.trim();
        if (transcript) {
          await sendAnswer(transcript);
        }
      };

      recognition.onend = () => {
        if (!isIntentionalStopRef.current) {
          try { recognition.start(); } catch (e) {}
        } else {
          setIsRecording(false);
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          isIntentionalStopRef.current = true;
          setIsRecording(false);
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        isIntentionalStopRef.current = true;
        recognitionRef.current.stop();
      }
    };
  }, [meetingId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const signalLabel: Record<string, string> = {
    idle: "Đang kết nối...",
    connecting: "Đang kết nối...",
    ready: peerConnected ? "Đã kết nối" : "Chờ người tham gia...",
    "peer-left": "Đối phương đã rời",
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#0A0A0A] text-white font-sans overflow-hidden">
      {/* Hidden audio element for WebRTC remote playback */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Sub-Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800/60 bg-[#0f0f0f]">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)] ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span className="text-xs font-bold tracking-wider text-gray-300">{isConnected ? "LIVE" : "DISCONNECTED"}</span>
          </div>
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-gray-100">Phòng bảo vệ đồ án — AI Mock Defense</h2>
            <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
              <span className="flex items-center gap-1" title="Thời gian đã tham gia phòng">
                <span className="inline-block w-3 h-3 rounded-full border border-gray-500 flex items-center justify-center text-[8px]">⏱</span>
                {fmtElapsed(elapsed)}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {signalLabel[signalStatus]}
              </span>
            </div>
          </div>
        </div>

        {/* Phase countdown + controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#1A1A1A] px-3 py-1.5 rounded-full border border-gray-800">
            <Users className="w-4 h-4 text-teal-400" />
            <span className="text-xs font-medium text-gray-300">{Math.max(participants.length, 1)} người trong phòng</span>
          </div>

          {/* Role badge */}
          <span
            className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
              myRole === "mentor"
                ? "bg-purple-900/40 text-purple-300 border-purple-700/50"
                : myRole === "student"
                  ? "bg-teal-900/40 text-teal-300 border-teal-700/50"
                  : "bg-gray-800 text-gray-300 border-gray-700"
            }`}
            title="Vai trò của bạn trong phòng"
          >
            {myRole === "mentor" ? "👔 Mentor" : myRole === "student" ? "🎓 Sinh viên" : "👤 Khác"}
          </span>

          {/* Phase indicator */}
          <div className="flex items-center gap-2 bg-[#1A1A1A] px-3 py-1.5 rounded-full border border-gray-800">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-amber-300">{PHASES[phaseIdx].label}</span>
            <span className="text-sm font-bold text-white tabular-nums">{fmtPhase(phaseRemaining)}</span>
          </div>

          {/* Phase controls */}
          <div className="flex items-center gap-1">
            {phaseRunning ? (
              <button onClick={pausePhase} className="w-8 h-8 rounded-full bg-amber-500/20 hover:bg-amber-500/30 flex items-center justify-center text-amber-400 transition-colors" title="Tạm dừng">
                <Pause className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={startPhase} className="w-8 h-8 rounded-full bg-green-500/20 hover:bg-green-500/30 flex items-center justify-center text-green-400 transition-colors" title="Bắt đầu đếm ngược">
                <Play className="w-4 h-4" />
              </button>
            )}
            <button onClick={resetPhase} className="w-8 h-8 rounded-full bg-[#202020] hover:bg-[#2A2A2A] flex items-center justify-center text-gray-300 transition-colors" title="Reset về giai đoạn 1">
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <button className="p-2 rounded-full hover:bg-gray-800 text-gray-400 transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden relative h-full">
        
        {/* Left Column (Video Grid + Captions + Bottom Toolbar) */}
        <div className="flex-1 flex flex-col p-4 relative h-full">

          {/* Phase stepper */}
          <div className="flex items-center gap-2 mb-4">
            {PHASES.map((p, i) => {
              const active = i === phaseIdx;
              const done = i < phaseIdx;
              return (
                <div key={p.key} className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setPhaseIdx(i);
                      setPhaseRemaining(PHASES[i].minutes * 60);
                      setPhaseRunning(false);
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                      active
                        ? "bg-amber-500/20 border-amber-500 text-amber-300"
                        : done
                          ? "bg-teal-900/30 border-teal-800 text-teal-400"
                          : "bg-[#1A1A1A] border-gray-800 text-gray-400 hover:bg-[#202020]"
                    }`}
                    title={`Chuyển sang giai đoạn: ${p.label} (${p.minutes} phút)`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${
                        done ? "bg-teal-500 text-white" : active ? "bg-amber-500 text-black" : "bg-gray-700 text-gray-300"
                      }`}
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    {p.label}
                  </button>
                  {i < PHASES.length - 1 && <span className="text-gray-600">→</span>}
                </div>
              );
            })}
          </div>

          {/* Video Grid — render động theo danh sách người tham gia (presence) */}
          <div className="flex-1 grid grid-cols-2 gap-4 pb-24 relative">
            {participants.length === 0 ? (
              // Chưa có presence → fallback hiển thị 2 ô mặc định
              <>
                {/* Card 1: Local (bạn) — mic / screen share */}
                <div className="bg-[#121212] rounded-2xl border border-teal-900/40 relative overflow-hidden flex flex-col items-center justify-center group">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {!micOn && !sharing && (
                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-teal-400 to-blue-600 flex items-center justify-center relative shadow-[0_0_50px_rgba(45,212,191,0.2)]">
                      <span className="text-5xl text-white opacity-90 drop-shadow-lg">🎓</span>
                    </div>
                  )}
                  <div className="absolute top-4 right-4 bg-teal-950/50 text-teal-400 text-[10px] font-bold px-2 py-1 rounded border border-teal-800/50">
                    {sharing ? "SHARE" : "YOU"}
                  </div>
                  <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/5">
                    <Mic className={`w-3.5 h-3.5 ${micOn ? "text-teal-400" : "text-gray-500"}`} />
                    <span className="text-xs text-gray-300 font-medium">
                      {sharing ? "Đang chia sẻ màn hình" : micOn ? "Bạn (Đang nói)" : "Bạn"}
                    </span>
                  </div>
                </div>
                {/* Card 2: Remote peer (đối phương) */}
                <div className="bg-[#121212] rounded-2xl border border-purple-900/30 relative overflow-hidden flex flex-col items-center justify-center group">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {!peerConnected && (
                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center relative shadow-[0_0_50px_rgba(168,85,247,0.15)]">
                      <span className="text-5xl text-white opacity-90 drop-shadow-lg">👤</span>
                    </div>
                  )}
                  <div className="absolute top-4 right-4 bg-teal-950/50 text-teal-400 text-[10px] font-bold px-2 py-1 rounded border border-teal-800/50">
                    PEER
                  </div>
                  <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/5">
                    <Mic className={`w-3.5 h-3.5 ${peerConnected ? "text-purple-400" : "text-gray-500"}`} />
                    <span className="text-xs text-gray-300 font-medium">
                      {peerConnected ? "Đối phương" : "Chờ đối phương..."}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              // Đã có presence → render 1 ô cho mỗi người (bạn + đối phương + người được mời)
              <>
              {participants.map((p) => {
                const isMe = userRef.current && p.user_id === userRef.current.id;
                const displayName = isMe
                  ? (userRef.current?.full_name || userRef.current?.email || "Bạn")
                  : p.name;
                const roleLabel = p.role === "mentor" ? "Mentor" : "Sinh viên";
                const initials = displayName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
                const isMentor = p.role === "mentor";
                // Ô của mình → gắn video local; ô người khác → gắn video remote (chỉ 1 peer kết nối)
                const showLocalVideo = isMe;
                const showRemoteVideo = !isMe && peerConnected;
                const hasVideo = showLocalVideo || showRemoteVideo;
                const isExpanded = expandedTile === p.user_id;
                return (
                  <div
                    key={p.user_id}
                    onClick={() => hasVideo && setExpandedTile(isExpanded ? null : p.user_id)}
                    className={`bg-[#121212] rounded-2xl border relative overflow-hidden flex flex-col items-center justify-center group ${
                      isMentor ? "border-purple-900/30" : "border-teal-900/40"
                    } ${hasVideo ? "cursor-pointer hover:ring-2 hover:ring-teal-500/50 transition-all" : ""} ${
                      isExpanded ? "hidden" : ""
                    }`}
                  >
                    {showLocalVideo && (
                      <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    {showRemoteVideo && (
                      <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    {/* Avatar placeholder khi chưa có stream (người được mời chưa bật mic) */}
                    {!showLocalVideo && !showRemoteVideo && (
                      <div className={`w-32 h-32 rounded-full flex items-center justify-center relative shadow-lg ${
                        isMentor
                          ? "bg-gradient-to-br from-purple-500 to-blue-500 shadow-[0_0_50px_rgba(168,85,247,0.15)]"
                          : "bg-gradient-to-br from-teal-400 to-blue-600 shadow-[0_0_50px_rgba(45,212,191,0.2)]"
                      }`}>
                        <span className="text-5xl text-white opacity-90 drop-shadow-lg">{initials}</span>
                      </div>
                    )}
                    <div className="absolute top-4 right-4 bg-teal-950/50 text-teal-400 text-[10px] font-bold px-2 py-1 rounded border border-teal-800/50">
                      {isMe ? (sharing ? "SHARE" : "YOU") : (isMentor ? "MENTOR" : "STUDENT")}
                    </div>
                    <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/5">
                      <Mic className={`w-3.5 h-3.5 ${
                        isMe ? (micOn ? "text-teal-400" : "text-gray-500") : (peerConnected ? (isMentor ? "text-purple-400" : "text-teal-400") : "text-gray-500")
                      }`} />
                      <span className="text-xs text-gray-300 font-medium">
                        {isMe
                          ? (sharing ? "Đang chia sẻ màn hình" : micOn ? `${displayName} (Đang nói)` : `${displayName} (${roleLabel})`)
                          : (peerConnected ? `${displayName} (${roleLabel})` : `${displayName} (${roleLabel}) — chưa kết nối`)}
                      </span>
                    </div>
                    {/* Nút phóng to khi có video */}
                    {hasVideo && !isExpanded && (
                      <div className="absolute top-4 left-4 bg-black/50 hover:bg-black/70 text-white/80 hover:text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                        <Maximize2 className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Overlay phóng to (click vào màn hình share để xem full) */}
              {expandedTile !== null &&
                participants
                  .filter((x) => x.user_id === expandedTile)
                  .map((p) => {
                    const isMe = userRef.current && p.user_id === userRef.current.id;
                    const displayName = isMe
                      ? (userRef.current?.full_name || userRef.current?.email || "Bạn")
                      : p.name;
                    const roleLabel = p.role === "mentor" ? "Mentor" : "Sinh viên";
                    const isMentor = p.role === "mentor";
                    const showLocalVideo = isMe;
                    const showRemoteVideo = !isMe && peerConnected;
                    const hasVideo = showLocalVideo || showRemoteVideo;
                    return (
                      <div
                        key={p.user_id}
                        className="col-span-2 row-span-2 bg-[#0A0A0A] rounded-2xl border border-teal-500/30 relative overflow-hidden flex flex-col items-center justify-center"
                        onClick={() => setExpandedTile(null)}
                      >
                        {showLocalVideo && (
                          <video
                            ref={expandedLocalVideoRef}
                            autoPlay
                            muted
                            playsInline
                            className="absolute inset-0 w-full h-full object-contain"
                          />
                        )}
                        {showRemoteVideo && (
                          <video
                            ref={expandedRemoteVideoRef}
                            autoPlay
                            playsInline
                            className="absolute inset-0 w-full h-full object-contain"
                          />
                        )}
                        {!hasVideo && (
                          <div className="text-gray-500 text-sm">Không có video để phóng to</div>
                        )}
                        <div className="absolute top-4 right-4 bg-teal-950/50 text-teal-400 text-[10px] font-bold px-2 py-1 rounded border border-teal-800/50">
                          {isMe ? (sharing ? "SHARE" : "YOU") : (isMentor ? "MENTOR" : "STUDENT")}
                        </div>
                        <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/5">
                          <Mic className={`w-3.5 h-3.5 ${isMe ? (micOn ? "text-teal-400" : "text-gray-500") : (peerConnected ? (isMentor ? "text-purple-400" : "text-teal-400") : "text-gray-500")}`} />
                          <span className="text-xs text-gray-300 font-medium">
                            {isMe ? (sharing ? "Đang chia sẻ màn hình" : `${displayName} (${roleLabel})`) : `${displayName} (${roleLabel})`}
                          </span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpandedTile(null); }}
                          className="absolute top-4 left-4 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg transition-colors"
                          title="Thu nhỏ"
                        >
                          <Minimize2 className="w-5 h-5" />
                        </button>
                      </div>
                    );
                  })}
              </>
            )}

            {/* Live Captions */}
            <div className="absolute bottom-4 left-0 right-0 px-4">
              <div className="bg-[#0f1513] border border-teal-900/50 rounded-xl p-4 shadow-xl backdrop-blur-md">
                <div className="flex items-center gap-2 mb-2">
                  <div className="bg-teal-900/60 p-1 rounded text-teal-400">
                    <MessageSquare className="w-3 h-3" />
                  </div>
                  <span className="text-[10px] font-bold text-teal-500 tracking-wider uppercase">PHỤ ĐỀ TRỰC TIẾP — AI HỘI ĐỒNG</span>
                </div>
                <p className="text-gray-200 text-sm font-medium leading-relaxed">
                  {currentQuestion
                    ? `🤖 ${currentQuestion.question}`
                    : "Phòng họp đã sẵn sàng. Bắt đầu trò chuyện với hội đồng AI hoặc chia sẻ màn hình để bảo vệ đồ án."}
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Toolbar */}
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-[#0A0A0A] border-t border-gray-800/40 flex items-center justify-between px-6 z-20">
            <div className="w-32"></div> {/* Spacer */}

            <div className="flex items-center gap-3">
              <button
                onClick={toggleMic}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  micOn
                    ? "bg-teal-500/20 border border-teal-500 text-teal-400" + (isRecording ? " animate-pulse" : "")
                    : "bg-[#202020] hover:bg-[#2A2A2A] text-gray-300"
                }`}
                title={micOn ? (isRecording ? "Tắt mic & nhận dạng giọng nói" : "Tắt mic") : "Bật mic & nhận dạng giọng nói (STT)"}
              >
                {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
              <button
                onClick={toggleScreenShare}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  sharing
                    ? "bg-blue-500/20 border border-blue-500 text-blue-400"
                    : "bg-[#202020] hover:bg-[#2A2A2A] text-gray-300"
                }`}
                title={sharing ? "Dừng chia sẻ" : "Chia sẻ màn hình"}
              >
                {sharing ? <ScreenShareOff className="w-5 h-5" /> : <ScreenShare className="w-5 h-5" />}
              </button>
              <button className="w-11 h-11 rounded-full bg-[#202020] hover:bg-[#2A2A2A] flex items-center justify-center text-gray-300 transition-colors">
                <Hand className="w-5 h-5" />
              </button>
              <button className="w-11 h-11 rounded-full bg-[#202020] hover:bg-[#2A2A2A] flex items-center justify-center text-gray-300 transition-colors">
                <MoreHorizontal className="w-5 h-5" />
              </button>
              <button className="w-11 h-11 rounded-xl bg-teal-900/30 border border-teal-800/50 hover:bg-teal-900/50 flex items-center justify-center text-teal-400 transition-colors ml-2">
                <MessageSquare className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-end w-32">
              <Button
                onClick={() => setShowLeaveConfirm(true)}
                className="bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-full px-6 h-10 font-semibold shadow-lg shadow-red-900/20"
              >
                <PhoneOff className="w-4 h-4 mr-2" />
                Rời phòng
              </Button>
            </div>
          </div>
        </div>

        {/* Right Sidebar (Chat + Q&A) */}
        <div className="w-[380px] bg-[#0A0A0A] border-l border-gray-800/60 flex flex-col h-full">
          
          {/* Tabs */}
          <div className="flex border-b border-gray-800/60">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex-1 py-4 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                activeTab === "chat"
                  ? "text-teal-400 border-b-2 border-teal-500"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              TRÒ CHUYỆN
            </button>
            <button
              onClick={() => setActiveTab("people")}
              className={`flex-1 py-4 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                activeTab === "people"
                  ? "text-teal-400 border-b-2 border-teal-500"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <Users className="w-4 h-4" />
              MỌI NGƯỜI ({Math.max(participants.length, 1)})
            </button>
            <button
              onClick={() => setActiveTab("qa")}
              className={`flex-1 py-4 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                activeTab === "qa"
                  ? "text-teal-400 border-b-2 border-teal-500"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <span className="w-4 h-4">❓</span>
              HỎI & ĐÁP
            </button>
          </div>

          {/* Tab content */}
          {activeTab === "chat" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            
            <div className="flex items-center gap-4">
              <div className="h-px bg-gray-800 flex-1"></div>
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Phiên Mock Room</span>
              <div className="h-px bg-gray-800 flex-1"></div>
            </div>

            {/* Current Question Display */}
            {currentQuestion && (
              <div className="bg-teal-900/20 border border-teal-800/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-teal-400 px-2 py-0.5 rounded bg-teal-900/30">
                    {currentQuestion.clo}
                  </span>
                  <span className="text-xs text-gray-500 px-2 py-0.5 rounded bg-gray-800/50">
                    {currentQuestion.type} • {currentQuestion.difficulty}
                  </span>
                </div>
                <p className="text-gray-200 font-medium">{currentQuestion.question}</p>
              </div>)}
            
            {/* CLO Coverage (KHÔNG chấm điểm số) */}
            <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">PHỦ TIÊU CHÍ (CLO)</span>
              </div>
              <div className="mb-3">
                <div className="flex flex-wrap gap-1">
                  {Object.entries(coverage).map(([clo, count]) => (
                    <span key={clo} className="bg-teal-900/30 border border-teal-800/50 rounded-full px-2 py-1 text-xs text-teal-300">
                      {clo}: {count}/2
                    </span>
                  ))}
                  {Object.keys(coverage).length === 0 && (
                    <span className="text-xs text-gray-500">Chưa có tiêu chí nào được phủ</span>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="space-y-4">
              {messages.map((msg, index) => {
                // Tin nhắn của chính mình → nằm bên phải; của người khác → bên trái
                const isMine = msg.sender_name === "Bạn" || (userRef.current && msg.sender_name === (userRef.current.full_name || userRef.current.email));
                const isStudent = msg.sender_role === "student";
                const avatarColor = isStudent 
                  ? "bg-teal-900/60 text-teal-300 border-teal-800/50" 
                  : "bg-blue-600 text-white border-blue-600";
                const initials = (msg.sender_name === "Bạn" ? (userRef.current?.full_name || "Bạn") : msg.sender_name).split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                
                return (
                  <div key={msg.id || index} className={`flex gap-3 ${isMine ? "flex-row-reverse" : ""}`}>
                    <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold shadow-sm mt-1 border ${avatarColor}`}>
                      {initials}
                    </div>
                    <div className={`flex-1 ${isMine ? "text-right" : ""}`}>
                      <div className={`flex items-baseline gap-2 mb-1 ${isMine ? "flex-row-reverse" : ""}`}>
                        <span className="text-sm font-semibold text-gray-200">{msg.sender_name}</span>
                        {msg.created_at && (
                          <span className="text-xs text-gray-500">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <p className={`text-sm leading-relaxed inline-block rounded-2xl px-3 py-2 ${
                        isMine
                          ? "bg-teal-600/20 text-teal-100 border border-teal-700/40"
                          : isStudent ? "bg-gray-800/60 text-gray-300" : "bg-blue-600/20 text-blue-100 border border-blue-700/40"
                      }`}>
                        {msg.content}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Chat Input */}
            <div className="p-4 border-t border-gray-800/60">
              {isRecording && (
                <div className="flex items-center gap-2 mb-2 text-xs text-red-400">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                  Đang nghe... giọng nói của bạn được ghi lại thành văn bản tự động
                </div>
              )}
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Gửi câu trả lời hoặc tin nhắn..." 
                  className="w-full bg-[#1A1A1A] border border-gray-700/50 rounded-full py-3 pl-4 pr-12 text-sm text-gray-200 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-all placeholder:text-gray-600"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button 
                  onClick={handleSendMessage}
                  className="absolute right-1.5 top-1.5 w-9 h-9 rounded-full bg-teal-600 hover:bg-teal-500 flex items-center justify-center text-white transition-colors"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </button>
              </div>
            </div>
          </div>
          )}

          {/* MỌI NGƯỜI tab */}
          {activeTab === "people" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Người có mặt trong phòng ({Math.max(participants.length, 1)})
              </div>
              {participants.length === 0 && (
                <div className="text-sm text-gray-500 text-center py-8">
                  Đang chờ mọi người tham gia...
                </div>
              )}
              {participants.map((p) => (
                <div key={p.user_id} className="flex items-center gap-3 bg-gray-900/50 border border-gray-800/50 rounded-xl p-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border ${
                    p.role === "mentor" ? "bg-purple-900/40 text-purple-300 border-purple-700/50" : "bg-teal-900/40 text-teal-300 border-teal-700/50"
                  }`}>
                    {p.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-gray-200">{p.name}</div>
                    <div className={`text-xs ${p.role === "mentor" ? "text-purple-400" : "text-teal-400"}`}>
                      {p.role === "mentor" ? "Mentor" : "Sinh viên"}
                    </div>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                </div>
              ))}
            </div>
          )}

          {/* HỎI & ĐÁP tab */}
          {activeTab === "qa" && (
            <div className="flex-1 flex flex-col">
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Câu hỏi từ Mentor (giai đoạn chất vấn)
                </div>
                {qaList.length === 0 && (
                  <div className="text-sm text-gray-500 text-center py-8">
                    {myRole === "mentor"
                      ? "Chuyển sang giai đoạn 'Chất vấn' để đặt câu hỏi cho sinh viên."
                      : "Chưa có câu hỏi nào từ Mentor."}
                  </div>
                )}
                {qaList.map((q) => (
                  <div key={q.id} className="bg-purple-900/20 border border-purple-800/50 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-purple-400">❓ {q.asked_by}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-200 leading-relaxed">{q.question}</p>
                  </div>
                ))}
              </div>
              {/* Mentor đặt câu hỏi (chỉ hiện khi là mentor) */}
              {myRole === "mentor" && (
                <div className="p-4 border-t border-gray-800/60">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Đặt câu hỏi cho sinh viên..."
                      className="w-full bg-[#1A1A1A] border border-gray-700/50 rounded-full py-3 pl-4 pr-12 text-sm text-gray-200 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all placeholder:text-gray-600"
                      value={qaInput}
                      onChange={(e) => setQaInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAskQuestion(); } }}
                    />
                    <button
                      onClick={handleAskQuestion}
                      className="absolute right-1.5 top-1.5 w-9 h-9 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center text-white transition-colors"
                    >
                      <Send className="w-4 h-4 ml-0.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Modal xác nhận rời phòng */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1A1A1A] border border-gray-700/60 rounded-2xl p-6 w-[400px] max-w-[90vw] shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <PhoneOff className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-100">Rời phòng Mock Room?</h3>
            </div>
            <p className="text-sm text-gray-400 mb-6">
              Bạn có chắc chắn muốn rời khỏi phòng? Cuộc họp sẽ kết thúc và bạn sẽ quay lại trang danh sách phòng.
            </p>
            <div className="flex gap-3">
              <Button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 bg-[#202020] hover:bg-[#2A2A2A] text-gray-300 rounded-xl h-11 font-semibold transition-colors"
              >
                Ở lại
              </Button>
              <Button
                onClick={() => router.push("/mock-room")}
                className="flex-1 bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-xl h-11 font-semibold shadow-lg shadow-red-900/20 transition-colors"
              >
                Xác nhận rời
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}