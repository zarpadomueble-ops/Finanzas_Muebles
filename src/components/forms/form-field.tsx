import type { ReactNode } from "react";
import { FormFieldWrapper } from "@/components/forms/form-field-wrapper";

interface FormFieldProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, children, className }: FormFieldProps) {
  return (
    <FormFieldWrapper label={label} className={className}>
      {children}
    </FormFieldWrapper>
  );
}
