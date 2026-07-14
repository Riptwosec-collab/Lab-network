"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, Clock3, FlaskConical, Gauge } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { labs } from "@/data/labs";
import { db } from "@/db/local-database";

export function LabsClient() {
  const records = useLiveQuery(() => db.labProgress.toArray(), [], []);
  const progressById = new Map(records?.map((record) => [record.id, record.progress]));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8 lg:py-10">
      <Badge>
        <FlaskConical className="mr-1 size-3" />
        PRACTICE LAB CENTER
      </Badge>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">
        เปลี่ยน topology ให้เป็น <span className="text-primary">ทักษะใช้งานจริง</span>
      </h1>
      <p className="text-muted-foreground mt-3 max-w-2xl leading-7">
        Scenario, objectives และจำนวนภารกิจทั้งหมดมาจาก lab registry ปัจจุบัน
      </p>
      <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {labs.map((lab, index) => {
          const progress = progressById.get(lab.id);
          return (
            <Card
              key={lab.id}
              className="group hover:border-primary/40 flex flex-col overflow-hidden transition-colors"
            >
              <div className="border-border technical-grid relative h-24 border-b">
                <span className="border-primary/20 bg-background text-primary absolute top-4 left-5 grid size-11 place-items-center rounded-lg border">
                  <FlaskConical />
                </span>
                <span className="text-muted-foreground/25 absolute top-4 right-5 font-mono text-3xl font-semibold">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{lab.level}</Badge>
                  <Badge variant="outline">{lab.difficulty}</Badge>
                  <Badge variant={progress === 100 ? "success" : "secondary"}>
                    {progress === undefined ? "NOT STARTED" : `${progress}%`}
                  </Badge>
                </div>
                <CardTitle className="mt-2">{lab.title}</CardTitle>
                <CardDescription>{lab.scenario}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <ul className="text-muted-foreground mb-4 space-y-1.5 text-xs">
                  {lab.objectives.slice(0, 2).map((objective) => (
                    <li key={objective} className="flex gap-2">
                      <span className="text-primary">—</span>
                      {objective}
                    </li>
                  ))}
                </ul>
                <div className="text-muted-foreground mb-5 flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5">
                    <Clock3 className="size-3.5" />
                    {lab.estimatedMinutes} นาที
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Gauge className="size-3.5" />
                    {lab.tasks.length} ภารกิจ
                  </span>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/workspace?project=demo-project&lab=${lab.id}`}>
                    เริ่ม Lab <ArrowRight />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
