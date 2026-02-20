/** Parse tool usage markers from Claude message content */
export function parseToolUsage(content: string): { tools: string[]; cleanContent: string } {
  const toolPattern = /\[Using tool: ([^\]]+)\]/g;
  const completedPattern = /\[Tool ([^\]]+) completed\]/g;

  const tools: string[] = [];
  let match;

  while ((match = toolPattern.exec(content)) !== null) {
    tools.push(match[1]);
  }

  // Remove tool messages from content
  const cleanContent = content
    .replace(toolPattern, '')
    .replace(completedPattern, '')
    .trim();

  return { tools, cleanContent };
}

/** Shorten a file path for display in collapsed headers */
export function shortenPath(filePath: string, maxLength = 40): string {
  if (filePath.length <= maxLength) return filePath;
  const parts = filePath.split('/');
  if (parts.length <= 2) return filePath;
  const filename = parts[parts.length - 1];
  const dir = parts[parts.length - 2];
  return `.../${dir}/${filename}`;
}
