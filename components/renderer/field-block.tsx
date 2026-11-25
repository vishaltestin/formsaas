"use client"

import { ImageIcon, PlayIcon } from "lucide-react"

import { videoEmbedUrl, type FormField } from "@/lib/form-engine"
import { cn } from "@/lib/utils"

export function widthClass(width: FormField["width"]) {
  switch (width) {
    case "half":
      return "col-span-12 @md:col-span-6"
    case "third":
      return "col-span-12 @md:col-span-4"
    default:
      return "col-span-12"
  }
}

type Patch = (patch: Partial<FormField>) => void

/** Inline editable text used on the builder canvas. */
function InlineText({
  value,
  onChange,
  className,
  placeholder,
  multiline,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
  multiline?: boolean
}) {
  if (multiline)
    return (
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.max(1, Math.ceil(value.length / 70))}
        onClick={(e) => e.stopPropagation()}
        className={cn("w-full resize-none border-0 bg-transparent p-0 outline-none focus:ring-0", className)}
        style={{ color: "inherit", font: "inherit" }}
      />
    )
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className={cn("w-full border-0 bg-transparent p-0 outline-none focus:ring-0", className)}
      style={{ color: "inherit", font: "inherit" }}
    />
  )
}

export function FieldShell({
  field,
  required,
  error,
  htmlFor,
  children,
  design,
  onPatch,
  large,
}: {
  field: FormField
  required?: boolean
  error?: string
  htmlFor?: string
  children: React.ReactNode
  design?: boolean
  onPatch?: Patch
  large?: boolean
}) {
  return (
    <div className="fs-field" data-field-key={field.key}>
      {design && onPatch ? (
        <div className={cn("fs-label fs-label-edit", large && "fs-h3")}>
          <InlineText
            value={field.label}
            onChange={(label) => onPatch({ label })}
            placeholder="Question label"
            className="w-auto max-w-full min-w-24 [field-sizing:content]"
          />
          {required && <span className="fs-required">*</span>}
        </div>
      ) : (
        <label htmlFor={htmlFor} className={cn("fs-label", large && "fs-h3 mb-3")}>
          {field.label}
          {required && <span className="fs-required" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {field.helpText &&
        (design && onPatch ? (
          <div className="fs-help">
            <InlineText value={field.helpText} onChange={(helpText) => onPatch({ helpText })} />
          </div>
        ) : (
          <p className="fs-help">{field.helpText}</p>
        ))}
      {error && (
        <p className="fs-error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function LayoutBlock({
  field,
  design,
  onPatch,
  asSection,
}: {
  field: FormField
  design?: boolean
  onPatch?: Patch
  /** step_break rendered as a section title in classic mode */
  asSection?: boolean
}) {
  const editable = design && onPatch
  switch (field.type) {
    case "heading": {
      const level = field.props?.level ?? 2
      const cls = level === 1 ? "fs-heading" : level === 3 ? "fs-h3" : "fs-h2"
      return (
        <div>
          {editable ? (
            <InlineText value={field.label} onChange={(label) => onPatch({ label })} className={cls} />
          ) : (
            <div className={cls} role="heading" aria-level={level + 1}>
              {field.label}
            </div>
          )}
          {(field.props?.content || editable) &&
            (editable ? (
              <InlineText
                value={field.props?.content ?? ""}
                placeholder="Optional subtitle"
                onChange={(content) => onPatch({ props: { ...field.props, content } })}
                className="fs-muted mt-1"
              />
            ) : (
              <p className="fs-muted mt-1">{field.props?.content}</p>
            ))}
        </div>
      )
    }
    case "paragraph":
      return editable ? (
        <InlineText
          multiline
          value={field.props?.content ?? ""}
          onChange={(content) => onPatch({ props: { ...field.props, content } })}
          className="fs-muted"
        />
      ) : (
        <p className="fs-muted whitespace-pre-line">{field.props?.content}</p>
      )
    case "divider":
      return <hr className="fs-divider my-1" />
    case "image":
      return field.props?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={field.props.imageUrl}
          alt={field.props.alt ?? ""}
          className="w-full object-cover"
          style={{ borderRadius: "var(--fs-radius)", maxHeight: 320 }}
        />
      ) : (
        <div
          className="fs-muted grid h-32 place-items-center border border-dashed text-sm"
          style={{ borderRadius: "var(--fs-radius)" }}
        >
          <span className="flex items-center gap-2">
            <ImageIcon className="size-4" /> {design ? "Add an image URL in the inspector" : ""}
          </span>
        </div>
      )
    case "video": {
      const src = videoEmbedUrl(field.props?.videoUrl)
      if (!src)
        return (
          <div className="fs-video grid place-items-center">
            <span className="fs-muted flex items-center gap-2 text-sm">
              <PlayIcon className="size-4" /> {design ? "Paste a YouTube, Vimeo or Loom link in the inspector" : "Video unavailable"}
            </span>
          </div>
        )
      return (
        <div className="fs-video">
          {design ? (
            <div className="fs-muted absolute inset-0 grid place-items-center text-sm">
              <span className="flex items-center gap-2">
                <PlayIcon className="size-4" /> {new URL(src).hostname.replace("www.", "")} video
              </span>
            </div>
          ) : (
            <iframe
              src={src}
              title={field.label || "Video"}
              loading="lazy"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
              allowFullScreen
            />
          )}
        </div>
      )
    }
    case "step_break":
      if (asSection)
        return (
          <div className="pt-2">
            <div className="fs-h3">{field.label}</div>
            {field.props?.content && <p className="fs-muted mt-1 text-sm">{field.props.content}</p>}
            <hr className="fs-divider mt-3" />
          </div>
        )
      return null
    default:
      return null
  }
}
