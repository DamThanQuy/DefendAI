import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="container relative mx-auto flex flex-col items-center justify-center min-h-[80vh] px-4">
      <Link
        href="/"
        className="absolute left-4 top-4 md:left-8 md:top-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Quay lại
      </Link>

      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[450px]">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Đăng nhập
          </h1>
          <p className="text-sm text-muted-foreground">
            Nhập email và mật khẩu của bạn để truy cập hệ thống GraduAI
          </p>
        </div>

        <Card className="border-0 shadow-xl bg-card/50 backdrop-blur-sm ring-1 ring-primary/10">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Xin chào 👋</CardTitle>
            <CardDescription>
              Tiếp tục hành trình bảo vệ đồ án của bạn
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                className="bg-background/50 focus:bg-background transition-colors"
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mật khẩu</Label>
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Quên mật khẩu?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                className="bg-background/50 focus:bg-background transition-colors"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button className="w-full h-11 text-base font-semibold shadow-md transition-transform hover:-translate-y-0.5">
              Đăng nhập
            </Button>
            <p className="text-center text-sm text-muted-foreground mt-2">
              Chưa có tài khoản?{" "}
              <Link
                href="/register"
                className="font-semibold text-primary hover:underline"
              >
                Đăng ký ngay
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
