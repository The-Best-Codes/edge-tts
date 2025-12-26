import * as crypto from "crypto";
import { TRUSTED_CLIENT_TOKEN } from "./constants";
import { SkewAdjustmentError } from "./exceptions";

const WIN_EPOCH = 11644473600;
const S_TO_NS = 1e9;

export class DRM {
  private static clockSkewSeconds = 0.0;

  static adjustClockSkewSeconds(skewSeconds: number): void {
    DRM.clockSkewSeconds += skewSeconds;
  }

  static getUnixTimestamp(): number {
    return Date.now() / 1000 + DRM.clockSkewSeconds;
  }

  static parseRFC2616Date(dateStr: string): number | null {
    const timestamp = Date.parse(dateStr);
    if (isNaN(timestamp)) {
      return null;
    }
    return timestamp / 1000;
  }

  static handleClientResponseError(headers: Record<string, any>): void {
    const serverDate = headers["date"] || headers["Date"];

    if (!serverDate || typeof serverDate !== "string") {
      throw new SkewAdjustmentError("No server date in headers.");
    }

    const serverDateParsed = DRM.parseRFC2616Date(serverDate);
    if (serverDateParsed === null) {
      throw new SkewAdjustmentError(
        `Failed to parse server date: ${serverDate}`,
      );
    }

    const clientDate = DRM.getUnixTimestamp();
    DRM.adjustClockSkewSeconds(serverDateParsed - clientDate);
  }

  static generateSecMsGec(): string {
    let ticks = DRM.getUnixTimestamp();

    ticks += WIN_EPOCH;

    ticks -= ticks % 300;

    ticks *= 10_000_000;

    const strToHash = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;

    return crypto
      .createHash("sha256")
      .update(strToHash, "ascii")
      .digest("hex")
      .toUpperCase();
  }

  static generateMuid(): string {
    return crypto.randomBytes(16).toString("hex").toUpperCase();
  }

  static headersWithMuid(
    headers: Record<string, string>,
  ): Record<string, string> {
    return {
      ...headers,
      Cookie: `muid=${DRM.generateMuid()};`,
    };
  }
}
