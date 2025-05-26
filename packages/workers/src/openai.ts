// OpenAI API統合 - Cloudflare Workers版
import { AIPersonality } from '../../shared/src/types/game';

export interface OpenAIServiceConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export class OpenAIService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(config: OpenAIServiceConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.model = config.model || 'gpt-4';
  }

  /**
   * OpenAI APIキーの妥当性を検証
   */
  validateApiKey(): boolean {
    return Boolean(this.apiKey && this.apiKey.startsWith('sk-') && this.apiKey.length > 20);
  }

  /**
   * APIキーをテスト
   */
  async testApiKey(): Promise<boolean> {
    if (!this.validateApiKey()) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      return response.ok;
    } catch (error) {
      console.error('OpenAI API key test failed:', error);
      return false;
    }
  }

  /**
   * AI個性を生成
   */
  async generateAIPersonality(playerName: string): Promise<AIPersonality> {
    const traits = this.generateRandomTraits();
    const personalities = ['aggressive', 'cautious', 'analytical', 'emotional', 'charismatic', 'suspicious'] as const;
    const speechPatterns = ['formal', 'casual', 'dramatic', 'quiet', 'talkative'] as const;
    const genders = ['male', 'female', 'neutral'] as const;
    
    const personality: AIPersonality = {
      gender: genders[Math.floor(Math.random() * genders.length)],
      personality: personalities[Math.floor(Math.random() * personalities.length)],
      emotionalState: {
        happiness: Math.floor(Math.random() * 50) + 25,
        anger: Math.floor(Math.random() * 30) + 10,
        fear: Math.floor(Math.random() * 40) + 20,
        confidence: Math.floor(Math.random() * 40) + 40,
        suspicion: Math.floor(Math.random() * 60) + 20
      },
      traits,
      speechPattern: speechPatterns[Math.floor(Math.random() * speechPatterns.length)],
      biases: {
        trustsEasily: Math.random() > 0.5,
        quickToAccuse: Math.random() > 0.5,
        followsLeader: Math.random() > 0.5,
        independent: Math.random() > 0.5
      }
    };

    return personality;
  }

  /**
   * メッセージを穏健化（有害コンテンツフィルタリング）
   */
  async moderateMessage(content: string): Promise<boolean> {
    if (!this.validateApiKey()) {
      // APIキーがない場合は基本的なフィルタリングのみ
      const badWords = ['死ね', 'バカ', 'アホ', 'クソ', 'ムカつく'];
      return !badWords.some(word => content.includes(word));
    }

    try {
      const response = await fetch(`${this.baseUrl}/moderations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: content
        })
      });

      if (!response.ok) {
        console.error('Moderation API error:', response.status);
        return true; // エラー時は許可
      }

      const data = await response.json() as any;
      return !data.results?.[0]?.flagged;
    } catch (error) {
      console.error('Error moderating message:', error);
      return true; // エラー時は許可
    }
  }

  /**
   * AIプレイヤーの応答を生成
   */
  async generateAIResponse(
    playerName: string,
    gameState: any,
    personality: AIPersonality
  ): Promise<string> {
    if (!this.validateApiKey()) {
      return this.generateFallbackResponse(playerName, gameState, personality);
    }

    try {
      const prompt = this.buildGamePrompt(playerName, gameState, personality);
      
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'あなたは人狼ゲームのプレイヤーです。与えられた個性に基づいて、自然で戦略的な発言をしてください。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 150,
          temperature: 0.8,
          frequency_penalty: 0.3,
          presence_penalty: 0.3
        })
      });

      if (!response.ok) {
        console.error('OpenAI API error:', response.status);
        return this.generateFallbackResponse(playerName, gameState, personality);
      }

      const data = await response.json() as any;
      const aiResponse = data.choices?.[0]?.message?.content?.trim();

      if (aiResponse && aiResponse.length > 0) {
        // 穏健化チェック
        const isAppropriate = await this.moderateMessage(aiResponse);
        if (isAppropriate) {
          return aiResponse;
        }
      }

      return this.generateFallbackResponse(playerName, gameState, personality);
    } catch (error) {
      console.error('Error generating AI response:', error);
      return this.generateFallbackResponse(playerName, gameState, personality);
    }
  }

  /**
   * AIの感情状態を更新
   */
  updateEmotionalState(player: any, gameState: any): AIPersonality {
    if (!player.aiPersonality) {
      return this.generateDefaultPersonality(player.name);
    }

    const personality = { ...player.aiPersonality };

    // ゲーム進行に基づく感情の変化
    if (gameState.phase === 'day') {
      personality.stress = Math.min(10, personality.stress + 1);
    } else if (gameState.phase === 'night') {
      personality.stress = Math.max(1, personality.stress - 1);
    }

    // 投票された場合のストレス増加
    const votesAgainst = gameState.votes?.filter((vote: any) => vote.targetId === player.id).length || 0;
    if (votesAgainst > 0) {
      personality.stress = Math.min(10, personality.stress + votesAgainst);
      personality.confidence = Math.max(1, personality.confidence - 1);
    }

    return personality;
  }

  /**
   * AI応答の判定
   */
  async determineAIResponse(gameState: any, player: any): Promise<string | null> {
    if (!player.aiPersonality) {
      return null;
    }

    // 発言頻度の制御
    const timeSinceLastMessage = Date.now() - (player.lastMessageTime || 0);
    const minInterval = 35000; // 35秒

    if (timeSinceLastMessage < minInterval) {
      return null;
    }

    // 発言確率の計算
    const speakProbability = this.calculateSpeakProbability(player, gameState);
    
    if (Math.random() > speakProbability) {
      return null;
    }

    return await this.generateAIResponse(player.name, gameState, player.aiPersonality);
  }

  /**
   * ランダムな性格特性を生成
   */
  private generateRandomTraits(): string[] {
    const allTraits = [
      '冷静', '論理的', '感情的', '直感的', '慎重', '大胆',
      '協調的', '独立的', '楽観的', '悲観的', '積極的', '消極的',
      '分析的', '創造的', '保守的', '革新的', '内向的', '外向的'
    ];

    const traitCount = Math.floor(Math.random() * 3) + 2; // 2-4個の特性
    const selectedTraits: string[] = [];

    while (selectedTraits.length < traitCount) {
      const trait = allTraits[Math.floor(Math.random() * allTraits.length)];
      if (!selectedTraits.includes(trait)) {
        selectedTraits.push(trait);
      }
    }

    return selectedTraits;
  }

  /**
   * 話し方スタイルを生成
   */
  private generateSpeakingStyle(traits: string[]): string {
    const styles = [];

    if (traits.includes('冷静') || traits.includes('論理的')) {
      styles.push('論理的で冷静な口調');
    }
    if (traits.includes('感情的')) {
      styles.push('感情豊かな表現');
    }
    if (traits.includes('慎重')) {
      styles.push('慎重で丁寧な言葉遣い');
    }
    if (traits.includes('大胆')) {
      styles.push('はっきりとした主張');
    }

    return styles.length > 0 ? styles.join('、') : '自然な話し方';
  }

  /**
   * フォールバック応答を生成
   */
  private generateFallbackResponse(playerName: string, gameState: any, personality: AIPersonality): string {
    const responses = [
      'みなさん、どう思いますか？',
      '今のところ特に怪しい人はいませんね。',
      'もう少し情報が欲しいところです。',
      '慎重に判断したいと思います。',
      'みなさんの意見を聞かせてください。',
      '今日は様子を見ましょう。',
      '何かおかしいと感じる人はいますか？',
      'まだ判断材料が少ないですね。'
    ];

    const phaseResponses = {
      day: [
        '昨夜は何か気になることはありましたか？',
        '今日は誰を疑うべきでしょうか？',
        'みなさんの発言を注意深く聞いています。'
      ],
      voting: [
        '投票は難しい判断ですね。',
        'よく考えて投票したいと思います。',
        '今までの議論を整理しましょう。'
      ]
    };

    const phaseSpecific = phaseResponses[gameState.phase as keyof typeof phaseResponses] || [];
    const allResponses = [...responses, ...phaseSpecific];

    return allResponses[Math.floor(Math.random() * allResponses.length)];
  }

  /**
   * ゲームプロンプトを構築
   */
  private buildGamePrompt(playerName: string, gameState: any, personality: AIPersonality): string {
    return `
【ゲーム状況】
- プレイヤー名: ${playerName}
- フェーズ: ${gameState.phase}
- 日数: ${gameState.currentDay}
- 生存者: ${gameState.players.filter((p: any) => p.isAlive).map((p: any) => p.name).join(', ')}

【あなたの個性】
- 性別: ${personality.gender}
- 性格: ${personality.personality}
- 特性: ${personality.traits.join(', ')}
- 話し方: ${personality.speechPattern}
- 幸福度: ${personality.emotionalState.happiness}/100
- 怒り: ${personality.emotionalState.anger}/100
- 恐怖: ${personality.emotionalState.fear}/100
- 自信: ${personality.emotionalState.confidence}/100
- 疑い: ${personality.emotionalState.suspicion}/100

【行動傾向】
- 信じやすさ: ${personality.biases.trustsEasily ? '高い' : '低い'}
- 告発傾向: ${personality.biases.quickToAccuse ? '強い' : '弱い'}
- リーダー追従: ${personality.biases.followsLeader ? 'あり' : 'なし'}
- 独立性: ${personality.biases.independent ? '高い' : '低い'}

【指示】
あなたの個性に基づいて、現在の状況に適した発言を50文字以内で生成してください。
自然で戦略的な発言を心がけ、ゲームの進行に貢献してください。
`;
  }

  /**
   * デフォルト個性を生成
   */
  private generateDefaultPersonality(playerName: string): AIPersonality {
    return {
      gender: 'neutral',
      personality: 'analytical',
      emotionalState: {
        happiness: 60,
        anger: 20,
        fear: 30,
        confidence: 70,
        suspicion: 40
      },
      traits: ['冷静', '協調的'],
      speechPattern: 'casual',
      biases: {
        trustsEasily: false,
        quickToAccuse: false,
        followsLeader: true,
        independent: false
      }
    };
  }

  /**
   * 発言確率を計算
   */
  private calculateSpeakProbability(player: any, gameState: any): number {
    const personality = player.aiPersonality;
    let probability = 0.3; // ベース確率

    // 攻撃性が高いほど発言しやすい
    probability += personality.aggressiveness * 0.02;

    // ストレスが高いほど発言しやすい
    probability += personality.stress * 0.03;

    // 昼フェーズでは発言確率が高い
    if (gameState.phase === 'day') {
      probability += 0.2;
    }

    // 投票フェーズでは発言確率が低い
    if (gameState.phase === 'voting') {
      probability -= 0.1;
    }

    return Math.min(1.0, Math.max(0.1, probability));
  }
}

/**
 * OpenAIサービスのインスタンスを作成
 */
export function createOpenAIService(env: any): OpenAIService | null {
  const apiKey = env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not found in environment variables');
    return null;
  }

  return new OpenAIService({
    apiKey,
    model: 'gpt-4'
  });
}