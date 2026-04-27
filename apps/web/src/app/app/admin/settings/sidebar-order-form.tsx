"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type SidebarOrderState = { error: string | null; success: string | null };
type SidebarOrderAction = (state: SidebarOrderState, formData: FormData) => Promise<SidebarOrderState>;

type SidebarOrderItem = {
  href: string;
  label: string;
  description?: string;
};

const initialState: SidebarOrderState = { error: null, success: null };

function buildOrderedItems(items: SidebarOrderItem[], savedOrder: string[]) {
  const itemsByHref = new Map(items.map((item) => [item.href, item]));
  const ordered: SidebarOrderItem[] = [];
  const used = new Set<string>();

  for (const href of savedOrder) {
    const item = itemsByHref.get(href);
    if (!item || used.has(href)) {
      continue;
    }

    ordered.push(item);
    used.add(href);
  }

  for (const item of items) {
    if (!used.has(item.href)) {
      ordered.push(item);
    }
  }

  return ordered;
}

export function SidebarOrderForm({
  items,
  savedOrder,
  updateAction
}: {
  items: SidebarOrderItem[];
  savedOrder: string[];
  updateAction: SidebarOrderAction;
}) {
  const router = useRouter();
  const defaultOrder = useMemo(() => items.map((item) => item.href), [items]);
  const [order, setOrder] = useState(() => buildOrderedItems(items, savedOrder).map((item) => item.href));
  const [state, setState] = useState(initialState);
  const [pending, startTransition] = useTransition();

  const orderedItems = useMemo(() => buildOrderedItems(items, order), [items, order]);

  function moveItem(href: string, direction: -1 | 1) {
    setState(initialState);
    setOrder((currentOrder) => {
      const nextOrder = buildOrderedItems(items, currentOrder).map((item) => item.href);
      const index = nextOrder.indexOf(href);
      const targetIndex = index + direction;

      if (index < 0 || targetIndex < 0 || targetIndex >= nextOrder.length) {
        return currentOrder;
      }

      const [moved] = nextOrder.splice(index, 1);
      if (!moved) {
        return currentOrder;
      }

      nextOrder.splice(targetIndex, 0, moved);
      return nextOrder;
    });
  }

  function resetToDefault() {
    setState(initialState);
    setOrder(defaultOrder);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState(initialState);

    const formData = new FormData(event.currentTarget);
    formData.set("sidebarOrder", JSON.stringify(orderedItems.map((item) => item.href)));

    startTransition(() => {
      void (async () => {
        try {
          const result = await updateAction(initialState, formData);
          setState(result);
          if (!result.error) {
            router.refresh();
          }
        } catch (error) {
          setState({
            error: error instanceof Error ? error.message : "Unable to update sidebar order.",
            success: null
          });
        }
      })();
    });
  }

  return (
    <form className="space-y-5 rounded-[2rem] bg-white p-6 shadow-panel" onSubmit={handleSubmit}>
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Sidebar order</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">Arrange admin sections</h3>
        <p className="mt-2 text-sm text-slate-500">
          Move the sections into the order your office uses most. Hidden sections still respect each user&apos;s permissions.
        </p>
      </div>

      <input name="sidebarOrder" type="hidden" value={JSON.stringify(order)} readOnly />

      <div className="space-y-2">
        {orderedItems.map((item, index) => (
          <div
            className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3"
            key={item.href}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{item.label}</p>
                {item.description ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.description}</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={index === 0 || pending}
                  onClick={() => moveItem(item.href, -1)}
                  type="button"
                >
                  Up
                </button>
                <button
                  className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={index === orderedItems.length - 1 || pending}
                  onClick={() => moveItem(item.href, 1)}
                  type="button"
                >
                  Down
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-600">{state.success}</p> : null}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <button className="rounded-2xl bg-slateblue px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">
          {pending ? "Saving order..." : "Save sidebar order"}
        </button>
        <button
          className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 disabled:opacity-60"
          disabled={pending}
          onClick={resetToDefault}
          type="button"
        >
          Reset default
        </button>
      </div>
    </form>
  );
}
