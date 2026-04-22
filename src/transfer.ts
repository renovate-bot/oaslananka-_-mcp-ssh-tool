import * as fs from "fs";
import * as path from "path";
import { createHash } from "node:crypto";
import type { SFTPWrapper, Stats } from "ssh2";
import { createFilesystemError } from "./errors.js";
import { logger } from "./logging.js";
import type { MetricsCollector } from "./metrics.js";
import type { PolicyEngine } from "./policy.js";
import type { SessionManager } from "./session.js";

export interface TransferProgress {
  filename: string;
  transferred: number;
  total: number;
  percentage: number;
  bytesPerSecond: number;
  eta: number;
}

export interface TransferOptions {
  sessionId: string;
  onProgress?: (progress: TransferProgress) => void;
}

export interface TransferResult {
  success: boolean;
  filename: string;
  size: number;
  durationMs: number;
  averageSpeed: number;
  sha256: string;
  verified: boolean;
}

export interface TransferService {
  uploadFileWithProgress(
    localPath: string,
    remotePath: string,
    options: TransferOptions,
  ): Promise<TransferResult>;
  downloadFileWithProgress(
    remotePath: string,
    localPath: string,
    options: TransferOptions,
  ): Promise<TransferResult>;
}

export interface TransferServiceDeps {
  sessionManager: Pick<SessionManager, "getSession">;
  metrics: Pick<MetricsCollector, "recordTransfer">;
  policy: Pick<PolicyEngine, "assertAllowed">;
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function sftpWriteFile(sftp: SFTPWrapper, remotePath: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.writeFile(remotePath, data, {}, (err: Error | null | undefined) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function sftpReadFile(sftp: SFTPWrapper, remotePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    sftp.readFile(remotePath, (err: Error | null | undefined, data: Buffer) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(data);
    });
  });
}

function sftpStat(sftp: SFTPWrapper, remotePath: string): Promise<Stats> {
  return new Promise((resolve, reject) => {
    sftp.stat(remotePath, (err: Error | null | undefined, stats: Stats) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stats);
    });
  });
}

export function createTransferService({
  sessionManager,
  metrics,
  policy,
}: TransferServiceDeps): TransferService {
  async function uploadFileWithProgress(
    localPath: string,
    remotePath: string,
    options: TransferOptions,
  ): Promise<TransferResult> {
    const { sessionId, onProgress } = options;

    logger.debug("Starting file upload with progress", {
      sessionId,
      localPath,
      remotePath,
    });

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw createFilesystemError("Session not found or expired");
    }
    if (!session.sftp) {
      throw createFilesystemError("SFTP subsystem is unavailable for this session");
    }

    const decision = policy.assertAllowed({
      action: "transfer.upload",
      path: remotePath,
      mode: session.info.policyMode,
    });
    if (decision.mode === "explain") {
      return {
        success: true,
        filename: path.basename(localPath),
        size: 0,
        durationMs: 0,
        averageSpeed: 0,
        sha256: "",
        verified: false,
      };
    }

    const startTime = Date.now();
    const filename = path.basename(localPath);

    try {
      const stats = await fs.promises.stat(localPath);
      const totalSize = stats.size;
      const fileContent = await fs.promises.readFile(localPath);
      const localSha256 = sha256(fileContent);

      await sftpWriteFile(session.sftp, remotePath, fileContent);
      const remoteContent = await sftpReadFile(session.sftp, remotePath);
      const remoteSha256 = sha256(remoteContent);
      const verified = localSha256 === remoteSha256;
      if (!verified) {
        throw createFilesystemError(
          `Transfer verification failed for ${remotePath}`,
          "Remote SHA-256 does not match the local file after upload",
        );
      }

      if (onProgress) {
        const elapsed = (Date.now() - startTime) / 1000 || 1;
        onProgress({
          filename,
          transferred: totalSize,
          total: totalSize,
          percentage: 100,
          bytesPerSecond: totalSize / elapsed,
          eta: 0,
        });
      }

      const durationMs = Date.now() - startTime;
      const averageSpeed = totalSize / ((durationMs || 1) / 1000);

      logger.info("File upload completed", {
        sessionId,
        filename,
        size: totalSize,
        durationMs,
        averageSpeed,
        sha256: localSha256,
      });
      metrics.recordTransfer("upload", totalSize);

      return {
        success: true,
        filename,
        size: totalSize,
        durationMs,
        averageSpeed,
        sha256: localSha256,
        verified,
      };
    } catch (error) {
      logger.error("File upload failed", { sessionId, localPath, error });
      throw createFilesystemError(`Failed to upload ${localPath}: ${error}`);
    }
  }

  async function downloadFileWithProgress(
    remotePath: string,
    localPath: string,
    options: TransferOptions,
  ): Promise<TransferResult> {
    const { sessionId, onProgress } = options;

    logger.debug("Starting file download with progress", {
      sessionId,
      remotePath,
      localPath,
    });

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw createFilesystemError("Session not found or expired");
    }
    if (!session.sftp) {
      throw createFilesystemError("SFTP subsystem is unavailable for this session");
    }

    const decision = policy.assertAllowed({
      action: "transfer.download",
      path: remotePath,
      mode: session.info.policyMode,
    });
    if (decision.mode === "explain") {
      return {
        success: true,
        filename: path.basename(remotePath),
        size: 0,
        durationMs: 0,
        averageSpeed: 0,
        sha256: "",
        verified: false,
      };
    }

    const startTime = Date.now();
    const filename = path.basename(remotePath);

    try {
      const stats = await sftpStat(session.sftp, remotePath);
      const totalSize = stats.size ?? 0;
      const data = await sftpReadFile(session.sftp, remotePath);
      const remoteSha256 = sha256(data);
      const tempLocalPath = `${localPath}.tmp.${Date.now()}`;
      await fs.promises.writeFile(tempLocalPath, data);
      const localData = await fs.promises.readFile(tempLocalPath);
      const localSha256 = sha256(localData);
      const verified = remoteSha256 === localSha256;
      if (!verified) {
        await fs.promises.rm(tempLocalPath, { force: true });
        throw createFilesystemError(
          `Transfer verification failed for ${remotePath}`,
          "Local SHA-256 does not match the remote file after download",
        );
      }
      await fs.promises.rename(tempLocalPath, localPath);

      if (onProgress) {
        const elapsed = (Date.now() - startTime) / 1000 || 1;
        onProgress({
          filename,
          transferred: totalSize,
          total: totalSize,
          percentage: 100,
          bytesPerSecond: totalSize / elapsed,
          eta: 0,
        });
      }

      const durationMs = Date.now() - startTime;
      const averageSpeed = totalSize / ((durationMs || 1) / 1000);

      logger.info("File download completed", {
        sessionId,
        filename,
        size: totalSize,
        durationMs,
        averageSpeed,
        sha256: remoteSha256,
      });
      metrics.recordTransfer("download", totalSize);

      return {
        success: true,
        filename,
        size: totalSize,
        durationMs,
        averageSpeed,
        sha256: remoteSha256,
        verified,
      };
    } catch (error) {
      logger.error("File download failed", { sessionId, remotePath, error });
      throw createFilesystemError(`Failed to download ${remotePath}: ${error}`);
    }
  }

  return {
    uploadFileWithProgress,
    downloadFileWithProgress,
  };
}

export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond >= 1024 * 1024) {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
  }
  if (bytesPerSecond >= 1024) {
    return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
  }
  return `${bytesPerSecond.toFixed(0)} B/s`;
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
}

export function formatETA(seconds: number): string {
  if (seconds < 60) {
    return `${Math.ceil(seconds)}s`;
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `${mins}m ${secs}s`;
  }

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}
