"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import React from "react";

export interface BackButtonProps {
  href?: string;
  fallbackHref?: string;
  label?: string;
  className?: string;
}

export function BackButton({
  href,
  fallbackHref,
  label = "Back",
  className = "",
}: BackButtonProps) {
  const router = useRouter();
  const targetHref = fallbackHref ?? href ?? "..";

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Allow modifier clicks (Cmd/Ctrl click, right-click, open in new tab) to behave normally
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }

    if (typeof window !== "undefined") {
      // If user arrived from an external referrer, stay inside the app via fallback
      if (document.referrer && !document.referrer.startsWith(window.location.origin)) {
        return;
      }

      // In Next.js App Router, window.history.state has idx > 0 when internal navigation occurred
      const historyIdx = (window.history.state as { idx?: number } | null)?.idx;
      if (typeof historyIdx === "number" && historyIdx > 0) {
        e.preventDefault();
        router.back();
        return;
      }

      // Fallback: If history has entries and no external referrer, allow router.back()
      if (window.history.length > 1 && !document.referrer) {
        e.preventDefault();
        router.back();
        return;
      }
    }
  };

  return (
    <div className={`mb-3 ${className}`.trim()}>
      <Link
        href={targetHref}
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
        aria-label={label}
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        <span>{label}</span>
      </Link>
    </div>
  );
}
