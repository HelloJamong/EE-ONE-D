import { Logger } from "pino";

export function safeEventHandler<Args extends unknown[]>(
  logger: Pick<Logger, "error">,
  event: string,
  handler: (...args: Args) => void | Promise<void>
): (...args: Args) => void {
  return (...args) => {
    Promise.resolve()
      .then(() => handler(...args))
      .catch((error) => {
        logger.error({ err: error, event }, "Discord event handler failed");
      });
  };
}
