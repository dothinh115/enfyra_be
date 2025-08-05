# Admin Guide

## Overview

This guide is for system administrators managing the Enfyra Backend platform. It includes installation, configuration, monitoring, backup, and troubleshooting.

## System Installation

### System Requirements

#### Minimum

- **CPU**: 2 cores
- **RAM**: 4GB
- **Storage**: 20GB
- **OS**: Ubuntu 20.04+, CentOS 8+, macOS 10.15+

#### Recommended

- **CPU**: 4+ cores
- **RAM**: 8GB+
- **Storage**: 100GB+ SSD
- **OS**: Ubuntu 22.04 LTS

### Install Dependencies

#### Ubuntu/Debian

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install MySQL
sudo apt install mysql-server -y
sudo systemctl start mysql
sudo systemctl enable mysql

# Install Redis
sudo apt install redis-server -y
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Install PM2
sudo npm install -g pm2

# Install useful tools
sudo apt install -y curl wget git htop nginx
```

#### CentOS/RHEL

```bash
# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install MySQL
sudo yum install -y mysql-server
sudo systemctl start mysqld
sudo systemctl enable mysqld

# Install Redis
sudo yum install -y redis
sudo systemctl start redis
sudo systemctl enable redis

# Install PM2
sudo npm install -g pm2
```

#### macOS

```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node@18

# Install MySQL
brew install mysql
brew services start mysql

# Install Redis
brew install redis
brew services start redis

# Install PM2
npm install -g pm2
```

### Install Enfyra Backend

```bash
# Clone repository
git clone <repository-url>
cd enfyra_be

# Install dependencies
npm install

# Create environment file
cp env_example .env

# Configure environment
nano .env
```

## System Configuration

### Database Configuration

#### MySQL

```bash
# Login to MySQL
sudo mysql -u root

# Create database and user
CREATE DATABASE enfyra_cms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'enfyra'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON enfyra_cms.* TO 'enfyra'@'localhost';
FLUSH PRIVILEGES;
EXIT;

# Configure MySQL for production
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf

# Add/modify the following configurations:
[mysqld]
innodb_buffer_pool_size = 1G
innodb_log_file_size = 256M
innodb_flush_log_at_trx_commit = 2
max_connections = 200
query_cache_size = 64M
query_cache_type = 1

# Restart MySQL
sudo systemctl restart mysql
```

#### PostgreSQL

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE enfyra_cms;
CREATE USER enfyra WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE enfyra_cms TO enfyra;
\q

# Configure PostgreSQL
sudo nano /etc/postgresql/*/main/postgresql.conf

# Add/modify configurations:
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### Configure Redis

```bash
# Configure Redis
sudo nano /etc/redis/redis.conf

# Add/modify configurations:
maxmemory 512mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000

# Restart Redis
sudo systemctl restart redis-server
```

### Configure Nginx (Reverse Proxy)

```bash
# Create Nginx configuration
sudo nano /etc/nginx/sites-available/enfyra

# Configuration content:
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:1105;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Enable site
sudo ln -s /etc/nginx/sites-available/enfyra /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Configure SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Create SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto renew
sudo crontab -e
# Add line: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Deployment

### Development Deployment

```bash
# Build ứng dụng
npm run build

# Chạy với PM2
pm2 start ecosystem.config.js --env development

# Lưu cấu hình PM2
pm2 save
pm2 startup
```

### Production Deployment

```bash
# Build cho production
npm run build:prod

# Chạy với PM2
pm2 start ecosystem.config.js --env production

# Kiểm tra status
pm2 status
pm2 logs enfyra-backend
```

### Docker Deployment

```bash
# Build Docker image
docker build -t enfyra-backend .

# Chạy container
docker run -d \
  --name enfyra-backend \
  -p 1105:1105 \
  --env-file .env \
  --restart unless-stopped \
  enfyra-backend

# Hoặc sử dụng Docker Compose
docker-compose up -d
```

## Monitoring and Logging

### PM2 Monitoring

```bash
# Xem dashboard
pm2 monit

# Xem logs
pm2 logs enfyra-backend

# Xem thông tin chi tiết
pm2 show enfyra-backend

# Restart ứng dụng
pm2 restart enfyra-backend

# Reload ứng dụng (zero-downtime)
pm2 reload enfyra-backend
```

### System Monitoring

```bash
# Cài đặt monitoring tools
sudo apt install -y htop iotop nethogs

# Monitor system resources
htop
iotop
nethogs

# Monitor disk usage
df -h
du -sh /var/log/*

# Monitor memory usage
free -h
cat /proc/meminfo
```

### Database Monitoring

#### MySQL

```sql
-- Kiểm tra connections
SHOW STATUS LIKE 'Threads_connected';

-- Kiểm tra slow queries
SHOW VARIABLES LIKE 'slow_query_log';
SHOW VARIABLES LIKE 'long_query_time';

-- Kiểm tra table sizes
SELECT
  table_name,
  ROUND(((data_length + index_length) / 1024 / 1024), 2) AS 'Size (MB)'
FROM information_schema.tables
WHERE table_schema = 'enfyra_cms'
ORDER BY (data_length + index_length) DESC;
```

#### PostgreSQL

```sql
-- Kiểm tra connections
SELECT count(*) FROM pg_stat_activity;

-- Kiểm tra slow queries
SELECT query, mean_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Kiểm tra table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Log Management

```bash
# Cấu hình log rotation
sudo nano /etc/logrotate.d/enfyra

# Nội dung:
/var/log/enfyra/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        pm2 reload enfyra-backend
    endscript
}

# Tạo thư mục logs
sudo mkdir -p /var/log/enfyra
sudo chown www-data:www-data /var/log/enfyra
```

## Backup and Recovery

### Database Backup

#### MySQL Backup

```bash
#!/bin/bash
# backup-mysql.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/mysql"
DB_NAME="enfyra_cms"

# Tạo thư mục backup
mkdir -p $BACKUP_DIR

# Backup database
mysqldump -u enfyra -p'your_password' $DB_NAME > $BACKUP_DIR/enfyra_$DATE.sql

# Nén file backup
gzip $BACKUP_DIR/enfyra_$DATE.sql

# Xóa backup cũ hơn 30 ngày
find $BACKUP_DIR -name "enfyra_*.sql.gz" -mtime +30 -delete

echo "Backup completed: enfyra_$DATE.sql.gz"
```

#### PostgreSQL Backup

```bash
#!/bin/bash
# backup-postgres.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/postgres"
DB_NAME="enfyra_cms"

# Tạo thư mục backup
mkdir -p $BACKUP_DIR

# Backup database
pg_dump -U enfyra $DB_NAME > $BACKUP_DIR/enfyra_$DATE.sql

# Nén file backup
gzip $BACKUP_DIR/enfyra_$DATE.sql

# Xóa backup cũ hơn 30 ngày
find $BACKUP_DIR -name "enfyra_*.sql.gz" -mtime +30 -delete

echo "Backup completed: enfyra_$DATE.sql.gz"
```

### Application Backup

```bash
#!/bin/bash
# backup-app.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/app"
APP_DIR="/opt/enfyra_be"

# Tạo thư mục backup
mkdir -p $BACKUP_DIR

# Backup application files
tar -czf $BACKUP_DIR/enfyra_app_$DATE.tar.gz -C $APP_DIR .

# Backup environment file
cp $APP_DIR/.env $BACKUP_DIR/env_$DATE

# Xóa backup cũ hơn 30 ngày
find $BACKUP_DIR -name "enfyra_app_*.tar.gz" -mtime +30 -delete
find $BACKUP_DIR -name "env_*" -mtime +30 -delete

echo "Application backup completed: enfyra_app_$DATE.tar.gz"
```

### Automated Backup

```bash
# Tạo cron job cho backup tự động
sudo crontab -e

# Thêm các dòng sau:
# Backup database hàng ngày lúc 2:00 AM
0 2 * * * /opt/enfyra_be/scripts/backup-mysql.sh

# Backup application hàng tuần vào Chủ nhật lúc 3:00 AM
0 3 * * 0 /opt/enfyra_be/scripts/backup-app.sh
```

### Recovery

#### Database Recovery

```bash
# MySQL Recovery
mysql -u enfyra -p enfyra_cms < backup/enfyra_20250805_020000.sql

# PostgreSQL Recovery
psql -U enfyra enfyra_cms < backup/enfyra_20250805_020000.sql
```

#### Application Recovery

```bash
# Restore application files
tar -xzf backup/enfyra_app_20250805_030000.tar.gz -C /opt/enfyra_be/

# Restore environment file
cp backup/env_20250805_030000 /opt/enfyra_be/.env

# Restart application
pm2 restart enfyra-backend
```

## Security

### Firewall Configuration

```bash
# Cài đặt UFW
sudo apt install ufw

# Cấu hình firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Mở các port cần thiết
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 1105/tcp  # Chỉ nếu cần truy cập trực tiếp

# Kích hoạt firewall
sudo ufw enable
```

### SSL/TLS Configuration

```bash
# Cấu hình SSL trong Nginx
sudo nano /etc/nginx/sites-available/enfyra

# Thêm cấu hình SSL:
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://localhost:1105;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

### Database Security

```sql
-- MySQL Security
-- Tạo user với quyền hạn chế
CREATE USER 'enfyra_readonly'@'localhost' IDENTIFIED BY 'password';
GRANT SELECT ON enfyra_cms.* TO 'enfyra_readonly'@'localhost';

-- Xóa user không sử dụng
DROP USER 'test'@'localhost';

-- Kiểm tra users
SELECT user, host FROM mysql.user;
```

## Performance Tuning

### Application Performance

```bash
# Cấu hình Node.js
export NODE_OPTIONS="--max-old-space-size=4096"

# Cấu hình PM2
pm2 start ecosystem.config.js --env production --max-memory-restart 1G
```

### Database Performance

#### MySQL Tuning

```sql
-- Cấu hình InnoDB
SET GLOBAL innodb_buffer_pool_size = 1073741824; -- 1GB
SET GLOBAL innodb_log_file_size = 268435456; -- 256MB
SET GLOBAL innodb_flush_log_at_trx_commit = 2;

-- Tạo indexes cho các cột thường query
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_category ON products(categoryId);
```

#### PostgreSQL Tuning

```sql
-- Cấu hình shared_buffers
ALTER SYSTEM SET shared_buffers = '256MB';

-- Cấu hình effective_cache_size
ALTER SYSTEM SET effective_cache_size = '1GB';

-- Tạo indexes
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_category ON products(category_id);

-- Analyze tables
ANALYZE products;
```

### Redis Performance

```bash
# Configure Redis cho performance
sudo nano /etc/redis/redis.conf

# Thêm/sửa:
maxmemory 1gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
tcp-keepalive 300
```

## Troubleshooting

### Common Issues

#### 1. Application not starting

```bash
# Check logs
pm2 logs enfyra-backend

# Check port
sudo netstat -tlnp | grep 1105

# Check process
ps aux | grep node
```

#### 2. Database connection failed

```bash
# Kiểm tra MySQL service
sudo systemctl status mysql

# Kiểm tra PostgreSQL service
sudo systemctl status postgresql

# Test connection
mysql -u enfyra -p enfyra_cms
psql -U enfyra enfyra_cms
```

#### 3. Redis connection failed

```bash
# Kiểm tra Redis service
sudo systemctl status redis-server

# Test connection
redis-cli ping
```

#### 4. High memory usage

```bash
# Kiểm tra memory usage
free -h
ps aux --sort=-%mem | head

# Restart application
pm2 restart enfyra-backend
```

#### 5. High CPU usage

```bash
# Kiểm tra CPU usage
top
htop

# Kiểm tra slow queries
# MySQL
SHOW PROCESSLIST;

# PostgreSQL
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';
```

### Log Analysis

```bash
# Xem application logs
pm2 logs enfyra-backend --lines 100

# Xem system logs
sudo journalctl -u nginx -f
sudo journalctl -u mysql -f
sudo journalctl -u redis-server -f

# Xem error logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/mysql/error.log
```

### Health Checks

```bash
#!/bin/bash
# health-check.sh

# Kiểm tra application
if curl -f http://localhost:1105/health > /dev/null 2>&1; then
    echo "Application: OK"
else
    echo "Application: FAILED"
    # Gửi alert
fi

# Kiểm tra database
if mysql -u enfyra -p'password' -e "SELECT 1" > /dev/null 2>&1; then
    echo "Database: OK"
else
    echo "Database: FAILED"
fi

# Kiểm tra Redis
if redis-cli ping > /dev/null 2>&1; then
    echo "Redis: OK"
else
    echo "Redis: FAILED"
fi
```

## Maintenance

### Regular Maintenance Tasks

```bash
#!/bin/bash
# maintenance.sh

# 1. Database maintenance
mysql -u enfyra -p enfyra_cms -e "OPTIMIZE TABLE products, categories, orders;"
# hoặc
psql -U enfyra enfyra_cms -c "VACUUM ANALYZE;"

# 2. Log rotation
sudo logrotate /etc/logrotate.d/enfyra

# 3. Clean old backups
find /backup -name "*.gz" -mtime +30 -delete

# 4. Update system packages
sudo apt update && sudo apt upgrade -y

# 5. Restart services
sudo systemctl restart nginx
pm2 reload enfyra-backend
```

### Scheduled Maintenance

```bash
# Thêm vào crontab
sudo crontab -e

# Maintenance hàng tuần vào Chủ nhật lúc 4:00 AM
0 4 * * 0 /opt/enfyra_be/scripts/maintenance.sh

# Health check mỗi 5 phút
*/5 * * * * /opt/enfyra_be/scripts/health-check.sh
```

## Disaster Recovery

### Backup Strategy

1. **Daily Backups**: Database và application files
2. **Weekly Backups**: Full system backup
3. **Monthly Backups**: Offsite backup
4. **Test Recovery**: Test restore procedures monthly

### Recovery Procedures

```bash
#!/bin/bash
# disaster-recovery.sh

# 1. Stop services
pm2 stop enfyra-backend
sudo systemctl stop nginx

# 2. Restore database
mysql -u enfyra -p enfyra_cms < /backup/latest/enfyra.sql

# 3. Restore application
tar -xzf /backup/latest/enfyra_app.tar.gz -C /opt/enfyra_be/

# 4. Restore configuration
cp /backup/latest/env /opt/enfyra_be/.env

# 5. Start services
sudo systemctl start nginx
pm2 start enfyra-backend

# 6. Verify recovery
curl -f http://localhost:1105/health
```

## Support and Documentation

### Monitoring Tools

- **PM2**: Application monitoring
- **htop**: System monitoring
- **MySQL Workbench**: Database management
- **Redis Commander**: Redis management
- **Grafana**: Advanced monitoring (optional)

### Documentation

- **System Logs**: `/var/log/`
- **Application Logs**: PM2 logs
- **Configuration Files**: `/etc/`
- **Backup Files**: `/backup/`

### Contact Information

- **Emergency**: [Emergency contact]
- **Technical Support**: [Support email]
- **Documentation**: [Documentation URL]
- **Issue Tracker**: [Issue tracker URL]

---

_Hướng dẫn này được cập nhật lần cuối: Tháng 8, 2025_
