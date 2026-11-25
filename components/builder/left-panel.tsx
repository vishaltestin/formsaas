"use client"

import { useMemo, useState } from "react"
import { useDraggable } from "@dnd-kit/core"
import {
  AlignLeftIcon,
  BanknoteIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CalendarRangeIcon,
  GlobeIcon,
  ListOrderedIcon,
  MapPinIcon,
  PaletteIcon,
  SlidersVerticalIcon,
  UserRoundIcon,
  VideoIcon,
  CalculatorIcon,
  ArrowRightToLineIcon,
  AtSignIcon,
  CalendarIcon,
  CheckSquareIcon,
  ChevronDownSquareIcon,
  CircleDotIcon,
  ClockIcon,
  EyeOffIcon,
  FileUpIcon,
  Grid3x3Icon,
  HashIcon,
  HeadingIcon,
  ImageIcon,
  ImagesIcon,
  KeyRoundIcon,
  LayoutTemplateIcon,
  LinkIcon,
  ListChecksIcon,
  type LucideIcon,
  MinusIcon,
  PenLineIcon,
  PhoneIcon,
  PilcrowIcon,
  SearchIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  StarIcon,
  TextCursorInputIcon,
  ToggleRightIcon,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  FIELD_CATEGORIES,
  FIELD_DEFINITIONS,
  fieldAvailableIn,
  getSteps,
  isInputField,
  type FieldType,
  type FormMode,
  type FormSchema,
} from "@/lib/form-engine"
import { cn } from "@/lib/utils"

export const FIELD_ICONS: Record<FieldType, LucideIcon> = {
  short_text: TextCursorInputIcon,
  long_text: AlignLeftIcon,
  email: AtSignIcon,
  phone: PhoneIcon,
  number: HashIcon,
  url: LinkIcon,
  password: KeyRoundIcon,
  full_name: UserRoundIcon,
  address: MapPinIcon,
  currency: BanknoteIcon,
  color: PaletteIcon,
  country: GlobeIcon,
  ranking: ListOrderedIcon,
  slider: SlidersVerticalIcon,
  datetime: CalendarClockIcon,
  date_range: CalendarRangeIcon,
  appointment: CalendarCheckIcon,
  video: VideoIcon,
  select: ChevronDownSquareIcon,
  multi_select: ListChecksIcon,
  radio: CircleDotIcon,
  checkboxes: CheckSquareIcon,
  yes_no: ToggleRightIcon,
  image_choice: ImagesIcon,
  rating: StarIcon,
  scale: SlidersHorizontalIcon,
  matrix: Grid3x3Icon,
  date: CalendarIcon,
  time: ClockIcon,
  file: FileUpIcon,
  signature: PenLineIcon,
  consent: ShieldCheckIcon,
  calculated: CalculatorIcon,
  hidden: EyeOffIcon,
  heading: HeadingIcon,
  paragraph: PilcrowIcon,
  divider: MinusIcon,
  image: ImageIcon,
  step_break: ArrowRightToLineIcon,
}

export interface TemplateOption {
  id: string
  name: string
  description: string
  mode: FormMode
  category: string
}

export function LeftPanel({
  schema,
  mode,
  selectedId,
  onAdd,
  onSelect,
  templates,
  onApplyTemplate,
}: {
  schema: FormSchema
  mode: FormMode
  selectedId: string | null
  onAdd: (type: FieldType) => void
  onSelect: (id: string) => void
  templates: TemplateOption[]
  onApplyTemplate: (id: string) => void
}) {
  const [query, setQuery] = useState("")
  const [pendingTemplate, setPendingTemplate] = useState<TemplateOption | null>(null)

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    return FIELD_CATEGORIES.map((c) => ({
      ...c,
      items: Object.values(FIELD_DEFINITIONS).filter(
        (d) =>
          d.category === c.id &&
          fieldAvailableIn(d.type, mode) &&
          (!q || `${d.label} ${d.description} ${d.keywords ?? ""}`.toLowerCase().includes(q))
      ),
    })).filter((g) => g.items.length)
  }, [query, mode])

  const steps = useMemo(() => getSteps(schema), [schema])

  return (
    <Tabs defaultValue="fields" className="flex h-full min-h-0 flex-col gap-0">
      <div className="shrink-0 border-b px-4">
        <TabsList variant="line" className="h-11! w-full justify-start gap-4">
          <TabsTrigger value="fields">Fields</TabsTrigger>
          <TabsTrigger value="outline">Outline</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="fields" className="min-h-0 flex-1">
        <div className="flex h-full flex-col">
          <div className="shrink-0 p-3 pb-2">
            <InputGroup className="h-8">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput placeholder="Search fields" value={query} onChange={(e) => setQuery(e.target.value)} />
            </InputGroup>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-4 px-3 pb-6">
              {grouped.map((g) => (
                <div key={g.id}>
                  <div className="mb-1.5 px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {g.label}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {g.items.map((d) => (
                      <PaletteItem key={d.type} type={d.type} label={d.label} description={d.description} onAdd={() => onAdd(d.type)} />
                    ))}
                  </div>
                </div>
              ))}
              {grouped.length === 0 && <p className="px-1 py-6 text-center text-sm text-muted-foreground">No fields match “{query}”.</p>}
            </div>
          </ScrollArea>
        </div>
      </TabsContent>

      <TabsContent value="outline" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="space-y-3 p-3">
            {schema.fields.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No fields yet.</p>}
            {steps.map((s, i) => (
              <div key={s.id}>
                {(steps.length > 1 || s.id !== "__start") && (
                  <button
                    type="button"
                    onClick={() => s.id !== "__start" && onSelect(s.id)}
                    className={cn(
                      "mb-1 flex w-full items-center gap-1.5 px-1 text-left text-[11px] font-medium tracking-wide text-muted-foreground uppercase",
                      selectedId === s.id && "text-foreground"
                    )}
                  >
                    <span className="tabular-nums">{i + 1}.</span>
                    <span className="truncate">{s.title || `Step ${i + 1}`}</span>
                  </button>
                )}
                <div className="space-y-0.5">
                  {s.fields.map((f) => {
                    const Icon = FIELD_ICONS[f.type]
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => onSelect(f.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                          selectedId === f.id && "bg-secondary font-medium"
                        )}
                      >
                        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{f.label || FIELD_DEFINITIONS[f.type].label}</span>
                        {isInputField(f) && <code className="shrink-0 text-[10px] text-muted-foreground">{f.key}</code>}
                        {f.required && <span className="text-destructive">*</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="templates" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="space-y-2 p-3">
            <p className="px-1 pb-1 text-xs text-muted-foreground">
              Replace this form’s fields, theme and settings with a ready-made template. You can undo afterwards.
            </p>
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPendingTemplate(t)}
                className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/60"
              >
                <div className="flex items-center gap-2">
                  <LayoutTemplateIcon className="size-3.5 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{t.name}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                <div className="mt-2 flex gap-1">
                  <Badge variant="secondary" className="text-[10px]">
                    {t.mode.toLowerCase()}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {t.category}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </TabsContent>

      <AlertDialog open={!!pendingTemplate} onOpenChange={(o) => !o && setPendingTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply “{pendingTemplate?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces the current fields, logic, theme and thank-you settings in your draft. The published version
              isn’t affected until you publish, and you can undo with ⌘Z.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingTemplate) onApplyTemplate(pendingTemplate.id)
                setPendingTemplate(null)
              }}
            >
              Apply template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  )
}

function PaletteItem({
  type,
  label,
  description,
  onAdd,
}: {
  type: FieldType
  label: string
  description: string
  onAdd: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${type}`,
    data: { from: "palette", type },
  })
  const Icon = FIELD_ICONS[type]
  return (
    <Button
      ref={setNodeRef}
      type="button"
      variant="outline"
      title={description}
      onClick={onAdd}
      className={cn(
        "h-auto cursor-grab justify-start gap-2 px-2 py-2 text-left text-xs font-normal active:cursor-grabbing",
        isDragging && "opacity-50"
      )}
      {...attributes}
      {...listeners}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
    </Button>
  )
}

export function PaletteGhost({ type }: { type: FieldType }) {
  const Icon = FIELD_ICONS[type]
  return (
    <div className="flex w-44 items-center gap-2 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <Icon className="size-3.5 text-muted-foreground" />
      {FIELD_DEFINITIONS[type].label}
    </div>
  )
}
