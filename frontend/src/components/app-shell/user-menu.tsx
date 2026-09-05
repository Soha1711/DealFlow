"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

import type { CurrentUser } from "@/lib/auth-guards";
import { roleLabel } from "@/lib/roles";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserMenu({ user }: { user: CurrentUser }) {
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="text-sm font-medium leading-tight text-foreground">
          {user.name}
        </p>
        <p className="text-xs leading-tight text-muted-foreground">{user.email}</p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-3 rounded-md outline-none ring-ring transition focus-visible:ring-2"
            aria-label="Account menu"
          >
            <Avatar className="size-9 border border-border bg-muted">
              <AvatarFallback className="bg-muted text-sm font-medium text-foreground">
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex flex-col gap-1">
            <span className="text-sm font-medium">{user.name}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
            <span className="pt-1">
              <Badge variant="secondary">{roleLabel(user.role)}</Badge>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="p-1">
            <button
              type="button"
              className="flex w-full select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/80 outline-none transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => signOut({ redirectTo: "/login" })}
            >
              <LogOut className="size-4 text-muted-foreground" aria-hidden />
              Log out
            </button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}