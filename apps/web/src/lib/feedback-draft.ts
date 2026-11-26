const DRAFT_PREFIX = "feedback_draft_";

export interface FeedbackDraft {
  step: 1 | 2;
  csatScore: number | null;
  aspectRatings: Record<string, number>;
  featureRatings: Record<string, number>;
  featureLowReasons: Record<string, string>;
  bestThing: string;
  suggestedChange: string;
  npsScore: number;
  payWillingness: string;
}

export const EMPTY_FEEDBACK_DRAFT: FeedbackDraft = {
  step: 1,
  csatScore: null,
  aspectRatings: {},
  featureRatings: {},
  featureLowReasons: {},
  bestThing: "",
  suggestedChange: "",
  npsScore: 10,
  payWillingness: "50k_99k",
};

function isRating(value: unknown, max = 5): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max;
}

function readRecord<T>(value: unknown, isValid: (entry: unknown) => entry is T): Record<string, T> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => isValid(entry)));
}

export function readFeedbackDraft(userId: string): FeedbackDraft {
  try {
    const stored = sessionStorage.getItem(`${DRAFT_PREFIX}${userId}`);
    if (!stored) return EMPTY_FEEDBACK_DRAFT;
    const draft = JSON.parse(stored) as Partial<FeedbackDraft> | null;
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) return EMPTY_FEEDBACK_DRAFT;

    return {
      step: draft.step === 2 ? 2 : 1,
      csatScore: isRating(draft.csatScore, 10) ? draft.csatScore : null,
      aspectRatings: readRecord(draft.aspectRatings, isRating),
      featureRatings: readRecord(draft.featureRatings, isRating),
      featureLowReasons: readRecord(draft.featureLowReasons, (entry): entry is string => typeof entry === "string"),
      bestThing: typeof draft.bestThing === "string" ? draft.bestThing : "",
      suggestedChange: typeof draft.suggestedChange === "string" ? draft.suggestedChange : "",
      npsScore: isRating(draft.npsScore, 10) ? draft.npsScore : EMPTY_FEEDBACK_DRAFT.npsScore,
      payWillingness: typeof draft.payWillingness === "string" ? draft.payWillingness : EMPTY_FEEDBACK_DRAFT.payWillingness,
    };
  } catch {
    return EMPTY_FEEDBACK_DRAFT;
  }
}

export function getFeedbackDraftOwner(): string | null {
  try {
    const user = JSON.parse(localStorage.getItem("user") ?? "null");
    return typeof user?.id === "number" || typeof user?.id === "string" ? String(user.id) : null;
  } catch {
    return null;
  }
}

export function isCurrentFeedbackUser(userId: string): boolean {
  try {
    return !!localStorage.getItem("access_token") && getFeedbackDraftOwner() === userId;
  } catch {
    return false;
  }
}

export function saveFeedbackDraft(userId: string, draft: FeedbackDraft) {
  if (!isCurrentFeedbackUser(userId)) return;
  try {
    sessionStorage.setItem(`${DRAFT_PREFIX}${userId}`, JSON.stringify(draft));
  } catch {
    // Người dùng vẫn có thể tiếp tục điền trong modal khi trình duyệt chặn lưu trữ.
  }
}

export function removeFeedbackDraft(userId: string) {
  try {
    sessionStorage.removeItem(`${DRAFT_PREFIX}${userId}`);
  } catch { /* ignore unavailable storage */ }
}
