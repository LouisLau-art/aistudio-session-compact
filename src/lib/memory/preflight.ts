import {
  collectMemoryDoctorReport,
  renderMemoryDoctorReport,
  type MemoryDoctorMode,
} from "./doctor.js";

export interface MemoryPreflightRequest {
  memoryDir: string;
  mode: MemoryDoctorMode;
}

export type MemoryCommandPreflight = (request: MemoryPreflightRequest) => boolean;

export function runMemoryPreflight(
  request: MemoryPreflightRequest,
  write: (message: string) => void = console.error,
): boolean {
  const report = collectMemoryDoctorReport({
    memoryDir: request.memoryDir,
    mode: request.mode,
  });

  if (report.ready) {
    return true;
  }

  write(renderMemoryDoctorReport(report));
  return false;
}
