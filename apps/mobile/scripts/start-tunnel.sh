#!/bin/bash

# Requires system ngrok (v3+) instead of the bundled @expo/ngrok (v2, deprecated)
# Install: brew install ngrok
# Setup:   ngrok config add-authtoken <your-token> (free at https://ngrok.com)

if ! command -v ngrok &> /dev/null; then
  echo ""
  echo "ERROR: ngrok is not installed."
  echo ""
  echo "Setup (free):"
  echo "  1. brew install ngrok"
  echo "  2. Sign up at https://ngrok.com"
  echo "  3. ngrok config add-authtoken <your-token>"
  echo ""
  echo "Or use 'pnpm start' instead (same Wi-Fi network required)."
  exit 1
fi

EXPO_PORT=${EXPO_PORT:-8081}

# Start ngrok in background
ngrok http $EXPO_PORT --log=stderr > /dev/null 2>&1 &
NGROK_PID=$!

# Wait for ngrok to be ready
echo "Starting ngrok tunnel..."
for i in $(seq 1 10); do
  NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try{
        const t=JSON.parse(d).tunnels;
        const h=t.find(x=>x.proto==='https');
        if(h)process.stdout.write(h.public_url);
      }catch(e){}
    });
  " 2>/dev/null)
  if [ -n "$NGROK_URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$NGROK_URL" ]; then
  kill $NGROK_PID 2>/dev/null
  echo ""
  echo "=================================="
  echo " Tunnel failed to start"
  echo "=================================="
  echo ""
  echo "Common causes:"
  echo "  - ngrok authtoken not configured"
  echo "  - ngrok service outage (check https://status.ngrok.com)"
  echo "  - Network issue (firewall, VPN, etc.)"
  echo ""
  echo "Run: ngrok config add-authtoken <your-token>"
  echo "Or use 'pnpm start' instead (same Wi-Fi network required)."
  exit 1
fi

echo "Tunnel: $NGROK_URL"
echo ""

# Cleanup on exit
cleanup() {
  kill $NGROK_PID 2>/dev/null
  wait $NGROK_PID 2>/dev/null
}
trap cleanup EXIT INT TERM

# Start Expo with the tunnel URL
EXPO_PACKAGER_PROXY_URL="$NGROK_URL" expo start --port $EXPO_PORT
