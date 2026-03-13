import type { ReactNode } from "react";
import { PageHeader } from "@/components/shared/page-header";

interface ModuleHeaderProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function ModuleHeader({ title, description, action }: ModuleHeaderProps) {
  return <PageHeader title={title} description={description} actions={action} className="mb-4" />;
}
