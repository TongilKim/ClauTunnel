import type { RealtimeChannel } from '@supabase/supabase-js';

const DEFAULT_TIMEOUT = 10000;

export function subscribeWithTimeout(
  channel: RealtimeChannel,
  channelName: string,
  timeout: number = DEFAULT_TIMEOUT
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let lastStatus = 'unknown';

    const timer = setTimeout(() => {
      console.warn(
        `[WARN] Realtime subscription timeout for ${channelName} (last status: ${lastStatus}).`
      );
      resolve(false);
    }, timeout);

    channel.subscribe((status, err) => {
      lastStatus = status;

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
          `[WARN] Channel ${channelName} ${status.toLowerCase()}.`
        );
        if (err) {
          console.warn(`[WARN] Error details: ${err.message || err}`);
        }
        resolve(false);
      }
    });
  });
}
