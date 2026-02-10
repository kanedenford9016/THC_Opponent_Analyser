import { NextResponse } from "next/server";
import { verifyKey } from "discord-interactions";
import {
  analyzeMember,
  fetchFactionMemberIds,
  generatePdfReport,
  parseIds,
} from "@/lib/discord_member_analysis";
import {
  deleteDiscordSession,
  getDiscordSession,
  setDiscordSession,
} from "@/lib/discord_sessions";

export const runtime = "nodejs";

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY || "";
const BASE_URL = process.env.BASE_URL || "https://api.torn.com/v2";
const DISCORD_APP_ID = process.env.DISCORD_APP_ID || "";
const SESSION_TTL_SECONDS = 30 * 60;

const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  MODAL_SUBMIT: 5,
};

const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  MODAL: 9,
};

function isGuildInteraction(interaction: any) {
  return Boolean(interaction.guild_id);
}

function makeEphemeralFlags(interaction: any) {
  return isGuildInteraction(interaction) ? 64 : undefined;
}

function getInteractionUserId(interaction: any) {
  return interaction?.user?.id || interaction?.member?.user?.id || null;
}

function jsonResponse(body: unknown, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function buildButtons(components: any[]) {
  return [{ type: 1, components }];
}

function buildKeyTypeButtons() {
  return buildButtons([
    {
      type: 2,
      style: 1,
      label: "Limited API Key",
      custom_id: "key_type:limited",
    },
    {
      type: 2,
      style: 3,
      label: "Full API Key",
      custom_id: "key_type:full",
    },
  ]);
}

function buildTargetTypeButtons() {
  return buildButtons([
    {
      type: 2,
      style: 1,
      label: "Faction ID",
      custom_id: "target_type:faction",
    },
    {
      type: 2,
      style: 2,
      label: "Opponent IDs",
      custom_id: "target_type:opponents",
    },
  ]);
}

function buildApiKeyModal(keyType: string) {
  return {
    title: "Enter Torn API Key",
    custom_id: `api_key_modal:${keyType}`,
    components: [
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: "api_key",
            style: 1,
            label: `${keyType === "full" ? "Full" : "Limited"} API Key`,
            min_length: 10,
            max_length: 120,
            required: true,
          },
        ],
      },
    ],
  };
}

function buildTargetModal(targetType: string) {
  const title = targetType === "faction" ? "Enter Faction ID" : "Enter Opponent IDs";
  const label = targetType === "faction" ? "Faction ID" : "Opponent IDs (comma-separated)";
  const placeholder = targetType === "faction" ? "123456" : "123, 456, 789";

  return {
    title,
    custom_id: `target_modal:${targetType}`,
    components: [
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: "target_ids",
            style: 1,
            label,
            placeholder,
            min_length: 1,
            max_length: 2000,
            required: true,
          },
        ],
      },
    ],
  };
}

function getTextValue(components: any[], customId: string) {
  for (const row of components || []) {
    for (const component of row.components || []) {
      if (component.custom_id === customId) {
        return component.value || "";
      }
    }
  }
  return "";
}

async function sendFollowup(interaction: any, content: string, attachment?: { filename: string; bytes: ArrayBuffer }) {
  if (!DISCORD_APP_ID || !interaction?.token) {
    return;
  }

  const webhookUrl = `https://discord.com/api/v10/webhooks/${DISCORD_APP_ID}/${interaction.token}`;
  const flags = makeEphemeralFlags(interaction);

  if (!attachment) {
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        flags,
      }),
    });
    return;
  }

  const payload = {
    content,
    flags,
    attachments: [
      {
        id: 0,
        filename: attachment.filename,
      },
    ],
  };

  const form = new FormData();
  form.append("payload_json", JSON.stringify(payload));
  form.append(
    "files[0]",
    new Blob([attachment.bytes], { type: "application/pdf" }),
    attachment.filename
  );

  await fetch(webhookUrl, {
    method: "POST",
    body: form,
  });
}

async function handleApplicationCommand(interaction: any) {
  const commandName = interaction.data?.name;
  const userId = getInteractionUserId(interaction);

  if (!userId) {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "Unable to identify user for this interaction.",
        flags: makeEphemeralFlags(interaction),
      },
    });
  }

  if (commandName === "forget_key") {
    await deleteDiscordSession(userId);
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "API key cleared.",
        flags: makeEphemeralFlags(interaction),
      },
    });
  }

  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: "Select an API key type to continue:",
      components: buildKeyTypeButtons(),
      flags: makeEphemeralFlags(interaction),
    },
  });
}

async function handleMessageComponent(interaction: any) {
  const customId = interaction.data?.custom_id || "";

  if (customId.startsWith("key_type:")) {
    const keyType = customId.split(":")[1] || "limited";
    return jsonResponse({
      type: InteractionResponseType.MODAL,
      data: buildApiKeyModal(keyType),
    });
  }

  if (customId.startsWith("target_type:")) {
    const targetType = customId.split(":")[1] || "opponents";
    return jsonResponse({
      type: InteractionResponseType.MODAL,
      data: buildTargetModal(targetType),
    });
  }

  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: "Unknown action.",
      flags: makeEphemeralFlags(interaction),
    },
  });
}

async function handleApiKeyModal(interaction: any, keyType: string) {
  const userId = getInteractionUserId(interaction);
  if (!userId) {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "Unable to identify user for this interaction.",
        flags: makeEphemeralFlags(interaction),
      },
    });
  }

  const apiKey = getTextValue(interaction.data?.components, "api_key").trim();
  if (!apiKey) {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "API key cannot be empty.",
        flags: makeEphemeralFlags(interaction),
      },
    });
  }

  try {
    await setDiscordSession(userId, apiKey, keyType, SESSION_TTL_SECONDS);
  } catch (error) {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content:
          "Session storage is unavailable right now. Please try again in a few minutes.",
        flags: makeEphemeralFlags(interaction),
      },
    });
  }

  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: "API key saved for 30 minutes. Choose a target type:",
      components: buildTargetTypeButtons(),
      flags: makeEphemeralFlags(interaction),
    },
  });
}

async function handleTargetModal(interaction: any, targetType: string) {
  const userId = getInteractionUserId(interaction);
  if (!userId) {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "Unable to identify user for this interaction.",
        flags: makeEphemeralFlags(interaction),
      },
    });
  }

  const rawIds = getTextValue(interaction.data?.components, "target_ids");
  if (!rawIds) {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "No IDs provided.",
        flags: makeEphemeralFlags(interaction),
      },
    });
  }

  queueMicrotask(async () => {
    try {
      let session = null;
      try {
        session = await getDiscordSession(userId);
      } catch (error) {
        await sendFollowup(
          interaction,
          "Session storage is unavailable right now. Please try again in a few minutes."
        );
        return;
      }

      if (!session) {
        await sendFollowup(
          interaction,
          "Your API key has expired. Run /member_analysis again."
        );
        return;
      }

      let memberIds = [];
      try {
        if (targetType === "faction") {
          memberIds = await fetchFactionMemberIds(session.apiKey, rawIds, BASE_URL);
        } else {
          memberIds = parseIds(rawIds);
        }
      } catch (error) {
        await sendFollowup(
          interaction,
          error instanceof Error ? error.message : "Invalid IDs."
        );
        return;
      }

      if (memberIds.length > 25) {
        memberIds = memberIds.slice(0, 25);
      }

      const analyses = [];
      for (const memberId of memberIds) {
        const analysis = await analyzeMember(session.apiKey, memberId, BASE_URL);
        analyses.push(analysis);
      }

      try {
        await deleteDiscordSession(userId);
      } catch (error) {
        await sendFollowup(
          interaction,
          "Report generated, but session cleanup failed. Please run /forget_key if needed."
        );
        return;
      }

      const pdfBuffer = generatePdfReport(analyses);
      const filename = `member_vetting_report_${Date.now()}.pdf`;
      await sendFollowup(interaction, "Here is your member analysis report.", {
        filename,
        bytes: pdfBuffer,
      });
    } catch (error) {
      await sendFollowup(
        interaction,
        error instanceof Error ? error.message : "Failed to generate report."
      );
    }
  });

  return jsonResponse({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: makeEphemeralFlags(interaction),
    },
  });
}

async function handleModalSubmit(interaction: any) {
  const customId = interaction.data?.custom_id || "";
  if (customId.startsWith("api_key_modal:")) {
    const keyType = customId.split(":")[1] || "limited";
    return handleApiKeyModal(interaction, keyType);
  }

  if (customId.startsWith("target_modal:")) {
    const targetType = customId.split(":")[1] || "opponents";
    return handleTargetModal(interaction, targetType);
  }

  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: "Unknown modal submission.",
      flags: makeEphemeralFlags(interaction),
    },
  });
}

async function routeInteraction(interaction: any) {
  switch (interaction.type) {
    case InteractionType.PING:
      return jsonResponse({ type: InteractionResponseType.PONG });
    case InteractionType.APPLICATION_COMMAND:
      return handleApplicationCommand(interaction);
    case InteractionType.MESSAGE_COMPONENT:
      return handleMessageComponent(interaction);
    case InteractionType.MODAL_SUBMIT:
      return handleModalSubmit(interaction);
    default:
      return jsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "Unsupported interaction.",
          flags: makeEphemeralFlags(interaction),
        },
      });
  }
}

export async function POST(request: Request) {
  if (!DISCORD_PUBLIC_KEY) {
    return jsonResponse({ error: "Missing DISCORD_PUBLIC_KEY." }, 500);
  }

  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (!signature || !timestamp) {
    return jsonResponse({ error: "Missing signature headers." }, 401);
  }
  const body = await request.text();

  const isValidRequest = verifyKey(body, signature, timestamp, DISCORD_PUBLIC_KEY);
  if (!isValidRequest) {
    return jsonResponse({ error: "Invalid request signature." }, 401);
  }

  const interaction = JSON.parse(body);
  return routeInteraction(interaction);
}
