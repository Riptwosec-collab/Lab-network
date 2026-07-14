"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function WorkspaceError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Workspace error", error);
  }, [error]);
  return (
    <main className="bg-background grid min-h-dvh place-items-center p-6">
      <div className="border-destructive/25 bg-card max-w-md rounded-2xl border p-8 text-center">
        <AlertTriangle className="text-destructive mx-auto size-10" />
        <h1 className="mt-4 text-xl font-semibold">Workspace มีปัญหา</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          ข้อมูลปัจจุบันยังอยู่ใน local database กรุณาลองเปิด Workspace ใหม่อีกครั้ง
        </p>
        <Button className="mt-6" onClick={unstable_retry}>
          ลองอีกครั้ง
        </Button>
      </div>
    </main>
  );
}
