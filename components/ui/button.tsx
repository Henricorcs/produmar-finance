"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-produmar-600 text-white hover:bg-produmar-700 active:scale-[0.98] shadow-sm",
        outline:
          "border border-produmar-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-produmar-700 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-700 hover:border-produmar-300",
        ghost: "text-produmar-700 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-800",
        destructive: "bg-red-600 text-white hover:bg-red-700",
        secondary: "bg-produmar-100 text-produmar-800 hover:bg-produmar-200",
        link: "text-produmar-600 underline-offset-4 hover:underline"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6",
        icon: "h-10 w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
