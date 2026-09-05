"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import type { NavSection } from "@/lib/navigation";
import { Brand } from "@/components/app-shell/brand";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function MobileNav({ sections }: { sections: NavSection[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
          <Menu className="size-5" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex h-16 items-center border-b border-border px-5">
          <Brand />
        </div>
        <div className="overflow-y-auto px-3 py-5">
          <SidebarNav sections={sections} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}