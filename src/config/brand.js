const rt = window.__APP_CONFIG__ || {}

export const brand = {
  apiUrl:       rt.apiUrl       || import.meta.env.VITE_API_URL            || 'http://localhost:3011',
  name:         rt.appName      || import.meta.env.VITE_APP_NAME           || 'Clara Ferreira CRM',
  logoUrl:      rt.logoUrl      || import.meta.env.VITE_APP_LOGO_URL       || '',
  primaryColor: rt.primaryColor || import.meta.env.VITE_APP_PRIMARY_COLOR  || '#ff007f',
  accentColor:  rt.accentColor  || import.meta.env.VITE_APP_ACCENT_COLOR   || '#cc0066',
  supportEmail: rt.supportEmail || import.meta.env.VITE_APP_SUPPORT_EMAIL  || '',
  footerText:   rt.footerText   || import.meta.env.VITE_APP_FOOTER_TEXT    || '© 2026 Clara Ferreira Acessórios',
}
