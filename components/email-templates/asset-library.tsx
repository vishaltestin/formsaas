"use client"

import { useRef, useState, useTransition } from "react"
import {
  CopyIcon,
  ImageIcon,
  ImagePlusIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import {
  deleteEmailAsset,
  uploadEmailAsset,
  type AssetInfo,
} from "@/app/actions/email-templates"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ASSET_MAX_BYTES } from "@/lib/email/template-library"
import { cn } from "@/lib/utils"

function kb(n: number) {
  return n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`
}

export function imgTag(a: Pick<AssetInfo, "url" | "name">) {
  return `<img src="${a.url}" alt="${a.name.replace(/\.[a-z]+$/, "").replace(/[-_]+/g, " ")}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0">`
}

/**
 * Workspace image library. Images are hosted by the app (email clients block
 * embedded data: images), so templates reference them by absolute URL.
 */
export function AssetLibrary({
  workspaceId,
  canManage,
  initial,
  onInsert,
  compact = false,
}: {
  workspaceId: string
  canManage: boolean
  initial: AssetInfo[]
  /** Editor mode: insert an <img> tag at the cursor */
  onInsert?: (asset: AssetInfo) => void
  compact?: boolean
}) {
  const [assets, setAssets] = useState(initial)
  const [uploading, startUpload] = useTransition()
  const [deleting, setDeleting] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  function upload(files: FileList | null) {
    const list = Array.from(files ?? [])
    if (list.length === 0) return
    startUpload(async () => {
      for (const file of list) {
        if (file.size > ASSET_MAX_BYTES) {
          toast.error(
            `${file.name} is larger than ${ASSET_MAX_BYTES / 1024 / 1024} MB.`
          )
          continue
        }
        const fd = new FormData()
        fd.set("file", file)
        const res = await uploadEmailAsset(workspaceId, fd)
        if (res.ok) {
          setAssets((a) => [res.data, ...a])
          toast.success(`Uploaded ${res.data.name}`)
        } else toast.error(res.error)
      }
      if (input.current) input.current.value = ""
    })
  }

  async function remove(a: AssetInfo) {
    if (
      !confirm(
        `Delete ${a.name}? Emails that already went out will show a broken image.`
      )
    )
      return
    setDeleting(a.id)
    const res = await deleteEmailAsset(workspaceId, a.id)
    setDeleting(null)
    if (res.ok) setAssets((list) => list.filter((x) => x.id !== a.id))
    else toast.error(res.error)
  }

  async function copy(a: AssetInfo) {
    try {
      await navigator.clipboard.writeText(a.url)
      toast.success("Image URL copied")
    } catch {
      toast.message(a.url)
    }
  }

  return (
    <section
      className={cn(!compact && "rounded-lg border bg-card p-4")}
      aria-labelledby="asset-library-title"
      data-testid="asset-library"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2
            id="asset-library-title"
            className={cn("font-semibold", compact ? "text-sm" : "text-base")}
          >
            Images
          </h2>
          <p className="text-xs text-muted-foreground">
            Logos, banners and photos for your templates. PNG, JPEG, GIF or WebP
            up to {ASSET_MAX_BYTES / 1024 / 1024} MB. You can also use any
            public https image URL.
          </p>
        </div>
        {canManage && (
          <>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              className="sr-only"
              aria-label="Upload images"
              data-testid="asset-upload"
              onChange={(e) => upload(e.target.files)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => input.current?.click()}
            >
              {uploading ? <Spinner /> : <ImagePlusIcon />} Upload
            </Button>
          </>
        )}
      </div>
      {assets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          <ImageIcon className="size-6" />
          No images yet.
        </div>
      ) : (
        <ul
          className={cn(
            "grid gap-3",
            compact
              ? "grid-cols-2"
              : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
          )}
        >
          {assets.map((a) => (
            <li
              key={a.id}
              className="group overflow-hidden rounded-md border bg-background"
            >
              <div className="flex aspect-[4/3] items-center justify-center bg-[repeating-conic-gradient(#f1f1f1_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.path}
                  alt={a.name}
                  className="max-h-full max-w-full object-contain"
                  loading="lazy"
                />
              </div>
              <div className="space-y-1.5 p-2">
                <p className="truncate text-xs font-medium" title={a.name}>
                  {a.name}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {kb(a.size)}
                </p>
                <div className="flex gap-1">
                  {onInsert && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 flex-1 px-2 text-xs"
                      onClick={() => onInsert(a)}
                    >
                      <PlusIcon /> Insert
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Copy URL of ${a.name}`}
                    onClick={() => copy(a)}
                  >
                    <CopyIcon />
                  </Button>
                  {canManage && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-destructive"
                      aria-label={`Delete ${a.name}`}
                      disabled={deleting === a.id}
                      onClick={() => remove(a)}
                    >
                      {deleting === a.id ? <Spinner /> : <Trash2Icon />}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
