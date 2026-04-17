import type { EnvironmentId, UserCommandsListResult } from "@t3tools/contracts";
import { queryOptions } from "@tanstack/react-query";

import { ensureEnvironmentApi } from "~/environmentApi";

export const userCommandsQueryKeys = {
  all: ["userCommands"] as const,
  list: (environmentId: EnvironmentId | null) =>
    ["userCommands", "list", environmentId ?? null] as const,
};

const EMPTY_USER_COMMANDS_RESULT: UserCommandsListResult = { commands: [] };

const DEFAULT_STALE_TIME = 60_000;

export function userCommandsListQueryOptions(input: {
  environmentId: EnvironmentId | null;
  enabled?: boolean;
  staleTime?: number;
}) {
  return queryOptions({
    queryKey: userCommandsQueryKeys.list(input.environmentId),
    queryFn: async () => {
      if (!input.environmentId) {
        return EMPTY_USER_COMMANDS_RESULT;
      }
      const api = ensureEnvironmentApi(input.environmentId);
      return api.userCommands.list();
    },
    enabled: (input.enabled ?? true) && input.environmentId !== null,
    staleTime: input.staleTime ?? DEFAULT_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_USER_COMMANDS_RESULT,
  });
}
