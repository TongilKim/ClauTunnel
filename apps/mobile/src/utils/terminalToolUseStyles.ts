export const TOOL_USE_LAYOUT_FIXES = {
  container: {
    flex: 1,
    minWidth: 0,
  },
  contentWidth: {
    width: '100%',
    minWidth: 0,
  },
  headerLeft: {
    minWidth: 0,
  },
  headerText: {
    flexShrink: 1,
    minWidth: 0,
  },
} as const;

export const TOOL_USE_WIDTH_RATIO_THRESHOLD = 0.65;

export function isToolUseWidthHealthy(widthRatio: number): boolean {
  return widthRatio >= TOOL_USE_WIDTH_RATIO_THRESHOLD;
}
