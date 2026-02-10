# Discord Member Analysis Bot

This bot runs member analysis only and returns a PDF report.

## Environment

Set these variables (via .env or runtime env vars):

- DISCORD_BOT_TOKEN: Discord bot token
- DISCORD_GUILD_ID: Optional guild ID for faster command sync
- BASE_URL: Torn API base URL (example: https://api.torn.com/v2)

## Run Locally

```bash
python -m discord_bot
```

## Docker

```bash
docker build -t thc-edge-bot -f discord_bot/Dockerfile .
docker run --env-file .env thc-edge-bot
```

## Usage

1. Run `/member_analysis` in Discord.
2. Choose limited or full API key.
3. Enter a faction ID or opponent IDs (comma-separated).
4. Receive the PDF report as an attachment.

The bot stores your API key in memory for 30 minutes and never persists it.
