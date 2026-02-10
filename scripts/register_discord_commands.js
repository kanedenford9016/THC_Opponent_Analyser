import "dotenv/config";

const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.APP_ID;

if (!token || !appId) {
  console.error("Missing DISCORD_BOT_TOKEN or DISCORD_APP_ID.");
  process.exit(1);
}

const commands = [
  {
    name: "member_analysis",
    description: "Generate a member analysis PDF report.",
  },
  {
    name: "forget_key",
    description: "Forget your stored API key.",
  },
];

const url = `https://discord.com/api/v10/applications/${appId}/commands`;

const response = await fetch(url, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(commands),
});

if (!response.ok) {
  const text = await response.text();
  console.error("Failed to register commands:", response.status, text);
  process.exit(1);
}

console.log("Discord commands registered.");
