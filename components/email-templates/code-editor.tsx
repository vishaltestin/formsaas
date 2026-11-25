"use client"

import { useMemo } from "react"
import CodeMirror from "@uiw/react-codemirror"
import { html } from "@codemirror/lang-html"
import { RangeSetBuilder, StateField, type Extension } from "@codemirror/state"
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view"
import { oneDark } from "@codemirror/theme-one-dark"

const errorLineDeco = Decoration.line({
  attributes: { style: "background-color: rgba(239, 68, 68, 0.15)" },
})

function errorLineField(line: number | null): Extension {
  return StateField.define<DecorationSet>({
    create(state) {
      if (!line || line > state.doc.lines) return Decoration.none
      const b = new RangeSetBuilder<Decoration>()
      b.add(state.doc.line(line).from, state.doc.line(line).from, errorLineDeco)
      return b.finish()
    },
    update(deco, tr) {
      return deco.map(tr.changes)
    },
    provide: (f) => EditorView.decorations.from(f),
  })
}

/** HTML editor (CSS inside <style> gets CSS highlighting via lang-html). Uncontrolled after mount. */
export function CodeEditor({
  value,
  dark,
  readOnly,
  errorLine,
  onChange,
  onReady,
}: {
  value: string
  dark: boolean
  readOnly: boolean
  errorLine: number | null
  onChange: (value: string) => void
  onReady: (view: EditorView) => void
}) {
  const extensions = useMemo(
    () => [
      html({ autoCloseTags: true, matchClosingTags: true }),
      EditorView.lineWrapping,
      errorLineField(errorLine),
    ],
    [errorLine]
  )
  return (
    <CodeMirror
      value={value}
      height="100%"
      className="absolute inset-0 overflow-hidden text-[13px] [&_.cm-editor]:h-full"
      theme={dark ? oneDark : "light"}
      editable={!readOnly}
      readOnly={readOnly}
      extensions={extensions}
      basicSetup={{
        foldGutter: true,
        highlightActiveLine: true,
        autocompletion: true,
        bracketMatching: true,
        tabSize: 2,
      }}
      onChange={onChange}
      onCreateEditor={onReady}
      aria-label="Template HTML"
    />
  )
}
