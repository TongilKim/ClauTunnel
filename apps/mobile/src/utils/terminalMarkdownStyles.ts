/**
 * react-native-markdown-display renders paragraphs as row-wrapped Views with
 * width: '100%' by default. Inside a constrained chat bubble that can create
 * oversized layout passes and clipped text when the bubble hides overflow.
 */
export const CLAUDE_MARKDOWN_LAYOUT_FIXES = {
  body: {
    flexShrink: 1,
    minWidth: 0,
  },
  paragraph: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    width: 'auto' as const,
    minWidth: 0,
  },
  textgroup: {
    flexShrink: 1,
  },
} as const;
