import { AppContext } from "../../types.js";
import { registerAllCommands } from "../../shared/discord.js";

export async function reloadCustomCommands(context: AppContext) {
  const customCmds = await context.db.custom_commands.findMany({
    select: { name: true, response: true },
  });

  const { rest, config, logger, staticCommands } = context;

  await registerAllCommands(
    staticCommands.map((cmd) => cmd.data),
    customCmds.map((c) => ({ name: c.name, description: c.response.slice(0, 100) })),
    rest,
    config,
    logger
  );
}
