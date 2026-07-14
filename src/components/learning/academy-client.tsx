"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, BookOpen, Database, FlaskConical } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { labs } from "@/data/labs";
import { db } from "@/db/local-database";

export function AcademyClient() {
  const progressRecords = useLiveQuery(() => db.learningProgress.toArray(), [], undefined);
  const levels = Array.from(new Set(labs.map((lab) => lab.level)));
  const loading = progressRecords === undefined;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8 lg:py-10">
      <Badge>
        <BookOpen className="mr-1 size-3" />
        NETLAB ACADEMY
      </Badge>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">
        Learning records ที่ <span className="text-primary">ตรวจสอบย้อนกลับได้</span>
      </h1>
      <p className="text-muted-foreground mt-3 max-w-2xl leading-7">
        หน้านี้แสดงเฉพาะความคืบหน้าที่บันทึกใน IndexedDB ไม่มีคะแนน ระดับ หรือบทเรียนสมมติ
      </p>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader>
            <CardTitle>Academy progress</CardTitle>
            <CardDescription>ข้อมูลจาก learningProgress store</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="bg-muted/45 h-32 animate-pulse rounded-xl" aria-label="กำลังโหลด progress" />
            ) : progressRecords.length ? (
              <div className="space-y-3">
                {progressRecords.map((record) => (
                  <div key={record.id} className="border-border rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <code className="text-sm">{record.id}</code>
                      <Badge variant={record.progress >= 100 ? "success" : "outline"}>
                        {Math.max(0, Math.min(100, record.progress))}%
                      </Badge>
                    </div>
                    <div className="bg-muted mt-3 h-1.5 overflow-hidden rounded-full">
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${Math.max(0, Math.min(100, record.progress))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-border rounded-xl border border-dashed p-8 text-center">
                <Database className="text-muted-foreground mx-auto mb-3 size-7" />
                <p className="font-medium">ยังไม่มี progress ที่บันทึกไว้</p>
                <p className="text-muted-foreground mt-2 text-sm">
                  Academy content engine จะเชื่อม record เหล่านี้ใน phase การเรียนรู้
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>เนื้อหาที่ใช้ได้ตอนนี้</CardTitle>
            <CardDescription>สรุปจาก lab definitions จริง</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {levels.map((level) => (
                <Badge key={level} variant="outline">
                  {level}
                </Badge>
              ))}
            </div>
            <div className="bg-primary/6 border-primary/20 rounded-xl border p-4">
              <FlaskConical className="text-primary mb-3 size-5" />
              <p className="text-sm font-medium">{labs.length} practice labs พร้อมใช้งาน</p>
              <p className="text-muted-foreground mt-1 text-xs">เริ่มผ่าน workspace ด้วย demo topology</p>
            </div>
            <Button asChild className="w-full">
              <Link href="/labs">
                เปิด Practice Labs <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
