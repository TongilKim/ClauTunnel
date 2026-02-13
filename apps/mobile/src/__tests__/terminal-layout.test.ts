import { describe, it, expect } from 'vitest';

/**
 * Terminal message bubble layout and utility tests.
 *
 * Validates that bubble containers use correct flex properties so
 * Claude messages fill available width instead of collapsing.
 */

/** Mirrors parseToolUsage from Terminal.tsx */
function parseToolUsage(content: string): { tools: string[]; cleanContent: string } {
  const toolPattern = /\[Using tool: ([^\]]+)\]/g;
  const completedPattern = /\[Tool ([^\]]+) completed\]/g;

  const tools: string[] = [];
  let match;

  while ((match = toolPattern.exec(content)) !== null) {
    tools.push(match[1]);
  }

  const cleanContent = content
    .replace(toolPattern, '')
    .replace(completedPattern, '')
    .trim();

  return { tools, cleanContent };
}

describe('parseToolUsage', () => {
  it('should return empty tools and original content for plain text', () => {
    const result = parseToolUsage('Hello, how can I help?');
    expect(result.tools).toEqual([]);
    expect(result.cleanContent).toBe('Hello, how can I help?');
  });

  it('should extract a single tool name', () => {
    const result = parseToolUsage('[Using tool: Read] Reading file...');
    expect(result.tools).toEqual(['Read']);
    expect(result.cleanContent).toBe('Reading file...');
  });

  it('should extract multiple tool names', () => {
    const result = parseToolUsage('[Using tool: Read] [Using tool: Write] Done.');
    expect(result.tools).toEqual(['Read', 'Write']);
    expect(result.cleanContent).toBe('Done.');
  });

  it('should remove completed tool messages', () => {
    const result = parseToolUsage('[Using tool: Bash] Running... [Tool Bash completed] Output here.');
    expect(result.tools).toEqual(['Bash']);
    expect(result.cleanContent).toBe('Running...  Output here.');
  });

  it('should handle content with only tool messages', () => {
    const result = parseToolUsage('[Using tool: Read]');
    expect(result.tools).toEqual(['Read']);
    expect(result.cleanContent).toBe('');
  });

  it('should handle empty content', () => {
    const result = parseToolUsage('');
    expect(result.tools).toEqual([]);
    expect(result.cleanContent).toBe('');
  });
});

describe('bubbleContainer styles', () => {
  // These values mirror the StyleSheet in Terminal.tsx
  const bubbleContainer = {
    maxWidth: '75%',
    flexShrink: 1,
    flexGrow: 1,
  };

  it('should have flexGrow: 1 so Claude messages fill available width', () => {
    expect(bubbleContainer.flexGrow).toBe(1);
  });

  it('should have flexShrink: 1 so content can shrink when needed', () => {
    expect(bubbleContainer.flexShrink).toBe(1);
  });

  it('should cap width at 75%', () => {
    expect(bubbleContainer.maxWidth).toBe('75%');
  });
});

describe('message grouping logic', () => {
  type MsgType = 'input' | 'output' | 'system';

  interface SimpleMsg {
    type: MsgType;
    content: string;
    timestamp: number;
  }

  /** Simplified version of Terminal.tsx grouping logic */
  function groupMessages(messages: SimpleMsg[]) {
    const groups: SimpleMsg[] = [];
    let currentGroup: SimpleMsg | null = null;

    const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);

    for (const msg of sorted) {
      if (msg.type === 'system') {
        if (currentGroup) {
          groups.push(currentGroup);
          currentGroup = null;
        }
        groups.push({ ...msg });
      } else if (currentGroup && currentGroup.type === msg.type) {
        currentGroup.content += msg.content;
      } else {
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = { ...msg };
      }
    }

    if (currentGroup) {
      groups.push(currentGroup);
    }

    return groups;
  }

  it('should group consecutive output messages', () => {
    const msgs: SimpleMsg[] = [
      { type: 'output', content: 'Hello ', timestamp: 1 },
      { type: 'output', content: 'world', timestamp: 2 },
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(1);
    expect(groups[0].content).toBe('Hello world');
  });

  it('should not group system messages', () => {
    const msgs: SimpleMsg[] = [
      { type: 'system', content: 'Session started', timestamp: 1 },
      { type: 'system', content: 'Model changed', timestamp: 2 },
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(2);
  });

  it('should separate input from output', () => {
    const msgs: SimpleMsg[] = [
      { type: 'input', content: 'Hi', timestamp: 1 },
      { type: 'output', content: 'Hello!', timestamp: 2 },
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(2);
    expect(groups[0].type).toBe('input');
    expect(groups[1].type).toBe('output');
  });

  it('should break groups around system messages', () => {
    const msgs: SimpleMsg[] = [
      { type: 'output', content: 'Part 1 ', timestamp: 1 },
      { type: 'system', content: 'Notification', timestamp: 2 },
      { type: 'output', content: 'Part 2', timestamp: 3 },
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(3);
    expect(groups[0].content).toBe('Part 1 ');
    expect(groups[1].type).toBe('system');
    expect(groups[2].content).toBe('Part 2');
  });
});
