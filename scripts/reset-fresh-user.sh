#!/usr/bin/env bash
set -euo pipefail

# Reset local environment to first-time user state.
# Usage: ./scripts/reset-fresh-user.sh

CONFIG_DIR="$HOME/.clautunnel"
CONFIG_FILE="$CONFIG_DIR/config.json"

echo "=== ClauTunnel Fresh User Reset ==="
echo ""

# ─── Step 0: Kill running processes ──────────────────────────────────────────

echo "[0/5] Stopping running processes..."
if pgrep -f "clautunnel" > /dev/null 2>&1; then
  pkill -f "clautunnel" 2>/dev/null && echo "  - clautunnel stopped" || echo "  - clautunnel: could not stop"
else
  echo "  - clautunnel: not running"
fi
if pgrep -x "ngrok" > /dev/null 2>&1; then
  killall ngrok 2>/dev/null && echo "  - ngrok stopped" || echo "  - ngrok: could not stop"
else
  echo "  - ngrok: not running"
fi

# ─── Step 1: Clean Supabase DB (before deleting local config) ───────────────

if [ -f "$CONFIG_FILE" ]; then
  SUPABASE_URL=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('supabaseUrl',''))" 2>/dev/null || true)
  SUPABASE_ANON_KEY=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('supabaseAnonKey',''))" 2>/dev/null || true)
  ACCESS_TOKEN=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('sessionTokens',{}).get('accessToken',''))" 2>/dev/null || true)
  REFRESH_TOKEN=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('sessionTokens',{}).get('refreshToken',''))" 2>/dev/null || true)

  if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_ANON_KEY" ] && [ -n "$ACCESS_TOKEN" ]; then
    echo "[1/5] Cleaning Supabase DB data..."

    # Refresh the session token first (it may be expired)
    REFRESH_RESP=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=refresh_token" \
      -H "apikey: $SUPABASE_ANON_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"refresh_token\": \"$REFRESH_TOKEN\"}" 2>/dev/null || true)

    NEW_TOKEN=$(echo "$REFRESH_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)
    if [ -n "$NEW_TOKEN" ]; then
      ACCESS_TOKEN="$NEW_TOKEN"
    fi

    AUTH_HEADER="Bearer $ACCESS_TOKEN"

    # Delete push_tokens (no cascade from machines)
    curl -s -X DELETE "$SUPABASE_URL/rest/v1/push_tokens?select=*" \
      -H "apikey: $SUPABASE_ANON_KEY" \
      -H "Authorization: $AUTH_HEADER" \
      -H "Prefer: return=minimal" > /dev/null 2>&1 && echo "  - push_tokens cleared" || echo "  - push_tokens: skipped"

    # Delete machines (cascades to sessions -> messages)
    curl -s -X DELETE "$SUPABASE_URL/rest/v1/machines?select=*" \
      -H "apikey: $SUPABASE_ANON_KEY" \
      -H "Authorization: $AUTH_HEADER" \
      -H "Prefer: return=minimal" > /dev/null 2>&1 && echo "  - machines cleared (sessions + messages cascade)" || echo "  - machines: skipped"
  else
    echo "[1/5] Skipping DB cleanup (missing credentials)"
  fi
else
  echo "[1/5] Skipping DB cleanup (no config file found)"
fi

# ─── Step 2: Uninstall CLI (npm) ────────────────────────────────────────────

echo "[2/5] Uninstalling CLI (npm)..."
if npm list -g @tongil_kim/clautunnel > /dev/null 2>&1; then
  npm uninstall -g @tongil_kim/clautunnel
  echo "  - npm package removed"
else
  echo "  - not installed via npm, skipped"
fi

# ─── Step 3: Uninstall CLI (Homebrew) ───────────────────────────────────────

echo "[3/5] Uninstalling CLI (Homebrew)..."
if brew list clautunnel > /dev/null 2>&1; then
  brew uninstall clautunnel
  echo "  - Homebrew package removed"
else
  echo "  - not installed via Homebrew, skipped"
fi

# ─── Step 4: Uninstall ngrok ────────────────────────────────────────────────

echo "[4/5] Uninstalling ngrok..."
if brew list ngrok > /dev/null 2>&1; then
  brew uninstall ngrok
  echo "  - ngrok removed"
elif command -v ngrok > /dev/null 2>&1; then
  echo "  - ngrok found but not installed via Homebrew, remove manually"
else
  echo "  - not installed, skipped"
fi

# Remove ngrok config (authtoken persists after uninstall)
NGROK_CONFIG_MACOS="$HOME/Library/Application Support/ngrok/ngrok.yml"
NGROK_CONFIG_LINUX="$HOME/.config/ngrok/ngrok.yml"
if [ -f "$NGROK_CONFIG_MACOS" ]; then
  rm -f "$NGROK_CONFIG_MACOS"
  echo "  - ngrok config removed ($NGROK_CONFIG_MACOS)"
elif [ -f "$NGROK_CONFIG_LINUX" ]; then
  rm -f "$NGROK_CONFIG_LINUX"
  echo "  - ngrok config removed ($NGROK_CONFIG_LINUX)"
else
  echo "  - ngrok config: already clean"
fi

# ─── Step 5: Remove local data ──────────────────────────────────────────────

echo "[5/5] Removing local data (~/.clautunnel)..."
if [ -d "$CONFIG_DIR" ]; then
  rm -rf "$CONFIG_DIR"
  echo "  - config, logs, repo removed"
else
  echo "  - already clean"
fi

# ─── Clean local dev .env (bootstrap code may linger) ────────────────────────
# Note: mobile_auth_bootstraps table rows are auto-cleaned by the Edge Function
# and protected by RLS (USING false), so we skip DB-level cleanup here.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MOBILE_ENV="$SCRIPT_DIR/../apps/mobile/.env"
if [ -f "$MOBILE_ENV" ]; then
  rm -f "$MOBILE_ENV"
  echo "  - apps/mobile/.env removed"
fi

echo ""
echo "Done! Fresh user state restored."
echo ""
echo "Next steps:"
echo "  1. Delete Expo Go from your phone (clears saved auth session)"
echo "  2. npm install -g @tongil_kim/clautunnel"
echo "  3. clautunnel setup"
echo "  4. clautunnel login"
echo "  5. clautunnel start"
