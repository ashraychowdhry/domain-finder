import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

const nextConfig: NextConfig = {
  /* config options here */
};

// BotID protects the paid model endpoints from scripted abuse — the wrapper
// sets up the challenge proxy rewrites it needs.
export default withBotId(nextConfig);
