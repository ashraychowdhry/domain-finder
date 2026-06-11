import { initBotId } from "botid/client/core";

// Every route that spends money (model tokens) or external-API quota gets
// BotID's invisible challenge. Plain curl/fetch scripts fail checkBotId()
// server-side even when rotating IPs.
initBotId({
  protect: [
    { path: "/api/generate", method: "POST" },
    { path: "/api/refine", method: "POST" },
    { path: "/api/analyze", method: "POST" },
    { path: "/api/check", method: "POST" },
  ],
});
