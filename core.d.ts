export interface RadioChronCoreClientOptions {
  executablePath?: string;
}

export class RadioChronCoreClient {
  constructor(options?: RadioChronCoreClientOptions);
  call(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
  dispose(): void;
}

export function getRadioChronCoreClient(): RadioChronCoreClient;
export function disposeRadioChronCoreClient(): void;
export function resolveRadioChronCoreBridgePath(options?: RadioChronCoreClientOptions): string;
export function radiochronCoreManifestPath(): string;
export function targetFor(platform?: NodeJS.Platform, arch?: string): { key: string; executable: string };
