import { expect, test, type Page } from "@playwright/test";

const WORKSPACE_ID = 42;
const WORKSPACE_API = `**/api/workspaces/${WORKSPACE_ID}`;
const CREATED_AT = "2026-01-01T00:00:00";
const DEFAULT_QUESTION = "Câu hỏi từ đoạn mặc định";
const EMPTY_CHAT = /Hỏi bất kỳ điều gì về toàn bộ workspace/;
const DEFAULT_TURN = {
  id: 21,
  workspace_id: WORKSPACE_ID,
  conversation_id: null,
  question: DEFAULT_QUESTION,
  answer: "Trả lời trong đoạn mặc định",
  citations: [],
  status: "completed",
  error: null,
  created_at: CREATED_AT,
};

async function mockWorkspace(page: Page) {
  const user = {
    id: 999,
    email: "student@defendai.dev",
    full_name: "Student",
    is_active: true,
    roles: ["student"],
    profile_data: {},
    major: "Khác",
  };
  const payload = Buffer.from(JSON.stringify({
    sub: String(user.id),
    exp: Math.floor(Date.now() / 1000) + 86400,
  })).toString("base64url");
  await page.addInitScript(({ user, token }) => {
    localStorage.setItem("access_token", token);
    localStorage.setItem("refresh_token", "test");
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem(`defendai_tour_done_${user.id}`, "completed");
  }, { user, token: `eyJhbGciOiJIUzI1NiJ9.${payload}.sig` });

  await page.route("**/api/**", (route) => route.fulfill({ json: { items: [], total: 0 } }));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user }));
  await page.route(WORKSPACE_API, (route) => route.fulfill({ json: {
    id: WORKSPACE_ID,
    name: "Workspace thử nghiệm",
    created_at: CREATED_AT,
    document_count: 1,
    files: [{
      document_id: 10,
      filename: "do-an.txt",
      file_type: ".txt",
      doc_type: "txt",
      role: "primary",
      added_at: CREATED_AT,
    }],
  } }));
  await page.route("**/api/documents/10/download", (route) =>
    route.fulfill({ contentType: "text/plain", body: "Nội dung đồ án" }),
  );
}

async function openWorkspaceChat(page: Page) {
  await page.goto(`/workspaces/${WORKSPACE_ID}`);
  await page.getByRole("button", { name: "Chat đề tài", exact: true }).click();
}

test("Chat đề tài dùng lại đoạn trống, rồi tạo đoạn riêng sau khi gửi tin", async ({ page }) => {
  await mockWorkspace(page);
  const createdIds: string[] = [];
  let releaseCreate!: () => void;
  const pendingCreate = new Promise<void>((resolve) => { releaseCreate = resolve; });
  await page.route(`${WORKSPACE_API}/chat/conversations`, async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    const conversationId = `conversation-${createdIds.length + 1}`;
    createdIds.push(conversationId);
    await pendingCreate;
    return route.fulfill({
      status: 201,
      json: { conversation_id: conversationId, name: route.request().postDataJSON().name },
    });
  });
  await page.route(`${WORKSPACE_API}/chat?*`, (route) => {
    const conversationId = new URL(route.request().url()).searchParams.get("conversation_id");
    return route.fulfill({ json: conversationId ? [] : [DEFAULT_TURN] });
  });

  const newQuestion = "Câu hỏi trong đoạn mới";
  const newAnswer = "Câu trả lời trong đoạn mới";
  await page.route(`${WORKSPACE_API}/chat/stream`, (route) => route.fulfill({
    contentType: "text/event-stream; charset=utf-8",
    body: [
      { type: "meta", chat_id: 52 },
      { type: "done", chat_id: 52, answer: newAnswer, citations: [] },
    ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
  }));

  await openWorkspaceChat(page);
  const createButton = page.getByTitle("Tạo đoạn chat mới");
  const defaultQuestion = page.getByText(DEFAULT_QUESTION, { exact: true });
  const emptyChat = page.getByText(EMPTY_CHAT);
  await expect(defaultQuestion).toBeVisible();

  try {
    await createButton.dblclick();
    await expect(createButton).toBeDisabled();
    await expect.poll(() => createdIds.length).toBe(1);
  } finally {
    releaseCreate();
  }
  await expect(emptyChat).toBeVisible();
  await createButton.click();
  await expect(emptyChat).toBeVisible();

  await page.getByRole("button", { name: "Đoạn mặc định", exact: true }).click();
  await expect(defaultQuestion).toBeVisible();
  await createButton.click();
  await expect(emptyChat).toBeVisible();

  await page.getByPlaceholder("Hỏi về workspace...").fill(newQuestion);
  const [chatRequest] = await Promise.all([
    page.waitForRequest(`${WORKSPACE_API}/chat/stream`),
    page.getByRole("button", { name: "Gửi", exact: true }).click(),
  ]);
  expect(chatRequest.postDataJSON()).toMatchObject({
    question: newQuestion,
    conversation_id: "conversation-1",
  });
  expect(createdIds).toEqual(["conversation-1"]);
  await expect(page.getByText(newAnswer, { exact: true })).toBeVisible();

  await createButton.click();
  await expect(emptyChat).toBeVisible();
  await expect(page.getByText(newQuestion, { exact: true })).toHaveCount(0);
  expect(createdIds).toEqual(["conversation-1", "conversation-2"]);
});

test("Chat đề tài hủy tải lịch sử mặc định khi mở đoạn mới", async ({ page }) => {
  await mockWorkspace(page);
  let releaseHistory!: () => void;
  const pendingHistory = new Promise<void>((resolve) => { releaseHistory = resolve; });
  await page.route(`${WORKSPACE_API}/chat?*`, async (route) => {
    await pendingHistory;
    if (!route.request().failure()) await route.fulfill({ json: [DEFAULT_TURN] });
  });
  await page.route(`${WORKSPACE_API}/chat/conversations`, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: [] })
      : route.fulfill({ status: 201, json: { conversation_id: "conversation-1", name: "Đoạn mới" } }),
  );

  try {
    await openWorkspaceChat(page);
    await expect(page.getByText("Đang tải hội thoại...")).toBeVisible();
    const [abortedRequest] = await Promise.all([
      page.waitForEvent("requestfailed", {
        predicate: (request) => new URL(request.url()).pathname === `/api/workspaces/${WORKSPACE_ID}/chat`,
      }),
      page.getByTitle("Tạo đoạn chat mới").click(),
    ]);
    expect(abortedRequest.failure()?.errorText).toContain("ERR_ABORTED");
    await expect(page.getByText(EMPTY_CHAT)).toBeVisible();
    await expect(page.getByText(DEFAULT_QUESTION, { exact: true })).toHaveCount(0);
  } finally {
    releaseHistory();
  }
});
