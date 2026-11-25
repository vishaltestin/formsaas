"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { updateInterfaceFont } from "@/app/actions/billing"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { INTERFACE_FONT_IDS, INTERFACE_FONTS, type InterfaceFont } from "@/lib/appearance-shared"
import { cn } from "@/lib/utils"

export function AppearanceEditor({ current }: { current: InterfaceFont }) {
  const router = useRouter()
  const [value, setValue] = useState<InterfaceFont>(current)
  const [pending, start] = useTransition()
  const dirty = value !== current

  const save = () =>
    start(async () => {
      const res = await updateInterfaceFont({ font: value })
      if (!res.ok) return void toast.error(res.error)
      toast.success(`Interface font set to ${INTERFACE_FONTS[value].label}`)
      router.refresh()
    })

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="text-sm">Interface font</CardTitle>
        <CardDescription className="text-xs">
          Applies to the dashboard and admin console for every member of this workspace. Published forms keep the fonts set in each form’s theme.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <RadioGroup value={value} onValueChange={(v) => setValue(v as InterfaceFont)} className="grid gap-3 sm:grid-cols-2">
          {INTERFACE_FONT_IDS.map((id) => {
            const f = INTERFACE_FONTS[id]
            return (
              <Label
                key={id}
                htmlFor={`ui-font-${id}`}
                className={cn(
                  "flex cursor-pointer flex-col items-stretch gap-3 rounded-lg border bg-background p-4 font-normal transition-colors hover:border-primary/40",
                  value === id && "border-primary ring-1 ring-primary"
                )}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id={`ui-font-${id}`} value={id} />
                  <span className="text-sm font-medium">{f.label}</span>
                  {id === current && (
                    <Badge variant="secondary" className="ml-auto font-normal">
                      Current
                    </Badge>
                  )}
                </div>
                <div style={{ fontFamily: f.stack }} className="space-y-1.5 rounded-md bg-muted/60 px-3 py-2.5">
                  <p className="text-base font-semibold tracking-tight">Quarterly vendor onboarding</p>
                  <p className="text-xs text-muted-foreground">1,284 responses · 92.4% completion · Updated 3 min ago</p>
                  <p className="font-medium text-sm tabular-nums">
                    ₹4,90,000 <span className="text-muted-foreground">·</span> 0O 1lI 8B
                  </p>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{f.note}</p>
              </Label>
            )
          })}
        </RadioGroup>
      </CardContent>
      <CardFooter className="justify-end gap-2 border-t px-5 pt-4 [.border-t]:pt-4">
        <Button variant="ghost" size="sm" disabled={!dirty || pending} onClick={() => setValue(current)}>
          Reset
        </Button>
        <Button size="sm" disabled={!dirty || pending} onClick={save}>
          {pending && <Spinner />} Apply to workspace
        </Button>
      </CardFooter>
    </Card>
  )
}
