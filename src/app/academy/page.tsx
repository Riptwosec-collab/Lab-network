import { AppHeader } from "@/components/layout/app-header";
import { AcademyClient } from "@/components/learning/academy-client";

export default function AcademyPage() {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <AcademyClient />
    </div>
  );
}
