"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Upload, Save, X, Camera, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function AvatarPage() {
  const { user } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string>("/avatar.jpg");
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("/avatar.jpg");

  // Get token lazily to avoid React warnings
  const getToken = () =>
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  useEffect(() => {
    if (user?.avatar) {
      setAvatarUrl(user.avatar);
      setPreviewUrl(user.avatar);
    }
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Kích thước file không được vượt quá 5MB");
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
      toast.error("Bạn cần đăng nhập để thay đổi avatar");
      return;
    }

    setIsUploading(true);
    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        toast.error("Không tìm thấy token đăng nhập");
        return;
      }

      // Upload avatar
      const formData = new FormData();
      formData.append("avatar", previewUrl);

      const response = await fetch("/api/user/avatar", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Không thể cập nhật avatar");
      }

      const result = await response.json();
      setAvatarUrl(result.avatar_url);
      toast.success("Cập nhật avatar thành công!");
    } catch (error: any) {
      toast.error(error.message || "Có lỗi xảy ra khi cập nhật avatar");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!user) {
      toast.error("Bạn cần đăng nhập để xóa avatar");
      return;
    }

    setIsUploading(true);
    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        toast.error("Không tìm thấy token đăng nhập");
        return;
      }

      const response = await fetch("/api/user/avatar", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Không thể xóa avatar");
      }

      setAvatarUrl("/avatar.jpg");
      setPreviewUrl("/avatar.jpg");
      toast.success("Xóa avatar thành công!");
    } catch (error: any) {
      toast.error(error.message || "Có lỗi xảy ra khi xóa avatar");
    } finally {
      setIsUploading(false);
    }
  };

  const getInitials = () => {
    if (!user) return "U";
    const fullName = user.full_name || user.email || "";
    const parts = fullName.split(" ");
    if (parts.length >= 2) {
      return parts[parts.length - 2][0] + parts[parts.length - 1][0];
    }
    return parts[0]?.[0] || "U";
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Avatar</h1>
        <p className="text-muted-foreground">Quản lý avatar của bạn</p>
      </div>

      <div className="grid gap-6">
        {/* Avatar Preview Card */}
        <Card>
          <CardHeader>
            <CardTitle>Xem trước</CardTitle>
            <CardDescription>Avatar hiện tại của bạn</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">
            <div className="relative">
              <Avatar className="w-32 h-32 border-4 border-border">
                <AvatarImage src={avatarUrl} alt="Avatar" />
                <AvatarFallback className="text-2xl font-bold bg-gradient-to-br from-primary to-secondary">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg">
                <Camera className="w-5 h-5 text-primary-foreground" />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleSave}
                disabled={isUploading || avatarUrl === previewUrl}
                className="gap-2"
              >
                <Save className="w-4 h-4" />
                {isUploading ? "Đang lưu..." : "Lưu thay đổi"}
              </Button>
              <Button
                variant="outline"
                onClick={handleRemove}
                disabled={isUploading || avatarUrl === "/avatar.jpg"}
                className="gap-2"
              >
                <X className="w-4 h-4" />
                Xóa
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Upload Card */}
        <Card>
          <CardHeader>
            <CardTitle>Tải lên avatar mới</CardTitle>
            <CardDescription>
              Chọn file ảnh từ máy tính của bạn. Định dạng: JPG, PNG, GIF. Kích thước tối đa: 5MB.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4">
              <div className="relative group">
                <div className="w-48 h-48 rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 group-hover:border-primary transition-colors cursor-pointer">
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
                      onClick={() => setPreviewUrl(avatarUrl)}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Reset
                    </Button>
                  </div>
                  <div className="relative rounded-xl overflow-hidden border border-border">
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="w-full h-48 object-cover"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Thông tin</CardTitle>
            <CardDescription>Quy định về avatar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
              <span>Avatar phải là ảnh thật hoặc ảnh minh họa chính đáng</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
              <span>Không sử dụng avatar vi phạm chính sách cộng đồng</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
              <span>Avatar được hiển thị trên các giao diện khác nhau</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
              <span>Avatar có thể được thay đổi bất cứ lúc nào</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
