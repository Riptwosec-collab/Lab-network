import { AppHeader } from "@/components/layout/app-header";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default function ProjectsPage() {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <DashboardClient />
    </div>
  );
}
