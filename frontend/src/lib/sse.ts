import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SSEEvent } from '@flora-pi/shared';

/* ================================================================
   SSE connection with auto-reconnect
   ================================================================ */

type SSECallback = (event: SSEEvent) => void;

const SSE_URL = '/api/events';
const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

/**
 * Creates a managed SSE connection that:
 *  - parses typed events from the Flora-Pi backend
 *  - reconnects with exponential backoff on failure
 *  - allows subscribers to listen to events
 */
export function createSSEClient() {
  let eventSource: EventSource | null = null;
  let retryMs = MIN_RETRY_MS;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<SSECallback>();

  function dispatch(event: SSEEvent) {
    listeners.forEach((cb) => {
      try {
        cb(event);
      } catch (err) {
        console.error('[SSE] listener error:', err);
      }
    });
  }

  function connect() {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource(SSE_URL);

    eventSource.onopen = () => {
      retryMs = MIN_RETRY_MS;
    };

    eventSource.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as SSEEvent;
        dispatch(event);
      } catch (err) {
        console.warn('[SSE] failed to parse event:', err);
      }
    };

    eventSource.onerror = () => {
      eventSource?.close();
      eventSource = null;
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (retryTimeout) return;
    retryTimeout = setTimeout(() => {
      retryTimeout = null;
      retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
      connect();
    }, retryMs);
  }

  function subscribe(cb: SSECallback) {
    listeners.add(cb);
    // Auto-connect when first listener arrives
    if (listeners.size === 1 && !eventSource) {
      connect();
    }
    return () => {
      listeners.delete(cb);
      // Disconnect when no more listeners
      if (listeners.size === 0) {
        disconnect();
      }
    };
  }

  function disconnect() {
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeout = null;
    }
    eventSource?.close();
    eventSource = null;
  }

  return { subscribe, disconnect };
}

/* Singleton client */
const sseClient = createSSEClient();

/* ================================================================
   React hook: useSSE
   Integrates SSE events with TanStack Query cache invalidation.
   ================================================================ */

/**
 * Subscribes to server-sent events and invalidates relevant TanStack
 * Query caches so the UI stays fresh without manual refetching.
 *
 * Optionally accepts an `onEvent` callback for custom handling.
 */
export function useSSE(onEvent?: SSECallback) {
  const queryClient = useQueryClient();
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const unsubscribe = sseClient.subscribe((event) => {
      // Forward to custom handler if provided
      onEventRef.current?.(event);

      // Invalidate query caches based on event type
      switch (event.type) {
        case 'sensor.reading':
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          queryClient.invalidateQueries({
            queryKey: ['plant-history', event.data.sensorId],
          });
          break;

        case 'recommendation.created':
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          queryClient.invalidateQueries({ queryKey: ['recommendations'] });
          queryClient.invalidateQueries({
            queryKey: ['plant-recommendations', event.data.plantId],
          });
          break;

        case 'plant.created':
        case 'plant.updated':
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          queryClient.invalidateQueries({ queryKey: ['plants'] });
          break;

        case 'plant.deleted':
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          queryClient.invalidateQueries({ queryKey: ['plants'] });
          break;

        case 'sensor.offline':
        case 'sensor.online':
          queryClient.invalidateQueries({ queryKey: ['sensors'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          break;
      }
    });

    return unsubscribe;
  }, [queryClient]);
}
