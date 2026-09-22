// Upgrade already-installed legacy registrations to the same routing logic.
// New sessions register only /sw.js; the portal removes the legacy UV scope.
importScripts('/sw.js?v=20260922-1');
