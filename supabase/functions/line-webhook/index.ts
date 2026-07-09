// ことばかけ - LINE Webhook受信用 Edge Function（雛形）
//
// 役割:
//   1. LINEからのWebhookイベントを受信する
//   2. 署名検証（LINE_CHANNEL_SECRET）を行う
//   3. テキスト/音声メッセージを受信した場合、last_message_at を更新する
//   4. 音声メッセージの場合は Gemini で音声理解→会話生成→TTS のパイプラインを呼び出し、
//      結果を LINE の audio メッセージとして返信する（実装は Gemini APIキー発行後）
//
// 環境変数（Supabase Secretsとして設定。リポジトリには絶対に含めない）:
//   LINE_CHANNEL_SECRET
//   LINE_CHANNEL_ACCESS_TOKEN
//   GEMINI_API_KEY  (未発行のためこの雛形では未使用)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

const LINE_CHANNEL_SECRET = Deno.env.get("LINE_CHANNEL_SECRET") ?? "";
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function verifySignature(body: string, signature: string | null): Promise<boolean> {
  if (!signature || !LINE_CHANNEL_SECRET) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(LINE_CHANNEL_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signature;
}

async function upsertUser(lineUserId: string) {
  const { data, error } = await supabase
    .from("kotobakake_users")
    .upsert(
      { line_user_id: lineUserId, last_message_at: new Date().toISOString() },
      { onConflict: "line_user_id" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function logMessage(userId: string, direction: "inbound" | "outbound", transcript: string | null) {
  const { error } = await supabase
    .from("kotobakake_messages")
    .insert({ user_id: userId, direction, transcript });
  if (error) throw error;
}

Deno.serve(async (req: Request) => {
  const body = await req.text();
  const signature = req.headers.get("x-line-signature");

  if (!(await verifySignature(body, signature))) {
    return new Response("invalid signature", { status: 401 });
  }

  const payload = JSON.parse(body);

  for (const event of payload.events ?? []) {
    if (event.type !== "message") continue;

    const lineUserId = event.source?.userId;
    if (!lineUserId) continue;

    const user = await upsertUser(lineUserId);

    if (event.message.type === "text") {
      await logMessage(user.id, "inbound", event.message.text);
      // TODO: Geminiで応答生成し、reply APIでテキスト返信する
    } else if (event.message.type === "audio") {
      await logMessage(user.id, "inbound", null);
      // TODO: 音声コンテンツ取得(GET /v2/bot/message/{messageId}/content)
      //       → Geminiで音声理解・会話生成・TTS
      //       → audio型メッセージとしてreply
    }
  }

  return new Response("ok", { status: 200 });
});
