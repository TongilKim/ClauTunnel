#!/bin/bash

expo start --tunnel
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "=================================="
  echo " Tunnel failed to start"
  echo "=================================="
  echo ""
  echo "Common causes:"
  echo "  - ngrok is not installed or not configured"
  echo "  - ngrok service outage (check https://status.ngrok.com)"
  echo "  - Network issue (firewall, VPN, etc.)"
  echo ""
  echo "To set up ngrok (free):"
  echo "  1. brew install ngrok"
  echo "  2. Sign up at https://ngrok.com"
  echo "  3. ngrok config add-authtoken <your-token>"
  echo ""
  echo "Or use 'pnpm start' instead (same Wi-Fi network required)."
  echo ""
  exit $EXIT_CODE
fi
