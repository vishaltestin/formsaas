"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  BarChart3Icon,
  CodeIcon,
  WorkflowIcon,
  CreditCardIcon,
  FileTextIcon,
  InboxIcon,
  LayoutGridIcon,
  LayoutTemplateIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  UsersIcon, GaugeIcon, PaletteIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { createForm } from "@/app/actions/forms"
import type { ShellForm } from "@/components/app/app-sidebar"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { Kbd, KbdGroup } from "@/components/ui/kbd"

export function CommandPalette({
  forms,
  isAdmin,
}: {
  forms: ShellForm[]
  isAdmin: boolean
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const [, start] = useTransition()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  const newForm = () => {
    setOpen(false)
    start(async () => {
      const res = await createForm({ title: "Untitled form" })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      router.push(`/dashboard/forms/${res.data.id}/edit`)
    })
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="hidden h-8 w-64 justify-start gap-2 px-2.5 text-muted-foreground md:flex"
        onClick={() => setOpen(true)}
      >
        <SearchIcon />
        <span className="text-xs">Search forms & actions…</span>
        <KbdGroup className="ml-auto">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Search"
      >
        <SearchIcon />
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Command palette"
        description="Jump to a form or run an action"
      >
        <Command>
          <CommandInput placeholder="Type a command or search forms…" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem onSelect={newForm}>
                <PlusIcon /> Create blank form
                <CommandShortcut>N</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => go("/dashboard/templates")}>
                <LayoutTemplateIcon /> Browse templates
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setTheme(resolvedTheme === "dark" ? "light" : "dark")
                  setOpen(false)
                }}
              >
                <MoonIcon /> Toggle dark mode
                <CommandShortcut>D</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Navigate">
              <CommandItem onSelect={() => go("/dashboard")}>
                <LayoutGridIcon /> All forms
              </CommandItem>
              <CommandItem onSelect={() => go("/dashboard/developers")}>
                <CodeIcon /> Developers — API keys &amp; playground
              </CommandItem>
              <CommandItem
                onSelect={() => go("/dashboard/developers?tab=logs")}
              >
                <CodeIcon /> API request logs
              </CommandItem>
              <CommandItem onSelect={() => go("/dashboard/billing")}>
                <CreditCardIcon /> Plan & billing
              </CommandItem>
              {isAdmin && (
                <>
                  <CommandItem onSelect={() => go("/admin")}>
                    <GaugeIcon /> Admin · Overview
                  </CommandItem>
                  <CommandItem onSelect={() => go("/admin/users")}>
                    <UsersIcon /> Admin · Users & plans
                  </CommandItem>
                  <CommandItem onSelect={() => go("/admin/requests")}>
                    <InboxIcon /> Admin · Upgrade requests
                  </CommandItem>
                  <CommandItem onSelect={() => go("/admin/settings")}>
                    <SettingsIcon /> Admin · Plans & contact
                  </CommandItem>
                  <CommandItem onSelect={() => go("/admin/appearance")}>
                    <PaletteIcon /> Admin · Appearance
                  </CommandItem>
                </>
              )}
            </CommandGroup>
            {forms.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Forms">
                  {forms.map((f) => (
                    <CommandItem
                      key={f.id}
                      value={`form ${f.title} ${f.id}`}
                      onSelect={() => go(`/dashboard/forms/${f.id}/edit`)}
                    >
                      <FileTextIcon /> {f.title}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup heading="Form insights">
                  {forms.slice(0, 5).map((f) => (
                    <CommandItem
                      key={`a-${f.id}`}
                      value={`analytics submissions ${f.title}`}
                      onSelect={() => go(`/dashboard/forms/${f.id}/analytics`)}
                    >
                      <BarChart3Icon /> {f.title} — analytics
                    </CommandItem>
                  ))}
                  {forms.slice(0, 5).map((f) => (
                    <CommandItem
                      key={`au-${f.id}`}
                      value={`automations workflow ${f.title}`}
                      onSelect={() =>
                        go(`/dashboard/forms/${f.id}/automations`)
                      }
                    >
                      <WorkflowIcon /> {f.title} — automations
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
