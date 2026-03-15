#!/usr/bin/env bash
set -euo pipefail

# Reset local environment to first-time user state.
# Usage: ./scripts/reset-fresh-user.sh [--skip-db] [--skip-ngrok]
#
# Flags:
#   --skip-db      Skip Supabase DB cleanup (faster for repeated local resets)
#   --skip-ngrok   Keep ngrok installed and configured

SKIP_DB=false
SKIP_NGROK=false

for arg in "$@"; do
  case "$arg" in
    --skip-db)    SKIP_DB=true ;;
    --skip-ngrok) SKIP_NGROK=true ;;
    *)            echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

CONFIG_DIR="$HOME/.clautunnel"
LEGACY_DIR="$HOME/.termbridge"
CONFIG_FILE="$CONFIG_DIR/config.json"
PID_FILE="$CONFIG_DIR/daemon.pid"

echo "=== ClauTunnel Fresh User Reset ==="
echo ""

# ─── Step 1: Stop running processes ──────────────────────────────────────────

echo "[1/7] Stopping running processes..."

# Kill clautunnel daemon via PID file
if [ -f "$PID_FILE" ]; then
  DAEMON_PID=$(cut -d: -f1 "$PID_FILE" 2>/dev/null || true)
  if [ -n "$DAEMON_PID" ] && kill -0 "$DAEMON_PID" 2>/dev/null; then
    kill "$DAEMON_PID" 2>/dev/null && echo "  - clautunnel daemon stopped (PID $DAEMON_PID)" || true
    # Give it a moment to clean up child processes
    sleep 1
  else
    echo "  - no running daemon"
  fi
  rm -f "$PID_FILE"
else
  echo "  - no PID file"
fi

# Kill orphaned ngrok/expo processes spawned by clautunnel
if pgrep -f "ngrok.*tunnel" > /dev/null 2>&1; then
  pkill -f "ngrok.*tunnel" 2>/dev/null && echo "  - ngrok tunnel process killed" || true
fi
if pgrep -f "expo start" > /dev/null 2>&1; then
  pkill -f "expo start" 2>/dev/null && echo "  - expo process killed" || true
fi

# ─── Step 2: Restore macOS sleep prevention ──────────────────────────────────

echo "[2/7] Restoring macOS sleep settings..."

if [[ "$(uname)" == "Darwin" ]]; then
  # Check if disablesleep is currently set
  if sudo pmset -g | grep -q "disablesleep.*1" 2>/dev/null; then
    sudo pmset -a disablesleep 0 && echo "  - lid-close sleep restored" || echo "  - failed to restore (may need sudo)"
  else
    echo "  - already normal"
  fi

  # Kill any leftover caffeinate from clautunnel
  if pgrep -f "caffeinate" > /dev/null 2>&1; then
    pkill -f "caffeinate" 2>/dev/null && echo "  - caffeinate stopped" || true
  fi
else
  echo "  - not macOS, skipped"
fi

# ─── Step 3: Clean Supabase DB (before deleting local config) ────────────────

if [ "$SKIP_DB" = true ]; then
  echo "[3/7] Skipping DB cleanup (--skip-db)"
else
  if [ -f "$CONFIG_FILE" ]; then
    SUPABASE_URL=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('supabaseUrl',''))" 2>/dev/null || true)
    SUPABASE_ANON_KEY=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('supabaseAnonKey',''))" 2>/dev/null || true)
    ACCESS_TOKEN=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('sessionTokens',{}).get('accessToken',''))" 2>/dev/null || true)
    REFRESH_TOKEN=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('sessionTokens',{}).get('refreshToken',''))" 2>/dev/null || true)

    if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_ANON_KEY" ] && [ -n "$ACCESS_TOKEN" ]; then
      echo "[3/7] Cleaning Supabase DB data..."

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

      # Delete mobile_pairings
      curl -s -X DELETE "$SUPABASE_URL/rest/v1/mobile_pairings?select=*" \
        -H "apikey: $SUPABASE_ANON_KEY" \
        -H "Authorization: $AUTH_HEADER" \
        -H "Prefer: return=minimal" > /dev/null 2>&1 && echo "  - mobile_pairings cleared" || echo "  - mobile_pairings: skipped"
    else
      echo "[3/7] Skipping DB cleanup (missing credentials)"
    fi
  else
    echo "[3/7] Skipping DB cleanup (no config file found)"
  fi
fi

# ─── Step 4: Uninstall CLI (npm) ─────────────────────────────────────────────

echo "[4/7] Uninstalling CLI (npm)..."
if npm list -g @tongil_kim/clautunnel > /dev/null 2>&1; then
  npm uninstall -g @tongil_kim/clautunnel
  echo "  - npm package removed"
else
  echo "  - not installed via npm, skipped"
fi

# ─── Step 5: Uninstall CLI (Homebrew) ────────────────────────────────────────

echo "[5/7] Uninstalling CLI (Homebrew)..."
if brew list clautunnel > /dev/null 2>&1; then
  brew uninstall clautunnel
  echo "  - Homebrew package removed"
else
  echo "  - not installed via Homebrew, skipped"
fi

# ─── Step 6: Uninstall ngrok ────────────────────────────────────────────────

if [ "$SKIP_NGROK" = true ]; then
  echo "[6/7] Skipping ngrok cleanup (--skip-ngrok)"
else
  echo "[6/7] Uninstalling ngrok..."
  if brew list ngrok > /dev/null 2>&1; then
    brew uninstall ngrok
    echo "  - ngrok removed"
  elif command -v ngrok > /dev/null 2>&1; then
    echo "  - ngrok found but not installed via Homebrew, remove manually"
  else
    echo "  - not installed, skipped"
  fi

  # Remove ngrok config (authtoken, etc.)
  NGROK_CONFIG_DIR="$HOME/.config/ngrok"
  NGROK_LEGACY_DIR="$HOME/.ngrok2"
  if [ -d "$NGROK_CONFIG_DIR" ]; then
    rm -rf "$NGROK_CONFIG_DIR"
    echo "  - ngrok config removed (~/.config/ngrok)"
  fi
  if [ -d "$NGROK_LEGACY_DIR" ]; then
    rm -rf "$NGROK_LEGACY_DIR"
    echo "  - ngrok legacy config removed (~/.ngrok2)"
  fi
fi

# ─── Step 7: Remove local data ──────────────────────────────────────────────

echo "[7/7] Removing local data..."

if [ -d "$CONFIG_DIR" ]; then
  rm -rf "$CONFIG_DIR"
  echo "  - ~/.clautunnel removed (config, logs, repo)"
else
  echo "  - ~/.clautunnel already clean"
fi

if [ -d "$LEGACY_DIR" ]; then
  rm -rf "$LEGACY_DIR"
  echo "  - ~/.termbridge removed (legacy)"
else
  echo "  - ~/.termbridge already clean"
fi

echo ""
echo "Done! Fresh user state restored."
echo "Next steps:"
echo "  1. npm install -g @tongil_kim/clautunnel"
echo "  2. clautunnel setup"
echo "  3. clautunnel login"
echo "  4. clautunnel start"
