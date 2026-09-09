import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Always throws an error. Call this when the user asks to trigger a failure.",
  inputSchema: z.object({}),
  async execute() {
    throw new Error("Intentional eve tool failure");
  },
});
