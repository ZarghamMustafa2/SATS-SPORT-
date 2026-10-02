# Oracle Cloud Always Free VM — Deployment Guide for Shubdx Fixed-IP Backend

This guide outlines the 100% FREE deployment of the **SatsSport Shubdx Egress Gateway** on **Oracle Cloud Infrastructure (OCI) Always Free Tier**.

Oracle Cloud Always Free provides:
- **1x to 2x Compute VMs** (Free Forever, $0.00/month).
- **1x Reserved Public IPv4 Address** (Persistent, Static, Never Changes).
- **10 TB/month Outbound Data Transfer** (More than enough for live sports feeds).

---

## Part 1: Create the Always Free VM in Oracle Cloud (5 Minutes)

1. Log in to your Oracle Cloud Console at [cloud.oracle.com](https://cloud.oracle.com).
2. In the top-left navigation menu, go to **Compute** $\rightarrow$ **Instances** $\rightarrow$ Click **Create Instance**.
3. Configure the instance with the **"Always Free Eligible"** badges:
   - **Name**: `satssport-shubdx-backend`
   - **Image**: **Canonical Ubuntu 22.04 LTS** or **Ubuntu 24.04 LTS** (Always Free Eligible).
   - **Shape**:
     - Option A (Recommended): **Ampere ARM `VM.Standard.A1.Flex`** (Up to 4 OCPUs, 24 GB RAM, Always Free).
     - Option B: **AMD `VM.Standard.E2.1.Micro`** (1 OCPU, 1 GB RAM, Always Free).
   - **Networking**:
     - Primary VNIC: Select default VCN and public subnet.
     - **Assign a public IPv4 address**: Select **"Automatically assign public IPv4 address"** or **"Do not assign"** (we will assign a Reserved IP in Part 2).
   - **Add SSH Keys**:
     - Choose **"Save private key"** and **"Save public key"** to your computer.
4. Click **Create**. The instance will transition to **Running** within 1–2 minutes.

---

## Part 2: Assign a Persistent Reserved Public IPv4 (Guarantees IP Never Changes)

1. In OCI Console, go to **Networking** $\rightarrow$ **IP Management** $\rightarrow$ **Reserved Public IPs**.
2. Click **Reserve Public IP Address**:
   - Scope: REGIONAL.
   - Name: `satssport-persistent-ip`.
   - Click **Reserve Public IP**.
3. Under the three dots menu on your newly created Reserved IP, click **Attach**:
   - Resource Type: **VNIC**.
   - Select your running `satssport-shubdx-backend` instance's primary VNIC.
   - Click **Attach**.
4. Note this IP: **This is your permanent, static public IP for Shubdx whitelisting.**

---

## Part 3: Open Ports in Oracle Cloud Network Security List (VCN)

Oracle Cloud blocks incoming web traffic at the cloud firewall level by default.

1. Go to **Networking** $\rightarrow$ **Virtual Cloud Networks (VCN)** $\rightarrow$ Click your VCN.
2. Under **Security Lists**, click **Default Security List for...**.
3. Click **Add Ingress Rules**:
   - **Source CIDR**: `0.0.0.0/0`
   - **IP Protocol**: `TCP`
   - **Destination Port Range**: `80,443`
   - **Description**: `Allow HTTP and HTTPS to SatsSport backend`
4. Click **Add Ingress Rules**.

---

## Part 4: 1-Command Automated Backend Setup

1. Open your terminal or PowerShell on your computer and connect to the Oracle VM using SSH:
   ```bash
   ssh -i /path/to/your/private_key.key ubuntu@YOUR_ORACLE_PUBLIC_IP
   ```

2. Run the automated deployment script (does everything in ~2 minutes):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/ZarghamMustafa2/SATS-SPORT-/main/scripts/deploy_vps.sh | bash
   ```
   *(Optional: If you have a custom domain pointing to this IP, add the domain at the end: `... | bash -s api.yourdomain.com` for automatic free SSL).*

3. The script automatically:
   - Installs Node.js 20 LTS, Nginx, and UFW firewall.
   - Flushes Oracle's internal OS `iptables` drop rules.
   - Clones the repository to `/var/www/satssport`.
   - Sets up the `satssport.service` systemd service (auto-starts on boot).
   - Configures Nginx reverse proxy (Port 80/443 $\rightarrow$ internal port 4000).
   - Runs `/api/shubdx/health` and displays the exact public static IP.

---

## Part 5: Verify Backend Health & Provide IP to Shubdx

1. On your computer or browser, visit:
   - `http://YOUR_ORACLE_PUBLIC_IP/api/health`
   - `http://YOUR_ORACLE_PUBLIC_IP/api/shubdx/health`

2. The response will show:
   ```json
   {
     "status": "unauthorized",
     "httpStatus": 200,
     "serverPublicEgressIp": "YOUR_ORACLE_PUBLIC_IP",
     "clientSeenByShubdx": "YOUR_ORACLE_PUBLIC_IP",
     "upstreamMessage": "Access denied: Your IP address is not authorized."
   }
   ```
3. Copy `serverPublicEgressIp` (your Oracle Reserved Public IP) and submit it to the **Shubdx Partner Portal** for allowlisting.

---

## Part 6: Connect Vercel to Your Oracle Fixed-IP Backend

In your Vercel Project Dashboard (`sats-sport` $\rightarrow$ **Settings** $\rightarrow$ **Environment Variables**):
- Add `SHUBDX_PROXY_URL` = `http://YOUR_ORACLE_PUBLIC_IP` (or `https://api.yourdomain.com`).
- Add `SHUBDX_SERVER_MODE` = `proxy`.
- Redeploy or trigger deployment on Vercel.

**Result**: All browser betting and live odds requests to `https://sats-sport.vercel.app` route seamlessly through your Oracle Always Free fixed IP to Shubdx, ensuring 100% uptime with zero monthly server cost.
