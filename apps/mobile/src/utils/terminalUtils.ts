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
