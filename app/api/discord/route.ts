import { NextResponse } from "next/server";
import { verifyKey } from "discord-interactions";
import {
  analyzeMember,
  fetchFactionMemberIds,
  generatePdfReport,
  parseIds,
} from "../../../lib/discord_member_analysis";

export const runtime = "nodejs";

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY || "";
const TORN_API_BASE_URL = process.env.TORN_API_BASE_URL || "https://api.torn.com/v2";
const DISCORD_APP_ID = process.env.APP_ID || process.env.DISCORD_APP_ID || "";

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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
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

function buildTargetTypeButtons(apiKey: string) {
  return buildButtons([
    {
      type: 2,
      style: 1,
      label: "Faction ID",
      custom_id: `target_type:faction:${apiKey}`,
    },
    {
      type: 2,
      style: 2,
      label: "Opponent IDs",
      custom_id: `target_type:opponents:${apiKey}`,
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

function buildTargetModal(targetType: string, apiKey: string) {
  const title = targetType === "faction" ? "Enter Faction ID" : "Enter Opponent IDs";
  const label = targetType === "faction" ? "Faction ID" : "Opponent IDs (comma-separated)";
  const placeholder = targetType === "faction" ? "123456" : "123, 456, 789";

  return {
    title,
    custom_id: `target_modal:${targetType}:${apiKey}`,
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
  console.log("Sending followup for interaction", interaction.id);
  if (!DISCORD_APP_ID || !interaction?.token) {
    console.log("Missing DISCORD_APP_ID or interaction token", {
      hasAppId: Boolean(DISCORD_APP_ID),
      hasToken: Boolean(interaction?.token),
    });
    return;
  }

  const webhookUrl = `https://discord.com/api/v10/webhooks/${DISCORD_APP_ID}/${interaction.token}`;
  console.log("Webhook URL:", webhookUrl);
  const flags = makeEphemeralFlags(interaction);

  if (!attachment) {
    console.log("Sending text followup");
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

  console.log("Sending attachment followup");
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
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "No stored API key to forget.",
        flags: makeEphemeralFlags(interaction),
      },
    });
  }

  if (commandName === "member_analysis") {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "Choose API key type:",
        components: buildKeyTypeButtons(),
        flags: makeEphemeralFlags(interaction),
      },
    });
  }

  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: "Unknown command.",
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
    const parts = customId.split(":");
    const targetType = parts[1] || "opponents";
    const apiKey = parts.slice(2).join(":");
    return jsonResponse({
      type: InteractionResponseType.MODAL,
      data: buildTargetModal(targetType, apiKey),
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

  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: "API key received. Choose a target type:",
      components: buildTargetTypeButtons(apiKey),
      flags: makeEphemeralFlags(interaction),
    },
  });
}

async function handleTargetModal(interaction: any, targetType: string, apiKey: string) {
  console.log("Handling target modal for interaction", interaction.id);
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

  const keepAlive = setInterval(() => {}, 500); // Keep function alive
  console.log("KeepAlive started for interaction", interaction.id);

  console.log("About to start deferred processing");
  process.nextTick(async () => {
    console.log("Inside process.nextTick for interaction", interaction.id);
    console.log("Starting deferred processing for interaction", interaction.id);
    try {
      let memberIds = [];
      try {
        if (!apiKey) {
          await sendFollowup(
            interaction,
            "Missing API key. Run /member_analysis again."
          );
          return;
        }

        console.log("Parsing IDs, targetType:", targetType, "rawIds:", rawIds);
        if (targetType === "faction") {
          memberIds = await withTimeout(
            fetchFactionMemberIds(apiKey, rawIds, TORN_API_BASE_URL),
            8000,
            "fetchFactionMemberIds"
          );
          console.log("Fetched faction memberIds", memberIds.length);
        } else {
          memberIds = parseIds(rawIds);
          console.log("Parsed opponent memberIds", memberIds.length);
        }
      } catch (error) {
        console.log("Error parsing/fetching IDs", error instanceof Error ? error.message : error);
        await sendFollowup(
          interaction,
          error instanceof Error ? error.message : "Invalid IDs."
        );
        return;
      }

      if (memberIds.length > 5) {
        memberIds = memberIds.slice(0, 5);
      }

      const analysisPromises = memberIds.map(memberId =>
        withTimeout(
          analyzeMember(apiKey, memberId, TORN_API_BASE_URL),
          8000,
          `analyzeMember:${memberId}`
        )
      );
      console.log("Starting analysis for", memberIds.length, "members");
      const results = await Promise.allSettled(analysisPromises);
      console.log("Analysis completed, results:", results.length);
      const analyses = results
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value);
      console.log("Successful analyses:", analyses.length);

      if (analyses.length === 0) {
        console.log("No successful analyses, sending error");
        await sendFollowup(interaction, "Failed to analyze any members.");
        return;
      }

      const pdfBuffer = generatePdfReport(analyses);
      console.log("PDF generated, size:", pdfBuffer.byteLength);
      const filename = `member_vetting_report_${Date.now()}.pdf`;
      console.log("Sending PDF followup");
      await sendFollowup(interaction, "Here is your member analysis report.", {
        filename,
        bytes: pdfBuffer,
      });
    } catch (error) {
      console.log("Error in deferred processing", error.message);
      await sendFollowup(
        interaction,
        error instanceof Error ? error.message : "Failed to generate report."
      );
    } finally {
      clearInterval(keepAlive);
      console.log("KeepAlive cleared for interaction", interaction.id);
    }
  });

  console.log("Sending defer response for interaction", interaction.id);

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
    const parts = customId.split(":");
    const targetType = parts[1] || "opponents";
    const apiKey = parts.slice(2).join(":");
    return handleTargetModal(interaction, targetType, apiKey);
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
  console.log("Interaction received", interaction.type, interaction.id, new Date().toISOString());
  return routeInteraction(interaction);
}
