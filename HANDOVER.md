# 引き継ぎ書 - ことばかけ

最終更新: 2026-07-09

## プロダクト概要

高齢者向け・孤独感の軽減とフレイル予防を目的としたLINE bot。「やさしい診断」（WEBサイト診断サービス）とは
対象・内容ともに全く別のプロダクト。

## 現状のステータス

- Supabase（sfhtvtcmgueystyuhzvd、他プロダクトと共通プロジェクト）にテーブル作成済み
  - `kotobakake_users`（line_user_id, display_name, family_line_user_id, last_message_at, morning_greeted_at）
  - `kotobakake_messages`（user_id, direction, transcript）
  - 両テーブルとも `ENABLE ROW LEVEL SECURITY` 済み。Supabase MCPで `relrowsecurity = true` を実際に確認済み
  - ポリシーは未追加（クライアントから直接アクセスさせず、Edge Functionからservice role keyのみでアクセスする設計のため、デフォルト拒否のまま運用）
- Edge Function雛形を追加済み（いずれも未デプロイ、Gemini呼び出し部分は未実装でTODOコメントのみ）
  - `supabase/functions/line-webhook`：LINE Webhook受信、署名検証、last_message_at更新
  - `supabase/functions/checkin-scheduler`：24時間無音声・朝10時未挨拶のユーザーへプッシュ通知（声かけ文言は現状固定文、将来Geminiで生成する想定）
- `.env.example` 追加済み。実際の値は未設定（LINE_CHANNEL_SECRET等はLINE公式アカウント作成後、GEMINI_API_KEYは起案者側で手配後にSupabase Secretsとして設定する）

## 認証方式

未定（未実装）。LINE Messaging APIのチャネルアクセストークン・チャネルシークレットの管理方法は
実装時に決定し、必ずこのセクションに追記すること。

## DB上の主要テーブルとRLSの状態

未定（未実装）。Supabaseの既存プロジェクト（sfhtvtcmgueystyuhzvd）を利用予定だが、
新規テーブルを作成する場合は必ず本ドキュメントの本セクションに以下を明記すること:
- テーブル名と用途
- RLS有効化の有無（`rls_enabled`をSupabase MCPで実際に確認した結果）
- ポリシーの内容

## 決済まわりの構成

このプロダクトにおける決済要否は未定。現時点で決済機能の実装予定なし。
実装する場合は必ずWebhook・Edge Function・料金プランの構成をこのセクションに明記すること。

## STT/TTS・会話生成のAI選定（確定）

Gemini APIを採用する。

- 音声理解（Audio understanding）: ユーザーが送った音声メッセージをGeminiに渡し、文字起こし＋（可能であれば）感情トーンの把握までを行う
- 会話生成: 同じくGeminiでテキスト応答を生成（トーン: 指示・助言をしない、聞き役に徹する）
- 音声合成（TTS）: GeminiのTTS機能でテキストを音声化し、LINEのaudio型メッセージとして返信
- 選定理由: 音声理解・会話生成・音声合成を1ベンダー（1 APIキー・1請求先）で完結でき、小規模チームでの実装・運用コストを抑えられるため。OpenAI（Whisper+TTS）は個別の完成度は高いが3段階の連携が必要、Claudeは現状ネイティブな音声入出力APIを持たないため今回は非採用
- 将来、会話のトーンの精度を上げたい場合は「Geminiで音声理解→Claudeで会話文生成→Geminiまたは他社でTTS」というハイブリッド構成に変更する余地を残す

### APIキーの管理

- Gemini APIキーは起案者側で手配予定
- 発行され次第、Supabase Edge Functionの環境変数（Secrets）として設定する。リポジトリや.envには絶対に含めないこと（.gitignore対象で管理）

## 会話体験の方針（確定）

LINE完結型（案A）を採用。LIFFや外部Webアプリへの遷移は行わない。

- ユーザーがLINEの音声メッセージ機能で録音・送信 → botが音声コンテンツを取得
- STT（音声→テキスト）で文字起こし
- AIが返答テキストを生成
- TTS（テキスト→音声）で音声ファイル化し、LINEのaudio型メッセージとしてbotから返信
- リアルタイム通話ではなく、非同期のボイスメッセージのキャッチボールを基本体験とする（高齢者が普段LINEで家族に音声メッセージを送る習慣と地続きにする）
- 将来的に需要が確認できれば、LIFF（LINEアプリ内蔵Webページ）でよりリッチな会話UIを追加する余地は残すが、現段階ではスコープ外

## 次にやるべきこと

- [x] 「最終会話時刻」を記録するテーブル設計・作成（Supabase） ※RLS有効化確認済み
- [x] Edge Functionの雛形作成（line-webhook, checkin-scheduler）
- [ ] LINE公式アカウント／Messaging APIチャネルの作成（LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN取得）
- [ ] Gemini APIキー取得後、Supabase Secretsとして設定
- [ ] `line-webhook`内のTODO実装：音声コンテンツ取得（LINE Content API）→Gemini音声理解→会話生成→Gemini TTS→audio型メッセージでreply
- [ ] `checkin-scheduler`の固定文をGemini生成の自然な声かけ文に置き換え
- [ ] `checkin-scheduler`をpg_cronまたはSupabase Scheduled Functionsで定期実行するよう設定（現状は手動実行のみ想定の雛形）
- [ ] 両Edge Functionのデプロイ（`supabase functions deploy`）
- [ ] 対話生成部分（トーン設計: 指示・助言をしない、聞き役に徹する）のプロンプト設計・調整
- [ ] 家族への通知設計（会話内容ではなく「会話があった事実」のみを共有する方針を維持すること）。`family_line_user_id`カラムは用意済みだが、通知ロジックは未実装

※Gemini/LINEの各キーが未発行のため、キー取得後に上記の実装を進める。

## 触れてはいけない/注意が必要な箇所

- センサー・ウェアラブル連携はスコープ外。この方針を覆す場合は起案者に要確認。
