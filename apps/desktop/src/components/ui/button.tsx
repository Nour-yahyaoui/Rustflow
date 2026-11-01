// Radix/shadcn-style accessible button primitive; app-specific visual tokens stay in CSS.
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import type { ComponentProps } from "react";
import { twMerge } from "tailwind-merge";
const cn = (...values: ClassValue[]) => twMerge(clsx(values));
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-xs transition-colors focus-visible:ring-2 focus-visible:ring-violet-300 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "primary-button",
        secondary: "subtle-button",
        ghost: "text-button",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
export function Button({
  className,
  variant,
  asChild = false,
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    />
  );
}
