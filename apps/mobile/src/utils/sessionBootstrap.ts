interface ShouldPrimeSessionScreenParams {
  isTestModeEnabled: boolean;
  authIsLoading: boolean;
  userId: string | null | undefined;
  primedUserId: string | null;
}

export function shouldPrimeSessionScreen({
  isTestModeEnabled,
  authIsLoading,
  userId,
  primedUserId,
}: ShouldPrimeSessionScreenParams): boolean {
  if (isTestModeEnabled) return false;
  if (authIsLoading) return false;
  if (!userId) return false;
  return primedUserId !== userId;
}
