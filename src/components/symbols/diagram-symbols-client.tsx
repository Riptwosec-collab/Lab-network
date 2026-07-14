"use client";

import {
  Boxes,
  Cable,
  Camera,
  Cloud,
  Database,
  GitFork,
  Globe2,
  KeyRound,
  Laptop,
  LayoutPanelTop,
  Monitor,
  Network,
  Phone,
  Radio,
  RadioTower,
  Router,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  Waypoints,
  Wifi,
} from "lucide-react";

import { AppHeader } from "@/components/layout/app-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { diagramSymbols } from "@/data/diagram-symbols";

const icons = {
  Router,
  Network,
  ShieldCheck,
  Cloud,
  Wifi,
  Server,
  Monitor,
  Laptop,
  Phone,
  Camera,
  Database,
  Cable,
  Waypoints,
  Radio,
  KeyRound,
  GitFork,
  LayoutPanelTop,
  Globe2,
  Shield,
  Settings,
  RadioTower,
  Boxes,
} as const;

export function DiagramSymbolsClient() {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8 lg:py-10">
        <Badge>VENDOR-NEUTRAL DIAGRAM SYMBOLS</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Diagram Symbols &amp; Legend</h1>
        <p className="text-muted-foreground mt-3 max-w-3xl leading-7">
          สัญลักษณ์สำหรับ NetLab Studio ใช้เพื่อการออกแบบและการเรียนรู้เท่านั้น ไม่ใช้ภาพทรัพย์สินของผู้ผลิตรายใด
        </p>
        {(["device", "link", "zone"] as const).map((category) => (
          <section key={category} className="mt-10">
            <h2 className="text-lg font-semibold capitalize">{category} symbols</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {diagramSymbols
                .filter((symbol) => symbol.category === category)
                .map((symbol) => {
                  const Icon = icons[symbol.icon as keyof typeof icons];
                  return (
                    <Card key={symbol.id}>
                      <CardHeader className="flex-row items-center gap-3 space-y-0">
                        <span className="bg-primary/10 text-primary grid size-11 place-items-center rounded-lg">
                          <Icon className="size-5" />
                        </span>
                        <div>
                          <CardTitle className="text-base">{symbol.label}</CardTitle>
                          <Badge variant="outline" className="mt-1 text-[10px] uppercase">
                            {symbol.category}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <CardDescription>{symbol.description}</CardDescription>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
