import type { RealtimeChannel } from '@supabase/supabase-js';

const DEFAULT_TIMEOUT = 10000;

export function subscribeWithTimeout(
  channel: RealtimeChannel,
  channelName: string,
  timeout: number = DEFAULT_TIMEOUT
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      console.warn(
        `[WARN] Realtime subscription timeout for ${channelName}. Mobile sync disabled.`
      );
      resolve(false);
    }, timeout);

    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve(true);
      } else if (
        status === 'CHANNEL_ERROR' ||
        status === 'CLOSED' ||
        status === 'TIMED_OUT'
      ) {
        clearTimeout(timer);
        console.warn(
          `[WARN] Channel ${channelName} ${status.toLowerCase()}. Mobile sync disabled.`
        );
        if (err) {
          console.warn(`[WARN] Error details: ${err.message || err}`);
        }
        resolve(false);
      }
    });
  });
}
