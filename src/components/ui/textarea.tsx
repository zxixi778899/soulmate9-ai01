import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "placeholder:text-[#8B8BA3]/50 selection:bg-[#FF2D78] selection:text-white bg-white/[0.04] backdrop-blur-xl border border-white/[0.10] flex field-sizing-content min-h-16 w-full rounded-lg px-3 py-2 text-base text-[#F0F0F5] transition-all duration-200 outline-none focus:border-[#FF2D78]/50 focus:ring-2 focus:ring-[#FF2D78]/20 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
