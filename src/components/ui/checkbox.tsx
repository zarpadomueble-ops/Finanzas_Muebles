import * as React from "react";
import { cn } from "@/lib/utils";

export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={cn("h-4 w-4 rounded border border-slate-300 text-slate-900 focus:ring-slate-300", className)}
        {...props}
      />
    );
  },
);
Checkbox.displayName = "Checkbox";


