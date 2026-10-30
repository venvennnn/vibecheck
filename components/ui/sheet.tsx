"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#111111]/20" />
        <Dialog.Content
          className={cn(
            "fixed top-0 right-0 z-50 flex h-full w-full flex-col border-l border-[#DEDEDE] bg-white outline-none",
            wide ? "max-w-[640px]" : "max-w-[420px]",
          )}
        >
          <div className="flex min-h-16 items-center justify-between border-b border-[#DEDEDE] px-5">
            <Dialog.Title className="font-tight text-[22px] font-bold tracking-[-0.03em]">{title}</Dialog.Title>
            <Dialog.Close className="inline-flex size-11 items-center justify-center" aria-label="Close">
              <X size={18} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
