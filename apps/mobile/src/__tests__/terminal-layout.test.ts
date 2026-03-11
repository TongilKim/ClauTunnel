import { describe, it, expect } from 'vitest';
import { parseToolUsage } from '../utils/terminalUtils';
import { CLAUDE_MARKDOWN_LAYOUT_FIXES } from '../utils/terminalMarkdownStyles';

/**
 * Terminal message bubble layout and utility tests.
 */

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

describe('Claude markdown layout fixes', () => {
  it('should let the markdown body shrink inside a capped bubble', () => {
    expect(CLAUDE_MARKDOWN_LAYOUT_FIXES.body.flexShrink).toBe(1);
    expect(CLAUDE_MARKDOWN_LAYOUT_FIXES.body.minWidth).toBe(0);
  });

  it('should override paragraph width so wrapped text does not keep the library default', () => {
    expect(CLAUDE_MARKDOWN_LAYOUT_FIXES.paragraph.width).toBe('auto');
    expect(CLAUDE_MARKDOWN_LAYOUT_FIXES.paragraph.flexDirection).toBe('row');
    expect(CLAUDE_MARKDOWN_LAYOUT_FIXES.paragraph.flexWrap).toBe('wrap');
    expect(CLAUDE_MARKDOWN_LAYOUT_FIXES.paragraph.minWidth).toBe(0);
  });

  it('should allow markdown text groups to shrink instead of clipping', () => {
    expect(CLAUDE_MARKDOWN_LAYOUT_FIXES.textgroup.flexShrink).toBe(1);
    expect(CLAUDE_MARKDOWN_LAYOUT_FIXES.textgroup.minWidth).toBe(0);
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
