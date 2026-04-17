import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";

export const UserCommand = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  namespace: Schema.optional(TrimmedNonEmptyString),
  description: Schema.optional(Schema.String),
  prompt: Schema.String,
  source: Schema.Literals(["user", "plugin"]),
  sourcePath: TrimmedNonEmptyString,
});
export type UserCommand = typeof UserCommand.Type;

export const UserCommandsListResult = Schema.Struct({
  commands: Schema.Array(UserCommand),
});
export type UserCommandsListResult = typeof UserCommandsListResult.Type;

export class UserCommandsError extends Schema.TaggedErrorClass<UserCommandsError>()(
  "UserCommandsError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}
