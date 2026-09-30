import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Behind nginx every request arrives from 127.0.0.1, so the stock tracker (`req.ip`) would put
 * the whole internet in one bucket. nginx overwrites X-Real-IP with `$remote_addr`, which makes it
 * the one client-address header a caller cannot forge — unlike X-Forwarded-For, which nginx only
 * appends to.
 */
@Injectable()
export class LeadsThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = req.headers as Record<string, string | string[] | undefined>;
    const realIp = headers['x-real-ip'];
    return (typeof realIp === 'string' && realIp) || String(req.ip ?? 'unknown');
  }
}
