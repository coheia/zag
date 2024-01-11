import { createMachine, guards } from "@zag-js/core"
import { getByTypeahead, isHTMLElement } from "@zag-js/dom-query"
import { compact } from "@zag-js/utils"
import { dom } from "./tree-view.dom"
import type { MachineContext, MachineState, UserDefinedContext } from "./tree-view.types"

const { and } = guards

export function machine(userContext: UserDefinedContext) {
  const ctx = compact(userContext)
  return createMachine<MachineContext, MachineState>(
    {
      id: "tree-view",
      initial: "idle",
      context: {
        expandedIds: new Set(),
        selectedIds: new Set(),
        focusedId: null,
        ...ctx,
        typeahead: getByTypeahead.defaultOptions,
      },

      entry: ["makeFirstTreeItemTabbable"],

      states: {
        idle: {
          on: {
            "ITEM.SELECT_ALL": {
              actions: ["selectAllItems"],
            },
            "ITEM.FOCUS": {
              actions: ["setFocusedItem"],
            },
            "ITEM.ARROW_DOWN": {
              actions: ["focusTreeNextItem"],
            },
            "ITEM.ARROW_UP": {
              actions: ["focusTreePrevItem"],
            },
            "ITEM.ARROW_LEFT": [
              {
                guard: and("isBranchFocused", "isBranchExpanded"),
                actions: ["collapseItem"],
              },
              {
                actions: ["focusBranchTrigger"],
              },
            ],
            "BRANCH.ARROW_RIGHT": [
              {
                guard: and("isBranchFocused", "isBranchExpanded"),
                actions: ["focusBranchFirstItem"],
              },
              {
                actions: ["expandItem"],
              },
            ],
            "ITEM.HOME": {
              actions: ["focusTreeFirstItem"],
            },
            "ITEM.END": {
              actions: ["focusTreeLastItem"],
            },
            "ITEM.CLICK": {
              actions: ["selectItem"],
            },
            "ITEM.BLUR": {
              actions: ["clearFocusedItem"],
            },
            "BRANCH.CLICK": {
              actions: ["selectItem", "toggleItem"],
            },
            "BRANCH.TOGGLE": {
              actions: ["toggleItem"],
            },
            "EXPANDED.SET": {
              actions: ["setExpanded"],
            },
            TYPEAHEAD: {
              actions: "focusMatchedItem",
            },
            "TREE.BLUR": [
              {
                guard: "hasSelectedItems",
                actions: ["makeFirstSelectedItemTabbable"],
              },
              {
                actions: ["makeFirstTreeItemTabbable"],
              },
            ],
          },
        },
      },
    },
    {
      guards: {
        isBranchFocused: (ctx, evt) => ctx.focusedId === evt.id,
        isBranchExpanded: (ctx, evt) => ctx.expandedIds.has(evt.id),
        hasSelectedItems: (ctx) => ctx.selectedIds.size > 0,
      },
      actions: {
        makeFirstTreeItemTabbable(ctx) {
          if (ctx.focusedId) return
          const walker = dom.getTreeWalker(ctx)
          const firstItem = walker.firstChild()
          if (!isHTMLElement(firstItem)) return
          set.focused(ctx, firstItem.id)
        },
        makeFirstSelectedItemTabbable(ctx) {
          const firstSelectedId = Array.from(ctx.selectedIds)[0]
          if (!firstSelectedId) return
          set.focused(ctx, firstSelectedId)
        },
        selectItem(ctx, evt) {
          set.selected(ctx, new Set([evt.id]))
        },
        setFocusedItem(ctx, evt) {
          set.focused(ctx, evt.id)
        },
        clearFocusedItem(ctx) {
          set.focused(ctx, null)
        },

        toggleItem(ctx, evt) {
          const nextSet = new Set(ctx.expandedIds)
          if (nextSet.has(evt.id)) nextSet.delete(evt.id)
          else nextSet.add(evt.id)
          set.expanded(ctx, nextSet)
        },
        expandItem(ctx, evt) {
          const nextSet = new Set(ctx.expandedIds)
          nextSet.add(evt.id)
          set.expanded(ctx, nextSet)
        },
        collapseItem(ctx, evt) {
          const nextSet = new Set(ctx.expandedIds)
          nextSet.delete(evt.id)
          set.expanded(ctx, nextSet)
        },
        setExpanded(ctx, evt) {
          set.expanded(ctx, evt.value)
        },
        focusTreeFirstItem(ctx) {
          const walker = dom.getTreeWalker(ctx)
          dom.focusNode(walker.firstChild())
        },
        focusTreeLastItem(ctx) {
          const walker = dom.getTreeWalker(ctx)
          dom.focusNode(walker.lastChild())
        },
        focusBranchFirstItem(ctx) {
          const walker = dom.getTreeWalker(ctx)
          walker.currentNode = document.activeElement as HTMLElement
          dom.focusNode(walker.nextNode())
        },
        focusTreeNextItem(ctx) {
          const walker = dom.getTreeWalker(ctx)
          const activeEl = dom.getActiveElement(ctx) as HTMLElement
          if (ctx.focusedId) {
            walker.currentNode = activeEl
            const nextNode = walker.nextNode()
            dom.focusNode(nextNode)
          } else {
            dom.focusNode(walker.firstChild())
          }
        },
        focusTreePrevItem(ctx) {
          const walker = dom.getTreeWalker(ctx)
          const activeEl = dom.getActiveElement(ctx) as HTMLElement
          if (ctx.focusedId) {
            walker.currentNode = activeEl
            const prevNode = walker.previousNode()
            dom.focusNode(prevNode)
          } else {
            dom.focusNode(walker.lastChild())
          }
        },
        focusBranchTrigger(ctx) {
          const activeEl = dom.getActiveElement(ctx)

          if (!ctx.focusedId) return

          let parentBranchEl = dom.getBranchEl(activeEl!)

          if (parentBranchEl?.id === ctx.focusedId) {
            parentBranchEl = dom.getBranchEl(parentBranchEl)
          }

          const parentBranchTrigger = parentBranchEl?.querySelector("[data-part=branch-trigger]")
          dom.focusNode(parentBranchTrigger)
        },
        selectAllItems(ctx) {
          const nextSet = new Set<string>()
          const walker = dom.getTreeWalker(ctx)
          let node = walker.firstChild()
          while (node) {
            if (isHTMLElement(node)) {
              nextSet.add(node.dataset.branch ?? node.id)
            }
            node = walker.nextNode()
          }
          set.selected(ctx, nextSet)
        },
        focusMatchedItem(ctx, evt) {
          const node = dom.getMatchingEl(ctx, evt.key)
          dom.focusNode(node)
        },
      },
    },
  )
}

const invoke = {
  focusChange(ctx: MachineContext) {
    ctx.onFocusChange?.({ focusedId: ctx.focusedId! })
  },
  openChange(ctx: MachineContext) {
    ctx.onOpenChange?.({ ids: ctx.expandedIds })
  },
  selectionChange(ctx: MachineContext) {
    ctx.onSelectionChange?.({ ids: ctx.selectedIds })
  },
}

const set = {
  selected(ctx: MachineContext, set: Set<string>) {
    ctx.selectedIds = set
    invoke.selectionChange(ctx)
  },
  focused(ctx: MachineContext, id: string | null) {
    ctx.focusedId = id
    invoke.focusChange(ctx)
  },
  expanded(ctx: MachineContext, set: Set<string>) {
    ctx.expandedIds = set
    invoke.openChange(ctx)
  },
}
