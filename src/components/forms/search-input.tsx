import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  rightSlot?: ReactNode;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Buscar...",
  ariaLabel,
  className,
  rightSlot,
}: SearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn("pl-9", rightSlot ? "pr-10" : undefined)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
      />
      {rightSlot ? <div className="absolute right-2 top-1.5">{rightSlot}</div> : null}
    </div>
  );
}
