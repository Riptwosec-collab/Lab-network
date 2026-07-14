import { AppHeader } from "@/components/layout/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-3xl font-semibold">ตั้งค่า</h1>
        <p className="text-muted-foreground mt-2">การตั้งค่าระบบและฟีเจอร์ทดลอง</p>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Local-first workspace</CardTitle>
            <CardDescription>โปรเจกต์ถูกจัดเก็บใน IndexedDB ของเบราว์เซอร์นี้</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-sm">Local project storage</span>
            <Badge variant="success">เปิดใช้งาน</Badge>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
