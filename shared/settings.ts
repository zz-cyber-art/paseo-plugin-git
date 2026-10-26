import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const gitSettings = defineSettings({
  id: "git-stage-commit",
  scope: "host",
  version: 1,
  schema: z.object({
    provider: z.string().optional(),
  }),
});