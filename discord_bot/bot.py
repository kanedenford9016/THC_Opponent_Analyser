"""Discord bot for member analysis with PDF reports."""

import asyncio
import logging
from pathlib import Path
from typing import List, Optional

import discord
from discord import app_commands
from discord.ext import commands

from discord_bot.key_store import ApiKeyStore
from discord_bot.settings import DISCORD_BOT_TOKEN, DISCORD_GUILD_ID
from thc_edge.api_client import APIClient
from thc_edge.member_analysis import MemberAnalyzer
from thc_edge.pdf_report import MemberVettingPDF


API_KEY_TTL_SECONDS = 30 * 60
logger = logging.getLogger("discord_bot")
logging.basicConfig(level=logging.INFO)


class ApiKeyModal(discord.ui.Modal):
    """Collect a Torn API key from the user."""

    def __init__(self, key_store: ApiKeyStore, key_type: str):
        super().__init__(title="Enter Torn API Key")
        self._key_store = key_store
        self._key_type = key_type
        self.api_key = discord.ui.TextInput(
            label=f"{key_type.title()} API Key",
            placeholder="Paste your API key here",
            required=True,
            min_length=10,
            max_length=120,
        )
        self.add_item(self.api_key)

    async def on_submit(self, interaction: discord.Interaction) -> None:
        api_key = str(self.api_key.value).strip()
        if not api_key:
            await interaction.response.send_message(
                "API key cannot be empty.",
                ephemeral=interaction.guild is not None,
            )
            return

        await self._key_store.set_key(interaction.user.id, api_key, self._key_type)

        await interaction.response.send_message(
            "API key saved for 30 minutes. Choose a target type:",
            view=TargetTypeView(self._key_store),
            ephemeral=interaction.guild is not None,
        )


class ApiKeyTypeView(discord.ui.View):
    """Let the user choose between limited or full API key."""

    def __init__(self, key_store: ApiKeyStore):
        super().__init__(timeout=300)
        self._key_store = key_store

    @discord.ui.button(label="Limited API Key", style=discord.ButtonStyle.primary)
    async def limited_key(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await interaction.response.send_modal(ApiKeyModal(self._key_store, "limited"))

    @discord.ui.button(label="Full API Key", style=discord.ButtonStyle.success)
    async def full_key(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await interaction.response.send_modal(ApiKeyModal(self._key_store, "full"))


class TargetTypeView(discord.ui.View):
    """Let the user choose how to target member analysis."""

    def __init__(self, key_store: ApiKeyStore):
        super().__init__(timeout=300)
        self._key_store = key_store

    @discord.ui.button(label="Faction ID", style=discord.ButtonStyle.primary)
    async def faction_id(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await interaction.response.send_modal(TargetIdModal(self._key_store, "faction"))

    @discord.ui.button(label="Opponent IDs", style=discord.ButtonStyle.secondary)
    async def opponent_ids(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await interaction.response.send_modal(TargetIdModal(self._key_store, "opponents"))


class TargetIdModal(discord.ui.Modal):
    """Collect target IDs for member analysis."""

    def __init__(self, key_store: ApiKeyStore, target_type: str):
        title = "Enter Faction ID" if target_type == "faction" else "Enter Opponent IDs"
        super().__init__(title=title)
        self._key_store = key_store
        self._target_type = target_type
        label = "Faction ID" if target_type == "faction" else "Opponent IDs (comma-separated)"
        self.target_ids = discord.ui.TextInput(
            label=label,
            placeholder="123456" if target_type == "faction" else "123, 456, 789",
            required=True,
            min_length=1,
            max_length=2000,
        )
        self.add_item(self.target_ids)

    async def on_submit(self, interaction: discord.Interaction) -> None:
        ephemeral = interaction.guild is not None
        await interaction.response.defer(ephemeral=ephemeral, thinking=True)
        pdf_path: Optional[Path] = None

        try:
            key_entry = await self._key_store.get_key(interaction.user.id)
            if not key_entry:
                await interaction.followup.send(
                    "Your API key has expired. Run the command again to enter a new key.",
                    ephemeral=ephemeral,
                )
                return

            api_key, _ = key_entry
            raw_ids = str(self.target_ids.value).strip()
            if not raw_ids:
                await interaction.followup.send("No IDs provided.", ephemeral=ephemeral)
                return

            try:
                if self._target_type == "faction":
                    member_ids = await fetch_faction_member_ids(api_key, raw_ids)
                else:
                    member_ids = parse_member_ids(raw_ids)
            except ValueError as exc:
                await interaction.followup.send(str(exc), ephemeral=ephemeral)
                return

            if not member_ids:
                await interaction.followup.send("No valid member IDs found.", ephemeral=ephemeral)
                return

            analyses = await run_member_analysis(api_key, member_ids)
            if not analyses:
                await interaction.followup.send(
                    "No member data could be analyzed.",
                    ephemeral=ephemeral,
                )
                return

            pdf_path = await generate_pdf_report(analyses)
            file = discord.File(str(pdf_path), filename=pdf_path.name)

            await interaction.followup.send(
                content=f"Generated report for {len(analyses)} member(s).",
                file=file,
                ephemeral=ephemeral,
            )
        except discord.Forbidden:
            await interaction.followup.send(
                "I do not have permission to send messages or attach files in this channel.",
                ephemeral=ephemeral,
            )
        except discord.HTTPException as exc:
            logger.exception("Discord API error while responding to interaction.")
            await interaction.followup.send(
                f"Discord API error: {exc}",
                ephemeral=ephemeral,
            )
        except Exception:
            logger.exception("Unexpected error during member analysis.")
            await interaction.followup.send(
                "An unexpected error occurred while generating the report.",
                ephemeral=ephemeral,
            )
        finally:
            if pdf_path:
                pdf_path.unlink(missing_ok=True)


def parse_member_ids(raw_ids: str) -> List[str]:
    member_ids = [mid.strip() for mid in raw_ids.split(",") if mid.strip()]
    if not member_ids:
        raise ValueError("No valid IDs provided.")
    for member_id in member_ids:
        if not member_id.isdigit():
            raise ValueError(f"Invalid member ID: {member_id}")
    return member_ids


async def fetch_faction_member_ids(api_key: str, faction_id: str) -> List[str]:
    if not faction_id.isdigit():
        raise ValueError("Faction ID must be numeric.")

    api_client = APIClient(api_key=api_key)
    member_ids = await api_client.fetch_faction_opponents(faction_id)

    if not member_ids:
        raise ValueError("No members found or insufficient API permissions.")

    return member_ids


async def run_member_analysis(api_key: str, member_ids: List[str]) -> List[dict]:
    api_client = APIClient(api_key=api_key)
    analyzer = MemberAnalyzer(api_client=api_client)

    analyses: List[dict] = []
    for member_id in member_ids:
        analysis = await analyzer.analyze_member(member_id)
        if analysis:
            analyses.append(analysis)

    return analyses


async def generate_pdf_report(analyses: List[dict]) -> Path:
    pdf_generator = MemberVettingPDF()
    filename = f"member_vetting_report_{int(asyncio.get_running_loop().time())}.pdf"
    return pdf_generator.generate_report(analyses, filename=filename)


def build_bot() -> commands.Bot:
    intents = discord.Intents.default()
    bot = commands.Bot(command_prefix="!", intents=intents)
    key_store = ApiKeyStore(API_KEY_TTL_SECONDS)

    @bot.event
    async def on_ready() -> None:
        try:
            await bot.tree.sync()
            if DISCORD_GUILD_ID:
                guild = discord.Object(id=int(DISCORD_GUILD_ID))
                await bot.tree.sync(guild=guild)
        except discord.Forbidden:
            logger.error("Missing access when syncing application commands.")

    @bot.tree.command(name="member_analysis", description="Generate a member analysis PDF report.")
    async def member_analysis(interaction: discord.Interaction) -> None:
        await interaction.response.send_message(
            "Select the API key type to continue:",
            view=ApiKeyTypeView(key_store),
            ephemeral=interaction.guild is not None,
        )

    @bot.tree.command(name="forget_key", description="Forget your stored API key immediately.")
    async def forget_key(interaction: discord.Interaction) -> None:
        await key_store.clear_key(interaction.user.id)
        await interaction.response.send_message(
            "API key cleared.",
            ephemeral=interaction.guild is not None,
        )

    return bot


def main() -> None:
    if not DISCORD_BOT_TOKEN:
        raise RuntimeError("DISCORD_BOT_TOKEN is not set in the environment.")

    bot = build_bot()
    bot.run(DISCORD_BOT_TOKEN)
