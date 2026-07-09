// ことばかけ - 声かけスケジューラ（雛形）
//
// 役割:
//   Cronで定期実行し、以下を満たすユーザーにLINEプッシュメッセージで声をかける
//     - 最終会話時刻(last_message_at)から24時間以上経過している場合 → 確認の声かけ
//     - 当日10時までにやり取りがない場合 → 朝の挨拶
//
// Supabaseの pg_cron / Scheduled Edge Function で定期実行する想定（未設定）
// 環境変数: LINE_CHANNEL_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function pushMessage(lineUserId: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text }],
    }),
  });
}

Deno.serve(async (_req: Request) => {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const today = now.toISOString().slice(0, 10);

  // 24時間以上、会話がないユーザーに確認の声かけ
  const { data: silentUsers, error: silentError } = await supabase
    .from("kotobakake_users")
    .select("id, line_user_id, last_message_at")
    .or(`last_message_at.lt.${twentyFourHoursAgo},last_message_at.is.null`);

  if (silentError) throw silentError;

  for (const user of silentUsers ?? []) {
    // TODO: 定型文ではなくGeminiで自然な声かけ文を生成する
    await pushMessage(user.line_user_id, "元気にしてる？よかったら少しお話ししようね。");
  }

  // 当日10時までにやり取りがないユーザーに朝の挨拶（10時台にCron実行される前提）
  const { data: noMorningGreeting, error: morningError } = await supabase
    .from("kotobakake_users")
    .select("id, line_user_id")
    .or(`morning_greeted_at.neq.${today},morning_greeted_at.is.null`);

  if (morningError) throw morningError;

  for (const user of noMorningGreeting ?? []) {
    await pushMessage(user.line_user_id, "おはようございます。今日も一日、無理のないように過ごしてくださいね。");
    await supabase
      .from("kotobakake_users")
      .update({ morning_greeted_at: today })
      .eq("id", user.id);
  }

  return new Response("ok", { status: 200 });
});
