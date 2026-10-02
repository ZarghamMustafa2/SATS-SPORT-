#!/usr/bin/env bash
# ==============================================================================
# SatsSport Fixed-IP VPS Automated Deployment & Shubdx Probe Script
# Supported OS: Ubuntu 20.04 / 22.04 / 24.04, Debian 11 / 12
# ==============================================================================

set -e

echo "========================================================"
echo "🚀 SatsSport Fixed-IP Dedicated Backend Deployment"
echo "========================================================"

# 1. Update OS packages
echo "📦 Updating OS packages..."
sudo apt-get update -y
sudo apt-get install -y curl git ufw nginx

# 2. Install Node.js 20 LTS if missing
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# 3. Detect Real Public Static IP
PUBLIC_IP=$(curl -s https://api.ipify.org || curl -s https://ifconfig.me || curl -s https://icanhazip.com)
echo "🌐 Detected Server Public Static IP: $PUBLIC_IP"

# 4. Clone or pull repository
APP_DIR="/var/www/satssport"
sudo mkdir -p $APP_DIR
sudo chown -R $USER:$USER $APP_DIR

if [ ! -d "$APP_DIR/.git" ]; then
    echo "📥 Cloning SATS-SPORT- repository into $APP_DIR..."
    git clone https://github.com/ZarghamMustafa2/SATS-SPORT-.git $APP_DIR
else
    echo "🔄 Updating existing repository..."
    cd $APP_DIR
    git pull origin main
fi

cd $APP_DIR

# 5. Install production dependencies
echo "📦 Installing npm dependencies..."
npm install --omit=dev

# 6. Configure environment variables (.env)
if [ ! -f "$APP_DIR/.env" ]; then
    echo "⚙️ Creating production .env file..."
    cat <<EOF > "$APP_DIR/.env"
PORT=4000
HOST=0.0.0.0
SHUBDX_API_BASE_URL=https://shubdxinternational.com
SHUBDX_API_KEY=
SHUBDX_SERVER_MODE=standalone
EOF
fi

# 7. Create Systemd Service for 24/7 background uptime
echo "⚙️ Installing systemd background service (satssport.service)..."
sudo bash -c "cat <<EOF > /etc/systemd/system/satssport.service
[Unit]
Description=SatsSport Fixed-IP Egress Backend Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
ExecStart=$(which node) $APP_DIR/server.js
Restart=always
RestartSec=5
EnvironmentFile=-$APP_DIR/.env
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=satssport

[Install]
WantedBy=multi-user.target
EOF"

sudo systemctl daemon-reload
sudo systemctl enable satssport.service
sudo systemctl restart satssport.service

# 8. Configure Nginx Reverse Proxy (Port 80 -> Port 4000)
echo "⚙️ Configuring Nginx reverse proxy..."
sudo cp $APP_DIR/nginx.conf /etc/nginx/sites-available/satssport
sudo ln -sf /etc/nginx/sites-available/satssport /etc/nginx/sites-enabled/satssport
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# 9. Configure UFW Firewall (Open SSH 22, HTTP 80, HTTPS 443; block direct 4000 from public)
echo "🔒 Configuring UFW Firewall..."
sudo ufw allow 22/tcp || true
sudo ufw allow 80/tcp || true
sudo ufw allow 443/tcp || true
sudo ufw --force enable || true

# 10. Wait 3 seconds and run Shubdx Health Verification
sleep 3
echo ""
echo "========================================================"
echo "🩺 Running Shubdx Health & Egress IP Probe from VPS..."
echo "========================================================"
HEALTH_OUTPUT=$(curl -s http://127.0.0.1:4000/api/shubdx/health || echo '{"status":"failed"}')
echo "$HEALTH_OUTPUT" | python3 -m json.tool || echo "$HEALTH_OUTPUT"

echo ""
echo "========================================================"
echo "✅ DEPLOYMENT SUMMARY FOR SHUBDX WHITELISTING:"
echo "========================================================"
echo "📍 Server Public Static IP: $PUBLIC_IP"
echo "🩺 Health Endpoint: http://$PUBLIC_IP/api/health"
echo "📡 Shubdx Health Probe: http://$PUBLIC_IP/api/shubdx/health"
echo "👉 GIVE THIS EXACT IP TO SHUBDX ACCOUNT MANAGER: $PUBLIC_IP"
echo "========================================================"
