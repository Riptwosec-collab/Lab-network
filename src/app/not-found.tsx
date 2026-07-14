import Link from "next/link";
import { Network } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="bg-background grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <Network className="text-primary mx-auto size-12" />
        <p className="text-primary mt-5 font-mono text-sm">ERROR 404</p>
        <h1 className="mt-2 text-3xl font-semibold">หาเส้นทางนี้ไม่พบ</h1>
        <p className="text-muted-foreground mt-2">Route นี้ไม่ได้อยู่ใน topology ของ NetLab Studio</p>
        <Button asChild className="mt-6">
          <Link href="/dashboard">กลับ Dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
