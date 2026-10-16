// Registers the bot's slash commands with Discord (run by the deploy workflow; by hand:
// DISCORD_APP_ID=… DISCORD_BOT_TOKEN=… node discord-register.mjs). Replaces the whole list each time.
import { COMMANDS } from "./src/discord-commands.js";

const app = process.env.DISCORD_APP_ID, token = process.env.DISCORD_BOT_TOKEN;
if (!app || !token) { console.error("DISCORD_APP_ID and DISCORD_BOT_TOKEN are needed"); process.exit(1); }
const r = await fetch(`https://discord.com/api/v10/applications/${app}/commands`, {
  method: "PUT",
  headers: { authorization: "Bot " + token, "content-type": "application/json" },
  body: JSON.stringify(COMMANDS),
});
if (!r.ok) { console.error("Discord answered", r.status, await r.text()); process.exit(1); }
console.log(`${(await r.json()).length} commands registered`);
