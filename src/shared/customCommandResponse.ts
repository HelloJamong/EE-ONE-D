export type CustomCommandResponse =
  | { type: "text"; content: string }
  | { type: "embed"; title: string; description: string };

export function parseCustomCommandResponses(input: string): CustomCommandResponse[] {
  const parts = input.split("|||").map((part) => part.trim());
  const responses: CustomCommandResponse[] = [];

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (!part) continue;

    if (part.startsWith("EMBED:")) {
      responses.push({
        type: "embed",
        title: part.slice(6).trim(),
        description: parts[index + 1] ?? "",
      });
      index++;
      continue;
    }

    responses.push({ type: "text", content: part });
  }

  return responses;
}
