import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts"

// Mock Supabase client for testing
const mockSupabase = {
  rpc: async (funcName: string, params: any) => {
    console.log(`Mock RPC call: ${funcName}`, params);
    return { data: true, error: null };
  },
  from: (table: string) => ({
    insert: async (data: any) => {
      console.log(`Mock insert to ${table}:`, data);
      return { error: null };
    },
  }),
};

// Test data
const validWebhookPayload = {
  type: 'INITIAL_PURCHASE',
  data: {
    product_id: 'isitvegan_premium_monthly',
    transaction_id: 'test-transaction-123',
    device_id: 'test-device-id',
    purchase_date: '2024-01-01T00:00:00Z',
    expiration_date: '2024-02-01T00:00:00Z',
    auto_renew_status: true,
    is_trial_period: false,
  },
};

const lifetimeWebhookPayload = {
  type: 'INITIAL_PURCHASE',
  data: {
    product_id: 'isitvegan_premium_lifetime',
    transaction_id: 'test-transaction-456',
    device_id: 'test-device-id-2',
    purchase_date: '2024-01-01T00:00:00Z',
  },
};

const cancellationWebhookPayload = {
  type: 'CANCELLATION',
  data: {
    product_id: 'isitvegan_premium_monthly',
    transaction_id: 'test-transaction-789',
    device_id: 'test-device-id-3',
    purchase_date: '2024-01-01T00:00:00Z',
    cancellation_date: '2024-01-15T00:00:00Z',
  },
};

// Helper function to create test request
function createTestRequest(method: string, body?: any): Request {
  const url = 'https://test.supabase.co/functions/v1/subscription-webhook';
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  if (body) {
    init.body = JSON.stringify(body);
  }
  
  return new Request(url, init);
}

// Helper function to parse response
async function parseResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { body: text };
  }
}

Deno.test("Webhook - Handle OPTIONS request", async () => {
  // Import the webhook handler (we'll need to modify the original file to export the handler)
  const { webhookHandler } = await import('./index.ts');
  
  const request = createTestRequest('OPTIONS');
  const response = await webhookHandler(request);
  
  assertEquals(response.status, 200);
  assertExists(response.headers.get('Access-Control-Allow-Origin'));
});

Deno.test("Webhook - Handle GET request (should return 405)", async () => {
  const { webhookHandler } = await import('./index.ts');
  
  const request = createTestRequest('GET');
  const response = await webhookHandler(request);
  
  assertEquals(response.status, 405);
  
  const data = await parseResponse(response);
  assertEquals(data.error, 'Method not allowed');
});

Deno.test("Webhook - Handle invalid JSON payload", async () => {
  const { webhookHandler } = await import('./index.ts');
  
  const request = new Request('https://test.supabase.co/functions/v1/subscription-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'invalid json',
  });
  
  const response = await webhookHandler(request);
  assertEquals(response.status, 500);
});

Deno.test("Webhook - Handle missing required fields", async () => {
  const { webhookHandler } = await import('./index.ts');
  
  const invalidPayload = {
    type: 'INITIAL_PURCHASE',
    // Missing data field
  };
  
  const request = createTestRequest('POST', invalidPayload);
  const response = await webhookHandler(request);
  
  assertEquals(response.status, 400);
  
  const data = await parseResponse(response);
  assertEquals(data.error, 'Invalid webhook payload');
});

Deno.test("Webhook - Process monthly subscription purchase", async () => {
  const { webhookHandler } = await import('./index.ts');
  
  const request = createTestRequest('POST', validWebhookPayload);
  const response = await webhookHandler(request);
  
  assertEquals(response.status, 200);
  
  const data = await parseResponse(response);
  assertEquals(data.success, true);
  assertEquals(data.updated, true);
});

Deno.test("Webhook - Process lifetime subscription purchase", async () => {
  const { webhookHandler } = await import('./index.ts');
  
  const request = createTestRequest('POST', lifetimeWebhookPayload);
  const response = await webhookHandler(request);
  
  assertEquals(response.status, 200);
  
  const data = await parseResponse(response);
  assertEquals(data.success, true);
  assertEquals(data.updated, true);
});

Deno.test("Webhook - Process subscription cancellation", async () => {
  const { webhookHandler } = await import('./index.ts');
  
  const request = createTestRequest('POST', cancellationWebhookPayload);
  const response = await webhookHandler(request);
  
  assertEquals(response.status, 200);
  
  const data = await parseResponse(response);
  assertEquals(data.success, true);
  assertEquals(data.updated, true);
});

Deno.test("Webhook - Handle unknown product ID", async () => {
  const { webhookHandler } = await import('./index.ts');
  
  const unknownProductPayload = {
    ...validWebhookPayload,
    data: {
      ...validWebhookPayload.data,
      product_id: 'unknown_product_id',
    },
  };
  
  const request = createTestRequest('POST', unknownProductPayload);
  const response = await webhookHandler(request);
  
  assertEquals(response.status, 200);
  
  const data = await parseResponse(response);
  assertEquals(data.success, true);
  assertEquals(data.updated, false); // Should not update for unknown product
});

Deno.test("Webhook - Handle billing retry event", async () => {
  const { webhookHandler } = await import('./index.ts');
  
  const billingRetryPayload = {
    type: 'BILLING_RETRY',
    data: validWebhookPayload.data,
  };
  
  const request = createTestRequest('POST', billingRetryPayload);
  const response = await webhookHandler(request);
  
  assertEquals(response.status, 200);
  
  const data = await parseResponse(response);
  assertEquals(data.success, true);
  assertEquals(data.updated, false); // Billing retry doesn't update subscription
});

Deno.test("Webhook - Handle unknown event type", async () => {
  const { webhookHandler } = await import('./index.ts');
  
  const unknownEventPayload = {
    type: 'UNKNOWN_EVENT',
    data: validWebhookPayload.data,
  };
  
  const request = createTestRequest('POST', unknownEventPayload);
  const response = await webhookHandler(request);
  
  assertEquals(response.status, 200);
  
  const data = await parseResponse(response);
  assertEquals(data.success, true);
  assertEquals(data.updated, false); // Unknown events don't update subscription
});

// Test utility functions
Deno.test("getSubscriptionInfo - Valid product IDs", () => {
  const { getSubscriptionInfo } = await import('./index.ts');
  
  assertEquals(getSubscriptionInfo('isitvegan_premium_monthly'), {
    level: 'premium',
    duration: 30,
  });
  
  assertEquals(getSubscriptionInfo('isitvegan_premium_quarterly'), {
    level: 'premium',
    duration: 90,
  });
  
  assertEquals(getSubscriptionInfo('isitvegan_premium_semiannual'), {
    level: 'premium',
    duration: 180,
  });
  
  assertEquals(getSubscriptionInfo('isitvegan_premium_annual'), {
    level: 'premium',
    duration: 365,
  });
  
  assertEquals(getSubscriptionInfo('isitvegan_premium_lifetime'), {
    level: 'premium',
    duration: -1,
  });
});

Deno.test("getSubscriptionInfo - Invalid product ID", () => {
  const { getSubscriptionInfo } = await import('./index.ts');
  
  assertEquals(getSubscriptionInfo('invalid_product'), null);
});

// Test subscription activation processing
Deno.test("processSubscriptionActivation - Monthly subscription", async () => {
  const { processSubscriptionActivation } = await import('./index.ts');
  
  const result = await processSubscriptionActivation(validWebhookPayload.data);
  
  assertExists(result);
  assertEquals(result.deviceId, 'test-device-id');
  assertEquals(result.subscriptionLevel, 'premium');
  assertEquals(result.isActive, true);
  assertEquals(result.transactionId, 'test-transaction-123');
  assertExists(result.expiresAt);
});

Deno.test("processSubscriptionActivation - Lifetime subscription", async () => {
  const { processSubscriptionActivation } = await import('./index.ts');
  
  const result = await processSubscriptionActivation(lifetimeWebhookPayload.data);
  
  assertExists(result);
  assertEquals(result.deviceId, 'test-device-id-2');
  assertEquals(result.subscriptionLevel, 'premium');
  assertEquals(result.isActive, true);
  assertEquals(result.transactionId, 'test-transaction-456');
  assertEquals(result.expiresAt, undefined); // Lifetime has no expiration
});

Deno.test("processSubscriptionActivation - Unknown product", async () => {
  const { processSubscriptionActivation } = await import('./index.ts');
  
  const unknownData = {
    ...validWebhookPayload.data,
    product_id: 'unknown_product',
  };
  
  const result = await processSubscriptionActivation(unknownData);
  
  assertEquals(result, null);
});

// Test subscription cancellation processing
Deno.test("processSubscriptionCancellation - Valid cancellation", async () => {
  const { processSubscriptionCancellation } = await import('./index.ts');
  
  const result = await processSubscriptionCancellation(cancellationWebhookPayload.data);
  
  assertExists(result);
  assertEquals(result.deviceId, 'test-device-id-3');
  assertEquals(result.subscriptionLevel, 'free');
  assertEquals(result.isActive, false);
  assertEquals(result.transactionId, 'test-transaction-789');
  assertExists(result.expiresAt);
});

Deno.test("processSubscriptionCancellation - Unknown product", async () => {
  const { processSubscriptionCancellation } = await import('./index.ts');
  
  const unknownData = {
    ...cancellationWebhookPayload.data,
    product_id: 'unknown_product',
  };
  
  const result = await processSubscriptionCancellation(unknownData);
  
  assertEquals(result, null);
});

// Integration test with mock database
Deno.test("Webhook - Full integration test", async () => {
  const { webhookHandler } = await import('./index.ts');
  
  // Test successful purchase flow
  const purchaseRequest = createTestRequest('POST', validWebhookPayload);
  const purchaseResponse = await webhookHandler(purchaseRequest);
  
  assertEquals(purchaseResponse.status, 200);
  
  const purchaseData = await parseResponse(purchaseResponse);
  assertEquals(purchaseData.success, true);
  assertEquals(purchaseData.updated, true);
  
  // Test cancellation flow
  const cancellationRequest = createTestRequest('POST', cancellationWebhookPayload);
  const cancellationResponse = await webhookHandler(cancellationRequest);
  
  assertEquals(cancellationResponse.status, 200);
  
  const cancellationData = await parseResponse(cancellationResponse);
  assertEquals(cancellationData.success, true);
  assertEquals(cancellationData.updated, true);
});

// Test edge cases
Deno.test("Webhook - Handle missing device ID in payload", async () => {
  const { webhookHandler } = await import('./index.ts');
  
  const payloadWithoutDeviceId = {
    type: 'INITIAL_PURCHASE',
    data: {
      product_id: 'isitvegan_premium_monthly',
      transaction_id: 'test-transaction-123',
      user_id: 'test-user-id', // Only user_id, no device_id
      purchase_date: '2024-01-01T00:00:00Z',
      expiration_date: '2024-02-01T00:00:00Z',
    },
  };
  
  const request = createTestRequest('POST', payloadWithoutDeviceId);
  const response = await webhookHandler(request);
  
  assertEquals(response.status, 200);
  
  const data = await parseResponse(response);
  assertEquals(data.success, true);
  assertEquals(data.updated, true); // Should still work with user_id fallback
});

Deno.test("Webhook - Handle missing both device_id and user_id", async () => {
  const { webhookHandler } = await import('./index.ts');
  
  const payloadWithoutIds = {
    type: 'INITIAL_PURCHASE',
    data: {
      product_id: 'isitvegan_premium_monthly',
      transaction_id: 'test-transaction-123',
      purchase_date: '2024-01-01T00:00:00Z',
      expiration_date: '2024-02-01T00:00:00Z',
    },
  };
  
  const request = createTestRequest('POST', payloadWithoutIds);
  const response = await webhookHandler(request);
  
  assertEquals(response.status, 200);
  
  const data = await parseResponse(response);
  assertEquals(data.success, true);
  assertEquals(data.updated, true); // Should work with transaction_id fallback
});

// Performance test
Deno.test("Webhook - Handle rapid successive requests", async () => {
  const { webhookHandler } = await import('./index.ts');
  
  const requests = Array.from({ length: 10 }, (_, i) => {
    const payload = {
      ...validWebhookPayload,
      data: {
        ...validWebhookPayload.data,
        transaction_id: `test-transaction-${i}`,
        device_id: `test-device-${i}`,
      },
    };
    return createTestRequest('POST', payload);
  });
  
  const responses = await Promise.all(
    requests.map(request => webhookHandler(request))
  );
  
  // All requests should succeed
  responses.forEach(response => {
    assertEquals(response.status, 200);
  });
  
  // Verify all responses
  const responseData = await Promise.all(
    responses.map(response => parseResponse(response))
  );
  
  responseData.forEach(data => {
    assertEquals(data.success, true);
    assertEquals(data.updated, true);
  });
});