# Visual Changes: Before & After

## Auth Modal (Before)

```
┌─────────────────────────────────┐
│      Welcome Back               │
│ Log in to access your synced... │
├─────────────────────────────────┤
│                                 │
│  Email                          │
│  ┌─────────────────────────┐   │
│  │ you@example.com         │   │
│  └─────────────────────────┘   │
│                                 │
│  Password                       │
│  ┌─────────────────────────┐   │
│  │ ••••••••                │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │       Log In            │   │
│  └─────────────────────────┘   │
│                                 │
│  Don't have an account? Sign Up │
└─────────────────────────────────┘
```

## Auth Modal (After)

```
┌─────────────────────────────────┐
│      Welcome Back               │
│ Log in to access your synced... │
├─────────────────────────────────┤
│                                 │
│  ┌─────────────────────────┐   │
│  │ 🔵 Continue with Google │   │ ← NEW
│  └─────────────────────────┘   │
│                                 │
│          ─── or ───             │ ← NEW
│                                 │
│  Email                          │
│  ┌─────────────────────────┐   │
│  │ you@example.com         │   │
│  └─────────────────────────┘   │
│                                 │
│  Password                       │
│  ┌─────────────────────────┐   │
│  │ ••••••••                │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │       Log In            │   │
│  └─────────────────────────┘   │
│                                 │
│  Don't have an account? Sign Up │
└─────────────────────────────────┘
```

## Sign Up Mode (After)

```
┌─────────────────────────────────┐
│      Create Account             │
│ Sign up to sync your tasks...   │
├─────────────────────────────────┤
│                                 │
│  ┌─────────────────────────┐   │
│  │ 🔵 Continue with Google │   │ ← Also in Sign Up
│  └─────────────────────────┘   │
│                                 │
│          ─── or ───             │
│                                 │
│  Email                          │
│  ┌─────────────────────────┐   │
│  │ you@example.com         │   │
│  └─────────────────────────┘   │
│                                 │
│  Password                       │
│  ┌─────────────────────────┐   │
│  │ ••••••••                │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │       Sign Up           │   │
│  └─────────────────────────┘   │
│                                 │
│  Already have an account? Log In│
└─────────────────────────────────┘
```

## Google Button States

### Idle
```
┌─────────────────────────────┐
│ 🔵 Continue with Google     │
└─────────────────────────────┘
```

### Loading (Initiating OAuth)
```
┌─────────────────────────────┐
│ ⏳ Signing in with Google...│
└─────────────────────────────┘
```

### Redirecting
```
┌─────────────────────────────┐
│ ⏳ Redirecting to Google... │
└─────────────────────────────┘
```

## Error States

### User Cancelled
```
┌─────────────────────────────────┐
│  ⚠️ You cancelled Google sign-in.│
│  Please try again or use        │
│  email/password.                │
└─────────────────────────────────┘
```

### Popup Blocked
```
┌─────────────────────────────────┐
│  ⚠️ Pop-ups are blocked. Please │
│  enable them and try again.     │
└─────────────────────────────────┘
```

### Network Error
```
┌─────────────────────────────────┐
│  ⚠️ Unable to connect. Check    │
│  your internet and try again.   │
└─────────────────────────────────┘
```

## User Dropdown (Enhanced)

Google sign-in auto-populates user metadata:

```
┌─────────────────────────┐
│  JD  John Doe        ⌄  │ ← Avatar initial + Name from Google
└─────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  John Doe                       │ ← Full name from Google
│  john@gmail.com                 │ ← Email
├─────────────────────────────────┤
│  ⚙️  Settings                   │
│  📋  Activity Log               │
├─────────────────────────────────┤
│  🚪  Log out                    │
└─────────────────────────────────┘
```

## OAuth Flow (Visual)

```
1. User clicks Google button
   │
   ▼
┌─────────────────────────────┐
│ ⏳ Signing in with Google...│
└─────────────────────────────┘
   │
   ▼
2. Browser redirects to Google
   │
   ▼
┌─────────────────────────────────┐
│  Google OAuth Consent Screen    │
│                                 │
│  Allow "Minima" to access:      │
│  ☑ Your email address           │
│  ☑ Your basic profile info      │
│                                 │
│  [Cancel]        [Allow]        │
└─────────────────────────────────┘
   │
   ▼
3. User clicks "Allow"
   │
   ▼
4. Redirect to /auth/callback
   │
   ▼
5. Exchange code for session
   │
   ▼
6. Redirect to home page
   │
   ▼
┌─────────────────────────────┐
│  ✅ Logged in as John Doe   │
└─────────────────────────────┘
```

## Account Linking (Visual)

### Scenario: Same Email

```
Day 1: Sign up with email
┌─────────────────────────────┐
│ Email: john@example.com     │
│ Password: ••••••••          │
│ [Sign Up]                   │
└─────────────────────────────┘
   │
   ▼
auth.users:
┌─────────────────────────────┐
│ id: uuid-123                │
│ email: john@example.com     │
│ identities: [               │
│   { provider: "email" }     │
│ ]                           │
└─────────────────────────────┘

Day 7: Sign in with Google
┌─────────────────────────────┐
│ 🔵 Continue with Google     │
└─────────────────────────────┘
   │
   ▼
Google returns: john@example.com
   │
   ▼
auth.users:
┌─────────────────────────────┐
│ id: uuid-123  ← Same ID!    │
│ email: john@example.com     │
│ identities: [               │
│   { provider: "email" },    │
│   { provider: "google" } ←  │ Auto-linked!
│ ]                           │
└─────────────────────────────┘

Result: ✅ Single account, two sign-in methods
```

### Scenario: Different Email

```
Day 1: Sign up with email
┌─────────────────────────────┐
│ Email: work@company.com     │
│ Password: ••••••••          │
│ [Sign Up]                   │
└─────────────────────────────┘
   │
   ▼
auth.users:
┌─────────────────────────────┐
│ id: uuid-123                │
│ email: work@company.com     │
│ identities: [               │
│   { provider: "email" }     │
│ ]                           │
└─────────────────────────────┘

Day 7: Sign in with Google
┌─────────────────────────────┐
│ 🔵 Continue with Google     │
└─────────────────────────────┘
   │
   ▼
Google returns: personal@gmail.com
   │
   ▼
auth.users:
┌─────────────────────────────┐ ┌─────────────────────────────┐
│ id: uuid-123                │ │ id: uuid-456  ← New ID!     │
│ email: work@company.com     │ │ email: personal@gmail.com   │
│ identities: [               │ │ identities: [               │
│   { provider: "email" }     │ │   { provider: "google" }    │
│ ]                           │ │ ]                           │
└─────────────────────────────┘ └─────────────────────────────┘

Result: ✅ Two separate accounts (expected)
```

---

## Styling Details

### Google Button

**Light Mode:**
- Background: `#ffffff`
- Border: `1px solid #d1d5db` (gray-300)
- Text: `#374151` (gray-700)
- Hover: `#f9fafb` (gray-50)

**Dark Mode:**
- Background: `#1f2937` (gray-800)
- Border: `1px solid #374151` (gray-700)
- Text: `#d1d5db` (gray-300)
- Hover: `#374151` (gray-700)

### Divider

- Line: `1px solid #e5e7eb` (gray-200) in light mode
- Line: `1px solid #374151` (gray-700) in dark mode
- Text: `12px`, `#9ca3af` (gray-400)
- Spacing: `16px` (my-4) top and bottom

### Google Logo

- Size: `18x18px`
- Format: SVG (inline, official Google brand colors)
- Colors: 
  - Red: `#EA4335`
  - Blue: `#4285F4`
  - Yellow: `#FBBC05`
  - Green: `#34A853`

---

**All changes maintain your existing design system and dark mode support!**
