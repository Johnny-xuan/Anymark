# 服务器配置日志

## 服务器信息

- **IP**: 138.68.47.46
- **域名**: v1.j-o-x.tech
- **用途**: 书签管理扩展 API 服务器（网页抓取代理）

## 2025-12-21 配置记录

### 1. 安装 Node.js 20.x

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

### 2. 创建 API 服务器

**目录**: `/root/api-server/`

**文件**: `/root/api-server/index.js`
```javascript
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 网页抓取代理（核心功能）
app.post('/api/fetch', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url || !url.startsWith('http')) {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    
    console.log('[Fetch]', url);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
      },
      timeout: 30000,
      maxRedirects: 5,
    });
    
    res.json({ html: response.data, status: response.status });
  } catch (error) {
    console.error('[Fetch] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch', message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`API Server running on port ${PORT}`);
});
```

**文件**: `/root/api-server/package.json`
```json
{
  "name": "bookmark-api-server",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "axios": "^1.6.0"
  }
}
```

**安装依赖**:
```bash
cd /root/api-server
npm install
```

### 3. 创建 Systemd 服务

**文件**: `/etc/systemd/system/api-server.service`
```ini
[Unit]
Description=Bookmark API Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/api-server
ExecStart=/usr/bin/node /root/api-server/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

**启动服务**:
```bash
systemctl daemon-reload
systemctl enable api-server
systemctl start api-server
```

### 4. 申请 SSL 证书

```bash
certbot certonly --nginx -d v1.j-o-x.tech --non-interactive --agree-tos --email admin@j-o-x.tech
```

证书路径:
- `/etc/letsencrypt/live/v1.j-o-x.tech/fullchain.pem`
- `/etc/letsencrypt/live/v1.j-o-x.tech/privkey.pem`

### 5. 配置 Nginx 反向代理

**文件**: `/etc/nginx/conf.d/v1.j-o-x.tech.conf`
```nginx
server {
    listen 80;
    server_name v1.j-o-x.tech;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name v1.j-o-x.tech;

    ssl_certificate /etc/letsencrypt/live/v1.j-o-x.tech/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/v1.j-o-x.tech/privkey.pem;
    
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    add_header Strict-Transport-Security "max-age=63072000" always;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
        
        if ($request_method = OPTIONS) {
            return 204;
        }
    }
}
```

**重载 Nginx**:
```bash
nginx -t
systemctl reload nginx
```

## API 端点

### 健康检查
```
GET https://v1.j-o-x.tech/health

Response: {"status":"ok","timestamp":"2025-12-21T17:14:42.175Z"}
```

### 网页抓取代理
```
POST https://v1.j-o-x.tech/api/fetch
Content-Type: application/json

Request:
{
  "url": "https://example.com"
}

Response:
{
  "html": "<!doctype html>...",
  "status": 200
}
```

## 常用运维命令

```bash
# 查看服务状态
systemctl status api-server

# 查看日志
journalctl -u api-server -f

# 重启服务
systemctl restart api-server

# 测试 API
curl -s http://localhost:3000/health
curl -s -X POST http://localhost:3000/api/fetch -H "Content-Type: application/json" -d '{"url":"https://example.com"}'
```

## 服务器上已有的其他服务

| 服务 | 内部端口 | 外部访问 | 说明 |
|------|----------|----------|------|
| API 服务器 | 3000 | https://v1.j-o-x.tech | 网页抓取代理，通过 Nginx 反向代理 |
| Whoogle 搜索 | 5000 | https://search.j-o-x.tech | 网页搜索服务，通过 Xray fallback 转发 |
| Xray | 443 | - | VPN 代理服务 |
| Nginx | 80, 443 | - | 反向代理 |

> **注意**: Whoogle 服务通过 Xray 的 fallback 机制转发，外部访问使用标准 HTTPS 端口 443，无需指定端口号。
