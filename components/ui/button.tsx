import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap px-4 text-[14px] font-medium transition-colors disabled:pointer-events-none disabled:border-[#DEDEDE] disabled:bg-[#F3F3F3] disabled:text-[#626262]",
  {
    variants: {
      variant: {
        primary: "min-h-11 bg-[#111111] text-white hover:bg-black",
        cobalt: "min-h-11 bg-[#2144ED] text-white hover:bg-[#1836c4]",
        outline: "min-h-11 border border-[#111111] bg-white text-[#111111] hover:border-[#2144ED] hover:text-[#2144ED]",
        ghost: "min-h-11 bg-transparent px-1 text-[#111111] underline-offset-4 hover:underline",
      },
      radius: {
        tight: "rounded-[4px]",
        pill: "rounded-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      radius: "tight",
    },
  },
);

export function Button({
  className,
  variant,
  radius,
  asChild = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, radius }), className)} {...props} />;
}
