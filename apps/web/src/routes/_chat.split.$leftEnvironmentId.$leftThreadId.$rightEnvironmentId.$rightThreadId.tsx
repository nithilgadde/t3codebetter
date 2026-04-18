import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ChatView from "../components/ChatView";
import { SidebarInset } from "~/components/ui/sidebar";
import { selectEnvironmentState, selectThreadExistsByRef, useStore } from "../store";
import { resolveThreadRouteRef, buildThreadRouteParams } from "../threadRoutes";

const MIN_PANE_PX = 360;
const DIVIDER_PX = 6;

function useClampedSplitRatio(initial: number) {
  const [ratio, setRatio] = useState(initial);
  return [ratio, setRatio] as const;
}

function SplitChatRouteView() {
  const navigate = useNavigate();
  const leftRef = Route.useParams({
    select: (params) =>
      resolveThreadRouteRef({
        environmentId: params.leftEnvironmentId,
        threadId: params.leftThreadId,
      }),
  });
  const rightRef = Route.useParams({
    select: (params) =>
      resolveThreadRouteRef({
        environmentId: params.rightEnvironmentId,
        threadId: params.rightThreadId,
      }),
  });

  const leftBootstrap = useStore(
    (store) => selectEnvironmentState(store, leftRef?.environmentId ?? null).bootstrapComplete,
  );
  const rightBootstrap = useStore(
    (store) => selectEnvironmentState(store, rightRef?.environmentId ?? null).bootstrapComplete,
  );
  const leftExists = useStore((store) => selectThreadExistsByRef(store, leftRef));
  const rightExists = useStore((store) => selectThreadExistsByRef(store, rightRef));

  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useClampedSplitRatio(0.5);
  const dragStateRef = useRef<{ startX: number; startRatio: number } | null>(null);

  const onDividerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      dragStateRef.current = { startX: event.clientX, startRatio: ratio };
    },
    [ratio],
  );

  const onDividerPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStateRef.current || !containerRef.current) return;
      const { startX, startRatio } = dragStateRef.current;
      const width = containerRef.current.clientWidth;
      if (width === 0) return;
      const deltaRatio = (event.clientX - startX) / width;
      const nextRatio = startRatio + deltaRatio;
      const minRatio = MIN_PANE_PX / width;
      const maxRatio = 1 - MIN_PANE_PX / width;
      setRatio(Math.max(minRatio, Math.min(maxRatio, nextRatio)));
    },
    [setRatio],
  );

  const onDividerPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      dragStateRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    [],
  );

  const closeSplit = useCallback(
    (keepSide: "left" | "right") => {
      const keepRef = keepSide === "left" ? leftRef : rightRef;
      if (!keepRef) return;
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(keepRef),
      });
    },
    [leftRef, navigate, rightRef],
  );

  useEffect(() => {
    if (!leftRef || !rightRef) return;
    if (!leftBootstrap || !rightBootstrap) return;
    if (!leftExists && !rightExists) {
      void navigate({ to: "/", replace: true });
    }
  }, [leftBootstrap, leftExists, leftRef, navigate, rightBootstrap, rightExists, rightRef]);

  const leftStyle = useMemo(
    () => ({
      flexBasis: `calc(${ratio * 100}% - ${DIVIDER_PX / 2}px)`,
      flexGrow: 0,
      flexShrink: 0,
      minWidth: 0,
    }),
    [ratio],
  );
  const rightStyle = useMemo(
    () => ({
      flexBasis: `calc(${(1 - ratio) * 100}% - ${DIVIDER_PX / 2}px)`,
      flexGrow: 0,
      flexShrink: 0,
      minWidth: 0,
    }),
    [ratio],
  );

  if (!leftRef || !rightRef) return null;
  if (!leftBootstrap || !rightBootstrap) return null;
  if (!leftExists || !rightExists) return null;

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div ref={containerRef} className="relative flex h-full w-full min-h-0">
        <div className="relative flex h-full min-h-0 flex-col" style={leftStyle}>
          <button
            type="button"
            onClick={() => closeSplit("right")}
            aria-label="Close left pane"
            className="absolute right-2 top-2 z-10 inline-flex size-6 items-center justify-center rounded-md border border-border/80 bg-popover/90 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
          <ChatView
            environmentId={leftRef.environmentId}
            threadId={leftRef.threadId}
            reserveTitleBarControlInset={false}
            routeKind="server"
          />
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={onDividerPointerDown}
          onPointerMove={onDividerPointerMove}
          onPointerUp={onDividerPointerUp}
          onPointerCancel={onDividerPointerUp}
          className="relative z-10 flex-none cursor-col-resize bg-border/60 transition-colors hover:bg-primary/40"
          style={{ width: DIVIDER_PX }}
        />
        <div className="relative flex h-full min-h-0 flex-col" style={rightStyle}>
          <button
            type="button"
            onClick={() => closeSplit("left")}
            aria-label="Close right pane"
            className="absolute right-2 top-2 z-10 inline-flex size-6 items-center justify-center rounded-md border border-border/80 bg-popover/90 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
          <ChatView
            environmentId={rightRef.environmentId}
            threadId={rightRef.threadId}
            reserveTitleBarControlInset={false}
            routeKind="server"
          />
        </div>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute(
  "/_chat/split/$leftEnvironmentId/$leftThreadId/$rightEnvironmentId/$rightThreadId",
)({
  component: SplitChatRouteView,
});
