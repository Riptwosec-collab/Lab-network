import { AppHeader } from "@/components/layout/app-header";
import { LabsClient } from "@/components/learning/labs-client";

export default function LabsPage() {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <LabsClient />
    </div>
  );
}
