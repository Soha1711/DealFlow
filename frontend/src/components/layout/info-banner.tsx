import { Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function InfoBanner({ title, description }: { title: string; description?: string }) {
  return (
    <Alert className="border-blue-200 bg-blue-50/60 text-blue-900">
      <Info className="size-4 text-blue-700" aria-hidden />
      <AlertTitle className="text-blue-900">{title}</AlertTitle>
      {description && (
        <AlertDescription className="text-blue-800/80">{description}</AlertDescription>
      )}
    </Alert>
  );
}