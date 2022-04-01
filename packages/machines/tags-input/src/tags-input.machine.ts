import { createMachine, guards, ref } from "@ui-machines/core"
import { autoResizeInput, createLiveRegion, nextTick, raf } from "@ui-machines/dom-utils"
import { dom } from "./tags-input.dom"
import { MachineContext, MachineState } from "./tags-input.types"

const { and, not, or } = guards

export const machine = createMachine<MachineContext, MachineState>(
  {
    id: "tags-input",
    initial: "unknown",

    context: {
      log: { current: null, prev: null },
      uid: "",
      inputValue: "",
      editedTagValue: "",
      focusedId: null,
      editedId: null,
      value: [],
      dir: "ltr",
      max: Infinity,
      liveRegion: null,
      addOnBlur: false,
      addOnPaste: false,
      allowEditTag: true,
      validate: () => true,
      separator: ",",
      messages: {
        clearButtonLabel: "Clear all tags",
        deleteTagButtonLabel: (value) => `Delete tag ${value}`,
        tagAdded: (value) => `Added tag ${value}`,
        tagsPasted: (values) => `Pasted ${values.length} tags`,
        tagEdited: (value) => `Editing tag ${value}. Press enter to save or escape to cancel.`,
        tagUpdated: (value) => `Tag update to ${value}`,
        tagDeleted: (value) => `Tag ${value} deleted`,
        tagSelected: (value) => `Tag ${value} selected. Press enter to edit, delete or backspace to remove.`,
      },
    },

    computed: {
      count: (ctx) => ctx.value.length,
      valueAsString: (ctx) => JSON.stringify(ctx.value),
      trimmedInputValue: (ctx) => ctx.inputValue.trim(),
      isInteractive: (ctx) => !(ctx.readonly || ctx.disabled),
      isAtMax: (ctx) => ctx.count === ctx.max,
      outOfRange: (ctx) => ctx.count > ctx.max,
    },

    watch: {
      focusedId: ["invokeOnHighlight", "logFocused"],
      outOfRange: "invokeOnInvalid",
      log: "announceLog",
    },

    exit: ["removeLiveRegion", "clearLog"],

    on: {
      DOUBLE_CLICK_TAG: {
        guard: "allowEditTag",
        target: "editing:tag",
        actions: ["setEditedId", "initializeEditedTagValue"],
      },
      POINTER_DOWN_TAG: {
        guard: not("isTagFocused"),
        target: "navigating:tag",
        actions: ["focusTag", "focusInput"],
      },
      SET_VALUE: {
        actions: ["setValue"],
      },
      DELETE_TAG: {
        actions: ["deleteTag"],
      },
      CLEAR_ALL: {
        actions: ["clearTags", "focusInput"],
      },
      ADD_TAG: {
        // (!isAtMax || allowOutOfRange) && !inputValueIsEmpty
        guard: and(or(not("isAtMax"), "allowOutOfRange"), not("isInputValueEmpty")),
        actions: ["addTag", "clearInputValue"],
      },
    },

    states: {
      unknown: {
        on: {
          SETUP: [
            {
              guard: "autoFocus",
              target: "focused:input",
              actions: "setupDocument",
            },
            { target: "idle", actions: "setupDocument" },
          ],
        },
      },

      idle: {
        on: {
          FOCUS: "focused:input",
          POINTER_DOWN: {
            guard: not("hasFocusedId"),
            target: "focused:input",
          },
        },
      },

      "focused:input": {
        tags: ["focused"],
        entry: ["focusInput", "clearFocusedId"],
        on: {
          TYPE: {
            actions: "setInputValue",
          },
          BLUR: [
            {
              target: "idle",
              guard: "addOnBlur",
              actions: "raiseAddTagEvent",
            },
            { target: "idle" },
          ],
          ENTER: {
            actions: ["raiseAddTagEvent"],
          },
          COMMA: {
            actions: ["raiseAddTagEvent"],
          },
          ARROW_LEFT: {
            guard: and("hasTags", "isInputCaretAtStart"),
            target: "navigating:tag",
            actions: "focusLastTag",
          },
          BACKSPACE: {
            target: "navigating:tag",
            guard: and("hasTags", "isInputCaretAtStart"),
            actions: "focusLastTag",
          },
          PASTE: {
            guard: "addOnPaste",
            actions: ["setInputValue", "addTagFromPaste"],
          },
        },
      },

      "navigating:tag": {
        tags: ["focused"],
        on: {
          ARROW_RIGHT: [
            {
              guard: and("hasTags", "isInputCaretAtStart", not("isLastTagFocused")),
              actions: "focusNextTag",
            },
            { target: "focused:input" },
          ],
          ARROW_LEFT: {
            actions: "focusPrevTag",
          },
          BLUR: {
            target: "idle",
            actions: "clearFocusedId",
          },
          ENTER: {
            guard: "allowEditTag",
            target: "editing:tag",
            actions: ["setEditedId", "initializeEditedTagValue", "focusEditedTagInput"],
          },
          ARROW_DOWN: "focused:input",
          ESCAPE: "focused:input",
          TYPE: {
            target: "focused:input",
            actions: "setInputValue",
          },
          BACKSPACE: [
            {
              guard: "isFirstTagFocused",
              actions: ["deleteFocusedTag", "focusFirstTag"],
            },
            {
              actions: ["deleteFocusedTag", "focusPrevTag"],
            },
          ],
          DELETE: {
            actions: ["deleteFocusedTag", "focusTagAtIndex"],
          },
        },
      },

      "editing:tag": {
        tags: ["editing"],
        entry: "focusEditedTagInput",
        activities: ["autoResizeTagInput"],
        on: {
          TYPE: {
            actions: "setEditedTagValue",
          },
          ESCAPE: {
            target: "navigating:tag",
            actions: ["clearEditedTagValue", "focusInput", "clearEditedId", "focusTagAtIndex"],
          },
          BLUR: {
            target: "navigating:tag",
            actions: ["clearEditedTagValue", "clearFocusedId", "clearEditedId"],
          },
          ENTER: {
            target: "navigating:tag",
            actions: ["submitEditedTagValue", "focusInput", "clearEditedId", "focusTagAtIndex"],
          },
        },
      },
    },
  },
  {
    guards: {
      isAtMax: (ctx) => ctx.isAtMax,
      hasFocusedId: (ctx) => ctx.focusedId !== null,
      isTagFocused: (ctx, evt) => ctx.focusedId === evt.id,
      isFirstTagFocused: (ctx) => dom.getFirstEl(ctx)?.id === ctx.focusedId,
      isLastTagFocused: (ctx) => dom.getLastEl(ctx)?.id === ctx.focusedId,
      isInputValueEmpty: (ctx) => ctx.trimmedInputValue.length === 0,
      hasTags: (ctx) => ctx.value.length > 0,
      allowOutOfRange: (ctx) => !!ctx.allowOutOfRange,
      autoFocus: (ctx) => !!ctx.autoFocus,
      addOnBlur: (ctx) => !!ctx.addOnBlur,
      addOnPaste: (ctx) => !!ctx.addOnPaste,
      allowEditTag: (ctx) => !!ctx.allowEditTag,
      isInputCaretAtStart(ctx) {
        const input = dom.getInputEl(ctx)
        if (!input) return false
        try {
          return input.selectionStart === 0 && input.selectionEnd === 0
        } catch (e) {
          return input.value === ""
        }
      },
    },

    activities: {
      autoResizeTagInput(ctx) {
        if (!ctx.editedTagValue || ctx.__index == null) return
        const input = dom.getTagInputEl(ctx, { value: ctx.editedTagValue, index: ctx.__index })
        return autoResizeInput(input)
      },
    },

    actions: {
      raiseAddTagEvent(_, __, { self }) {
        self.send("ADD_TAG")
      },
      invokeOnHighlight(ctx) {
        const value = dom.getFocusedTagValue(ctx)
        ctx.onHighlight?.(value)
      },
      setupDocument(ctx, evt) {
        ctx.uid = evt.id
        if (evt.doc) ctx.doc = ref(evt.doc)
        nextTick(() => {
          ctx.liveRegion = createLiveRegion({ level: "assertive", doc: ctx.doc })
        })
      },
      focusNextTag(ctx) {
        if (!ctx.focusedId) return
        const next = dom.getNextEl(ctx, ctx.focusedId)
        if (next) ctx.focusedId = next.id
      },
      focusFirstTag(ctx) {
        raf(() => {
          const first = dom.getFirstEl(ctx)?.id
          if (first) ctx.focusedId = first
        })
      },
      focusLastTag(ctx) {
        const last = dom.getLastEl(ctx)
        if (last) ctx.focusedId = last.id
      },
      focusPrevTag(ctx) {
        if (!ctx.focusedId) return
        const prev = dom.getPrevEl(ctx, ctx.focusedId)
        if (prev) ctx.focusedId = prev.id
      },
      focusTag(ctx, evt) {
        ctx.focusedId = evt.id
      },
      focusTagAtIndex(ctx) {
        raf(() => {
          if (ctx.__index == null) return
          const el = dom.getElAtIndex(ctx, ctx.__index)
          if (el) {
            ctx.focusedId = el.id
            ctx.__index = undefined
          }
        })
      },
      deleteTag(ctx, evt) {
        const index = dom.getIndexOfId(ctx, evt.id)
        const value = ctx.value[index]

        // log
        ctx.log.prev = ctx.log.current
        ctx.log.current = { type: "delete", value }

        ctx.value.splice(index, 1)
      },
      deleteFocusedTag(ctx) {
        if (!ctx.focusedId) return
        const index = dom.getIndexOfId(ctx, ctx.focusedId)
        ctx.__index = index
        const value = ctx.value[index]

        // log
        ctx.log.prev = ctx.log.current
        ctx.log.current = { type: "delete", value }

        ctx.value.splice(index, 1)
      },
      setEditedId(ctx, evt) {
        ctx.editedId = evt.id ?? ctx.focusedId
        ctx.__index = dom.getIndexOfId(ctx, ctx.editedId!)
      },
      clearEditedId(ctx) {
        ctx.editedId = null
      },
      clearEditedTagValue(ctx) {
        ctx.editedTagValue = ""
      },
      setEditedTagValue(ctx, evt) {
        ctx.editedTagValue = evt.value
      },
      submitEditedTagValue(ctx) {
        if (!ctx.editedId) return
        const index = dom.getIndexOfId(ctx, ctx.editedId)
        ctx.value[index] = ctx.editedTagValue ?? ""
        // log
        ctx.log.prev = ctx.log.current
        ctx.log.current = { type: "update", value: ctx.editedTagValue! }
      },
      initializeEditedTagValue(ctx) {
        if (!ctx.editedId) return
        const index = dom.getIndexOfId(ctx, ctx.editedId)
        ctx.editedTagValue = ctx.value[index]
      },
      focusEditedTagInput(ctx) {
        nextTick(() => {
          dom.getEditInputEl(ctx)?.select()
        })
      },
      setInputValue(ctx, evt) {
        ctx.inputValue = evt.value
      },
      clearFocusedId(ctx) {
        ctx.focusedId = null
      },
      focusInput(ctx) {
        nextTick(() => {
          dom.getInputEl(ctx)?.focus()
        })
      },
      clearInputValue(ctx) {
        ctx.inputValue = ""
      },
      addTag(ctx, evt) {
        const value = evt.value ?? ctx.trimmedInputValue
        const guard = ctx.validate?.({ inputValue: value, values: ctx.value })
        if (guard) {
          ctx.value.push(value)
          // log
          ctx.log.prev = ctx.log.current
          ctx.log.current = { type: "add", value }
        } else {
          ctx.onInvalid?.("invalidTag")
        }
      },
      addTagFromPaste(ctx) {
        nextTick(() => {
          const value = ctx.trimmedInputValue
          const guard = ctx.validate?.({ inputValue: value, values: ctx.value })
          if (guard) {
            const trimmedValue = value.split(ctx.separator).map((v) => v.trim())
            ctx.value.push(...trimmedValue)
            // log
            ctx.log.prev = ctx.log.current
            ctx.log.current = { type: "paste", values: trimmedValue }
          } else {
            ctx.onInvalid?.("invalidTag")
          }
          ctx.inputValue = ""
        })
      },
      clearTags(ctx) {
        ctx.value = []
        // log
        ctx.log.prev = ctx.log.current
        ctx.log.current = { type: "clear" }
      },
      setValue(ctx, evt) {
        ctx.value = evt.value
      },
      removeLiveRegion(ctx) {
        ctx.liveRegion?.destroy()
      },
      invokeOnInvalid(ctx) {
        if (ctx.outOfRange) {
          ctx.onInvalid?.("outOfRange")
        }
      },
      clearLog(ctx) {
        ctx.log = { prev: null, current: null }
      },
      logFocused(ctx) {
        if (!ctx.focusedId) return
        const index = dom.getIndexOfId(ctx, ctx.focusedId)

        // log
        ctx.log.prev = ctx.log.current
        ctx.log.current = { type: "select", value: ctx.value[index] }
      },
      // queue logs with screen reader and get it announced
      announceLog(ctx) {
        if (!ctx.log.current || ctx.liveRegion == null) return

        const region = ctx.liveRegion
        const { current, prev } = ctx.log
        let msg: string | undefined

        switch (current.type) {
          case "add":
            msg = ctx.messages.tagAdded(current.value)
            break
          case "delete":
            msg = ctx.messages.tagDeleted(current.value)
            break
          case "update":
            msg = ctx.messages.tagUpdated(current.value)
            break
          case "paste":
            msg = ctx.messages.tagsPasted(current.values)
            break
          case "select":
            msg = ctx.messages.tagSelected(current.value)
            if (prev?.type === "delete") {
              msg = `${ctx.messages.tagDeleted(prev.value)}. ${msg}`
            } else if (prev?.type === "update") {
              msg = `${ctx.messages.tagUpdated(prev.value)}. ${msg}`
            }
            break
          default:
            break
        }

        if (msg) region.announce(msg)
      },
    },
  },
)
