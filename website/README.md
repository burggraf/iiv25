# Is It Vegan? Website

A modern, responsive static website for the Is It Vegan mobile app, built for Cloudflare Pages with serverless contact form functionality.

## 🚀 Quick Start

After initial setup (see below), deploying updates is simple:

```bash
cd website
./deploy.sh
```

## 📋 Initial Setup Guide

### Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://cloudflare.com)
2. **Domain Control**: You need access to `isitvegan.net` DNS settings
3. **Node.js**: Install from [nodejs.org](https://nodejs.org)
4. **Wrangler CLI**: Install globally
   ```bash
   npm install -g wrangler
   ```

### Step 1: Cloudflare Dashboard Setup

#### 1.1 Add Domain to Cloudflare
1. Go to Cloudflare Dashboard → Add a Site
2. Enter `isitvegan.net`
3. Choose the Free plan
4. Update your domain's nameservers to Cloudflare's (provided in the dashboard)
5. Wait for DNS propagation (can take up to 24 hours)

#### 1.2 Create Cloudflare Pages Project
1. Go to **Pages** in Cloudflare Dashboard
2. Click **Create a project**
3. Choose **Upload assets** (not Git integration)
4. Name your project: `isitvegan-website`
5. Skip initial upload for now

#### 1.3 Configure Custom Domain
1. In your Pages project, go to **Custom domains**
2. Add custom domain: `isitvegan.net`
3. Add another: `www.isitvegan.net`
4. Cloudflare will automatically provision SSL certificates

### Step 2: DNS Configuration

Set up these DNS records in Cloudflare Dashboard → DNS:

```
Type    Name    Content                              Proxy
CNAME   www     isitvegan-website.pages.dev         ✅ Proxied
CNAME   @       isitvegan-website.pages.dev         ✅ Proxied
```

### Step 3: Email Service Setup

Choose one email service provider for the contact form:

#### Option A: Resend (Recommended - Simple Setup)
1. Sign up at [resend.com](https://resend.com)
2. Add your domain `isitvegan.net` 
3. Verify domain ownership
4. Get your API key from the dashboard

#### Option B: Mailgun
1. Sign up at [mailgun.com](https://mailgun.com)
2. Add your domain `isitvegan.net`
3. Configure DNS records as instructed by Mailgun
4. Get your API key and domain name

#### Option C: SendGrid
1. Sign up at [sendgrid.com](https://sendgrid.com)
2. Complete sender authentication
3. Get your API key from Settings → API Keys

### Step 4: Wrangler Authentication & Configuration

1. **Login to Cloudflare**:
   ```bash
   wrangler login
   ```

2. **Set up email service secrets** (choose your service):

   For Resend:
   ```bash
   cd website/functions
   wrangler secret put RESEND_API_KEY --env production
   ```

   For Mailgun:
   ```bash
   cd website/functions
   wrangler secret put MAILGUN_API_KEY --env production
   wrangler secret put MAILGUN_DOMAIN --env production
   ```

   For SendGrid:
   ```bash
   cd website/functions
   wrangler secret put SENDGRID_API_KEY --env production
   ```

### Step 5: Deploy Website

```bash
cd website
./deploy.sh
```

### Step 6: Set up Old Website Redirect

If you want to preserve the old website at `old.isitvegan.net`:

1. Create a subdomain DNS record:
   ```
   Type    Name    Content              Proxy
   CNAME   old     your-old-server-ip   ✅ Proxied
   ```

2. Set up a redirect rule in Cloudflare Dashboard → Rules → Redirect Rules

## 🔧 Configuration Files

### Website Structure
```
website/
├── public/                 # Static website files
│   ├── assets/
│   │   ├── images/        # Screenshots, logos, icons
│   │   └── icons/         # Favicons and touch icons
│   ├── index.html         # Main landing page
│   └── privacy.html       # Privacy policy
├── src/
│   ├── styles/main.css    # Main stylesheet
│   └── js/main.js         # JavaScript functionality
├── functions/
│   ├── contact.js         # Cloudflare Worker for contact form
│   └── wrangler.toml      # Worker configuration
├── wrangler.toml          # Main Cloudflare Pages configuration
├── deploy.sh              # Deployment script
└── README.md              # This file
```

### Environment Variables

The contact form worker uses these environment variables:

- `CONTACT_EMAIL`: Destination email (default: support@isitvegan.net)
- `RESEND_API_KEY`: Resend service API key (secret)
- `MAILGUN_API_KEY`: Mailgun API key (secret)
- `MAILGUN_DOMAIN`: Mailgun domain (secret)
- `SENDGRID_API_KEY`: SendGrid API key (secret)

## 🛠️ Development

### Local Development

1. Install dependencies:
   ```bash
   cd website
   npm install
   ```

2. Start local server:
   ```bash
   npm run dev
   ```

3. Test contact form locally:
   ```bash
   cd functions
   wrangler dev
   ```

### Making Changes

1. Edit files in `public/`, `src/`, or `functions/`
2. Test locally
3. Deploy with `./deploy.sh`

## 🔒 Security Features

- **Rate Limiting**: Contact form prevents spam (5 submissions per hour per IP)
- **Input Sanitization**: All form inputs are sanitized to prevent XSS
- **CORS Protection**: Proper CORS headers for API security
- **Email Protection**: Support email address is never exposed to clients
- **SSL/TLS**: Automatic HTTPS with Cloudflare certificates

## 🚨 Troubleshooting

### Common Issues

1. **"wrangler: command not found"**
   ```bash
   npm install -g wrangler
   ```

2. **"Not authenticated with Cloudflare"**
   ```bash
   wrangler login
   ```

3. **Contact form not working**
   - Check that email service API keys are set as secrets
   - Verify the worker is deployed: `wrangler list`
   - Check worker logs: `wrangler tail isitvegan-contact-form-prod`

4. **Website not updating**
   - Clear Cloudflare cache: Dashboard → Caching → Purge Everything
   - Check Pages deployment logs in dashboard

5. **DNS not resolving**
   - Verify nameservers are set to Cloudflare
   - Check DNS propagation: [dnschecker.org](https://dnschecker.org)
   - Ensure DNS records are proxied (orange cloud)

### Getting Help

- Check Cloudflare Pages documentation
- View deployment logs in Cloudflare Dashboard
- Test contact form with browser dev tools
- Check worker logs with `wrangler tail`

## 📱 Mobile App Links

- **iOS**: Available on the App Store
- **Android**: Coming soon

## 🔄 Maintenance

### Regular Tasks

1. **Monitor contact form**: Check that emails are being delivered
2. **Update dependencies**: Keep wrangler and other tools updated
3. **Check analytics**: Monitor website performance in Cloudflare Dashboard
4. **SSL certificates**: Automatically renewed by Cloudflare

### Backup

The website code is version controlled in your Git repository. Cloudflare automatically maintains backups of deployed versions.

## 📊 Analytics & Monitoring

Cloudflare provides built-in analytics for:
- Page views and visitors
- Performance metrics
- Security events
- Worker execution stats

Access these in: Cloudflare Dashboard → Analytics

## 🎨 Customization

### Color Scheme
The website uses the app's color scheme defined in `src/styles/main.css`:
- Primary: `#0a7ea4` (app tint color)
- Text: `#11181C` (dark text)
- Background: `#fff` (light background)

### Adding New Pages
1. Create HTML file in `public/`
2. Link from navigation in `public/index.html`
3. Update sitemap if needed
4. Deploy with `./deploy.sh`

### Modifying Contact Form
Edit `functions/contact.js` to change:
- Email templates
- Validation rules
- Rate limiting
- Email service provider

## 📄 License

This website is part of the Is It Vegan project. All rights reserved.