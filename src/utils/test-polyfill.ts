// Test utility to check if polyfill is working
export const testPolyfill = () => {
  console.log('Testing polyfill...');
  
  // Test structuredClone
  if (typeof global.structuredClone === 'function') {
    console.log('✅ structuredClone is available');
    
    // Test basic functionality
    const testObj = { a: 1, b: { c: 2 } };
    const cloned = global.structuredClone(testObj);
    
    if (cloned.a === 1 && cloned.b.c === 2 && cloned !== testObj) {
      console.log('✅ structuredClone works correctly');
    } else {
      console.log('❌ structuredClone not working properly');
    }
  } else {
    console.log('❌ structuredClone is not available');
  }
  
  // Test AbortController
  if (typeof global.AbortController === 'function') {
    console.log('✅ AbortController is available');
  } else {
    console.log('❌ AbortController is not available');
  }
};