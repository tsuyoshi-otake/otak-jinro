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
    this.model = config.model || 'gpt-4.1-nano';
  }

  /**
   * OpenAI APIキーの妥当性を検証
   */
  validateApiKey(): boolean {
    if (!this.apiKey) {
      console.error('OpenAI API key is not set');
      return false;
    }
    
    if (!this.apiKey.startsWith('sk-')) {
      console.error('OpenAI API key does not start with "sk-"');
      return false;
    }
    
    if (this.apiKey.length <= 20) {
      console.error('OpenAI API key is too short');
      return false;
    }
    
    console.log('OpenAI API key validation passed');
    return true;
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
      
      // 発言の長さを動的に制御（3回に1回は長い発言、他は短い発言）
      const currentPlayer = gameState.players.find((p: any) => p.name === playerName);
      const messageCount = (currentPlayer?.messageCount || 0) + 1;
      const isLongMessage = messageCount % 3 === 0; // 3回に1回は長い発言
      const maxTokens = isLongMessage ? 100 : 50;
      const lengthInstruction = isLongMessage ?
        '2-3文で詳しく' :
        '1文で簡潔に';

      const requestBody = {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `あなたは人狼ゲームの世界の住民です。以下の重要なルールに従ってください：

1. 最新の会話履歴を必ず読み、直前の発言に反応してください
2. ${lengthInstruction}発言してください
3. 自分の陣営に応じた感情を表現してください：
   - 村人陣営：死への恐怖、仲間を失う悲しみ、人狼への怒りを表現
   - 人狼陣営：狩りの興奮、村人を騙す楽しさ、殺戮への満足感を内に秘める
4. 他のプレイヤーの発言に具体的に言及し、会話を続けてください
5. 人狼ゲームの緊張感のある雰囲気を演出してください

重要：会話の文脈を理解し、自然で感情豊かな発言をしてください。`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: {
          type: 'text'
        },
        temperature: 0.7,
        max_completion_tokens: maxTokens,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
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
        console.error('OpenAI API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          model: this.model,
          apiKeyPrefix: this.apiKey?.substring(0, 10) + '...'
        });
        
        // 特定のエラーをチェック
        if (response.status === 404) {
          console.error(`Model ${this.model} not found. This might indicate the model name is incorrect.`);
        } else if (response.status === 401) {
          console.error('Invalid API key - check if OPENAI_API_KEY is correctly set in Cloudflare secrets');
        } else if (response.status === 429) {
          console.error('Rate limit exceeded - too many requests');
        } else if (response.status === 400) {
          console.error('Bad request - check API parameters');
        }
        
        return this.generateFallbackResponse(playerName, gameState, personality);
      }

      const data = await response.json() as any;
      
      console.log(`OpenAI API response for ${playerName}:`, {
        model: data.model,
        usage: data.usage,
        choicesCount: data.choices?.length || 0
      });

      const aiResponse = data.choices?.[0]?.message?.content?.trim();

      if (aiResponse && aiResponse.length > 0) {
        console.log(`AI response generated for ${playerName}: "${aiResponse}"`);
        
        // 穏健化チェック
        const isAppropriate = await this.moderateMessage(aiResponse);
        if (isAppropriate) {
          return aiResponse;
        } else {
          console.log('AI response was flagged by moderation, using fallback');
        }
      } else {
        console.log('Empty AI response from OpenAI, using fallback');
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
    const emotionalState = { ...personality.emotionalState };

    // ゲーム進行に基づく感情の変化
    if (gameState.phase === 'day') {
      // 昼フェーズでは恐怖と怒りが上昇
      emotionalState.fear = Math.min(100, emotionalState.fear + 5);
      emotionalState.anger = Math.min(100, emotionalState.anger + 3);
    } else if (gameState.phase === 'night') {
      // 夜フェーズでは恐怖が大幅上昇、幸福度低下
      emotionalState.fear = Math.min(100, emotionalState.fear + 10);
      emotionalState.happiness = Math.max(0, emotionalState.happiness - 5);
    }

    // 投票された場合の感情変化
    const votesAgainst = gameState.votes?.filter((vote: any) => vote.targetId === player.id).length || 0;
    if (votesAgainst > 0) {
      emotionalState.fear = Math.min(100, emotionalState.fear + votesAgainst * 10);
      emotionalState.anger = Math.min(100, emotionalState.anger + votesAgainst * 8);
      emotionalState.confidence = Math.max(0, emotionalState.confidence - votesAgainst * 10);
      emotionalState.suspicion = Math.min(100, emotionalState.suspicion + votesAgainst * 5);
    }

    // 生存者数による感情変化
    const aliveCount = gameState.players.filter((p: any) => p.isAlive).length;
    const totalCount = gameState.players.length;
    const deathRate = 1 - (aliveCount / totalCount);
    
    if (deathRate > 0.3) {
      emotionalState.fear = Math.min(100, emotionalState.fear + deathRate * 20);
      emotionalState.happiness = Math.max(0, emotionalState.happiness - deathRate * 15);
    }

    personality.emotionalState = emotionalState;
    return personality;
  }

  /**
   * AI応答の判定
   */
  async determineAIResponse(gameState: any, player: any): Promise<string | null> {
    console.log(`[OpenAI] determineAIResponse called for ${player.name}`, {
      hasAIPersonality: !!player.aiPersonality,
      playerRole: player.role,
      isAlive: player.isAlive
    });

    if (!player.aiPersonality) {
      console.log(`[OpenAI] ${player.name} has no AI personality, skipping`);
      return null;
    }

    // 発言頻度の制御 - 最低15秒間隔（頻度調整）
    const timeSinceLastMessage = Date.now() - (player.lastMessageTime || 0);
    const minInterval = 15000; // 15秒

    if (timeSinceLastMessage < minInterval) {
      console.log(`[OpenAI] ${player.name} spoke too recently (${timeSinceLastMessage}ms ago), skipping`);
      return null;
    }

    // 発言確率の計算
    const speakProbability = this.calculateSpeakProbability(player, gameState);
    const randomValue = Math.random();
    
    console.log(`[OpenAI] ${player.name} speak probability: ${speakProbability}, random: ${randomValue}`);
    
    if (randomValue > speakProbability) {
      console.log(`[OpenAI] ${player.name} decided not to speak this time`);
      return null;
    }

    console.log(`[OpenAI] ${player.name} will speak, generating response...`);
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
    // 最新のチャットメッセージから他のプレイヤーを取得
    const recentMessages = (gameState.chatMessages || []).slice(-5);
    const otherPlayers = gameState.players
      .filter((p: any) => p.isAlive && p.name !== playerName)
      .map((p: any) => p.name);
    
    if (otherPlayers.length === 0) {
      return 'みなさん、どう思いますか？';
    }

    const randomPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
    
    // フェーズに応じた文脈的な発言
    const contextualResponses: { [key: string]: string[] } = {
      day: [
        `${randomPlayer}さん、怪しくないですか？`,
        `${randomPlayer}さんが人狼かもしれません...`,
        `${randomPlayer}さんの行動が不自然です。`,
        `${randomPlayer}さんを疑っています。`,
        `${randomPlayer}さん、本当に村人ですか？`
      ],
      voting: [
        `${randomPlayer}さんに投票します。`,
        `${randomPlayer}さんが人狼だと思います。`,
        `${randomPlayer}さんを処刑しましょう。`,
        `${randomPlayer}さんは危険です。`,
        `${randomPlayer}さんを信じられません。`
      ],
      night: [
        '恐ろしい夜です...',
        '誰が殺されるのでしょうか...',
        '朝まで生きていられるでしょうか...',
        '人狼が近くにいる気がします...',
        '怖くて眠れません...'
      ]
    };

    const phaseResponses = contextualResponses[gameState.phase] || contextualResponses.day;
    
    // 性格に応じた調整
    if (personality.personality === 'aggressive') {
      return phaseResponses.find(r => r.includes('怪しい') || r.includes('投票')) || phaseResponses[0];
    } else if (personality.personality === 'cautious') {
      return phaseResponses.find(r => r.includes('どう思い') || r.includes('意見')) || phaseResponses[0];
    }
    
    return phaseResponses[Math.floor(Math.random() * phaseResponses.length)];
  }

  /**
   * ゲームプロンプトを構築
   */
  private buildGamePrompt(playerName: string, gameState: any, personality: AIPersonality): string {
    const currentPlayer = gameState.players.find((p: any) => p.name === playerName);
    const playerRole = currentPlayer?.role || 'unknown';
    
    // デバッグログ: プレイヤーの能力結果を確認
    console.log(`[AI Context Debug] ${playerName} (${playerRole}):`, {
      seerResults: currentPlayer?.seerResults?.length || 0,
      mediumResults: currentPlayer?.mediumResults?.length || 0,
      voteHistoryRounds: gameState.voteHistory?.length || 0
    });
    
    // 最新の会話履歴を取得（最新30件に制限して文脈を保持）
    const recentMessages = (gameState.chatMessages || [])
      .slice(-30) // 最新30件のメッセージのみ
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

【最新会話履歴（最新30件）】
${recentMessages || '（まだ発言がありません）'}

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

【重要な指示】
1. 必ず最新の会話履歴から1-2人のプレイヤーの発言を引用または言及してください
2. 「○○さんの言うとおり」「○○さんが怪しい」など、具体的な名前を使ってください
3. 一般的な発言（「様子を見ましょう」など）は避けてください
4. あなたの役職に基づいた視点で発言してください
5. 現在の投票状況や死亡者を考慮した発言をしてください

例：
- 「アリスさんの先ほどの発言は矛盾していますね。昨日は○○と言っていたのに...」
- 「ボブさんに同意します。チャーリーさんの行動は確かに怪しい」
- 「ダイアナさん、なぜそんなに私を疑うんですか？」

上記を踏まえ、1-3文で自然な発言を生成してください。
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
        biases.push('- 村人を騙すことに快感を覚え、巧妙に信頼を得る');
        biases.push('- 真の占い師や霊媒師を見つけ出し、密かに排除を企む');
        biases.push('- 仲間の人狼とは表面上距離を置き、内心では連携を図る');
        biases.push('- 村人の恐怖や混乱を楽しみながら、冷静を装う');
        break;
      case 'seer':
        biases.push('- 人狼を見つけた時の恐怖と使命感に駆られる');
        biases.push('- 自分が狙われる恐怖を感じながらも村を守ろうとする');
        biases.push('- 偽占い師に対抗する際は恐怖に震えながらも論理的な証拠を示す');
        biases.push('- 自分が狙われる恐怖から結果を隠すことも検討');
        break;
      case 'medium':
        biases.push('- 死者の声を聞く重責と恐怖を感じながら情報を活用');
        biases.push('- 偽霊媒師への怒りと恐怖を込めて矛盾を指摘');
        break;
      case 'hunter':
        biases.push('- 村人を守る使命感と失敗への恐怖に駆られながら人狼を探す');
        biases.push('- 処刑の恐怖に怯えながらも最後の手段として能力を明かす');
        break;
      case 'villager':
        biases.push('- 無力感と死への恐怖に怯えながらも必死に推理する');
        biases.push('- 仲間の死に悲しみ、人狼への怒りを燃やしながら村を守る');
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
    let probability = 0.3; // ベース確率を0.6から0.3に下げて頻度調整

    // 性格タイプによる調整
    if (personality.personality === 'aggressive' || personality.personality === 'charismatic') {
      probability += 0.2;
    } else if (personality.personality === 'cautious' || personality.personality === 'quiet') {
      probability -= 0.1;
    }

    // 感情状態による調整
    // 怒りが高いほど発言しやすい
    probability += (personality.emotionalState.anger / 100) * 0.2;
    
    // 自信が高いほど発言しやすい
    probability += (personality.emotionalState.confidence / 100) * 0.15;
    
    // 恐怖が高いと発言しにくい
    probability -= (personality.emotionalState.fear / 100) * 0.1;

    // 話し方パターンによる調整
    if (personality.speechPattern === 'talkative') {
      probability += 0.2;
    } else if (personality.speechPattern === 'quiet') {
      probability -= 0.15;
    }

    // 昼フェーズでは発言確率が高い
    if (gameState.phase === 'day') {
      probability += 0.15; // 0.3から0.15に下げて頻度調整
    }

    // 投票フェーズでは発言確率が低い
    if (gameState.phase === 'voting') {
      probability -= 0.05; // -0.1から-0.05に緩和
    }

    // 最近の会話が活発な場合は発言確率を上げる
    const recentMessages = (gameState.chatMessages || []).filter((msg: any) =>
      Date.now() - msg.timestamp < 60000 // 1分以内
    );
    if (recentMessages.length > 5) {
      probability += 0.15; // 0.1から0.15に向上
    }

    // 会話が少ない場合は発言確率を大幅に上げる
    if (recentMessages.length < 2) {
      probability += 0.2;
    }

    return Math.min(0.9, Math.max(0.4, probability)); // 範囲を0.4-0.9に拡大
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
  
  console.log('Attempting to create OpenAI service...', {
    hasApiKey: !!apiKey,
    apiKeyLength: apiKey?.length || 0,
    apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'none'
  });
  
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not found in Cloudflare Workers Secrets');
    console.warn('設定方法: wrangler secret put OPENAI_API_KEY');
    console.warn('確認方法: wrangler secret list');
    return null;
  }

  const service = new OpenAIService({
    apiKey,
    model: 'gpt-4.1-nano'
  });
  
  // APIキーの検証
  if (!service.validateApiKey()) {
    console.error('OpenAI API key validation failed');
    return null;
  }
  
  console.log('OpenAI service created successfully with GPT-4.1-nano model');
  return service;
}