"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Download, RefreshCw, Moon, Sun, Monitor, Save, X, Upload, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function WallpaperPage() {
  const { user } = useAuth();
  const [wallpaperUrl, setWallpaperUrl] = useState<string>("/wallpaper.jpg");
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("/wallpaper.jpg");
  const [isDark, setIsDark] = useState(true);
  const [isLight, setIsLight] = useState(false);
  const [isSystem, setIsSystem] = useState(true);

  useEffect(() => {
    // Check system preference
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setIsDark(true);
      setIsLight(false);
      setIsSystem(false);
    } else {
      setIsDark(false);
      setIsLight(true);
      setIsSystem(false);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Kích thước file không được vượt quá 10MB");
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!user) {
      toast.error("Bạn cần đăng nhập để thay đổi wallpaper");
      return;
    }

    setIsUploading(true);
    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        toast.error("Không tìm thấy token đăng nhập");
        return;
      }

      // Upload wallpaper
      const formData = new FormData();
      formData.append("wallpaper", previewUrl);

      const response = await fetch("/api/user/wallpaper", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Không thể cập nhật wallpaper");
      }

      const result = await response.json();
      setWallpaperUrl(result.wallpaper_url);
      toast.success("Cập nhật wallpaper thành công!");
    } catch (error: any) {
      toast.error(error.message || "Có lỗi xảy ra khi cập nhật wallpaper");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!user) {
      toast.error("Bạn cần đăng nhập để xóa wallpaper");
      return;
    }

    setIsUploading(true);
    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        toast.error("Không tìm thấy token đăng nhập");
        return;
      }

      const response = await fetch("/api/user/wallpaper", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Không thể xóa wallpaper");
      }

      setWallpaperUrl("/wallpaper.jpg");
      setPreviewUrl("/wallpaper.jpg");
      toast.success("Xóa wallpaper thành công!");
    } catch (error: any) {
      toast.error(error.message || "Có lỗi xảy ra khi xóa wallpaper");
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setPreviewUrl("/wallpaper.jpg");
    toast.success("Đã reset về wallpaper mặc định");
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = previewUrl;
    link.download = "wallpaper-preview.jpg";
    link.click();
    toast.success("Đang tải xuống...");
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Wallpaper</h1>
        <p className="text-muted-foreground">Quản lý wallpaper của bạn</p>
      </div>

      <div className="grid gap-6">
        {/* Wallpaper Preview Card */}
        <Card>
          <CardHeader>
            <CardTitle>Xem trước</CardTitle>
            <CardDescription>Wallpaper hiện tại của bạn</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative rounded-xl overflow-hidden border border-border aspect-video">
              <img
                src={wallpaperUrl}
                alt="Wallpaper"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSave}
                      disabled={isUploading || wallpaperUrl === previewUrl}
                      size="sm"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {isUploading ? "Đang lưu..." : "Lưu thay đổi"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleRemove}
                      disabled={isUploading || wallpaperUrl === "/wallpaper.jpg"}
                      size="sm"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Xóa
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleDownload}
                    size="sm"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Tải xuống
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upload Card */}
        <Card>
          <CardHeader>
            <CardTitle>Tải lên wallpaper mới</CardTitle>
            <CardDescription>
              Chọn file ảnh từ máy tính của bạn. Định dạng: JPG, PNG, GIF. Kích thước tối đa: 10MB.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4">
              <div className="relative group">
                <div className="w-64 h-64 rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 group-hover:border-primary transition-colors cursor-pointer">
                  <Upload className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-sm text-muted-foreground">Kéo thả hoặc click để chọn</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>

              {previewUrl && (
                <div className="w-full">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Xem trước:</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleReset}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Reset
                    </Button>
                  </div>
                  <div className="relative rounded-xl overflow-hidden border border-border">
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="w-full h-64 object-cover"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Theme Card */}
        <Card>
          <CardHeader>
            <CardTitle>Chủ đề</CardTitle>
            <CardDescription>Chọn chủ đề cho wallpaper</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="dark" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="dark" onClick={() => setIsDark(true)}>
                  <Moon className="w-4 h-4 mr-2" />
                  Tối
                </TabsTrigger>
                <TabsTrigger value="light" onClick={() => setIsLight(true)}>
                  <Sun className="w-4 h-4 mr-2" />
                  Sáng
                </TabsTrigger>
                <TabsTrigger value="system" onClick={() => setIsSystem(true)}>
                  <Monitor className="w-4 h-4 mr-2" />
                  Hệ thống
                </TabsTrigger>
              </TabsList>
              <TabsContent value="dark" className="mt-4">
                <div className="relative rounded-xl overflow-hidden border border-border aspect-video">
                  <img
                    src="/wallpaper-dark.svg"
                    alt="Dark Wallpaper"
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-2">Wallpaper tối cho giao diện dark mode</p>
              </TabsContent>
              <TabsContent value="light" className="mt-4">
                <div className="relative rounded-xl overflow-hidden border border-border aspect-video">
                  <img
                    src="/wallpaper-light.svg"
                    alt="Light Wallpaper"
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-2">Wallpaper sáng cho giao diện light mode</p>
              </TabsContent>
              <TabsContent value="system" className="mt-4">
                <div className="flex items-center justify-between p-4 rounded-xl border border-border">
                  <div>
                    <p className="font-medium">Sử dụng chủ đề hệ thống</p>
                    <p className="text-sm text-muted-foreground">Tự động theo dõi chủ đề của hệ điều hành</p>
                  </div>
                  <Switch
                    checked={isSystem}
                    onCheckedChange={setIsSystem}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Thông tin</CardTitle>
            <CardDescription>Quy định về wallpaper</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
              <span>Wallpaper phải là ảnh chất lượng cao</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
              <span>Không sử dụng wallpaper vi phạm chính sách cộng đồng</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
              <span>Wallpaper được hiển thị trên các giao diện khác nhau</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
              <span>Wallpaper có thể được thay đổi bất cứ lúc nào</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
