#!/bin/bash
export PATH="/tmp/node_bin2/node-v20.19.0-darwin-arm64/bin:$PATH"
cd "$(dirname "$0")"
echo "🌿 Starting SOOKKAYA POS..."
echo "📱 Open: http://localhost:3000"
echo "🔑 Owner: owner / sookkaya2026"
echo "👤 Staff: staff / staff1234"
echo ""
npm run dev
