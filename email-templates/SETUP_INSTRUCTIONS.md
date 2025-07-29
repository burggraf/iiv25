# Email Template Setup Instructions for Is It Vegan

## Overview
This guide will help you update your Supabase email confirmation template with the new branded design.

## Method 1: Using Supabase Dashboard (Recommended)

1. **Access Email Templates**
   - Go to [Supabase Dashboard](https://supabase.com/dashboard)
   - Select your Is It Vegan project
   - Navigate to **Authentication** → **Email Templates**

2. **Update Confirmation Template**
   - Select **"Confirm signup"** template
   - Replace the existing HTML content with the content from `confirmation-template.html`
   - Update the subject line to: `"Welcome to Is It Vegan! Please confirm your email"`

3. **Save Changes**
   - Click **Save** to apply the new template
   - The changes will take effect immediately for new signups

## Method 2: Using Supabase Management API

If you prefer to update via API, use this curl command:

```bash
# Get your access token from https://supabase.com/dashboard/account/tokens
export SUPABASE_ACCESS_TOKEN="your-access-token"
export PROJECT_REF="wlatnzsnrlwykkriovwd"

# Update the confirmation email template
curl -X PATCH "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mailer_subjects_confirmation": "Welcome to Is It Vegan! Please confirm your email",
    "mailer_templates_confirmation_content": "<!-- Paste the HTML content from confirmation-template.html here -->"
  }'
```

## Template Features

The new email template includes:

### Visual Design
- **App Branding**: Uses your app icon from isitvegan.net
- **Green Theme**: Matches your app's color scheme with gradient backgrounds
- **Responsive Design**: Optimized for both desktop and mobile email clients
- **Professional Layout**: Clean, modern design with proper spacing and typography

### Content Elements
- **Welcome Message**: Friendly introduction to "Is It Vegan?"
- **Clear Call-to-Action**: Prominent green confirmation button
- **App Features**: Overview of key functionality (barcode scanning, search, history)
- **App Store Link**: Direct link to iOS app download
- **Footer Links**: Website, privacy policy, and contact information

### Technical Features
- **Mobile Responsive**: Adapts to different screen sizes
- **Email Client Compatible**: Works with major email providers (Gmail, Outlook, Apple Mail)
- **Inline CSS**: All styles are inline for maximum compatibility
- **Fallback Support**: Graceful degradation for older email clients

## Testing the Template

1. **Test Signup Flow**
   - Create a test account with a new email address
   - Check that the new template is delivered correctly
   - Verify the confirmation link works properly

2. **Email Client Testing**
   - Test the email appearance in different clients:
     - Gmail (web and mobile)
     - Apple Mail
     - Outlook
     - Other major providers

3. **Mobile Responsiveness**
   - Check how the email displays on mobile devices
   - Ensure buttons are easily tappable
   - Verify text is readable without zooming

## Troubleshooting

### Common Issues
- **Images not loading**: Make sure your website images are publicly accessible
- **Styles not applying**: Some email clients strip CSS - the template uses inline styles to minimize this
- **Links not working**: Verify the `{{ .ConfirmationURL }}` variable is properly included

### Fallback Options
If you encounter issues with the full template, you can use a simplified version:

```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: linear-gradient(135deg, #95bf0a 0%, #00a32c 100%); padding: 40px; text-align: center;">
    <h1 style="color: white; margin: 0;">Is It Vegan?</h1>
  </div>
  <div style="padding: 40px;">
    <h2>Welcome to Is It Vegan! 🌱</h2>
    <p>Thank you for joining our community of conscious consumers!</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{ .ConfirmationURL }}" style="background: #95bf0a; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Confirm My Email</a>
    </div>
    <p>Start scanning barcodes to discover vegan and vegetarian products instantly!</p>
  </div>
</div>
```

## Support

If you need help with the template setup:
- Check the [Supabase Email Templates documentation](https://supabase.com/docs/guides/auth/auth-email-templates)
- Contact Supabase support for technical issues with their platform
- Review email client compatibility guides for rendering issues