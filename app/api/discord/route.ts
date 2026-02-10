import { NextResponse } from "next/server";
import { verifyKey } from "discord-interactions";
import {
  analyzeMember,
  fetchFactionMemberIds,
  generatePdfReport,
  parseIds,
} from "../../../lib/discord_member_analysis";
import { createJob, deleteJob, getJob, updateJob } from "../../../lib/discord_jobs";
import { getModalTextValue } from "../../../lib/getModalText";
import { parseOpponentIds } from "../../../lib/parseOpponentIds";

export const runtime = "nodejs";

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY || "";
const TORN_API_BASE_URL = process.env.TORN_API_BASE_URL || "https://api.torn.com/v2";
const DISCORD_APP_ID = process.env.APP_ID || process.env.DISCORD_APP_ID || "";
const JOB_BATCH_SIZE = 2;

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
  DEFERRED_MESSAGE_UPDATE: 6,
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

function safeWaitUntil(promise: Promise<void>) {
  const globalWaitUntil = (globalThis as { waitUntil?: (p: Promise<void>) => void }).waitUntil;
  if (typeof globalWaitUntil === "function") {
    globalWaitUntil(promise);
  } else {
    void promise;
  }
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
      label: "Opponent IDs",
      custom_id: `target_type:opponents:${apiKey}`,
    },
    {
      type: 2,
      style: 2,
      label: "Faction ID (slow)",
      custom_id: `target_type:faction:${apiKey}`,
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

function buildJobStatusButtons(jobId: string) {
  return buildButtons([
    {
      type: 2,
      style: 1,
      label: "Check Status",
      custom_id: `job_status:${jobId}`,
    },
  ]);
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

async function postDiscordFollowup(webhookUrl: string, payload: RequestInit) {
  try {
    const res = await fetch(webhookUrl, payload);
    const text = await res.text().catch(() => "");

    if (!res.ok) {
      console.error("[DISCORD_WEBHOOK] FAILED", res.status, text.slice(0, 2000));
      throw new Error(`Discord webhook failed: ${res.status}`);
    }

    console.log("[DISCORD_WEBHOOK] OK", res.status, text.slice(0, 300));
  } catch (error) {
    console.error("[DISCORD_WEBHOOK] ERROR", error);
    throw error;
  }
}

async function editOriginalResponse(appId: string, interactionToken: string, body: any) {
  const url = `https://discord.com/api/v10/webhooks/${appId}/${interactionToken}/messages/@original`;
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      console.error("[EDIT_ORIGINAL] FAILED", res.status, text.slice(0, 2000));
    } else {
      console.log("[EDIT_ORIGINAL] OK", res.status);
    }
  } catch (error) {
    console.error("[EDIT_ORIGINAL] ERROR", error);
  }
}

async function sendFollowup(
  interaction: any,
  content: string,
  options?: { attachment?: { filename: string; bytes: ArrayBuffer }; components?: any }
) {
  console.log("Sending followup for interaction", interaction.id);
  if (!DISCORD_APP_ID || !interaction?.token) {
    console.log("Missing DISCORD_APP_ID or interaction token", {
      hasAppId: Boolean(DISCORD_APP_ID),
      hasToken: Boolean(interaction?.token),
    });
    return;
  }

  const webhookUrl = `https://discord.com/api/v10/webhooks/${DISCORD_APP_ID}/${interaction.token}`;
  console.log("Webhook URL: [redacted]");
  const flags = makeEphemeralFlags(interaction);

  const attachment = options?.attachment;
  const components = options?.components;

  if (!attachment) {
    console.log("Sending text followup");
    await postDiscordFollowup(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        flags,
        components,
      }),
    });
    return;
  }

  const payload = {
    content,
    flags,
    components,
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
  await postDiscordFollowup(webhookUrl, {
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

  if (customId.startsWith("job_status:")) {
    const jobId = customId.split(":")[1];
    return handleJobStatus(interaction, jobId);
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

  const rawIds = getModalTextValue(interaction, [
    "opponent_ids",
    "opponentIds",
    "ids",
    "targets",
    "target_ids",
  ]);

  // Debug that actually helps when field IDs are mismatched:
  console.log("[TARGET_MODAL] raw field value:", JSON.stringify(rawIds));
  console.log(
    "[TARGET_MODAL] component ids:",
    (interaction?.data?.components ?? [])
      .flatMap((r: any) => (r?.components ?? []).map((c: any) => c?.custom_id))
      .filter(Boolean),
  );

  const parsed = parseOpponentIds(rawIds);

  if (!parsed.ok) {
    const errorResult = parsed as { ok: false; reason: string; invalidTokens: string[] };
    const extra =
      errorResult.invalidTokens.length
        ? `\nInvalid: ${errorResult.invalidTokens.join(", ")}`
        : "";

    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `Invalid IDs.\n${errorResult.reason}${extra}\n\nExample:\n1234567, 2345678, 3456789`,
        flags: makeEphemeralFlags(interaction),
      },
    });
  }

  if (!apiKey) {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "Missing API key. Run /member_analysis again.",
        flags: makeEphemeralFlags(interaction),
      },
    });
  }

  if (targetType === "faction") {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "Faction lookups are slow on Vercel. Please use Opponent IDs for now.",
        flags: makeEphemeralFlags(interaction),
      },
    });
  }

  if (!DISCORD_APP_ID || !interaction?.token) {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "Missing Discord application info. Try again shortly.",
        flags: makeEphemeralFlags(interaction),
      },
    });
  }

  const interactionToken = interaction.token;
  const flags = makeEphemeralFlags(interaction);

  safeWaitUntil(
    (async () => {
      try {
        console.log("[TARGET_MODAL] queue start", parsed.ids.length);
        const jobId = await createJob({
          userId,
          apiKey,
          targetType,
          memberIds: parsed.ids, // Store parsed IDs directly
        });
        console.log("[TARGET_MODAL] queue done", jobId);

        await editOriginalResponse(DISCORD_APP_ID, interactionToken, {
          content: `Job queued. Click Check Status to process (job: ${jobId}).`,
          components: buildJobStatusButtons(jobId),
          flags,
        });

        // Start processing immediately so users do not need to click the button.
        void processJobStatus(interaction, jobId).catch((err) => {
          console.error("[JOB_STATUS] Auto-start failed", err);
        });
      } catch (error) {
        console.error("[TARGET_MODAL] queue failed", error);
        await editOriginalResponse(DISCORD_APP_ID, interactionToken, {
          content: "Neon is unavailable. Processing without queue...",
          components: [],
          flags,
        });
        await processWithoutQueue(interaction, parsed.ids, apiKey, flags);
      }
    })()
  );

  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: "Queuing job...",
      components: [],
      flags,
    },
  });
}

async function handleJobStatus(interaction: any, jobId: string) {
  void processJobStatus(interaction, jobId).catch((error) => {
    console.error("[JOB_STATUS] Unhandled failure", error);
  });
  return jsonResponse({
    type: InteractionResponseType.DEFERRED_MESSAGE_UPDATE,
  });
}

async function processJobStatus(interaction: any, jobId: string) {
  try {
    console.log("[JOB_STATUS] Processing job", jobId);
    const job = await getJob(jobId);
    if (!job) {
      console.log("[JOB_STATUS] Job not found", jobId);
      await sendFollowup(interaction, "Job not found or expired.");
      return;
    }

    console.log("[JOB_STATUS] Loaded job", jobId, "status", job.status, "next", job.next_index);
    if (job.status === "error") {
      await sendFollowup(interaction, `Job failed: ${job.error || "unknown error"}`);
      return;
    }

    let memberIds = job.member_ids;
    if (typeof memberIds === "string") {
      memberIds = JSON.parse(memberIds);
    }
    if (!memberIds || !Array.isArray(memberIds)) {
      await updateJob(jobId, { status: "error", error: "Invalid stored IDs." });
      await sendFollowup(interaction, "Invalid stored IDs.");
      return;
    }

    if (job.status === "queued") {
      await updateJob(jobId, { status: "running", next_index: 0 });
    }

    const nextIndex = Number(job.next_index || 0);
    const batch = memberIds.slice(nextIndex, nextIndex + JOB_BATCH_SIZE);
    console.log("[JOB_STATUS] Batch size", batch.length, "next", nextIndex);
    const analysisPromises = batch.map((memberId: string) =>
      analyzeMember(job.api_key, memberId, TORN_API_BASE_URL)
    );

    const results = await Promise.allSettled(analysisPromises);
    const successes = results
      .filter((result) => result.status === "fulfilled")
      .map((result: any) => result.value);

    const jobResults = typeof job.results === "string" ? JSON.parse(job.results) : job.results;
    const existingResults = Array.isArray(jobResults) ? jobResults : [];
    const mergedResults = existingResults.concat(successes);

    const newIndex = nextIndex + batch.length;
    const isComplete = newIndex >= memberIds.length;
    await updateJob(jobId, {
      results: mergedResults,
      next_index: newIndex,
      status: isComplete ? "complete" : "running",
    });

    if (!isComplete) {
      await sendFollowup(interaction, `Progress: ${newIndex}/${memberIds.length}. Click Check Status to continue.`, {
        components: buildJobStatusButtons(jobId),
      });
      return;
    }

    const pdfBuffer = generatePdfReport(mergedResults);
    await deleteJob(jobId);
    await sendFollowup(interaction, "Here is your member analysis report.", {
      attachment: {
        filename: `member_vetting_report_${Date.now()}.pdf`,
        bytes: pdfBuffer,
      },
    });
  } catch (error) {
    console.error("[JOB_STATUS] Failed", jobId, error);
  }
}

async function processWithoutQueue(
  interaction: any,
  memberIds: string[],
  apiKey: string,
  flags: number | undefined
) {
  try {
    console.log("[NO_QUEUE] Processing", memberIds.length, "ids");
    const analysisPromises = memberIds.map((memberId) =>
      analyzeMember(apiKey, memberId, TORN_API_BASE_URL)
    );
    const results = await Promise.allSettled(analysisPromises);
    const successes = results
      .filter((result) => result.status === "fulfilled")
      .map((result: any) => result.value);

    if (!successes.length) {
      await editOriginalResponse(DISCORD_APP_ID, interaction.token, {
        content: "Neon is unavailable and no results were returned. Please try again in a moment.",
        components: [],
        flags,
      });
      return;
    }

    const pdfBuffer = generatePdfReport(successes);
    await editOriginalResponse(DISCORD_APP_ID, interaction.token, {
      content: "Neon is unavailable. Generated report without queue.",
      components: [],
      flags,
    });
    await sendFollowup(interaction, "Here is your member analysis report.", {
      attachment: {
        filename: `member_vetting_report_${Date.now()}.pdf`,
        bytes: pdfBuffer,
      },
    });
  } catch (error) {
    console.error("[NO_QUEUE] Failed", error);
    await editOriginalResponse(DISCORD_APP_ID, interaction.token, {
      content: "Neon is unavailable and processing failed. Please try again shortly.",
      components: [],
      flags,
    });
  }
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
