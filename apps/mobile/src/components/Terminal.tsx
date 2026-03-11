import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Modal,
  TextInput,
  Pressable,
  Keyboard,
  type LayoutChangeEvent,
} from 'react-native';
import { Image } from 'expo-image';
import Markdown from 'react-native-markdown-display';
import * as Clipboard from 'expo-clipboard';
import { useConnectionStore } from '../stores/connectionStore';
import { useSessionStore } from '../stores/sessionStore';
import type { RealtimeMessage, ToolUseData, ToolUseEditData, ToolUseWriteData, ToolUseGenericData } from 'clautunnel-shared';
import { parseToolUsage, shortenPath } from '../utils/terminalUtils';
import { CLAUDE_MARKDOWN_LAYOUT_FIXES } from '../utils/terminalMarkdownStyles';
import {
  isToolUseWidthHealthy,
  TOOL_USE_LAYOUT_FIXES,
} from '../utils/terminalToolUseStyles';
import { isTestMode } from '../utils/testMode';

/** Scroll offset threshold (px) from top to trigger loading older messages */
const SCROLL_LOAD_THRESHOLD = 200;
/** Delay (ms) before clearing pre-fetch state, allowing onContentSizeChange to fire first */
const PREFETCH_CLEAR_DELAY = 500;
const MESSAGE_ROW_GAP = 8;

interface GroupedMessage {
  type: 'input' | 'output' | 'system' | 'tool-use';
  content: string;
  timestamp: number;
  toolUseData?: ToolUseData;
  /** Stable key derived from the first message's seq in the group */
  key: string;
  /** Seq of the first message in the group – used for stable testIDs */
  seq: number;
}

// Avatar components using text-based icons
function UserAvatar() {
  return (
    <View style={[avatarStyles.avatar, avatarStyles.userAvatar]}>
      <Text style={avatarStyles.avatarText}>U</Text>
    </View>
  );
}

const claudeIconSource = require('../../assets/claude-icon.png');

function ClaudeAvatar() {
  return (
    <Image
      source={claudeIconSource}
      style={avatarStyles.claudeAvatarImage}
      cachePolicy="memory"
    />
  );
}

// Tool usage badge component
function ToolBadge({ toolName, isDark }: { toolName: string; isDark: boolean }) {
  return (
    <View style={[toolBadgeStyles.badge, isDark && toolBadgeStyles.badgeDark]}>
      <Text style={[toolBadgeStyles.icon]}>⚡</Text>
      <Text style={[toolBadgeStyles.text, isDark && toolBadgeStyles.textDark]}>
        {toolName}
      </Text>
    </View>
  );
}

export function Terminal() {
  const scrollViewRef = useRef<ScrollView>(null);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const {
    messages, state, isTyping, isMessageQueued, sessionId,
    registerScrollToBottom, fetchOlderMessages, isLoadingMore, hasMoreMessages,
  } = useConnectionStore();
  const { sessionOnlineStatus } = useSessionStore();
  const isCliOnline = sessionId ? (sessionOnlineStatus[sessionId] ?? null) : null;

  const hasInitiallyScrolled = useRef(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const prevLastSeqRef = useRef<number>(0);

  // Pagination scroll fix: save scroll state BEFORE fetch, adjust AFTER render
  const preFetchState = useRef<{ baseOffset: number; baseHeight: number } | null>(null);
  const isLoadingMoreRef = useRef(false);

  // Sync isLoadingMoreRef with store state
  useEffect(() => {
    isLoadingMoreRef.current = isLoadingMore;
  }, [isLoadingMore]);

  // Clear preFetchState after loading completes (give onContentSizeChange time to fire)
  useEffect(() => {
    if (!isLoadingMore && preFetchState.current) {
      const timer = setTimeout(() => {
        preFetchState.current = null;
      }, PREFETCH_CLEAR_DELAY);
      return () => clearTimeout(timer);
    }
  }, [isLoadingMore]);

  // Scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, []);

  // Register scroll function with the store so InputBar can trigger it
  useEffect(() => {
    registerScrollToBottom(scrollToBottom);
  }, [registerScrollToBottom, scrollToBottom]);

  // Reset on session change
  useEffect(() => {
    hasInitiallyScrolled.current = false;
    setIsInitialLoading(true);
    prevLastSeqRef.current = 0;
  }, [sessionId]);

  // Auto-scroll to bottom when NEW messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      const currentLastSeq = messages[messages.length - 1].seq;
      if (currentLastSeq > prevLastSeqRef.current && hasInitiallyScrolled.current) {
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
      prevLastSeqRef.current = currentLastSeq;
    }
  }, [messages, isTyping]);

  // Scroll to bottom when keyboard opens
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });
    return () => sub.remove();
  }, []);

  // Initial scroll: keep calling scrollToEnd on every content size change, reveal after stabilization
  const revealDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleContentSizeChange = useCallback((_w: number, h: number) => {
    // Handle pagination scroll position fix: adjust for prepended content
    if (preFetchState.current && hasInitiallyScrolled.current) {
      const delta = h - preFetchState.current.baseHeight;
      if (delta > 0) {
        scrollViewRef.current?.scrollTo({
          y: preFetchState.current.baseOffset + delta,
          animated: false,
        });
      }
      return; // Don't run initial scroll logic during pagination
    }

    // Handle initial scroll to bottom
    if (!hasInitiallyScrolled.current && messages.length > 0) {
      scrollViewRef.current?.scrollToEnd({ animated: false });
      if (revealDebounceRef.current) clearTimeout(revealDebounceRef.current);
      revealDebounceRef.current = setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: false });
        setTimeout(() => {
          hasInitiallyScrolled.current = true;
          setIsInitialLoading(false);
        }, 50);
      }, 300);
    }
  }, [messages.length]);

  // Pagination: load older messages when scrolling near the top
  const handleScroll = useCallback((event: any) => {
    if (!hasInitiallyScrolled.current) return;
    const { contentOffset, contentSize } = event.nativeEvent;
    if (contentOffset.y < SCROLL_LOAD_THRESHOLD && hasMoreMessages && !isLoadingMoreRef.current) {
      // Save scroll state BEFORE triggering fetch
      preFetchState.current = {
        baseOffset: contentOffset.y,
        baseHeight: contentSize.height,
      };
      fetchOlderMessages();
    }
  }, [hasMoreMessages, fetchOlderMessages]);

  // Group consecutive messages of the same type (except system messages)
  const groupedMessages = useMemo(() => {
    const groups: GroupedMessage[] = [];
    let currentGroup: GroupedMessage | null = null;

    // Sort messages by timestamp to ensure correct chronological order
    // (seq can't be used because mobile and CLI have separate seq counters)
    const sortedMessages = [...messages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    for (const msg of sortedMessages) {
      const msgType = msg.type === 'input' ? 'input' :
                      msg.type === 'output' ? 'output' :
                      msg.type === 'tool-use' ? 'tool-use' : 'system';

      // Input, system, and tool-use messages are never grouped — each gets its own bubble.
      // Only consecutive output chunks are grouped (Claude streams responses in parts).
      if (msgType === 'system' || msgType === 'tool-use' || msgType === 'input') {
        if (currentGroup) {
          groups.push(currentGroup);
          currentGroup = null;
        }
        groups.push({
          type: msgType,
          content: msg.content || '',
          timestamp: msg.timestamp,
          toolUseData: msg.toolUseData,
          key: `${msgType}-${msg.seq}`,
          seq: msg.seq,
        });
      } else if (currentGroup && currentGroup.type === msgType) {
        // Append to current group (only for output)
        // Add newline between chunks so line breaks are preserved when rendering
        const chunk = msg.content || '';
        if (chunk && !currentGroup.content.endsWith('\n') && !chunk.startsWith('\n')) {
          currentGroup.content += '\n' + chunk;
        } else {
          currentGroup.content += chunk;
        }
      } else {
        // Start new group
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = {
          type: msgType,
          content: msg.content || '',
          timestamp: msg.timestamp,
          key: `${msgType}-${msg.seq}`,
          seq: msg.seq,
        };
      }
    }

    if (currentGroup) {
      groups.push(currentGroup);
    }

    return groups;
  }, [messages]);

  // Top of list: loading indicator or "Beginning of conversation"
  const ListHeaderComponent = useMemo(() => {
    if (isLoadingMore) {
      return (
        <View style={styles.loadingMoreContainer}>
          <ActivityIndicator size="small" color={isDark ? '#9ca3af' : '#6b7280'} />
          <Text style={[styles.loadingMoreText, isDark && styles.loadingMoreTextDark]}>
            Loading older messages...
          </Text>
        </View>
      );
    }
    if (!hasMoreMessages && messages.length > 0) {
      return (
        <View style={styles.loadingMoreContainer}>
          <Text style={[styles.loadingMoreText, isDark && styles.loadingMoreTextDark]}>
            Beginning of conversation
          </Text>
        </View>
      );
    }
    return null;
  }, [isLoadingMore, hasMoreMessages, isDark, messages.length]);

  // Bottom of list: typing indicator
  const ListFooterComponent = useMemo(() => {
    if (isTyping) {
      return (
        <AnimatedBubble>
          <TypingIndicator isDark={isDark} isQueued={isMessageQueued} />
        </AnimatedBubble>
      );
    }
    return null;
  }, [isTyping, isDark, isMessageQueued]);


  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {state !== 'connected' && (
        <View style={[styles.statusBanner, styles[`status_${state}`]]}>
          <Text style={styles.statusText}>
            {state === 'connecting'
              ? 'Connecting...'
              : state === 'reconnecting'
                ? 'Reconnecting...'
                : 'Disconnected'}
          </Text>
        </View>
      )}
      {state === 'connected' && isCliOnline === false && (
        <View style={[styles.statusBanner, styles.status_cliOffline]}>
          <Text style={styles.statusText}>CLI Offline (laptop may be sleeping)</Text>
        </View>
      )}
      {isInitialLoading && messages.length > 0 && (
        <View style={styles.initialLoadingOverlay}>
          <ActivityIndicator size="small" color={isDark ? '#9ca3af' : '#6b7280'} />
        </View>
      )}
      <ScrollView
        testID="terminal-scrollview"
        ref={scrollViewRef}
        style={[styles.scrollView, isInitialLoading && messages.length > 0 && { opacity: 0 }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        onContentSizeChange={handleContentSizeChange}
      >
        {ListHeaderComponent}
        {groupedMessages.length === 0 && !isTyping ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>
              Send a message to start chatting with Claude
            </Text>
          </View>
        ) : (
          groupedMessages.map((group) => (
            <AnimatedBubble key={group.key}>
              {group.type === 'tool-use' && group.toolUseData ? (
                <CollapsibleToolUse
                  toolUseData={group.toolUseData}
                  isDark={isDark}
                  timestamp={group.timestamp}
                />
              ) : (
                <MessageBubble
                  message={group}
                  isDark={isDark}
                />
              )}
            </AnimatedBubble>
          ))
        )}
        {ListFooterComponent}
      </ScrollView>
    </View>
  );
}

// Animated wrapper for fade-in effect
function AnimatedBubble({ children }: { children: React.ReactNode }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
      }}
    >
      {children}
    </Animated.View>
  );
}

interface TypingIndicatorProps {
  isDark: boolean;
  isQueued?: boolean;
}

function TypingIndicator({ isDark, isQueued }: TypingIndicatorProps) {
  return (
    <View style={styles.messageRow}>
      <ClaudeAvatar />
      <View style={styles.bubbleContainerClaude}>
        <View style={[styles.typingBubble, isDark && styles.typingBubbleDark]}>
          <ActivityIndicator size="small" color={isDark ? '#9ca3af' : '#6b7280'} />
          <Text style={[styles.typingText, isDark && styles.typingTextDark]}>
            {isQueued ? 'Message queued, Claude is finishing up...' : 'Claude is working...'}
          </Text>
        </View>
      </View>
    </View>
  );
}

interface MessageBubbleProps {
  message: GroupedMessage;
  isDark: boolean;
}

function MessageBubble({ message, isDark }: MessageBubbleProps) {
  const isUser = message.type === 'input';
  const isSystem = message.type === 'system';
  const [showSelectModal, setShowSelectModal] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);

  // Clean up the content - remove excessive whitespace for user messages
  const rawContent = isUser
    ? message.content.trim()
    : message.content;

  // Parse tool usage for Claude messages
  const { tools, cleanContent } = isUser
    ? { tools: [], cleanContent: rawContent }
    : parseToolUsage(rawContent);

  // Skip empty messages (but show if there are tools)
  if (!cleanContent.trim() && tools.length === 0) {
    return null;
  }

  // Format timestamp
  const formattedTime = formatTimestamp(message.timestamp);

  // Copy full message to clipboard
  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(cleanContent);
    setShowActionMenu(false);
  }, [cleanContent]);

  // Open modal for text selection
  const handleSelect = useCallback(() => {
    setShowActionMenu(false);
    setShowSelectModal(true);
  }, []);

  // Long press handler to show action menu
  const handleLongPress = useCallback(() => {
    setShowActionMenu(true);
  }, []);

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text style={[styles.systemText, isDark && styles.systemTextDark]}>
          {rawContent}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
      {!isUser && <ClaudeAvatar />}
      <View
        style={[
          styles.bubbleContainer,
          isUser ? styles.bubbleContainerUser : styles.bubbleContainerClaude,
        ]}
      >
        {/* Tool badges */}
        {tools.length > 0 && (
          <View style={styles.toolBadgesContainer}>
            {tools.map((tool, index) => (
              <ToolBadge key={index} toolName={tool} isDark={isDark} />
            ))}
          </View>
        )}

        {/* Message bubble with long-press for copy options */}
        {cleanContent.trim() && (
          <Pressable onLongPress={handleLongPress} delayLongPress={300}>
            <View
              testID={isUser ? `user-message-bubble-${message.seq}` : undefined}
              style={[
                styles.bubble,
                isUser
                  ? [styles.bubbleUser, isDark && styles.bubbleUserDark]
                  : [styles.bubbleClaude, isDark && styles.bubbleClaudeDark],
              ]}
            >
              {isUser ? (
                <Text style={styles.bubbleTextUser}>
                  {cleanContent}
                </Text>
              ) : (
                <ClaudeMessage content={cleanContent} isDark={isDark} />
              )}
            </View>
          </Pressable>
        )}

        {/* Timestamp and status */}
        <View style={[styles.timestampRow, isUser && styles.timestampRowUser]}>
          <Text
            style={[
              styles.timestamp,
              isDark && styles.timestampDark,
            ]}
          >
            {isUser ? 'You' : 'Claude'} · {formattedTime}
          </Text>
          {isUser && (
            <Text style={[styles.statusIndicator, isDark && styles.statusIndicatorDark]}>
              ✓
            </Text>
          )}
        </View>
      </View>
      {isUser && <UserAvatar />}

      {/* Action menu modal (shown on long-press) */}
      <Modal
        visible={showActionMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActionMenu(false)}
      >
        <Pressable
          style={styles.actionMenuOverlay}
          onPress={() => setShowActionMenu(false)}
        >
          <View style={[styles.actionMenuContainer, isDark && styles.actionMenuContainerDark]}>
            <TouchableOpacity
              style={[styles.actionMenuItem, isDark && styles.actionMenuItemDark]}
              onPress={handleCopy}
            >
              <Text style={[styles.actionMenuText, isDark && styles.actionMenuTextDark]}>
                Copy All
              </Text>
            </TouchableOpacity>
            <View style={[styles.actionMenuDivider, isDark && styles.actionMenuDividerDark]} />
            <TouchableOpacity
              style={[styles.actionMenuItem, isDark && styles.actionMenuItemDark]}
              onPress={handleSelect}
            >
              <Text style={[styles.actionMenuText, isDark && styles.actionMenuTextDark]}>
                Select Text
              </Text>
            </TouchableOpacity>
            <View style={[styles.actionMenuDivider, isDark && styles.actionMenuDividerDark]} />
            <TouchableOpacity
              style={[styles.actionMenuItem, isDark && styles.actionMenuItemDark]}
              onPress={() => setShowActionMenu(false)}
            >
              <Text style={[styles.actionMenuCancelText]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Text selection modal (bottom sheet) */}
      <Modal
        visible={showSelectModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSelectModal(false)}
      >
        <View style={styles.selectOverlay}>
          <View style={styles.selectBackdrop} />
          <View
            style={[
              styles.selectSheet,
              isDark && styles.selectSheetDark,
            ]}
          >
            <View style={styles.selectHandle} />

            <Text style={[styles.selectTitle, isDark && styles.selectTitleDark]}>
              Select Text
            </Text>

            <Text style={[styles.selectHint, isDark && styles.selectHintDark]}>
              Tap and hold to select text, then copy
            </Text>

            <View style={[styles.selectTextCard, isDark && styles.selectTextCardDark]}>
              <TextInput
                style={[styles.selectableText, isDark && styles.selectableTextDark]}
                value={cleanContent}
                multiline
                editable={false}
                selectTextOnFocus
                scrollEnabled
              />
            </View>

            <TouchableOpacity
              style={[styles.selectCopyButton, isDark && styles.selectCopyButtonDark]}
              onPress={async () => {
                await handleCopy();
                setShowSelectModal(false);
              }}
            >
              <Text style={styles.selectCopyButtonText}>Copy All</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.selectCloseButton, isDark && styles.selectCloseButtonDark]}
              onPress={() => setShowSelectModal(false)}
            >
              <Text style={[styles.selectCloseText, isDark && styles.selectCloseTextDark]}>
                Done
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

interface ClaudeMessageProps {
  content: string;
  isDark: boolean;
}

function ClaudeMessage({ content, isDark }: ClaudeMessageProps) {
  const copyToClipboard = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text);
  }, []);

  // Markdown styles
  const markdownStyles = useMemo(() => ({
    body: {
      color: isDark ? '#e5e5e5' : '#1f2937',
      fontSize: 14,
      lineHeight: 20,
      ...CLAUDE_MARKDOWN_LAYOUT_FIXES.body,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 8,
      ...CLAUDE_MARKDOWN_LAYOUT_FIXES.paragraph,
    },
    textgroup: {
      ...CLAUDE_MARKDOWN_LAYOUT_FIXES.textgroup,
    },
    heading1: {
      color: isDark ? '#ffffff' : '#111827',
      fontSize: 20,
      fontWeight: 'bold' as const,
      marginBottom: 8,
      marginTop: 12,
    },
    heading2: {
      color: isDark ? '#ffffff' : '#111827',
      fontSize: 18,
      fontWeight: 'bold' as const,
      marginBottom: 6,
      marginTop: 10,
    },
    heading3: {
      color: isDark ? '#ffffff' : '#111827',
      fontSize: 16,
      fontWeight: 'bold' as const,
      marginBottom: 4,
      marginTop: 8,
    },
    strong: {
      fontWeight: 'bold' as const,
    },
    em: {
      fontStyle: 'italic' as const,
    },
    code_inline: {
      backgroundColor: isDark ? '#374151' : '#f3f4f6',
      color: isDark ? '#fbbf24' : '#dc2626',
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 4,
      fontFamily: 'monospace',
      fontSize: 13,
    },
    code_block: {
      backgroundColor: isDark ? '#1e1e1e' : '#1f2937',
      color: isDark ? '#d4d4d4' : '#e5e7eb',
      padding: 12,
      borderRadius: 8,
      fontFamily: 'monospace',
      fontSize: 13,
      marginVertical: 8,
      overflow: 'hidden' as const,
    },
    fence: {
      backgroundColor: isDark ? '#1e1e1e' : '#1f2937',
      color: isDark ? '#d4d4d4' : '#e5e7eb',
      padding: 12,
      borderRadius: 8,
      fontFamily: 'monospace',
      fontSize: 13,
      marginVertical: 8,
    },
    blockquote: {
      backgroundColor: isDark ? '#374151' : '#f9fafb',
      borderLeftColor: isDark ? '#6b7280' : '#d1d5db',
      borderLeftWidth: 4,
      paddingLeft: 12,
      paddingVertical: 4,
      marginVertical: 8,
    },
    list_item: {
      marginBottom: 4,
    },
    bullet_list: {
      marginBottom: 8,
    },
    ordered_list: {
      marginBottom: 8,
    },
    link: {
      color: '#3b82f6',
    },
    hr: {
      backgroundColor: isDark ? '#4b5563' : '#e5e7eb',
      height: 1,
      marginVertical: 12,
    },
  }), [isDark]);

  // Custom code block renderer with copy button
  const renderCodeBlock = useCallback((node: any, children: any, parent: any, styles: any) => {
    const codeContent = node.content || '';
    return (
      <View key={node.key} style={codeBlockStyles.container}>
        <View style={[codeBlockStyles.header, isDark && codeBlockStyles.headerDark]}>
          <Text style={codeBlockStyles.language}>
            {node.sourceInfo || 'code'}
          </Text>
          <TouchableOpacity
            onPress={() => copyToClipboard(codeContent)}
            style={codeBlockStyles.copyButton}
          >
            <Text style={codeBlockStyles.copyText}>
              Copy
            </Text>
          </TouchableOpacity>
        </View>
        <View style={[codeBlockStyles.codeContainer, isDark && codeBlockStyles.codeContainerDark]}>
          <Text style={[codeBlockStyles.code, isDark && codeBlockStyles.codeDark]}>
            {codeContent}
          </Text>
        </View>
      </View>
    );
  }, [isDark, copyToClipboard]);

  // Convert single newlines to double newlines so Markdown renders them
  // as paragraph breaks instead of collapsing them into spaces
  const processedContent = useMemo(() => {
    return content.replace(/\n(?!\n)/g, '\n\n');
  }, [content]);

  return (
    <Markdown
      style={markdownStyles}
      rules={{
        fence: renderCodeBlock,
        code_block: renderCodeBlock,
      }}
    >
      {processedContent}
    </Markdown>
  );
}

// Collapsible tool use component for displaying diffs
interface CollapsibleToolUseProps {
  toolUseData: ToolUseData;
  isDark: boolean;
  timestamp: number;
}

function CollapsibleToolUse({ toolUseData, isDark, timestamp }: CollapsibleToolUseProps) {
  const [expanded, setExpanded] = useState(false);
  const [rowWidth, setRowWidth] = useState(0);
  const [avatarWidth, setAvatarWidth] = useState(0);
  const [headerWidth, setHeaderWidth] = useState(0);
  const formattedTime = formatTimestamp(timestamp);
  const shouldShowTestProbe = isTestMode();

  const getHeaderLabel = () => {
    switch (toolUseData.action) {
      case 'Edit':
        return `Edit: ${shortenPath((toolUseData as ToolUseEditData).filePath)}`;
      case 'Write':
        return `Write: ${shortenPath((toolUseData as ToolUseWriteData).filePath)}`;
      default:
        return `Tool: ${(toolUseData as ToolUseGenericData).toolName}`;
    }
  };

  const handleRowLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setRowWidth((prevWidth) => (Math.abs(prevWidth - nextWidth) < 0.5 ? prevWidth : nextWidth));
  }, []);

  const handleAvatarLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setAvatarWidth((prevWidth) => (Math.abs(prevWidth - nextWidth) < 0.5 ? prevWidth : nextWidth));
  }, []);

  const handleHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setHeaderWidth((prevWidth) => (Math.abs(prevWidth - nextWidth) < 0.5 ? prevWidth : nextWidth));
  }, []);

  const hasWidthMeasurement = rowWidth > 0 && avatarWidth > 0 && headerWidth > 0;
  const isWidthHealthy = hasWidthMeasurement && isToolUseWidthHealthy(
    headerWidth,
    rowWidth,
    avatarWidth,
    MESSAGE_ROW_GAP,
  );

  return (
    <View
      testID="tool-use-card"
      style={styles.messageRow}
      onLayout={shouldShowTestProbe ? handleRowLayout : undefined}
    >
      {shouldShowTestProbe ? (
        <View onLayout={handleAvatarLayout}>
          <ClaudeAvatar />
        </View>
      ) : (
        <ClaudeAvatar />
      )}
      <View
        style={[
          styles.bubbleContainer,
          styles.bubbleContainerClaude,
          TOOL_USE_LAYOUT_FIXES.container,
        ]}
      >
        <TouchableOpacity
          testID="tool-use-card-header"
          onPress={() => setExpanded(!expanded)}
          onLayout={shouldShowTestProbe ? handleHeaderLayout : undefined}
          style={[
            diffStyles.header,
            TOOL_USE_LAYOUT_FIXES.contentWidth,
            isDark && diffStyles.headerDark,
          ]}
          activeOpacity={0.7}
        >
          <View style={[diffStyles.headerLeft, TOOL_USE_LAYOUT_FIXES.headerLeft]}>
            <Text style={[diffStyles.headerIcon, isDark && diffStyles.headerIconDark]}>
              {toolUseData.action === 'Edit' ? '\u270E' : toolUseData.action === 'Write' ? '\u2710' : '\u2699'}
            </Text>
            <Text
              testID="tool-use-card-title"
              style={[
                diffStyles.headerText,
                TOOL_USE_LAYOUT_FIXES.headerText,
                isDark && diffStyles.headerTextDark,
              ]}
              numberOfLines={1}
            >
              {getHeaderLabel()}
            </Text>
          </View>
          <Text style={[diffStyles.chevron, isDark && diffStyles.chevronDark]}>
            {expanded ? '\u25B2' : '\u25BC'}
          </Text>
        </TouchableOpacity>

        {expanded && (
          <View
            testID="tool-use-card-body"
            style={[
              diffStyles.body,
              TOOL_USE_LAYOUT_FIXES.contentWidth,
              isDark && diffStyles.bodyDark,
            ]}
          >
            {toolUseData.action === 'Edit' ? (
              <EditDiffContent data={toolUseData as ToolUseEditData} isDark={isDark} />
            ) : toolUseData.action === 'Write' ? (
              <WriteContent data={toolUseData as ToolUseWriteData} isDark={isDark} />
            ) : (
              <GenericToolContent data={toolUseData as ToolUseGenericData} isDark={isDark} />
            )}
          </View>
        )}

        <View style={styles.timestampRow}>
          <Text style={[styles.timestamp, isDark && styles.timestampDark]}>
            Claude · {formattedTime}
          </Text>
        </View>
        {shouldShowTestProbe && hasWidthMeasurement && (
          <View
            testID={isWidthHealthy ? 'tool-use-width-ok' : 'tool-use-width-bad'}
            style={styles.toolUseProbeDot}
          />
        )}
      </View>
    </View>
  );
}

function EditDiffContent({ data, isDark }: { data: ToolUseEditData; isDark: boolean }) {
  return (
    <ScrollView style={diffStyles.scrollContainer} nestedScrollEnabled scrollsToTop={false}>
      <Text style={[diffStyles.filePath, isDark && diffStyles.filePathDark]}>
        {data.filePath}
      </Text>
      {data.oldString.trim() !== '' && (
        <View style={[diffStyles.removedBlock, isDark && diffStyles.removedBlockDark]}>
          {data.oldString.split('\n').map((line, i) => (
            <Text key={`old-${i}`} style={[diffStyles.diffLine, diffStyles.removedLine, isDark && diffStyles.removedLineDark]}>
              {'- '}{line}
            </Text>
          ))}
        </View>
      )}
      {data.newString.trim() !== '' && (
        <View style={[diffStyles.addedBlock, isDark && diffStyles.addedBlockDark]}>
          {data.newString.split('\n').map((line, i) => (
            <Text key={`new-${i}`} style={[diffStyles.diffLine, diffStyles.addedLine, isDark && diffStyles.addedLineDark]}>
              {'+ '}{line}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function WriteContent({ data, isDark }: { data: ToolUseWriteData; isDark: boolean }) {
  const displayContent = data.content.length > 2000
    ? data.content.slice(0, 2000) + '\n... (truncated)'
    : data.content;

  return (
    <ScrollView style={diffStyles.scrollContainer} nestedScrollEnabled scrollsToTop={false}>
      <Text style={[diffStyles.filePath, isDark && diffStyles.filePathDark]}>
        {data.filePath}
      </Text>
      <View style={[diffStyles.codeBlock, isDark && diffStyles.codeBlockDark]}>
        <Text style={[diffStyles.codeText, isDark && diffStyles.codeTextDark]}>
          {displayContent}
        </Text>
      </View>
    </ScrollView>
  );
}

function GenericToolContent({ data, isDark }: { data: ToolUseGenericData; isDark: boolean }) {
  const inputStr = JSON.stringify(data.input, null, 2);
  const displayContent = inputStr.length > 1000
    ? inputStr.slice(0, 1000) + '\n... (truncated)'
    : inputStr;

  return (
    <ScrollView style={diffStyles.scrollContainer} nestedScrollEnabled scrollsToTop={false}>
      <View style={[diffStyles.codeBlock, isDark && diffStyles.codeBlockDark]}>
        <Text style={[diffStyles.codeText, isDark && diffStyles.codeTextDark]}>
          {displayContent}
        </Text>
      </View>
    </ScrollView>
  );
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  const timeStr = `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`;

  if (isToday) {
    return timeStr;
  }

  // If not today, include the date
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}/${day} ${timeStr}`;
}

const avatarStyles = StyleSheet.create({
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  userAvatar: {
    backgroundColor: '#3b82f6',
  },
  claudeAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginTop: 4,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});

const toolBadgeStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 6,
    alignSelf: 'flex-start',
    gap: 4,
  },
  badgeDark: {
    backgroundColor: '#422006',
  },
  icon: {
    fontSize: 10,
  },
  text: {
    fontSize: 11,
    fontWeight: '500',
    color: '#92400e',
  },
  textDark: {
    color: '#fbbf24',
  },
});

const codeBlockStyles = StyleSheet.create({
  container: {
    marginVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#374151',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerDark: {
    backgroundColor: '#2d2d2d',
  },
  language: {
    color: '#9ca3af',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  copyButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  copyText: {
    color: '#9ca3af',
    fontSize: 12,
  },
  codeContainer: {
    backgroundColor: '#1f2937',
    padding: 12,
  },
  codeContainerDark: {
    backgroundColor: '#1e1e1e',
  },
  code: {
    color: '#e5e7eb',
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  codeDark: {
    color: '#d4d4d4',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  containerDark: {
    backgroundColor: '#0a0a0a',
  },
  statusBanner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  status_disconnected: {
    backgroundColor: '#ef4444',
  },
  status_connecting: {
    backgroundColor: '#f59e0b',
  },
  status_reconnecting: {
    backgroundColor: '#f59e0b',
  },
  status_connected: {
    backgroundColor: '#22c55e',
  },
  status_cliOffline: {
    backgroundColor: '#6b7280',
  },
  statusText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 20,
  },
  initialLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    zIndex: 1,
  },
  loadingMoreContainer: {
    alignItems: 'center' as const,
    paddingVertical: 16,
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  loadingMoreText: {
    fontSize: 12,
    color: '#6b7280',
  },
  loadingMoreTextDark: {
    color: '#9ca3af',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
  },
  emptyTextDark: {
    color: '#9ca3af',
  },
  // Message row with avatar
  messageRow: {
    flexDirection: 'row',
    marginVertical: 4,
    gap: MESSAGE_ROW_GAP,
    alignItems: 'flex-start',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  // Bubble container
  bubbleContainer: {
    maxWidth: '75%',
    flexShrink: 1,
    minWidth: 0,
  },
  bubbleContainerUser: {
    alignItems: 'flex-end',
  },
  bubbleContainerClaude: {
    alignItems: 'flex-start',
  },
  // Tool badges container
  toolBadgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 4,
  },
  // Bubble styles
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    // Clamp the inner bubble to the container cap during markdown reflow.
    maxWidth: '100%',
    overflow: 'hidden' as const,
  },
  bubbleUser: {
    backgroundColor: '#3b82f6',
    borderBottomRightRadius: 4,
  },
  bubbleUserDark: {
    backgroundColor: '#2563eb',
  },
  bubbleClaude: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  bubbleClaudeDark: {
    backgroundColor: '#1f1f1f',
    borderColor: '#333333',
  },
  // Typing indicator
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 8,
  },
  typingBubbleDark: {
    backgroundColor: '#1f1f1f',
    borderColor: '#333333',
  },
  typingText: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  typingTextDark: {
    color: '#9ca3af',
  },
  // Text styles
  bubbleTextUser: {
    fontSize: 15,
    lineHeight: 20,
    color: '#ffffff',
  },
  // Timestamp row
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  timestampRowUser: {
    justifyContent: 'flex-end',
  },
  timestamp: {
    fontSize: 11,
    color: '#9ca3af',
  },
  timestampDark: {
    color: '#6b7280',
  },
  toolUseProbeDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 1,
    height: 1,
    borderRadius: 0.5,
    backgroundColor: '#22c55e',
    opacity: 0.02,
  },
  // Status indicator
  statusIndicator: {
    fontSize: 11,
    color: '#22c55e',
  },
  statusIndicatorDark: {
    color: '#4ade80',
  },
  // Action menu (long-press)
  actionMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  actionMenuContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    width: '100%',
    maxWidth: 300,
    overflow: 'hidden',
  },
  actionMenuContainerDark: {
    backgroundColor: '#2c2c2e',
  },
  actionMenuItem: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionMenuItemDark: {},
  actionMenuText: {
    fontSize: 17,
    color: '#007aff',
  },
  actionMenuTextDark: {
    color: '#0a84ff',
  },
  actionMenuCancelText: {
    fontSize: 17,
    color: '#ff3b30',
    fontWeight: '600',
  },
  actionMenuDivider: {
    height: 1,
    backgroundColor: '#e5e5ea',
  },
  actionMenuDividerDark: {
    backgroundColor: '#38383a',
  },
  // Text selection bottom sheet
  selectOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  selectBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  selectSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  selectSheetDark: {
    backgroundColor: '#1f1f1f',
  },
  selectHandle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#d1d5db',
    alignSelf: 'center',
    marginBottom: 16,
  },
  selectTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  selectTitleDark: {
    color: '#f9fafb',
  },
  selectHint: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 12,
  },
  selectHintDark: {
    color: '#9ca3af',
  },
  selectTextCard: {
    maxHeight: 300,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 16,
  },
  selectTextCardDark: {
    backgroundColor: '#2d2d2d',
    borderColor: '#4b5563',
  },
  selectableText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1f2937',
    textAlignVertical: 'top',
  },
  selectableTextDark: {
    color: '#e5e5e5',
  },
  selectCopyButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  selectCopyButtonDark: {
    backgroundColor: '#2563eb',
  },
  selectCopyButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  selectCloseButton: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },
  selectCloseButtonDark: {
    backgroundColor: '#374151',
  },
  selectCloseText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  selectCloseTextDark: {
    color: '#d1d5db',
  },
  // System message
  systemContainer: {
    alignItems: 'center',
    marginVertical: 8,
  },
  systemText: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  systemTextDark: {
    color: '#9ca3af',
  },
});

const diffStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  headerDark: {
    backgroundColor: '#1f1f1f',
    borderColor: '#333333',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  headerIcon: {
    fontSize: 14,
    color: '#6b7280',
  },
  headerIconDark: {
    color: '#9ca3af',
  },
  headerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    fontFamily: 'monospace',
    flex: 1,
  },
  headerTextDark: {
    color: '#d1d5db',
  },
  chevron: {
    fontSize: 10,
    color: '#6b7280',
    marginLeft: 8,
  },
  chevronDark: {
    color: '#9ca3af',
  },
  body: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginTop: 4,
    overflow: 'hidden',
  },
  bodyDark: {
    backgroundColor: '#111111',
    borderColor: '#333333',
  },
  scrollContainer: {
    maxHeight: 300,
    padding: 8,
    flexGrow: 0,
  },
  filePath: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#6b7280',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  filePathDark: {
    color: '#9ca3af',
  },
  removedBlock: {
    backgroundColor: '#fef2f2',
    borderRadius: 4,
    padding: 8,
    marginBottom: 4,
  },
  removedBlockDark: {
    backgroundColor: '#1c0f0f',
  },
  addedBlock: {
    backgroundColor: '#f0fdf4',
    borderRadius: 4,
    padding: 8,
  },
  addedBlockDark: {
    backgroundColor: '#0f1c14',
  },
  diffLine: {
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  removedLine: {
    color: '#dc2626',
  },
  removedLineDark: {
    color: '#f87171',
  },
  addedLine: {
    color: '#16a34a',
  },
  addedLineDark: {
    color: '#4ade80',
  },
  codeBlock: {
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    padding: 8,
  },
  codeBlockDark: {
    backgroundColor: '#1e1e1e',
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
    color: '#1f2937',
  },
  codeTextDark: {
    color: '#d4d4d4',
  },
});
