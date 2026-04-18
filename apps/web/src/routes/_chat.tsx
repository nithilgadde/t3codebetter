import { Outlet, createFileRoute, redirect, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";

import { parseScopedThreadKey } from "@t3tools/client-runtime";
import { useCommandPaletteStore } from "../commandPaletteStore";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import {
  startNewLocalThreadFromContext,
  startNewThreadFromContext,
} from "../lib/chatThreadActions";
import { isTerminalFocused } from "../lib/terminalFocus";
import { resolveShortcutCommand } from "../keybindings";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { useUiStateStore } from "../uiStateStore";
import { resolveThreadRouteRef, buildThreadRouteParams } from "../threadRoutes";
import { resolveSidebarNewThreadEnvMode } from "~/components/Sidebar.logic";
import { useSettings } from "~/hooks/useSettings";
import { useServerKeybindings } from "~/rpc/serverState";

function ChatRouteGlobalShortcuts() {
  const clearSelection = useThreadSelectionStore((state) => state.clearSelection);
  const selectedThreadKeysSize = useThreadSelectionStore((state) => state.selectedThreadKeys.size);
  const { activeDraftThread, activeThread, defaultProjectRef, handleNewThread, routeThreadRef } =
    useHandleNewThread();
  const keybindings = useServerKeybindings();
  const terminalOpen = useTerminalStateStore((state) =>
    routeThreadRef
      ? selectThreadTerminalState(state.terminalStateByThreadKey, routeThreadRef).terminalOpen
      : false,
  );
  const appSettings = useSettings();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (loc) => loc.pathname });
  const splitParams = useParams({ strict: false });
  const threadLastVisitedAtById = useUiStateStore((state) => state.threadLastVisitedAtById);

  const toggleSplit = useCallback(() => {
    const onSplitRoute =
      pathname.startsWith("/split/") &&
      typeof splitParams.leftEnvironmentId === "string" &&
      typeof splitParams.leftThreadId === "string";
    if (onSplitRoute) {
      const leftRef = resolveThreadRouteRef({
        environmentId: splitParams.leftEnvironmentId as string,
        threadId: splitParams.leftThreadId as string,
      });
      if (!leftRef) return;
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(leftRef),
      });
      return;
    }
    if (!routeThreadRef) return;
    const currentKey = `${routeThreadRef.environmentId}:${routeThreadRef.threadId}`;
    const candidateKey = Object.entries(threadLastVisitedAtById)
      .filter(([key]) => key !== currentKey)
      .sort(([, a], [, b]) => (a < b ? 1 : a > b ? -1 : 0))[0]?.[0];
    if (!candidateKey) return;
    const otherRef = parseScopedThreadKey(candidateKey);
    if (!otherRef) return;
    void navigate({
      to: "/split/$leftEnvironmentId/$leftThreadId/$rightEnvironmentId/$rightThreadId",
      params: {
        leftEnvironmentId: routeThreadRef.environmentId,
        leftThreadId: routeThreadRef.threadId,
        rightEnvironmentId: otherRef.environmentId,
        rightThreadId: otherRef.threadId,
      },
    });
  }, [navigate, pathname, routeThreadRef, splitParams, threadLastVisitedAtById]);

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen,
        },
      });

      if (useCommandPaletteStore.getState().open) {
        return;
      }

      if (event.key === "Escape" && selectedThreadKeysSize > 0) {
        event.preventDefault();
        clearSelection();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === "\\") {
        event.preventDefault();
        event.stopPropagation();
        toggleSplit();
        return;
      }

      if (command === "chat.newLocal") {
        event.preventDefault();
        event.stopPropagation();
        void startNewLocalThreadFromContext({
          activeDraftThread,
          activeThread,
          defaultProjectRef,
          defaultThreadEnvMode: resolveSidebarNewThreadEnvMode({
            defaultEnvMode: appSettings.defaultThreadEnvMode,
          }),
          handleNewThread,
        });
        return;
      }

      if (command === "chat.new") {
        event.preventDefault();
        event.stopPropagation();
        void startNewThreadFromContext({
          activeDraftThread,
          activeThread,
          defaultProjectRef,
          defaultThreadEnvMode: resolveSidebarNewThreadEnvMode({
            defaultEnvMode: appSettings.defaultThreadEnvMode,
          }),
          handleNewThread,
        });
      }
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [
    activeDraftThread,
    activeThread,
    clearSelection,
    handleNewThread,
    keybindings,
    defaultProjectRef,
    selectedThreadKeysSize,
    terminalOpen,
    appSettings.defaultThreadEnvMode,
    toggleSplit,
  ]);

  return null;
}

function ChatRouteLayout() {
  return (
    <>
      <ChatRouteGlobalShortcuts />
      <Outlet />
    </>
  );
}

export const Route = createFileRoute("/_chat")({
  beforeLoad: async ({ context }) => {
    if (context.authGateState.status !== "authenticated") {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: ChatRouteLayout,
});
