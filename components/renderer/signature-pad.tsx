"use client"

import { useCallback, useEffect, useRef } from "react"

export function SignaturePad({
  value,
  onChange,
  disabled,
  invalid,
}: {
  value?: string | null
  onChange: (v: string | null) => void
  disabled?: boolean
  invalid?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const hasInk = useRef(false)

  const resize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const prev = hasInk.current ? canvas.toDataURL("image/png") : value
    canvas.width = Math.max(1, Math.floor(rect.width * dpr))
    canvas.height = Math.max(1, Math.floor(rect.height * dpr))
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.lineWidth = 2.2
    ctx.strokeStyle = getComputedStyle(canvas).color || "#111"
    if (prev && prev.startsWith("data:image")) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
      img.src = prev
    }
  }, [value])

  useEffect(() => {
    resize()
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => resize())
    ro.observe(canvas)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = point(e)
  }
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return
    const ctx = canvasRef.current?.getContext("2d")
    const p = point(e)
    if (ctx && last.current) {
      ctx.strokeStyle = getComputedStyle(e.currentTarget).color || "#111"
      ctx.beginPath()
      ctx.moveTo(last.current.x, last.current.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      hasInk.current = true
    }
    last.current = p
  }
  const onUp = () => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    if (hasInk.current && canvasRef.current) onChange(canvasRef.current.toDataURL("image/png"))
  }
  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasInk.current = false
    onChange(null)
  }

  return (
    <div>
      <div
        className="fs-input relative p-0"
        aria-invalid={invalid}
        style={{ padding: 0, height: 160, overflow: "hidden" }}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none"
          style={{ color: "var(--fs-text)", cursor: disabled ? "default" : "crosshair" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          aria-label="Signature pad"
          role="img"
        />
        <div
          className="pointer-events-none absolute right-4 bottom-8 left-4 border-b border-dashed"
          style={{ borderColor: "var(--fs-border)" }}
        />
        <span className="fs-muted pointer-events-none absolute bottom-2 left-4 text-xs">Sign above</span>
      </div>
      {!disabled && (
        <div className="mt-2 flex justify-end">
          <button type="button" className="fs-link text-xs" onClick={clear}>
            Clear signature
          </button>
        </div>
      )}
    </div>
  )
}
