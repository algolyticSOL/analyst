const Anthropic = require('@anthropic-ai/sdk');

class AIAnalyzer {
    constructor(config) {
        this.config = config;
        this.modelCache = new Map();
        this.lastAnalysis = new Map();
        this.anthropic = new Anthropic({
            apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY
        });
    }

    async analyzePattern(pattern, context = {}) {
        try {
            const prompt = this.constructPrompt(pattern, context);
            const analysis = await this.queryModel(prompt);
            return this.processAnalysis(analysis, pattern);
        } catch (error) {
            console.error('Error in AI analysis:', error);
            return null;
        }
    }

    constructPrompt(pattern, context) {
        return `\n\nHuman: As a trading analysis AI, analyze the following Solana wallet trading pattern:

Trading Pattern Analysis Request:
- Buy Frequency: ${JSON.stringify(pattern.buyFrequency)}
- Sell Frequency: ${JSON.stringify(pattern.sellFrequency)}
- Average Hold Time: ${JSON.stringify(pattern.averageHoldTime)}
- Success Rate: ${JSON.stringify(pattern.successRate)}
- Risk Profile: ${pattern.riskProfile}

Market Context:
- Current Market Trend: ${context.marketTrend || 'Unknown'}
- Market Volatility: ${context.volatility || 'Unknown'}
- Token Performance: ${context.tokenPerformance || 'Unknown'}

Please analyze and provide:
1. Trading Strategy Classification
2. Risk Assessment
3. Token Preference Analysis
4. Success Probability
5. Recommended Actions
6. Risk Mitigation Suggestions

Format your response in a structured way with clear section headers.`;
    }

    async queryModel(prompt) {
        try {
            const message = await this.anthropic.messages.create({
                model: "claude-3-opus-20240229",
                max_tokens: 1000,
                temperature: 0.7,
                system: "You are an expert trading analyst specializing in cryptocurrency markets, particularly Solana. You analyze trading patterns and provide detailed, structured insights.",
                messages: [{
                    role: "user",
                    content: prompt
                }]
            });

            return message.content[0].text;
        } catch (error) {
            console.error('Error querying Claude:', error);
            throw error;
        }
    }

    processAnalysis(analysis, pattern) {
        // Extract key insights from the AI response
        const insights = this.extractInsights(analysis);
        
        // Validate insights against historical pattern
        const validatedInsights = this.validateInsights(insights, pattern);
        
        // Calculate confidence scores
        const confidenceScores = this.calculateConfidence(validatedInsights, pattern);
        
        return {
            strategy: validatedInsights.strategy,
            riskLevel: validatedInsights.riskLevel,
            tokenPreferences: validatedInsights.tokenPreferences,
            successProbability: confidenceScores.successProbability,
            recommendedActions: validatedInsights.recommendedActions,
            confidence: confidenceScores.overall,
            timestamp: Date.now()
        };
    }

    extractInsights(analysis) {
        // Parse the AI response and extract structured insights
        const lines = analysis.split('\n');
        const insights = {
            strategy: '',
            riskLevel: '',
            tokenPreferences: [],
            recommendedActions: []
        };

        let currentSection = '';
        for (const line of lines) {
            if (line.includes('Strategy Classification:')) {
                currentSection = 'strategy';
                insights.strategy = line.split(':')[1].trim();
            } else if (line.includes('Risk Assessment:')) {
                currentSection = 'risk';
                insights.riskLevel = line.split(':')[1].trim();
            } else if (line.includes('Token Preference:')) {
                currentSection = 'tokens';
            } else if (line.includes('Recommended Actions:')) {
                currentSection = 'actions';
            } else if (line.trim() && currentSection === 'tokens') {
                insights.tokenPreferences.push(line.trim());
            } else if (line.trim() && currentSection === 'actions') {
                insights.recommendedActions.push(line.trim());
            }
        }

        return insights;
    }

    validateInsights(insights, pattern) {
        // Validate insights against historical pattern
        const validated = { ...insights };

        // Validate strategy against historical success
        if (pattern.successRate) {
            const avgSuccessRate = Object.values(pattern.successRate)
                .reduce((acc, rate) => acc + (rate.success / rate.total), 0) / 
                Object.keys(pattern.successRate).length;

            if (avgSuccessRate < 0.5 && insights.strategy.includes('aggressive')) {
                validated.strategy = 'conservative ' + insights.strategy;
            }
        }

        // Validate risk level against pattern
        if (pattern.riskProfile !== 'unknown' && 
            pattern.riskProfile !== insights.riskLevel.toLowerCase()) {
            validated.riskLevel = pattern.riskProfile;
        }

        return validated;
    }

    calculateConfidence(insights, pattern) {
        let confidenceScores = {
            strategy: 0,
            risk: 0,
            tokens: 0,
            actions: 0
        };

        // Calculate strategy confidence
        confidenceScores.strategy = this.calculateStrategyConfidence(insights.strategy, pattern);
        
        // Calculate risk assessment confidence
        confidenceScores.risk = this.calculateRiskConfidence(insights.riskLevel, pattern);
        
        // Calculate token preference confidence
        confidenceScores.tokens = this.calculateTokenConfidence(insights.tokenPreferences, pattern);
        
        // Calculate overall confidence
        const overall = (
            confidenceScores.strategy * 0.4 +
            confidenceScores.risk * 0.3 +
            confidenceScores.tokens * 0.3
        );

        // Calculate success probability
        const successProbability = this.calculateSuccessProbability(overall, pattern);

        return {
            ...confidenceScores,
            overall,
            successProbability
        };
    }

    calculateStrategyConfidence(strategy, pattern) {
        if (!pattern.successRate) return 0.5;

        const successRates = Object.values(pattern.successRate);
        const avgSuccessRate = successRates.reduce((acc, rate) => 
            acc + (rate.success / rate.total), 0) / successRates.length;

        // Higher confidence if strategy aligns with historical success
        const isAggressive = strategy.includes('aggressive');
        const isSuccessful = avgSuccessRate > 0.7;

        return isAggressive === isSuccessful ? 0.8 : 0.4;
    }

    calculateRiskConfidence(riskLevel, pattern) {
        if (pattern.riskProfile === 'unknown') return 0.5;
        
        // Higher confidence if AI risk assessment matches historical profile
        return riskLevel.toLowerCase() === pattern.riskProfile ? 0.9 : 0.3;
    }

    calculateTokenConfidence(tokenPreferences, pattern) {
        if (!pattern.preferredTokens || pattern.preferredTokens.size === 0) return 0.5;

        // Calculate overlap between AI suggestions and historical preferences
        const preferredTokensSet = new Set(pattern.preferredTokens);
        const overlap = tokenPreferences.filter(token => 
            preferredTokensSet.has(token)).length;

        return overlap / Math.max(tokenPreferences.length, pattern.preferredTokens.size);
    }

    calculateSuccessProbability(confidence, pattern) {
        // Base success probability on historical success and current confidence
        const historicalSuccess = pattern.successRate ? 
            Object.values(pattern.successRate)
                .reduce((acc, rate) => acc + (rate.success / rate.total), 0) / 
                Object.keys(pattern.successRate).length : 
            0.5;

        return (historicalSuccess * 0.7 + confidence * 0.3);
    }
}

module.exports = AIAnalyzer; 