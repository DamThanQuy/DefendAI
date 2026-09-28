"use client";

import { Fragment, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FIELD_META,
  FEATURE_CATALOG,
  REF_CATEGORIES,
  useAdminAI,
  useAdminReference,
  useAdminSettings,
  type AIProviderItem,
} from "@/hooks/useAdminData";
import {
  Cpu,
  Server,
  Sparkles,
  Plus,
  Trash2,
  RefreshCw,
  Check,
  X,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Mic,
  MessageSquare,
  FileText,
  Code2,
  Layers,
  Award,
  Eye,
  BookOpen,
  Sliders,
  PlugZap,
  Globe,
  Key,
  Zap,
} from "lucide-react";

// Icon mapping helper
function FeatureIcon({ name, className }: { name: string; className?: string }) {
  const map: Record<string, any> = {
    HelpCircle,
    Mic,
    MessageSquare,
    FileText,
    Code2,
    Layers,
    Award,
    Cpu,
    Eye,
  };
  const IconComponent = map[name] || Sparkles;
  return <IconComponent className={className || "w-4 h-4"} />;
}

import type { Variants } from "framer-motion";

// Animation Variants
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.05,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 24,
    },
  },
};

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<"features" | "providers" | "reference" | "general">("features");

  // AI Management Hook
  const ai = useAdminAI();

  // Legacy settings & Reference hooks
  const general = useAdminSettings();
  const ref = useAdminReference();

  // State cho Form thêm Provider mới
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProv, setNewProv] = useState({ name: "", base_url: "", api_key: "", enabled: true });

  // State cho Form thêm Model cho từng provider
  const [addingModelFor, setAddingModelFor] = useState<string | null>(null);
  const [newModelId, setNewModelId] = useState("");
  const [newModelLabel, setNewModelLabel] = useState("");

  // State chỉnh sửa Provider
  const [editingProv, setEditingProv] = useState<AIProviderItem | null>(null);

  // Modal xác nhận xoá
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "provider" | "model" | "ref";
    id?: number;
    name: string;
    extra?: string;
  } | null>(null);

  // Quick stats
  const totalModels = ai.providers.reduce((acc, p) => acc + (p.models?.length || 0), 0);
  const configuredFeatures = Object.keys(ai.featureConfig).length;

  type TabId = "features" | "providers" | "reference" | "general";
  interface TabItem {
    id: TabId;
    label: string;
    icon: any;
    count?: number;
    badgeColor?: string;
  }

  const tabs: TabItem[] = [
    {
      id: "features",
      label: "Phân bổ Tính năng (Feature Matrix)",
      icon: Sparkles,
      count: FEATURE_CATALOG.length,
      badgeColor: "bg-teal-500/20 text-teal-300",
    },
    {
      id: "providers",
      label: "AI Providers & Models",
      icon: PlugZap,
      count: ai.providers.length,
      badgeColor: "bg-zinc-700/60 text-zinc-300",
    },
    {
      id: "reference",
      label: "Tài liệu chuẩn (RAG)",
      icon: BookOpen,
      count: ref.refItems.length > 0 ? ref.refItems.length : undefined,
      badgeColor: "bg-blue-500/20 text-blue-300",
    },
    {
      id: "general",
      label: "Cài đặt chung",
      icon: Server,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-6xl mx-auto space-y-8 pb-16"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <motion.div
              animate={{ rotate: [0, 15, -15, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 6, ease: "easeInOut" }}
            >
              <Sliders className="w-6 h-6 text-teal-400" />
            </motion.div>
            <h1 className="text-2xl font-serif font-bold text-foreground">
              Cấu hình hệ thống & AI Gateway
            </h1>
          </div>
          <p className="text-[14px] text-muted-foreground mt-1">
            Quản lý đa nhà cung cấp AI, phân bổ model riêng cho từng tính năng và cấu hình tài liệu chuẩn RAG.
          </p>

          {/* Quick Metrics Bar */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-[11px] font-semibold text-teal-300">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
              {ai.providers.filter((p) => p.enabled).length}/{ai.providers.length} Providers kích hoạt
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/80 border border-zinc-700/50 text-[11px] font-medium text-zinc-300">
              <Cpu className="w-3 h-3 text-zinc-400" />
              {totalModels} Models đã đăng ký
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[11px] font-semibold text-blue-300">
              <Sparkles className="w-3 h-3 text-blue-400" />
              {configuredFeatures}/9 Tính năng đã gán DB
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                ai.loadData();
                general.setMsg(null);
              }}
              disabled={ai.loading}
              className="flex items-center gap-1.5 rounded-xl border-border/70 hover:border-teal-500/50 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${ai.loading ? "animate-spin text-teal-400" : ""}`} />
              Làm mới
            </Button>
          </motion.div>
        </div>
      </div>

      {/* Global Notifications with AnimatePresence */}
      <AnimatePresence>
        {ai.msg && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl border text-sm font-medium shadow-lg backdrop-blur-md ${
              ai.msg.type === "ok"
                ? "bg-teal-500/10 border-teal-500/30 text-teal-200 shadow-teal-500/5"
                : "bg-red-500/10 border-red-500/30 text-red-200 shadow-red-500/5"
            }`}
          >
            {ai.msg.type === "ok" ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-teal-400" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
            )}
            <p className="flex-1">{ai.msg.text}</p>
            <motion.button
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.85 }}
              onClick={() => ai.setMsg(null)}
              className="text-muted-foreground hover:text-foreground p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs Navigation with Animated Underline / Background Pill */}
      <div className="relative flex items-center gap-1.5 border-b border-border/60 pb-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-colors whitespace-nowrap z-10 ${
                isActive ? "text-teal-300" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-teal-400" : "text-muted-foreground"}`} />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ml-1 ${tab.badgeColor}`}>
                  {tab.count}
                </span>
              )}

              {/* Animated Floating Indicator */}
              {isActive && (
                <motion.div
                  layoutId="activeTabIndicator"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className="absolute inset-0 bg-teal-500/10 border border-teal-500/30 rounded-xl -z-10 shadow-sm shadow-teal-500/10"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content with AnimatePresence */}
      <AnimatePresence mode="wait">
        {/* ========================================================================= */}
        {/* TAB 1: FEATURE MATRIX ASSIGNMENT                                          */}
        {/* ========================================================================= */}
        {activeTab === "features" && (
          <motion.div
            key="tab-features"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20 border border-border/50 rounded-2xl p-4">
              <div>
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-400" />
                  Ma trận cấu hình Model cho từng Chức năng
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Mỗi chức năng trong hệ thống có thể chạy một Model riêng biệt phù hợp nhất với đặc thù nhiệm vụ (suy luận logic, realtime, code, vision,...).
                </p>
              </div>
            </div>

            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="grid gap-3.5"
            >
              {FEATURE_CATALOG.map((feat) => {
                const currentInDb = ai.featureConfig[feat.key];
                const draft = ai.featureDraft[feat.key] || {
                  provider_name: currentInDb?.provider_name || "",
                  model_id: currentInDb?.model_id || "",
                };

                // Danh sách providers đang enabled
                const enabledProviders = ai.providers.filter((p) => p.enabled);
                // Provider đang chọn
                const selectedProvObj = ai.providers.find((p) => p.name === draft.provider_name);
                // Models của provider đó
                const availableModels = selectedProvObj?.models || [];

                const isModified =
                  draft.provider_name !== (currentInDb?.provider_name || "") ||
                  draft.model_id !== (currentInDb?.model_id || "");

                const isBusy = ai.busy === `save-feature-${feat.key}`;

                return (
                  <motion.div
                    key={feat.key}
                    variants={itemVariants}
                    whileHover={{ y: -2, transition: { duration: 0.15 } }}
                    className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-2xl border transition-all ${
                      isModified
                        ? "bg-teal-500/[0.07] border-teal-500/50 shadow-md shadow-teal-500/10 ring-1 ring-teal-500/30"
                        : "bg-card/70 border-border/60 hover:border-border hover:shadow-sm"
                    }`}
                  >
                    {/* Cột 1: Thông tin tính năng */}
                    <div className="flex items-start gap-3.5 lg:max-w-md">
                      <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 flex-shrink-0 mt-0.5">
                        <FeatureIcon name={feat.iconName} className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground text-[15px]">{feat.label}</span>
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-muted text-muted-foreground border border-border/60">
                            {feat.badge}
                          </span>
                          {currentInDb ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-teal-500/10 text-teal-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                              DB
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/10 text-amber-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              Fallback ENV
                            </span>
                          )}
                          {isModified && (
                            <motion.span
                              initial={{ scale: 0.8, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-teal-400 text-zinc-950 shadow-sm"
                            >
                              Chưa lưu
                            </motion.span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{feat.description}</p>
                      </div>
                    </div>

                    {/* Cột 2: Cascading Dropdowns (Provider & Model) */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 lg:flex-1 lg:justify-end">
                      {/* Dropdown 1: Chọn Provider */}
                      <div className="w-full sm:w-44">
                        <Label className="text-[11px] text-muted-foreground font-medium mb-1 block">Provider</Label>
                        <select
                          value={draft.provider_name}
                          onChange={(e) => {
                            const newProvName = e.target.value;
                            const newProvObj = ai.providers.find((p) => p.name === newProvName);
                            const firstModel = newProvObj?.models[0]?.model_id || "";
                            ai.setFeatureMappingDraft(feat.key, newProvName, firstModel);
                          }}
                          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700/80 rounded-xl text-[13px] text-foreground font-medium focus:outline-none focus:border-teal-400 transition-colors"
                        >
                          <option value="">— Chọn Provider —</option>
                          {enabledProviders.map((p) => (
                            <option key={p.name} value={p.name}>
                              {p.name.toUpperCase()} {p.source === "db" ? "(DB)" : "(ENV)"}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Dropdown 2: Chọn Model */}
                      <div className="w-full sm:w-64">
                        <Label className="text-[11px] text-muted-foreground font-medium mb-1 block">Model</Label>
                        {availableModels.length > 0 ? (
                          <select
                            value={draft.model_id}
                            onChange={(e) => ai.setFeatureMappingDraft(feat.key, draft.provider_name, e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700/80 rounded-xl text-[13px] text-foreground font-medium focus:outline-none focus:border-teal-400 transition-colors"
                          >
                            <option value="">— Chọn Model —</option>
                            {availableModels.map((m) => (
                              <option key={m.id} value={m.model_id}>
                                {m.model_id} {m.label ? `(${m.label})` : ""}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            value={draft.model_id}
                            onChange={(e) => ai.setFeatureMappingDraft(feat.key, draft.provider_name, e.target.value)}
                            placeholder={draft.provider_name ? "Nhập model ID..." : "Chọn provider trước"}
                            disabled={!draft.provider_name}
                            className="h-9 text-[13px] rounded-xl"
                          />
                        )}
                      </div>

                      {/* Nút Thao tác */}
                      <div className="sm:self-end pt-1">
                        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}>
                          <Button
                            size="sm"
                            onClick={() => ai.saveFeatureMapping(feat.key, draft.provider_name, draft.model_id)}
                            disabled={isBusy || !draft.provider_name || !draft.model_id || (!isModified && !!currentInDb)}
                            className={`h-9 px-4 rounded-xl text-xs font-semibold transition-all ${
                              isModified
                                ? "bg-teal-500 hover:bg-teal-400 text-zinc-950 shadow-md shadow-teal-500/20 ring-2 ring-teal-400/40"
                                : "bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {isBusy ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : isModified ? (
                              <motion.span
                                initial={{ scale: 0.9 }}
                                animate={{ scale: 1 }}
                                className="flex items-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5 mr-0.5" /> Lưu
                              </motion.span>
                            ) : (
                              "Đã lưu"
                            )}
                          </Button>
                        </motion.div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: AI PROVIDERS & MODELS MANAGEMENT                                   */}
        {/* ========================================================================= */}
        {activeTab === "providers" && (
          <motion.div
            key="tab-providers"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="space-y-6"
          >
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/20 border border-border/50 rounded-2xl p-4">
              <div>
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <PlugZap className="w-4 h-4 text-teal-400" />
                  Danh sách Nhà cung cấp AI (AI Providers)
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Khai báo các OpenAI-compatible endpoints (NVIDIA NIM, Google Studio, vLLM, Ollama, OpenRouter, v.v.) và quản lý models.
                </p>
              </div>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button
                  onClick={() => {
                    setEditingProv(null);
                    setShowAddProvider(true);
                  }}
                  className="bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-teal-500/10"
                >
                  <Plus className="w-4 h-4" />
                  Thêm Provider mới
                </Button>
              </motion.div>
            </div>

            {/* Form thêm / sửa Provider with AnimatePresence */}
            <AnimatePresence>
              {showAddProvider && (
                <motion.div
                  initial={{ opacity: 0, height: 0, scale: 0.98 }}
                  animate={{ opacity: 1, height: "auto", scale: 1 }}
                  exit={{ opacity: 0, height: 0, scale: 0.98 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <Card className="border-teal-500/40 bg-teal-500/5 rounded-2xl shadow-xl shadow-teal-500/5">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <PlugZap className="w-4 h-4 text-teal-400" />
                        {editingProv ? `Chỉnh sửa Provider: ${editingProv.name}` : "Thêm AI Provider mới"}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Nhập endpoint tương thích chuẩn OpenAI `/v1` và API key tương ứng.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Tên định danh (Provider Name)</Label>
                          <Input
                            value={newProv.name}
                            onChange={(e) => setNewProv((p) => ({ ...p, name: e.target.value }))}
                            placeholder="VD: nvidia, ollama, openrouter"
                            disabled={!!editingProv}
                            className="text-xs rounded-xl bg-zinc-900 border-zinc-700"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Base URL</Label>
                          <Input
                            value={newProv.base_url}
                            onChange={(e) => setNewProv((p) => ({ ...p, base_url: e.target.value }))}
                            placeholder="VD: https://integrate.api.nvidia.com/v1"
                            className="text-xs rounded-xl bg-zinc-900 border-zinc-700"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">API Key</Label>
                          <Input
                            type="password"
                            value={newProv.api_key}
                            onChange={(e) => setNewProv((p) => ({ ...p, api_key: e.target.value }))}
                            placeholder={editingProv ? "Bỏ trống nếu giữ key cũ" : "nvapi-..., sk-..."}
                            className="text-xs rounded-xl bg-zinc-900 border-zinc-700"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="checkbox"
                          id="prov-enabled"
                          checked={newProv.enabled}
                          onChange={(e) => setNewProv((p) => ({ ...p, enabled: e.target.checked }))}
                          className="rounded border-zinc-700 text-teal-500 focus:ring-teal-400"
                        />
                        <Label htmlFor="prov-enabled" className="text-xs font-medium cursor-pointer">
                          Kích hoạt provider này ngay sau khi lưu
                        </Label>
                      </div>

                      <div className="flex items-center gap-2.5 pt-2">
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (!newProv.name.trim() || !newProv.base_url.trim()) return;
                            let ok = false;
                            if (editingProv) {
                              ok = await ai.updateProvider(editingProv.name, newProv.base_url, newProv.api_key, newProv.enabled);
                            } else {
                              ok = await ai.addProvider(newProv.name, newProv.base_url, newProv.api_key, newProv.enabled);
                            }
                            if (ok) {
                              setShowAddProvider(false);
                              setEditingProv(null);
                              setNewProv({ name: "", base_url: "", api_key: "", enabled: true });
                            }
                          }}
                          disabled={ai.busy === "add-provider" || !newProv.name.trim() || !newProv.base_url.trim()}
                          className="bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold text-xs rounded-xl shadow-md shadow-teal-500/10"
                        >
                          {ai.busy === "add-provider" ? "Đang lưu..." : editingProv ? "Cập nhật Provider" : "Lưu Provider"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setShowAddProvider(false);
                            setEditingProv(null);
                          }}
                          className="text-xs rounded-xl"
                        >
                          Huỷ
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Danh sách Provider Cards */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="grid gap-5 md:grid-cols-2"
            >
              {ai.providers.length === 0 ? (
                <div className="col-span-full py-12 text-center border border-dashed border-border/80 rounded-2xl">
                  <PlugZap className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-semibold text-foreground">Chưa có Provider nào được cấu hình</p>
                  <p className="text-xs text-muted-foreground mt-1">Bấm "+ Thêm Provider mới" để bắt đầu thiết lập.</p>
                </div>
              ) : (
                ai.providers.map((p) => {
                  const test = ai.testResults[p.name];
                  const isTesting = ai.busy === `test-${p.name}`;

                  return (
                    <motion.div
                      key={p.name}
                      variants={itemVariants}
                      whileHover={{ y: -3, transition: { duration: 0.2 } }}
                      className={`flex flex-col justify-between p-5 rounded-2xl border transition-all space-y-4 ${
                        p.enabled
                          ? "border-border/80 bg-card/80 hover:border-teal-500/40 hover:shadow-lg hover:shadow-teal-500/5"
                          : "border-zinc-800 bg-zinc-900/40 opacity-70"
                      }`}
                    >
                      <div className="space-y-3">
                        {/* Provider Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-foreground text-base tracking-wide uppercase">{p.name}</span>
                              <span
                                className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                                  p.enabled ? "bg-teal-500/10 text-teal-400" : "bg-zinc-700/40 text-zinc-400"
                                }`}
                              >
                                {p.enabled ? "Active" : "Disabled"}
                              </span>
                              <span
                                className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                                  p.source === "db"
                                    ? "bg-blue-500/10 text-blue-400"
                                    : "bg-amber-500/10 text-amber-400"
                                }`}
                              >
                                ● {p.source.toUpperCase()}
                              </span>
                            </div>
                            <p className="text-[12px] text-muted-foreground font-mono mt-1 break-all flex items-center gap-1">
                              <Globe className="w-3 h-3 flex-shrink-0" />
                              {p.base_url}
                            </p>
                            {p.api_key_masked && (
                              <p className="text-[11px] text-muted-foreground/80 font-mono mt-0.5 flex items-center gap-1">
                                <Key className="w-3 h-3 flex-shrink-0" />
                                Key: {p.api_key_masked}
                              </p>
                            )}
                          </div>

                          {/* Nút hành động */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => ai.testProvider(p.name)}
                                disabled={isTesting}
                                className="h-8 px-2.5 text-xs font-semibold text-teal-400 bg-teal-500/5 hover:bg-teal-500/15 border-teal-500/30 rounded-xl flex items-center gap-1"
                              >
                                <Zap className={`w-3.5 h-3.5 ${isTesting ? "animate-spin text-amber-400" : ""}`} />
                                {isTesting ? "Testing..." : "Test"}
                              </Button>
                            </motion.div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingProv(p);
                                setNewProv({ name: p.name, base_url: p.base_url, api_key: "", enabled: p.enabled });
                                setShowAddProvider(true);
                              }}
                              className="h-8 w-8 p-0 rounded-xl text-muted-foreground hover:text-foreground"
                            >
                              <Sliders className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteConfirm({ type: "provider", name: p.name })}
                              disabled={ai.busy === `del-${p.name}`}
                              className="h-8 w-8 p-0 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Test Result Banner with AnimatePresence */}
                        <AnimatePresence>
                          {test && (
                            <motion.div
                              initial={{ opacity: 0, height: 0, y: -4 }}
                              animate={{ opacity: 1, height: "auto", y: 0 }}
                              exit={{ opacity: 0, height: 0, y: -4 }}
                              transition={{ duration: 0.2 }}
                              className={`p-2.5 rounded-xl text-xs flex flex-col gap-1 border overflow-hidden ${
                                test.ok
                                  ? "bg-teal-500/10 border-teal-500/30 text-teal-300"
                                  : "bg-red-500/10 border-red-500/30 text-red-300"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 font-semibold">
                                {test.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                                {test.detail}
                              </div>
                              {test.models && test.models.length > 0 && (
                                <div className="pt-1 flex items-center justify-between gap-2">
                                  <span className="text-[11px] opacity-80">Phát hiện {test.models.length} model từ endpoint</span>
                                  <button
                                    onClick={async () => {
                                      for (const mid of test.models || []) {
                                        if (!p.models.some((m) => m.model_id === mid)) {
                                          await ai.addModel(p.name, mid);
                                        }
                                      }
                                    }}
                                    className="text-[11px] underline font-semibold text-teal-300 hover:text-teal-200"
                                  >
                                    + Nạp nhanh vào danh sách
                                  </button>
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Models List */}
                        <div className="space-y-2 pt-1 border-t border-border/40">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground">
                              Models ({p.models.length})
                            </span>
                            <button
                              onClick={() => {
                                setAddingModelFor(addingModelFor === p.name ? null : p.name);
                                setNewModelId("");
                                setNewModelLabel("");
                              }}
                              className="text-xs font-semibold text-teal-400 hover:text-teal-300 flex items-center gap-1 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" /> Thêm model
                            </button>
                          </div>

                          {/* Inline Form thêm model with AnimatePresence */}
                          <AnimatePresence>
                            {addingModelFor === p.name && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.18 }}
                                className="overflow-hidden"
                              >
                                <div className="p-3 bg-muted/40 border border-border/60 rounded-xl space-y-2.5 mb-2">
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <Input
                                      value={newModelId}
                                      onChange={(e) => setNewModelId(e.target.value)}
                                      placeholder="Model ID (vd: gpt-4o, llama-3.3-70b)"
                                      className="h-8 text-xs rounded-lg bg-zinc-900 border-zinc-700"
                                    />
                                    <Input
                                      value={newModelLabel}
                                      onChange={(e) => setNewModelLabel(e.target.value)}
                                      placeholder="Nhãn gợi nhớ (tùy chọn)"
                                      className="h-8 text-xs rounded-lg bg-zinc-900 border-zinc-700"
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={async () => {
                                        if (!newModelId.trim()) return;
                                        const ok = await ai.addModel(p.name, newModelId, newModelLabel);
                                        if (ok) {
                                          setNewModelId("");
                                          setNewModelLabel("");
                                          setAddingModelFor(null);
                                        }
                                      }}
                                      disabled={!newModelId.trim()}
                                      className="h-7 px-3 text-[11px] bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold rounded-lg"
                                    >
                                      Thêm
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setAddingModelFor(null)}
                                      className="h-7 px-2.5 text-[11px] rounded-lg"
                                    >
                                      Đóng
                                    </Button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Danh sách model chips with AnimatePresence */}
                          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                            {p.models.length === 0 ? (
                              <span className="text-xs text-muted-foreground/70 italic">Chưa khai báo model nào.</span>
                            ) : (
                              <AnimatePresence>
                                {p.models.map((m) => (
                                  <motion.span
                                    key={m.id}
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.8, opacity: 0 }}
                                    transition={{ duration: 0.15 }}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60 text-xs font-mono text-zinc-200 hover:border-zinc-500 transition-colors"
                                  >
                                    <span>{m.model_id}</span>
                                    {m.label && <span className="text-[10px] text-muted-foreground">({m.label})</span>}
                                    <motion.button
                                      whileHover={{ scale: 1.2 }}
                                      whileTap={{ scale: 0.9 }}
                                      onClick={() => setDeleteConfirm({ type: "model", id: m.id, name: m.model_id, extra: p.name })}
                                      disabled={ai.busy === `del-model-${m.id}`}
                                      className="text-zinc-500 hover:text-red-400 ml-0.5 transition-colors"
                                      title="Xoá model này"
                                    >
                                      <X className="w-3 h-3" />
                                    </motion.button>
                                  </motion.span>
                                ))}
                              </AnimatePresence>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </motion.div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: REFERENCE CHUNKS (RAG)                                             */}
        {/* ========================================================================= */}
        {activeTab === "reference" && (
          <motion.div
            key="tab-reference"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <Card className="rounded-2xl border-border/60 bg-card/70 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-teal-400" />
                  📚 Quản lý Tài liệu chuẩn (RAG Reference)
                </CardTitle>
                <CardDescription>
                  Upload rubric, giáo trình, hoặc dự án mẫu. AI sẽ truy xuất ngữ cảnh từ bảng `reference_chunks` để hỏi xoáy đúng chuẩn hội đồng.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 p-4 rounded-2xl bg-muted/20 border border-border/50">
                  <div className="space-y-1.5">
                    <Label className="text-xs">File tài liệu (PDF/DOCX/PPTX/ZIP/MD)</Label>
                    <input
                      type="file"
                      accept=".pdf,.docx,.pptx,.zip,.rar,.md"
                      onChange={(e) => ref.setRefFile(e.target.files?.[0] ?? null)}
                      className="w-full text-xs text-muted-foreground file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-muted file:text-foreground file:text-xs file:font-semibold hover:file:bg-muted"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Phân loại</Label>
                    <select
                      value={ref.refCategory}
                      onChange={(e) => ref.setRefCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700/80 rounded-xl text-xs text-foreground focus:outline-none focus:border-teal-400"
                    >
                      {REF_CATEGORIES.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tiêu đề tài liệu</Label>
                    <Input
                      value={ref.refTitle}
                      onChange={(e) => ref.setRefTitle(e.target.value)}
                      placeholder="VD: Rubric bảo vệ K18"
                      className="text-xs rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nguồn gốc (tùy chọn)</Label>
                    <Input
                      value={ref.refSource}
                      onChange={(e) => ref.setRefSource(e.target.value)}
                      placeholder="VD: Hội đồng KTPM"
                      className="text-xs rounded-xl"
                    />
                  </div>
                </div>

                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    onClick={ref.uploadReference}
                    disabled={!ref.refFile || !ref.refTitle.trim() || ref.refRunning}
                    className="bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold text-xs rounded-xl shadow-md shadow-teal-500/10"
                  >
                    {ref.refRunning ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Đang index chunks...
                      </>
                    ) : (
                      "Upload & Index tài liệu"
                    )}
                  </Button>
                </motion.div>

                {ref.refMsg && (
                  <p className={`text-xs font-semibold ${ref.refMsg.type === "ok" ? "text-teal-400" : "text-red-400"}`}>
                    {ref.refMsg.text}
                  </p>
                )}

                {/* Bảng danh sách reference chunks */}
                <div className="space-y-3 pt-2">
                  <h4 className="font-semibold text-sm text-foreground">Tài liệu đã index</h4>
                  {ref.refLoading ? (
                    <p className="text-xs text-muted-foreground">Đang tải danh sách...</p>
                  ) : ref.refItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Chưa có tài liệu chuẩn nào được index.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-border/60">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
                            <th className="py-2.5 px-4 font-semibold">Loại</th>
                            <th className="py-2.5 px-4 font-semibold">Tiêu đề</th>
                            <th className="py-2.5 px-4 font-semibold text-right">Số chunk</th>
                            <th className="py-2.5 px-4 font-semibold">Cập nhật lúc</th>
                            <th className="py-2.5 px-4 font-semibold text-right">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {ref.refItems.map((it) => {
                            const key = ref.refKey(it.category, it.title);
                            return (
                              <Fragment key={key}>
                                <tr className="hover:bg-muted/10 transition-colors">
                                  <td className="py-2.5 px-4">
                                    <span className="px-2 py-0.5 bg-teal-500/10 text-teal-400 text-[10px] font-bold rounded-full">
                                      {REF_CATEGORIES.find((c) => c.key === it.category)?.label ?? it.category}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-4 font-medium text-foreground">{it.title}</td>
                                  <td className="py-2.5 px-4 text-right text-muted-foreground font-mono">{it.chunks}</td>
                                  <td className="py-2.5 px-4 text-muted-foreground">
                                    {new Date(it.updated_at + "Z").toLocaleString("vi-VN")}
                                  </td>
                                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                                    <button
                                      onClick={() => ref.togglePreview(it.category, it.title)}
                                      className="px-2.5 py-1 text-[11px] font-semibold text-teal-400 bg-teal-500/10 rounded-lg hover:bg-teal-500/20 transition-colors mr-2"
                                    >
                                      {ref.refPreview[key] ? "Ẩn" : "👁 Xem"}
                                    </button>
                                    <button
                                      onClick={() => ref.removeRef(it.category, it.title)}
                                      disabled={ref.refDeleting === key}
                                      className="px-2.5 py-1 text-[11px] font-semibold text-red-400 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                    >
                                      Xoá
                                    </button>
                                  </td>
                                </tr>
                                {ref.refPreview[key] && (
                                  <tr>
                                    <td colSpan={5} className="p-4 bg-zinc-950/60">
                                      <div className="rounded-xl p-3 space-y-2 max-h-60 overflow-y-auto font-mono text-[11px]">
                                        {ref.refPreview[key].map((content, i) => (
                                          <div key={i} className="text-zinc-300 pb-2 border-b border-zinc-800/60 last:border-0">
                                            <span className="text-teal-400 font-bold">#{i + 1}</span> {content}
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: GENERAL SETTINGS                                                   */}
        {/* ========================================================================= */}
        {activeTab === "general" && (
          <motion.div
            key="tab-general"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="space-y-6"
          >
            {/* Informational Banner pointing to Tab 2 */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-200">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-teal-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-teal-300">
                    Bạn muốn thêm nhiều Provider và nhiều Model cho từng Provider?
                  </p>
                  <p className="text-teal-200/80 leading-relaxed">
                    Tab <strong>Cài đặt chung</strong> này chỉ dùng làm tham số Fallback dự phòng đơn lẻ (1 model mặc định). 
                    Để quản lý đa nhà cung cấp và thêm danh sách nhiều model (dạng tags/chips), hãy dùng tab <strong>AI Providers & Models</strong>.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => setActiveTab("providers")}
                className="bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold text-xs rounded-xl flex-shrink-0 whitespace-nowrap shadow-md shadow-teal-500/20"
              >
                <PlugZap className="w-3.5 h-3.5 mr-1.5" />
                Sang AI Providers & Models
              </Button>
            </div>

            <Card className="rounded-2xl border-border/60 bg-card/70 shadow-lg">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Server className="w-4 h-4 text-teal-400" />
                  Cài đặt Fallback AI Gateway (Dự phòng đơn lẻ)
                </CardTitle>
                <CardDescription className="text-xs">
                  Cấu hình tham số fallback dự phòng cấp thấp khi Database chưa cấu hình riêng cho chức năng.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {general.loading ? (
                  <p className="text-xs text-muted-foreground">Đang tải cấu hình...</p>
                ) : (
                  FIELD_META.map((f) => (
                    <div key={f.key} className="space-y-1">
                      <Label htmlFor={f.key} className="text-xs font-medium">
                        {f.label}
                      </Label>
                      <Input
                        id={f.key}
                        type={f.type || "text"}
                        value={general.settings[f.key] ?? ""}
                        onChange={(e) => general.set(f.key, e.target.value)}
                        placeholder={f.hint}
                        className="text-xs rounded-xl"
                      />
                      <p className="text-[11px] text-muted-foreground">{f.hint}</p>
                    </div>
                  ))
                )}
                {general.msg && (
                  <p className={`text-xs font-semibold ${general.msg.type === "ok" ? "text-teal-400" : "text-red-400"}`}>
                    {general.msg.text}
                  </p>
                )}
                <div className="pt-2">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="inline-block">
                    <Button
                      onClick={general.save}
                      disabled={general.loading || general.saving}
                      className="bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold text-xs rounded-xl shadow-md shadow-teal-500/10"
                    >
                      {general.saving ? "Đang lưu..." : "Lưu cài đặt"}
                    </Button>
                  </motion.div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* DIALOG XÁC NHẬN XOÁ (WITH SPRING ANIMATION)                               */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            />

            {/* Modal Content */}
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 16 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              className="relative z-10 bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-md w-full space-y-4 shadow-2xl"
            >
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-400" />
                Xác nhận xoá {deleteConfirm.type === "provider" ? "Provider" : "Model"}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Bạn có chắc chắn muốn xoá {deleteConfirm.type === "provider" ? "nhà cung cấp" : "model"}{" "}
                <span className="font-semibold text-zinc-200">"{deleteConfirm.name}"</span>?
                {deleteConfirm.type === "provider" && (
                  <span className="block mt-1 text-red-400 font-semibold">
                    Lưu ý: Mọi model và cấu hình chức năng đang trỏ tới provider này sẽ bị xoá liên đới.
                  </span>
                )}
              </p>
              <div className="flex justify-end gap-2.5 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteConfirm(null)}
                  className="text-xs rounded-xl"
                >
                  Huỷ bỏ
                </Button>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button
                    size="sm"
                    onClick={async () => {
                      if (deleteConfirm.type === "provider") {
                        await ai.deleteProvider(deleteConfirm.name);
                      } else if (deleteConfirm.type === "model" && deleteConfirm.id) {
                        await ai.deleteModel(deleteConfirm.id, deleteConfirm.name);
                      }
                      setDeleteConfirm(null);
                    }}
                    className="bg-red-500 hover:bg-red-600 text-white font-semibold text-xs rounded-xl shadow-md shadow-red-500/20"
                  >
                    Xác nhận xoá
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
