"use client"

import { useCallback, useReducer } from "react"

import type { FormMode, FormSchema, FormSettings, ThemeConfig } from "@/lib/form-engine"

export interface BuilderDoc {
  title: string
  mode: FormMode
  schema: FormSchema
  theme: ThemeConfig
  settings: FormSettings
}

interface HistoryState {
  past: BuilderDoc[]
  present: BuilderDoc
  future: BuilderDoc[]
  /** coalescing key + timestamp of the last edit (typing into one input = one undo step) */
  lastKey: string | null
  lastAt: number
  /** increments on every change; used by autosave */
  revision: number
}

type Action =
  | { type: "update"; updater: (d: BuilderDoc) => BuilderDoc; key?: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; doc: BuilderDoc; keepHistory?: boolean }

const LIMIT = 100
const COALESCE_MS = 900

function reducer(state: HistoryState, action: Action): HistoryState {
  switch (action.type) {
    case "update": {
      const next = action.updater(state.present)
      if (next === state.present) return state
      const now = Date.now()
      const coalesce = !!action.key && action.key === state.lastKey && now - state.lastAt < COALESCE_MS
      return {
        past: coalesce ? state.past : [...state.past, state.present].slice(-LIMIT),
        present: next,
        future: [],
        lastKey: action.key ?? null,
        lastAt: now,
        revision: state.revision + 1,
      }
    }
    case "undo": {
      if (!state.past.length) return state
      const prev = state.past[state.past.length - 1]
      return {
        past: state.past.slice(0, -1),
        present: prev,
        future: [state.present, ...state.future].slice(0, LIMIT),
        lastKey: null,
        lastAt: 0,
        revision: state.revision + 1,
      }
    }
    case "redo": {
      if (!state.future.length) return state
      const [next, ...rest] = state.future
      return {
        past: [...state.past, state.present].slice(-LIMIT),
        present: next,
        future: rest,
        lastKey: null,
        lastAt: 0,
        revision: state.revision + 1,
      }
    }
    case "reset":
      return {
        past: action.keepHistory ? [...state.past, state.present].slice(-LIMIT) : [],
        present: action.doc,
        future: [],
        lastKey: null,
        lastAt: 0,
        revision: state.revision + 1,
      }
  }
}

export function useBuilderState(initial: BuilderDoc) {
  const [state, dispatch] = useReducer(reducer, {
    past: [],
    present: initial,
    future: [],
    lastKey: null,
    lastAt: 0,
    revision: 0,
  })

  const update = useCallback(
    (updater: (d: BuilderDoc) => BuilderDoc, key?: string) => dispatch({ type: "update", updater, key }),
    []
  )
  const undo = useCallback(() => dispatch({ type: "undo" }), [])
  const redo = useCallback(() => dispatch({ type: "redo" }), [])
  const reset = useCallback((doc: BuilderDoc, keepHistory?: boolean) => dispatch({ type: "reset", doc, keepHistory }), [])

  return {
    doc: state.present,
    revision: state.revision,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    update,
    undo,
    redo,
    reset,
  }
}

export type BuilderApi = ReturnType<typeof useBuilderState>
