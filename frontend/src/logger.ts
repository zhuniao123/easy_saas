import type { PageLoggingConfig } from './pageDsl';

export const logEvent = (
  pageCode: string,
  config: PageLoggingConfig | undefined,
  eventType: 'click' | 'query' | 'create' | 'edit' | 'delete' | 'filter',
  elementCode: string,
  message: string,
  details: Record<string, unknown> = {}
) => {
  // If logging configuration is absent, default is to log to console
  const isEnabled = config ? config.enabled !== false : true;
  const printConsole = config ? config.console !== false : true;
  const reportServer = config ? config.reportToServer === true : false;

  // Filter events if specified
  if (config?.events && !config.events.includes(eventType)) {
    return;
  }

  if (!isEnabled) return;

  const timestamp = new Date().toISOString();

  if (printConsole) {
    console.log(
      `%c[LOWCODE LOG] [${timestamp}] [${pageCode}] [${eventType.toUpperCase()}] [${elementCode}]: ${message}`,
      'color: #22d3ee; font-weight: bold; background: #0f172a; border: 1px solid #22d3ee/30; padding: 3px 6px; border-radius: 6px;',
      details
    );
  }

  if (reportServer) {
    fetch(`/api/v1/pages/${encodeURIComponent(pageCode)}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType,
        elementCode,
        message,
        details,
      }),
    }).catch((err) => {
      console.warn('Failed to send client-side log to database:', err);
    });
  }
};
