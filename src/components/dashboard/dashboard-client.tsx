"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Copy, FileJson, FolderOpen, Network, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createDemoProject } from "@/data/demo-topology";
import { formatRelativeTime } from "@/lib/utils";
import { importProjectFile } from "@/services/project-transfer";
import { useProjectStore } from "@/stores/project-store";
import type { NetLabProject } from "@/types/network";

function ProjectCard({ project }: { project: NetLabProject }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name);
  const renameProject = useProjectStore((state) => state.renameProject);
  const duplicateProject = useProjectStore((state) => state.duplicateProject);
  const deleteProject = useProjectStore((state) => state.deleteProject);
  const setCurrentProject = useProjectStore((state) => state.setCurrentProject);

  const openProject = () => {
    setCurrentProject(project);
    router.push(`/workspace?project=${project.id}`);
  };

  const submitRename = async () => {
    try {
      await renameProject(project.id, name);
      setRenaming(false);
      toast.success("เปลี่ยนชื่อโปรเจกต์แล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เปลี่ยนชื่อไม่สำเร็จ");
    }
  };

  return (
    <article className="border-border bg-background/45 hover:border-primary/45 group rounded-xl border p-4 transition-colors">
      <div className="flex items-start gap-3">
        <button
          className="bg-primary/10 text-primary focus-visible:ring-ring grid size-11 shrink-0 place-items-center rounded-lg outline-none focus-visible:ring-2"
          onClick={openProject}
          aria-label={`เปิด ${project.name}`}
        >
          <Network className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void submitRename();
              }}
            >
              <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} autoFocus />
              <Button size="sm" type="submit">
                บันทึก
              </Button>
            </form>
          ) : (
            <button
              className="hover:text-primary block max-w-full truncate text-left font-medium"
              onClick={openProject}
            >
              {project.name}
            </button>
          )}
          <p className="text-muted-foreground mt-1 text-xs">
            {project.devices.length} อุปกรณ์ · {project.connections.length} ลิงก์
          </p>
          <p className="text-muted-foreground mt-1 font-mono text-[10px]">{formatRelativeTime(project.updatedAt)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1 border-t pt-3">
        <Button variant="ghost" size="sm" onClick={openProject}>
          เปิด <ArrowRight />
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto size-8"
              aria-label={`ทำสำเนา ${project.name}`}
              onClick={() => void duplicateProject(project.id).then(() => toast.success("สร้างสำเนาแล้ว"))}
            >
              <Copy />
            </Button>
          </TooltipTrigger>
          <TooltipContent>ทำสำเนา</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`เปลี่ยนชื่อ ${project.name}`}
              onClick={() => setRenaming(true)}
            >
              <Pencil />
            </Button>
          </TooltipTrigger>
          <TooltipContent>เปลี่ยนชื่อ</TooltipContent>
        </Tooltip>
        {project.id !== "demo-project" && (
          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive size-8"
                    aria-label={`ลบ ${project.name}`}
                  >
                    <Trash2 />
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent>ลบโปรเจกต์</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>ลบโปรเจกต์นี้?</AlertDialogTitle>
                <AlertDialogDescription>
                  “{project.name}” และประวัติเวอร์ชันในเครื่องจะถูกลบ การดำเนินการนี้ย้อนกลับไม่ได้
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void deleteProject(project.id).then(() => toast.success("ลบโปรเจกต์แล้ว"))}
                >
                  ลบโปรเจกต์
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </article>
  );
}

export function DashboardClient() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const recentProjects = useProjectStore((state) => state.recentProjects);
  const setCurrentProject = useProjectStore((state) => state.setCurrentProject);
  const loadRecentProjects = useProjectStore((state) => state.loadRecentProjects);
  const saveProject = useProjectStore((state) => state.saveProject);
  const ensureDemoProject = useProjectStore((state) => state.ensureDemoProject);

  useEffect(() => {
    void ensureDemoProject()
      .then(() => loadRecentProjects())
      .finally(() => setProjectsLoading(false));
  }, [ensureDemoProject, loadRecentProjects]);

  const createNew = () => {
    router.push("/workspace?new=1");
  };

  const openDemo = async () => {
    const project = await ensureDemoProject();
    setCurrentProject(project);
    router.push(`/workspace?project=${project.id}`);
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const project = await importProjectFile(file);
      setCurrentProject(project);
      await saveProject(project);
      toast.success("นำเข้าโปรเจกต์เรียบร้อย");
      router.push(`/workspace?project=${project.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "นำเข้าโปรเจกต์ไม่สำเร็จ");
    }
  };

  const demo = createDemoProject();
  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-6 lg:px-8 lg:py-8">
      <section className="border-primary/20 bg-card relative overflow-hidden rounded-2xl border px-5 py-7 shadow-[0_24px_90px_-55px_var(--primary)] lg:px-9 lg:py-9">
        <div className="technical-grid pointer-events-none absolute inset-0 opacity-45" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
          <div>
            <Badge>LOCAL-FIRST NETWORK WORKSPACE</Badge>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              ออกแบบ ทดลอง และเรียนรู้
              <br />
              <span className="text-primary">ระบบเครือข่ายใน workspace เดียว</span>
            </h1>
            <p className="text-muted-foreground mt-4 max-w-2xl text-base leading-7">
              สร้าง topology แบบลากวาง จัดการโปรเจกต์ในเบราว์เซอร์ และฝึกผ่าน lab definitions ที่อยู่ในระบบจริง
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button size="lg" onClick={createNew}>
                <Plus />
                สร้างโปรเจกต์ใหม่
              </Button>
              <Button size="lg" variant="outline" onClick={() => void openDemo()}>
                <FolderOpen />
                เปิด Demo Project
              </Button>
              <Button size="lg" variant="ghost" onClick={() => fileRef.current?.click()}>
                <FileJson />
                Import JSON
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => void importFile(event.target.files?.[0])}
              />
            </div>
          </div>
          <div className="network-preview" aria-label={`ตัวอย่าง ${demo.name} มี ${demo.devices.length} อุปกรณ์`}>
            <div className="preview-node preview-cloud">INTERNET</div>
            <div className="preview-line line-1" />
            <div className="preview-line line-2" />
            <div className="preview-line line-3" />
            <div className="preview-line line-4" />
            <div className="preview-node preview-firewall">FIREWALL</div>
            <div className="preview-node preview-switch">CORE SWITCH</div>
            <div className="preview-node preview-pc">PC-01</div>
            <div className="preview-node preview-ap">WI-FI AP</div>
            <div className="preview-node preview-nas">NAS</div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.75fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>โปรเจกต์ล่าสุด</CardTitle>
              <CardDescription>ข้อมูลจาก IndexedDB ในเบราว์เซอร์นี้</CardDescription>
            </div>
            <Badge variant="outline">{recentProjects.length} PROJECTS</Badge>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {projectsLoading ? (
              Array.from({ length: 2 }, (_, index) => (
                <div key={index} className="bg-muted/45 h-36 animate-pulse rounded-xl" aria-label="กำลังโหลดโปรเจกต์" />
              ))
            ) : recentProjects.length ? (
              recentProjects.slice(0, 6).map((project) => <ProjectCard key={project.id} project={project} />)
            ) : (
              <div className="border-border text-muted-foreground col-span-full rounded-xl border border-dashed p-8 text-center text-sm">
                ยังไม่มีโปรเจกต์ในเครื่องนี้
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Learning workspace</CardTitle>
            <CardDescription>ยังไม่มี progress ที่บันทึกไว้</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="border-border bg-muted/35 rounded-xl border border-dashed p-5">
              <BookOpen className="text-primary mb-4 size-6" />
              <p className="text-sm font-medium">เริ่มจากเนื้อหาและ lab ที่มีอยู่จริง</p>
              <p className="text-muted-foreground mt-2 text-xs leading-5">
                ระบบจะแสดงความคืบหน้าเมื่อมี record ใน IndexedDB เท่านั้น
              </p>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link href="/academy">
                เปิด Academy <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link href="/labs">ดู Practice Labs</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="mt-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Start points</h2>
          <p className="text-muted-foreground text-sm">เฉพาะ topology ที่ระบบสร้างได้จริงในตอนนี้</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="hover:border-primary/45 transition-colors">
            <CardContent className="flex items-center gap-4 p-5">
              <span className="bg-primary/10 text-primary grid size-11 place-items-center rounded-lg">
                <Plus />
              </span>
              <div className="flex-1">
                <p className="font-medium">Empty Network</p>
                <p className="text-muted-foreground text-sm">เริ่มจาก canvas ว่าง</p>
              </div>
              <Button variant="ghost" size="icon" aria-label="สร้าง Empty Network" onClick={createNew}>
                <ArrowRight />
              </Button>
            </CardContent>
          </Card>
          <Card className="hover:border-primary/45 transition-colors">
            <CardContent className="flex items-center gap-4 p-5">
              <span className="bg-success/10 text-success grid size-11 place-items-center rounded-lg">
                <Network />
              </span>
              <div className="flex-1">
                <p className="font-medium">{demo.name}</p>
                <p className="text-muted-foreground text-sm">
                  {demo.devices.length} อุปกรณ์ · {demo.connections.length} ลิงก์
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label={`เปิด ${demo.name}`} onClick={() => void openDemo()}>
                <ArrowRight />
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
