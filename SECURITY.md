# Security Considerations

## EAS Configuration

### Files in Git
- ✅ `eas.json.template` - Template with placeholder values
- ✅ `app.json` - App configuration (project ID is public)
- ❌ `eas.json` - Gitignored (may contain sensitive data)

### Setup Process
1. Copy template: `cp eas.json.template eas.json`
2. Fill in your actual values in `eas.json`
3. Keep `eas.json` local only (it's gitignored)

### What's Sensitive?
- **Apple ID email** - Used for App Store submissions
- **App Store Connect App ID** - Internal Apple identifier
- **Google Service Account keys** - For Play Store API access
- **Project credentials** - Team-specific configurations

### What's Safe to Commit?
- **Expo Project ID** - Public identifier, needed for builds
- **Build profiles** - Configuration settings, not secrets
- **Bundle identifiers** - Public app identifiers
- **Permissions and descriptions** - Public metadata

## Best Practices

1. **Never commit real credentials** to version control
2. **Use templates** for configuration files with sensitive data
3. **Document** what needs to be filled in locally
4. **Use environment variables** for CI/CD systems
5. **Rotate credentials** if accidentally committed

## Team Collaboration

When working with a team:
1. Share the template file (`eas.json.template`)
2. Document required values in setup guides
3. Use team-shared Expo organizations for consistent project IDs
4. Keep individual credentials separate