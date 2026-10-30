import * as React from "react";
import { cn } from "@/lib/utils";

export function FieldLabel({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-2 block text-[12px] uppercase tracking-[0.14em] text-[#626262]", className)}
      {...props}
    />
  );
}

export function TextInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-12 w-full rounded-[4px] border border-[#DEDEDE] bg-white px-3 text-[16px] text-[#111111] outline-none placeholder:text-[#626262] focus:border-[#111111]",
        className,
      )}
      {...props}
    />
  );
}

export function TextArea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-[4px] border border-[#DEDEDE] bg-white px-3 py-3 text-[16px] text-[#111111] outline-none placeholder:text-[#626262] focus:border-[#111111]",
        className,
      )}
      {...props}
    />
  );
}
