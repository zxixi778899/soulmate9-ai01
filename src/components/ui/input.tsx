import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "placeholder:text-[#8B8BA3]/50 selection:bg-[#FF2D78] selection:text-white bg-white/[0.04] backdrop-blur-xl border border-white/[0.10] h-9 w-full min-w-0 rounded-lg px-3 py-1 text-base text-[#F0F0F5] transition-all duration-200 outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-[#FF2D78]/50 focus-visible:ring-2 focus-visible:ring-[#FF2D78]/20 focus-visible:bg-white/[0.06]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
