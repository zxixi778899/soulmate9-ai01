import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive cursor-pointer",
  {
    variants: {
      variant: {
        default:
          'bg-[#FF2D78] text-white hover:bg-[#FF6BA6] shadow-[0_0_15px_rgba(255,45,120,0.3)] hover:shadow-[0_0_25px_rgba(255,45,120,0.5)] hover:scale-[1.02] active:scale-[0.98]',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border border-white/[0.12] bg-white/[0.04] backdrop-blur-xl text-foreground hover:bg-white/[0.08] hover:border-[#FF6BA6]/40 hover:text-[#FF6BA6]',
        secondary:
          'bg-white/[0.06] text-foreground backdrop-blur-lg border border-white/[0.08] hover:bg-white/[0.10] hover:border-white/[0.15]',
        ghost:
          'hover:bg-white/[0.06] hover:text-[#FF6BA6] text-muted-foreground',
        link: 'text-[#FF2D78] underline-offset-4 hover:underline',
        glow:
          'bg-gradient-to-r from-[#FF2D78] to-[#d946ef] text-white shadow-[0_0_20px_rgba(255,45,120,0.4)] hover:shadow-[0_0_35px_rgba(255,45,120,0.6)] hover:scale-[1.02] active:scale-[0.98]',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-lg gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-11 rounded-xl px-6 has-[>svg]:px-4',
        xl: 'h-12 rounded-xl px-8 text-base font-semibold',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
