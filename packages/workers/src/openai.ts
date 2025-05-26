// OpenAI API統合 - Cloudflare Workers版（fetch API使用、GPT-4.1対応）
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
    this.model = config.model || 'gpt-4.1';
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

      if (response.ok) {
        const data = await response.json();
        console.log('OpenAI API test successful, available models:', data.data?.length || 0);
        return true;
      } else {
        console.error('OpenAI API test failed:', response.status, response.statusText);
        return false;
      }
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
        console.error('Moderation API error:', response.status, response.statusText);
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
      console.log('OpenAI API key not available, using fallback response');
      return this.generateFallbackResponse(playerName, gameState, personality);
    }

    try {
      const prompt = this.buildGamePrompt(playerName, gameState, personality);
      
      console.log(`Generating AI response for ${playerName} using model: ${this.model}`);
      
      const requestBody = {
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
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI API error:', response.status, response.statusText, errorText);
        
        // 特定のエラーをチェック
        if (response.status === 404) {
          console.error(`Model ${this.model} not found. Available models might be different.`);
        } else if (response.status === 401) {
          console.error('Invalid API key');
        } else if (response.status === 429) {
          console.error('Rate limit exceeded');
        }
        
        return this.generateFallbackResponse(playerName, gameState, personality);
      }

      const data = await response.json() as any;
      const aiResponse = data.choices?.[0]?.message?.content?.trim();

      if (aiResponse && aiResponse.length > 0) {
        console.log(`AI response generated for ${playerName}: ${aiResponse.substring(0, 50)}...`);
        
        // 穏健化チェック
        const isAppropriate = await this.moderateMessage(aiResponse);
        if (isAppropriate) {
          return aiResponse;
        } else {
          console.log('AI response was flagged by moderation, using fallback');
        }
      } else {
        console.log('Empty AI response, using fallback');
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

    // 発言頻度の制御 - 最低10秒間隔
    const timeSinceLastMessage = Date.now() - (player.lastMessageTime || 0);
    const minInterval = 10000; // 10秒

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
    const currentPlayer = gameState.players.find((p: any) => p.name === playerName);
    const playerRole = currentPlayer?.role || 'unknown';
    
    // 全会話履歴を取得
    const allMessages = (gameState.chatMessages || [])
      .map((msg: any) => `[${msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'}) : '時刻不明'}] ${msg.playerName}: ${msg.content}`)
      .join('\n');

    // 投票履歴の詳細情報
    const voteHistory = (gameState.voteHistory || [])
      .map((round: any, index: number) => {
        const votes = round.votes.map((vote: any) => {
          const voter = gameState.players.find((p: any) => p.id === vote.voterId)?.name || '不明';
          const target = gameState.players.find((p: any) => p.id === vote.targetId)?.name || '不明';
          return `  ${voter} → ${target}`;
        }).join('\n');
        const executed = round.executedPlayer || '処刑なし';
        return `${index + 1}日目投票:\n${votes}\n処刑: ${executed}`;
      })
      .join('\n\n');

    // 現在の投票状況
    const currentVotes = (gameState.votes || [])
      .map((vote: any) => {
        const voter = gameState.players.find((p: any) => p.id === vote.voterId)?.name || '不明';
        const target = gameState.players.find((p: any) => p.id === vote.targetId)?.name || '不明';
        return `${voter} → ${target}`;
      })
      .join('\n');

    // 夜の能力結果（AIの知識として）
    const nightResults = this.buildNightResults(currentPlayer, gameState);

    // 死亡情報
    const deathInfo = gameState.players
      .filter((p: any) => !p.isAlive)
      .map((p: any) => `${p.name} (${p.deathReason || '処刑'}・${p.deathDay || '?'}日目)`)
      .join(', ');

    // AI独自のバイアスと戦略
    const strategicBias = this.generateStrategicBias(playerRole, personality, gameState);

    return `
【あなたの秘密情報】
- 役職: ${playerRole}
- あなただけが知っている情報: ${nightResults}

【戦略的バイアス】
${strategicBias}

【ゲーム状況】
- プレイヤー名: ${playerName}
- フェーズ: ${gameState.phase}
- 日数: ${gameState.currentDay}
- 生存者: ${gameState.players.filter((p: any) => p.isAlive).map((p: any) => p.name).join(', ')}
- 死亡者: ${deathInfo || 'なし'}

【全会話履歴】
${allMessages || '（まだ発言がありません）'}

【投票履歴】
${voteHistory || '（まだ投票履歴がありません）'}

【現在の投票状況】
${currentVotes || '（まだ投票がありません）'}

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

【戦略的指示】
役職に応じた高度な戦略を取ってください：
- 村人: 必要に応じて占い師や霊媒師を騙り、情報を撹乱してもよい
- 人狼: 村人を装い、疑いを他に向ける。仲間をかばいすぎないよう注意
- 占い師: 真の結果を伝えるか、戦略的に嘘をつくかを判断
- 霊媒師: 処刑された人の正体を正確に、または戦略的に偽って報告
- ハンター: 正体を隠しつつ、人狼を見つけることに集中

上記の全情報を踏まえ、戦略的で自然な発言を50文字以内で生成してください。
会話の流れを読み、他プレイヤーの発言に具体的に反応してください。
`;
  }

  /**
   * 夜の能力結果を構築
   */
  private buildNightResults(player: any, gameState: any): string {
    if (!player) return '特別な情報はありません';

    const results = [];
    
    // 占い師の結果
    if (player.role === 'seer' && player.seerResults) {
      player.seerResults.forEach((result: any) => {
        results.push(`${result.day}日目: ${result.target}を占った結果 → ${result.result}`);
      });
    }

    // 霊媒師の結果
    if (player.role === 'medium' && player.mediumResults) {
      player.mediumResults.forEach((result: any) => {
        results.push(`${result.day}日目: ${result.target}の霊視結果 → ${result.result}`);
      });
    }

    // 人狼の仲間情報
    if (player.role === 'werewolf') {
      const werewolves = gameState.players
        .filter((p: any) => p.role === 'werewolf' && p.name !== player.name)
        .map((p: any) => p.name);
      if (werewolves.length > 0) {
        results.push(`人狼の仲間: ${werewolves.join(', ')}`);
      }
    }

    return results.length > 0 ? results.join('\n') : '特別な情報はありません';
  }

  /**
   * 戦略的バイアスを生成
   */
  private generateStrategicBias(role: string, personality: AIPersonality, gameState: any): string {
    const biases = [];

    // 役職別のバイアス
    switch (role) {
      case 'werewolf':
        biases.push('- 村人チームの信頼を得ることを最優先とする');
        biases.push('- 真の占い師や霊媒師を特定し、無力化を図る');
        biases.push('- 仲間の人狼を露骨にかばわない');
        break;
      case 'seer':
        biases.push('- 人狼を見つけたら積極的に告発するか、慎重に立ち回るかを判断');
        biases.push('- 偽占い師に対抗する際は論理的な証拠を示す');
        biases.push('- 必要に応じて結果を隠すことも検討');
        break;
      case 'medium':
        biases.push('- 処刑された人の正体情報を戦略的に活用');
        biases.push('- 偽霊媒師の発言と照らし合わせて矛盾を指摘');
        break;
      case 'hunter':
        biases.push('- 正体を隠しつつ人狼を探す');
        biases.push('- 処刑されそうになったら能力を明かすことを検討');
        break;
      case 'villager':
        biases.push('- 時として占い師や霊媒師を騙ることで場を混乱させる戦術も有効');
        biases.push('- 真の能力者を守るために注意を引く役割を果たす');
        break;
    }

    // 個性別のバイアス
    if (personality.biases.quickToAccuse) {
      biases.push('- 怪しいと感じたら積極的に疑いを表明する');
    }
    if (personality.biases.trustsEasily) {
      biases.push('- 他プレイヤーの言葉を信じやすく、騙されやすい傾向');
    }
    if (personality.biases.independent) {
      biases.push('- 多数意見に流されず、独自の判断を重視する');
    }

    return biases.join('\n');
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
 *
 * OpenAI APIキーの取得場所：
 * - Cloudflare Workers Secrets（暗号化保存）
 * - ローカル開発: wrangler secret put OPENAI_API_KEY
 * - 本番環境: GitHub Actions経由で自動設定
 * - 確認方法: wrangler secret list [--env production]
 */
export function createOpenAIService(env: any): OpenAIService | null {
  // env.OPENAI_API_KEY は Cloudflare Workers の Secrets から取得
  // Secretsは暗号化されてCloudflareのインフラに保存され、
  // 実行時のみWorkerインスタンスに安全に注入される
  const apiKey = env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not found in Cloudflare Workers Secrets');
    console.warn('設定方法: wrangler secret put OPENAI_API_KEY');
    return null;
  }

  console.log('Creating OpenAI service with GPT-4.1 model');
  return new OpenAIService({
    apiKey,
    model: 'gpt-4.1'
  });
}