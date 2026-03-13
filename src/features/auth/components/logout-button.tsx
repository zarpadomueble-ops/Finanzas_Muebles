"use client";

import { Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { signOutCurrentSession } from "../services";

interface LogoutButtonProps {
  compact?: boolean;
  className?: string;
}

export function LogoutButton({ compact = false, className }: LogoutButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    setIsLoading(true);
    await signOutCurrentSession();
    router.replace("/login");
    router.refresh();
    setIsLoading(false);
  };

  return (
    <Button
      type="button"
      variant={compact ? "ghost" : "outline"}
      size={compact ? "icon" : "default"}
      className={cn(className)}
      onClick={handleLogout}
      disabled={isLoading}
      aria-label="Cerrar sesion"
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      {compact ? null : <span className="ml-2">Salir</span>}
    </Button>
  );
}
