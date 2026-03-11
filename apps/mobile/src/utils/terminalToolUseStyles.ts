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

export const ASSISTANT_BUBBLE_MAX_WIDTH_RATIO = 0.75;
export const TOOL_USE_WIDTH_RATIO_TOLERANCE = 0.05;

export function getToolUseAvailableWidth(
  rowWidth: number,
  avatarWidth: number,
  rowGap: number,
): number {
  return Math.max(0, rowWidth - avatarWidth - rowGap);
}

export function getToolUseMinHealthyRatio(
  rowWidth: number,
  avatarWidth: number,
  rowGap: number,
): number {
  const availableWidth = getToolUseAvailableWidth(rowWidth, avatarWidth, rowGap);

  if (rowWidth <= 0 || availableWidth <= 0) {
    return 0;
  }

  const targetRatio = (rowWidth * ASSISTANT_BUBBLE_MAX_WIDTH_RATIO) / availableWidth;
  return Math.max(0, targetRatio - TOOL_USE_WIDTH_RATIO_TOLERANCE);
}

export function isToolUseWidthHealthy(
  bubbleWidth: number,
  rowWidth: number,
  avatarWidth: number,
  rowGap: number,
): boolean {
  const availableWidth = getToolUseAvailableWidth(rowWidth, avatarWidth, rowGap);

  if (bubbleWidth <= 0 || availableWidth <= 0) {
    return false;
  }

  return bubbleWidth / availableWidth >= getToolUseMinHealthyRatio(rowWidth, avatarWidth, rowGap);
}
