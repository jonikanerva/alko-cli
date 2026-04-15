import * as fs from 'node:fs/promises';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Download the Alko price list Excel file.
 * Uses a two-step session approach to bypass Incapsula bot protection:
 * 1. Visit the homepage to receive session cookies.
 * 2. Fetch the Excel file with those cookies.
 */
export async function downloadPriceList(): Promise<ArrayBuffer> {
  logger.info('Establishing session with alko.fi');

  const homeResponse = await fetch(`${config.alkoBaseUrl}/`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fi-FI,fi;q=0.9,en;q=0.8',
    },
  });

  const cookies = homeResponse.headers.get('set-cookie') || '';

  // Small delay to mimic browser timing
  await new Promise((resolve) => setTimeout(resolve, 1000));

  logger.info('Downloading Alko price list');
  const excelResponse = await fetch(config.alkoPriceListUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,*/*',
      'Accept-Language': 'fi-FI,fi;q=0.9,en;q=0.8',
      Referer: `${config.alkoBaseUrl}/valikoimat-ja-hinnasto/hinnasto`,
      Cookie: cookies,
    },
  });

  if (!excelResponse.ok) {
    throw new Error(
      `Failed to download price list: ${excelResponse.status} ${excelResponse.statusText}`
    );
  }

  const contentType = excelResponse.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error('Received HTML instead of Excel — likely blocked by bot protection');
  }

  const buffer = await excelResponse.arrayBuffer();
  logger.info(`Downloaded ${buffer.byteLength} bytes`);
  return buffer;
}

/**
 * Read an Excel file from the local filesystem (for --from-file override).
 */
export async function readLocalPriceList(filePath: string): Promise<ArrayBuffer> {
  const data = await fs.readFile(filePath);
  // Create a fresh ArrayBuffer view backed by the Node Buffer
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}
