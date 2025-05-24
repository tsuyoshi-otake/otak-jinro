import OpenAI from "openai";

// OpenAI API key management utilities
const OPENAI_API_KEY_STORAGE_KEY = 'otak-jinro-openai-api-key'

export function getStoredApiKey(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY)
}

export function setStoredApiKey(apiKey: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(OPENAI_API_KEY_STORAGE_KEY, apiKey)
}

export function removeStoredApiKey(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY)
}

export function validateApiKey(apiKey: string): boolean {
  return apiKey.startsWith('sk-') && apiKey.length > 20
}

export async function testApiKey(apiKey: string): Promise<boolean> {
  try {
    const openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    });

    // Test with a simple request
    await openai.models.list();
    return true;
  } catch (error) {
    console.error('API key test failed:', error)
    return false
  }
}

// 感情に基づく発言スタイルを生成
function getEmotionalSpeechStyle(emotionalState: any, personality: string): string {
  const { happiness, anger, fear, confidence, suspicion } = emotionalState;
  
  let style = '';
  
  // 感情の強さに基づくスタイル
  if (anger > 70) {
    style += '怒りを込めて、';
  } else if (anger > 40) {
    style += 'やや苛立ちながら、';
  }
  
  if (fear > 70) {
    style += '恐怖を感じながら、';
  } else if (fear > 40) {
    style += '不安そうに、';
  }
  
  if (happiness > 70) {
    style += '嬉しそうに、';
  } else if (happiness > 40) {
    style += '明るく、';
  }
  
  if (confidence > 70) {
    style += '自信満々に、';
  } else if (confidence < 30) {
    style += 'おどおどしながら、';
  }
  
  if (suspicion > 70) {
    style += '疑い深く、';
  } else if (suspicion > 40) {
    style += '警戒しながら、';
  }
  
  // 性格に基づく追加スタイル
  switch (personality) {
    case 'aggressive':
      style += '攻撃的に、';
      break;
    case 'cautious':
      style += '慎重に、';
      break;
    case 'analytical':
      style += '論理的に、';
      break;
    case 'emotional':
      style += '感情的に、';
      break;
    case 'charismatic':
      style += '魅力的に、';
      break;
    case 'suspicious':
      style += '疑い深く、';
      break;
  }
  
  return style || '普通に、';
}

// 性格の説明を取得
function getPersonalityDescription(personality: string): string {
  const descriptions = {
    'aggressive': '攻撃的で積極的',
    'cautious': '慎重で用心深い',
    'analytical': '分析的で論理的',
    'emotional': '感情的で表現豊か',
    'charismatic': '魅力的でカリスマ的',
    'suspicious': '疑い深く警戒心が強い'
  };
  return descriptions[personality as keyof typeof descriptions] || '普通';
}

// 話し方の説明を取得
function getSpeechPatternDescription(speechPattern: string): string {
  const descriptions = {
    'formal': '丁寧で礼儀正しい',
    'casual': 'カジュアルで親しみやすい',
    'dramatic': '劇的で大げさ',
    'quiet': '静かで控えめ',
    'talkative': 'おしゃべりで活発'
  };
  return descriptions[speechPattern as keyof typeof descriptions] || '普通';
}

export async function generateAIResponse(
  apiKey: string, 
  prompt: string, 
  gameContext?: string, 
  aiPersonality?: any
): Promise<string> {
  try {
    const openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    });

    // 感情と個性に基づくシステムメッセージ
    let personalityContext = '';
    if (aiPersonality) {
      const emotionalStyle = getEmotionalSpeechStyle(aiPersonality.emotionalState, aiPersonality.personality);
      
      personalityContext = `
【あなたの個性】
- 性別: ${aiPersonality.gender === 'male' ? '男性' : aiPersonality.gender === 'female' ? '女性' : '中性的'}
- 性格: ${getPersonalityDescription(aiPersonality.personality)}
- 話し方: ${getSpeechPatternDescription(aiPersonality.speechPattern)}
- 特徴: ${aiPersonality.traits?.join('、') || ''}
- 口癖: ${aiPersonality.catchphrase || ''}

【現在の感情状態】
- 幸福度: ${aiPersonality.emotionalState?.happiness || 50}/100
- 怒り: ${aiPersonality.emotionalState?.anger || 0}/100
- 恐怖: ${aiPersonality.emotionalState?.fear || 0}/100
- 自信: ${aiPersonality.emotionalState?.confidence || 50}/100
- 疑念: ${aiPersonality.emotionalState?.suspicion || 30}/100

【発言スタイル】
${emotionalStyle}

【行動バイアス】
- 信頼しやすい: ${aiPersonality.biases?.trustsEasily ? 'はい' : 'いいえ'}
- 疑いやすい: ${aiPersonality.biases?.quickToAccuse ? 'はい' : 'いいえ'}
- リーダーに従う: ${aiPersonality.biases?.followsLeader ? 'はい' : 'いいえ'}
- 独立的: ${aiPersonality.biases?.independent ? 'はい' : 'いいえ'}
      `;
    }

    const systemMessage = gameContext
      ? `あなたは人狼ゲームのAIプレイヤーです。以下の情報を必ず考慮して応答してください：

${gameContext}

${personalityContext}

【重要な指示】
- あなたの個性と現在の感情状態を反映した発言をする
- 感情の強さに応じて発言のトーンを調整する
- 性格的なバイアスを発言に反映させる
- 最新の発言内容を理解し、それに対して具体的に反応する
- 自分の役職に応じた戦略的な行動を取る
- 具体的なプレイヤー名を挙げて推理や意見を述べる
- あなたの口癖や特徴的な表現を使う
- 日本語で自然に会話する
- 1-2文で簡潔だが個性的に答える`
      : 'あなたは人狼ゲームのAIプレイヤーです。あなたの個性を反映した応答をしてください。';

    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: 'system',
          content: `${systemMessage} 重要: あなたの個性と感情を反映した1-2文で応答してください。`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.8,
      max_completion_tokens: 100,
      top_p: 0.9,
      frequency_penalty: 0.3,
      presence_penalty: 0.3
    });

    return response.choices[0]?.message?.content || 'AI response unavailable';
  } catch (error) {
    console.error('AI response generation failed:', error)
    return 'AI response error'
  }
}

// Generate AI player personality and behavior with emotions
export async function generateAIPersonality(apiKey: string, playerName: string): Promise<any> {
  try {
    const openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    });

    const personalityPrompt = `
AIプレイヤー「${playerName}」の詳細な個性を生成してください。人狼ゲームで感情豊かで個性的なキャラクターにしてください。

以下のJSON形式で回答してください：
{
  "gender": "male" | "female" | "neutral",
  "personality": "aggressive" | "cautious" | "analytical" | "emotional" | "charismatic" | "suspicious",
  "emotionalState": {
    "happiness": 0-100の数値,
    "anger": 0-100の数値,
    "fear": 0-100の数値,
    "confidence": 0-100の数値,
    "suspicion": 0-100の数値
  },
  "traits": ["logical", "impulsive", "protective", "competitive", "empathetic", "stubborn", "optimistic", "pessimistic"]から3-4個選択,
  "speechPattern": "formal" | "casual" | "dramatic" | "quiet" | "talkative",
  "biases": {
    "trustsEasily": true/false,
    "quickToAccuse": true/false,
    "followsLeader": true/false,
    "independent": true/false
  },
  "backstory": "簡潔な背景設定（1-2文）",
  "catchphrase": "口癖や特徴的な表現"
}

バランスの取れた多様な個性を作成してください。
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: 'system',
          content: 'あなたは人狼ゲーム用のAIキャラクター生成システムです。感情豊かで個性的なキャラクターを作成してください。'
        },
        {
          role: 'user',
          content: personalityPrompt
        }
      ],
      temperature: 0.9,
      max_completion_tokens: 400,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      try {
        return JSON.parse(content);
      } catch (error) {
        console.error('JSON parsing failed:', error);
        return generateFallbackPersonality(playerName);
      }
    }

    return generateFallbackPersonality(playerName);
  } catch (error) {
    console.error('AI personality generation failed:', error)
    return generateFallbackPersonality(playerName);
  }
}

// フォールバック用の個性生成
function generateFallbackPersonality(playerName: string): any {
  const personalities = ['aggressive', 'cautious', 'analytical', 'emotional', 'charismatic', 'suspicious'];
  const genders = ['male', 'female', 'neutral'];
  const speechPatterns = ['formal', 'casual', 'dramatic', 'quiet', 'talkative'];
  
  return {
    gender: genders[Math.floor(Math.random() * genders.length)],
    personality: personalities[Math.floor(Math.random() * personalities.length)],
    emotionalState: {
      happiness: Math.floor(Math.random() * 50) + 25,
      anger: Math.floor(Math.random() * 30) + 10,
      fear: Math.floor(Math.random() * 40) + 10,
      confidence: Math.floor(Math.random() * 60) + 20,
      suspicion: Math.floor(Math.random() * 50) + 25
    },
    traits: ['logical', 'protective', 'competitive'],
    speechPattern: speechPatterns[Math.floor(Math.random() * speechPatterns.length)],
    biases: {
      trustsEasily: Math.random() > 0.5,
      quickToAccuse: Math.random() > 0.5,
      followsLeader: Math.random() > 0.5,
      independent: Math.random() > 0.5
    },
    backstory: `${playerName}は独特な個性を持つプレイヤーです。`,
    catchphrase: "..."
  };
}

// メッセージを人狼ゲームの世界観に合わせて校閲
export async function moderateMessage(apiKey: string, message: string): Promise<string> {
  try {
    const openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: 'system',
          content: `You are a message moderator for a Werewolf (Mafia) game.
          Your task is to rewrite messages to fit the game's atmosphere while preserving the original intent.
          - Remove modern slang, internet memes, or out-of-character references
          - Keep the message natural and conversational
          - Preserve the emotional tone and intent
          - If the message is already appropriate, return it unchanged
          - Keep the message concise
          - Respond in the same language as the input`
        },
        {
          role: 'user',
          content: message
        }
      ],
      temperature: 0.2,
      max_completion_tokens: 120,
      top_p: 0.8,
      frequency_penalty: 0,
      presence_penalty: 0
    });

    return response.choices[0]?.message?.content || message;
  } catch (error) {
    console.error('Message moderation failed:', error)
    return message; // 失敗した場合は元のメッセージを返す
  }
}

// AI応答判定関数 - 文脈に基づいてAIが応答すべきかを判定
export async function determineAIResponse(
  apiKey: string,
  latestMessage: any,
  aiPlayers: any[],
  chatMessages: any[],
  gameState: any
): Promise<{ respond: boolean; aiPlayer?: any; reason?: string }> {
  try {
    const openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    });

    // 会話履歴を構築
    const recentMessages = chatMessages.slice(-10).map(msg =>
      `${msg.playerName}: ${msg.content}`
    ).join('\n')

    // 生存プレイヤー情報
    const alivePlayers = gameState.players.filter((p: any) => p.isAlive).map((p: any) => p.name).join(', ')
    
    // 各AIプレイヤーの応答必要性を分析
    const analysisPrompt = `
人狼ゲームの状況を分析して、AIプレイヤーが応答すべきかを判定してください。

【現在の状況】
フェーズ: ${gameState.phase === 'day' ? '昼の議論時間' : gameState.phase === 'night' ? '夜時間' : '投票時間'}
${gameState.currentDay}日目
生存者: ${alivePlayers}

【最新の発言】
${latestMessage.playerName}: "${latestMessage.content}"

【最近の会話履歴】
${recentMessages}

【AIプレイヤー】
${aiPlayers.map(ai => `${ai.name} (役職: ${ai.role || '村人'})`).join(', ')}

以下の条件で応答の必要性を判定してください：
1. 直接名前を呼ばれた場合 → 高優先度で応答
2. 質問や疑いをかけられた場合 → 応答必要
3. 重要な推理や情報が出た場合 → 応答推奨
4. 会話が停滞している場合 → 自発的発言推奨
5. 単なる挨拶や雑談 → 応答不要

JSON形式で回答してください：
{
  "shouldRespond": boolean,
  "respondingAI": "AI名前" または null,
  "reason": "応答理由",
  "priority": "high" | "medium" | "low"
}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: 'system',
          content: 'あなたは人狼ゲームのAI応答判定システムです。文脈を理解して適切な応答判定を行ってください。'
        },
        {
          role: 'user',
          content: analysisPrompt
        }
      ],
      temperature: 0.3,
      max_completion_tokens: 200,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}')
    
    if (result.shouldRespond && result.respondingAI) {
      const selectedAI = aiPlayers.find(ai => ai.name === result.respondingAI) || aiPlayers[0]
      return {
        respond: true,
        aiPlayer: selectedAI,
        reason: result.reason
      }
    }

    return { respond: false }
  } catch (error) {
    console.error('AI response determination failed:', error)
    // フォールバック: 名前が呼ばれた場合のみ応答
    const mentionedAI = aiPlayers.find(ai => latestMessage.content.includes(ai.name))
    if (mentionedAI) {
      return {
        respond: true,
        aiPlayer: mentionedAI,
        reason: 'Name mentioned'
      }
    }
    return { respond: false }
  }
}

// 感情状態を更新する関数
export function updateEmotionalState(
  currentState: any,
  event: 'accused' | 'defended' | 'attacked' | 'protected' | 'voted_out' | 'won' | 'lost' | 'suspicious_behavior'
): any {
  const newState = { ...currentState };
  
  switch (event) {
    case 'accused':
      newState.anger = Math.min(100, newState.anger + 20);
      newState.fear = Math.min(100, newState.fear + 15);
      newState.confidence = Math.max(0, newState.confidence - 10);
      newState.suspicion = Math.min(100, newState.suspicion + 10);
      break;
      
    case 'defended':
      newState.happiness = Math.min(100, newState.happiness + 15);
      newState.confidence = Math.min(100, newState.confidence + 10);
      newState.fear = Math.max(0, newState.fear - 10);
      break;
      
    case 'attacked':
      newState.fear = Math.min(100, newState.fear + 30);
      newState.anger = Math.min(100, newState.anger + 25);
      newState.confidence = Math.max(0, newState.confidence - 20);
      break;
      
    case 'protected':
      newState.happiness = Math.min(100, newState.happiness + 20);
      newState.confidence = Math.min(100, newState.confidence + 15);
      newState.fear = Math.max(0, newState.fear - 15);
      break;
      
    case 'voted_out':
      newState.anger = Math.min(100, newState.anger + 40);
      newState.fear = Math.min(100, newState.fear + 30);
      newState.confidence = Math.max(0, newState.confidence - 30);
      break;
      
    case 'won':
      newState.happiness = Math.min(100, newState.happiness + 30);
      newState.confidence = Math.min(100, newState.confidence + 20);
      newState.anger = Math.max(0, newState.anger - 20);
      newState.fear = Math.max(0, newState.fear - 20);
      break;
      
    case 'lost':
      newState.anger = Math.min(100, newState.anger + 15);
      newState.fear = Math.min(100, newState.fear + 10);
      newState.confidence = Math.max(0, newState.confidence - 15);
      newState.happiness = Math.max(0, newState.happiness - 20);
      break;
      
    case 'suspicious_behavior':
      newState.suspicion = Math.min(100, newState.suspicion + 15);
      newState.fear = Math.min(100, newState.fear + 10);
      break;
  }
  
  return newState;
}