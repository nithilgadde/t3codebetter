import { Context, Schema } from "effect";
import type { Effect } from "effect";

import type { UserCommand } from "@t3tools/contracts";

export class UserCommandsLoaderError extends Schema.TaggedErrorClass<UserCommandsLoaderError>()(
  "UserCommandsLoaderError",
  {
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export interface UserCommandsLoaderShape {
  readonly list: () => Effect.Effect<ReadonlyArray<UserCommand>, UserCommandsLoaderError>;
}

export class UserCommandsLoader extends Context.Service<
  UserCommandsLoader,
  UserCommandsLoaderShape
>()("t3/userCommands/Services/UserCommandsLoader") {}
