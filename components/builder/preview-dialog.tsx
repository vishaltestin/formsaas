"use client"

import { useState } from "react"
import { MonitorIcon, RotateCcwIcon, SmartphoneIcon, TabletIcon } from "lucide-react"

import { FormRenderer } from "@/components/renderer/form-renderer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { toPublicSettings } from "@/lib/form-engine"

import type { BuilderDoc } from "./use-builder-state"
import { APP_HOST, DEVICE_SCREEN, DeviceFrame, type Viewport } from "./device-frame"

export function PreviewDialog({
  open,
  onOpenChange,
  formId,
  slug,
  doc,
  description,
  features,
  maxUploadMb,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  formId: string
  slug: string
  doc: BuilderDoc
  description: string
  features: { conditionalLogic: boolean; customCss: boolean; customBranding: boolean; removeBadge: boolean }
  maxUploadMb: number
}) {
  const [viewport, setViewport] = useState<Viewport>("desktop")
  const [run, setRun] = useState(0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92svh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[96vw]">
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b px-4 py-2.5 pr-12">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2 text-sm">
              Preview <Badge variant="outline" className="text-[10px]">{doc.mode.toLowerCase()}</Badge>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Logic, validation and piping run exactly as live. Nothing is submitted.
            </DialogDescription>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground tabular-nums md:inline">
              {DEVICE_SCREEN[viewport].label} · {DEVICE_SCREEN[viewport].detail}
            </span>
            <ToggleGroup type="single" variant="outline" size="sm" value={viewport} onValueChange={(v) => v && setViewport(v as Viewport)}>
              <ToggleGroupItem value="desktop" aria-label="Desktop">
                <MonitorIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="tablet" aria-label="Tablet">
                <TabletIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="mobile" aria-label="Mobile">
                <SmartphoneIcon />
              </ToggleGroupItem>
            </ToggleGroup>
            <Button variant="outline" size="sm" onClick={() => setRun((r) => r + 1)}>
              <RotateCcwIcon /> Restart
            </Button>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto bg-muted/60 p-3 md:p-5" data-viewport={viewport}>
          <DeviceFrame viewport={viewport} url={`${APP_HOST}/f/${slug}`} fill screenStyle={{ background: doc.theme.colors.background }}>
            {open && (
              <FormRenderer
                key={run}
                formId={`${formId}-preview`}
                slug={slug}
                title={doc.title}
                description={description}
                mode={doc.mode}
                schema={doc.schema}
                theme={doc.theme}
                settings={toPublicSettings(doc.settings)}
                preview
                logicEnabled={features.conditionalLogic}
                showBadge={!(features.removeBadge && doc.settings.hideBadge)}
                allowCustomCss={features.customCss}
                allowBranding={features.customBranding}
                maxUploadMb={maxUploadMb}
              />
            )}
          </DeviceFrame>
        </div>
      </DialogContent>
    </Dialog>
  )
}
