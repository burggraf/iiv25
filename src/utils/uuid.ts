// Simple UUID v4 generator without external dependencies
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Alternative simple ID generator if you don't need full UUID format
export function generateSimpleId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}