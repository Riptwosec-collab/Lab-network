"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, FlaskConical, LayoutDashboard, Moon, Network, Settings, Sun } from "lucide-react";

import { useNetLabTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/workspace", label: "Workspace", icon: Network },
  { href: "/academy", label: "Academy", icon: BookOpen },
  { href: "/labs", label: "Labs", icon: FlaskConical },
];

export function AppHeader() {
  const pathname = usePathname();
  const { theme, setTheme } = useNetLabTheme();

  return (
    <header className="border-border/80 bg-background/85 sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 lg:px-6">
        <Link
          href="/dashboard"
          className="flex min-w-fit items-center gap-2 font-semibold"
          aria-label="NetLab Studio dashboard"
        >
          <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-xl shadow-[0_0_24px_-8px_var(--primary)]">
            <Network className="size-5" />
          </span>
          <span className="hidden sm:inline">
            NetLab <span className="text-primary">Studio</span>
          </span>
        </Link>
        <nav className="flex flex-1 items-center justify-center gap-1 overflow-x-auto" aria-label="เมนูหลัก">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "text-muted-foreground hover:bg-accent hover:text-foreground flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm transition-colors",
                  active && "bg-primary/10 text-primary",
                )}
              >
                <item.icon className="size-4" />
                <span className="hidden md:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <Button
          variant="ghost"
          size="icon"
          aria-label="สลับธีม"
          title="สลับธีม"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
        <Button asChild variant="ghost" size="icon" aria-label="ตั้งค่า" title="ตั้งค่า">
          <Link href="/settings">
            <Settings />
          </Link>
        </Button>
      </div>
    </header>
  );
}
