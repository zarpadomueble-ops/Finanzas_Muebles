import * as React from "react";
import { cn } from "@/lib/utils";

interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  checked: boolean;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, ...props }, ref) => {
    return (
      <label className={cn("relative inline-flex h-6 w-11 cursor-pointer items-center", className)}>
        <input ref={ref} type="checkbox" className="peer sr-only" checked={checked} {...props} />
        <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-slate-900" />
        <span className="absolute left-1 h-4 w-4 rounded-full bg-white transition peer-checked:left-6" />
      </label>
    );
  },
);
Switch.displayName = "Switch";


