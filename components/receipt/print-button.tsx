"use client"

import { PrinterIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

export function PrintButton() {
  return (
    <Button size="sm" onClick={() => window.print()}>
      <PrinterIcon data-icon="inline-start" /> Print / Save as PDF
    </Button>
  )
}
