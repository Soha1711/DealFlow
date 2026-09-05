import { Hourglass } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SectionPlaceholder({
  title,
  description,
  plannedIn,
}: {
  title: string;
  description: string;
  plannedIn?: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card className="border-dashed bg-white">
        <CardHeader className="items-center gap-3 text-center">
          <span className="flex size-11 items-center justify-center rounded-full border border-border bg-muted">
            <Hourglass className="size-5 text-muted-foreground" aria-hidden />
          </span>
          <CardTitle className="text-base">Coming soon</CardTitle>
          <CardDescription className="max-w-md">
            This module is part of the DealFlow360 roadmap and will be built in a
            later phase. No functionality is stubbed out here.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-5 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            {plannedIn ? `Planned for ${plannedIn}` : "Roadmap item"}
          </span>
        </CardContent>
      </Card>
    </>
  );
}