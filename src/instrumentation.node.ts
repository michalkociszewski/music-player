import path from "path";
import { spawn } from "child_process";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const slskdBin = path.join(process.cwd(), "slskd", "slskd");

  const proc = spawn(slskdBin, ["--no-logo"], {
    stdio: "ignore",
    detached: false,
  });

  proc.on("error", () => {
    // slskd not found or failed to start — radio will fall back gracefully
  });

  process.on("exit", () => proc.kill());
}
