/**
 * Incrementally parse SSE blocks from a byte stream (one or more `data: {...}\\n\\n`).
 */
export function extractSseDataBlocks(buffer: string): { blocks: string[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const blocks: string[] = [];
  for (const chunk of parts) {
    const lines = chunk.split("\n").filter(Boolean);
    const dataLines = lines
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.replace(/^data:\s?/, ""));
    if (dataLines.length) blocks.push(dataLines.join("\n"));
  }
  return { blocks, rest };
}
