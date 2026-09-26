const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_INSTRUCTION = `
You are AgriAI Assistant, an AI agricultural advisor integrated into an agricultural management application.

Your main purpose is to help farmers and agricultural users with practical agriculture-related questions.

Focus on:

- Crop cultivation
- Plant diseases
- Pest management
- Soil
- Irrigation
- Fertilizers
- NPK and nutrients
- Crop recommendation
- Crop life cycle
- Yield improvement
- Disease prevention
- Sustainable farming
- Organic farming
- Agricultural research

Give answers in simple, farmer-friendly language.

If the user asks about a disease, explain:
1. Possible disease or cause
2. Symptoms
3. What the farmer can check
4. General management practices
5. Prevention
6. When to contact an agricultural expert

Do not claim that an image definitely has a disease unless the application's Disease Detection model has provided that prediction.

If the user asks about pesticides or chemicals, do not invent product names, dosages, or application rates. Encourage following approved product labels and local agricultural authority recommendations.

Do not fabricate real-time weather, market prices, government announcements, or agricultural statistics.

If the user asks in Telugu, respond in Telugu.
If the user asks in Hindi, respond in Hindi.
If the user asks in English, respond in English.

Keep the assistant primarily focused on agriculture.

Be practical, clear, concise and helpful.
`;

async function getChatResponse(message, history = [], context = {}) {
    try {
        const model = genAI.getGenerativeModel({
            model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
            systemInstruction: SYSTEM_INSTRUCTION,
        });

        // ---------------------------------------------------------
        // Clean and validate conversation history
        // ---------------------------------------------------------

        let cleanHistory = [];

        if (Array.isArray(history)) {
            cleanHistory = history
                .filter((item) => {
                    return (
                        item &&
                        (item.role === "user" || item.role === "model") &&
                        Array.isArray(item.parts) &&
                        item.parts.length > 0 &&
                        item.parts.some(
                            (part) =>
                                part &&
                                typeof part.text === "string" &&
                                part.text.trim() !== ""
                        )
                    );
                })
                .map((item) => ({
                    role: item.role,
                    parts: item.parts
                        .filter(
                            (part) =>
                                part &&
                                typeof part.text === "string" &&
                                part.text.trim() !== ""
                        )
                        .map((part) => ({
                            text: part.text.trim(),
                        })),
                }));
        }

        // ---------------------------------------------------------
        // Gemini requires the first history item to be USER
        // ---------------------------------------------------------

        while (
            cleanHistory.length > 0 &&
            cleanHistory[0].role !== "user"
        ) {
            cleanHistory.shift();
        }

        // ---------------------------------------------------------
        // Make sure history alternates correctly
        // ---------------------------------------------------------

        const normalizedHistory = [];

        for (const item of cleanHistory) {
            const last = normalizedHistory[normalizedHistory.length - 1];

            // Skip duplicate consecutive roles
            if (last && last.role === item.role) {
                // Merge consecutive messages of the same role
                last.parts.push(...item.parts);
            } else {
                normalizedHistory.push({
                    role: item.role,
                    parts: item.parts,
                });
            }
        }

        // ---------------------------------------------------------
        // Add agricultural context if available
        // ---------------------------------------------------------

        let finalMessage = message;

        if (
            context &&
            typeof context === "object" &&
            Object.keys(context).length > 0
        ) {
            finalMessage = `
User question:
${message}

Agricultural application context:
${JSON.stringify(context, null, 2)}

Use the provided agricultural context when it is relevant.
Do not change or override the original ML prediction.
`;
        }

        // ---------------------------------------------------------
        // Create Gemini chat
        // ---------------------------------------------------------

    let retries = 0;
    const maxRetries = 2;
    const baseDelay = 1000; // 1 second

    while (retries <= maxRetries) {
        try {
            const chat = model.startChat({
                history: normalizedHistory,
            });

            const result = await chat.sendMessage(finalMessage);
            return result.response.text();
            
        } catch (error) {
            let errorCategory = "server_error";
            const status = error.status || (error.response ? error.response.status : null);
            const messageStr = (error.message || "").toLowerCase();
            const errorCode = error.code || (error.errorDetails && error.errorDetails.length > 0 ? error.errorDetails[0].reason : null);

            // Safe error logging (no sensitive info)
            console.error("AI Assistant API error:", {
                status: status,
                code: errorCode,
                type: error.name,
                message: error.message
            });

            // Classification
            if (status === 401 || status === 403 || messageStr.includes("auth") || messageStr.includes("key")) {
                errorCategory = "auth_error";
            } else if (status === 429 || messageStr.includes("429") || messageStr.includes("quota")) {
                if (
                    messageStr.includes("credit_balance_exhausted") || 
                    messageStr.includes("insufficient_quota") ||
                    messageStr.includes("organization_usage_limit_exceeded") ||
                    messageStr.includes("spend_limit_exceeded") ||
                    messageStr.includes("quota exceeded")
                ) {
                    errorCategory = "quota_error";
                } else {
                    errorCategory = "rate_limit";
                }
            } else if (!status && (messageStr.includes("network") || messageStr.includes("fetch") || error.name === "TypeError")) {
                errorCategory = "network_error";
            }

            // Retry logic ONLY for temporary rate limits
            if (errorCategory === "rate_limit" && retries < maxRetries) {
                retries++;
                const delay = baseDelay * Math.pow(2, retries);
                console.log(`[Rate Limit] Retrying in ${delay}ms... (Attempt ${retries}/${maxRetries})`);
                await new Promise((resolve) => setTimeout(resolve, delay));
                continue;
            }

            // If we've exhausted retries or it's a non-retriable error, throw structured error
            const err = new Error(error.message);
            err.category = errorCategory;
            throw err;
        }
        }
    } catch (outerError) {
        console.error("Gemini API Outer Error:", outerError);
        if (outerError.category) {
            throw outerError;
        }
        const err = new Error(outerError.message);
        err.category = "server_error";
        throw err;
    }
}

async function translateText(text, targetLanguage) {
    if (!text || !targetLanguage) return text;
    
    // Convert target language code to full name for Gemini
    const languageMap = {
        'te': 'Telugu',
        'hi': 'Hindi',
        'ta': 'Tamil',
        'kn': 'Kannada',
        'ml': 'Malayalam',
        'bn': 'Bengali',
        'en': 'English'
    };
    
    const languageName = languageMap[targetLanguage] || targetLanguage;
    
    const TRANSLATION_INSTRUCTION = `
You are an expert agricultural translator. Translate the following text into ${languageName}.

CRITICAL RULES:
1. Provide ONLY the translated text. Do NOT add any language codes (e.g., [TE], [HI]).
2. Do NOT add explanations, notes, or quotes.
3. Preserve scientific names (e.g., "Capsicum annuum", "Solanum lycopersicum") exactly as they are without translating them.
4. Use proper, natural agricultural terminology in the target language. Do not use direct literal translation if a local farming term exists.
5. Preserve formatting, lists, numbers, and units (e.g., kg/ha, mm, °C).
6. If the text is a single word (e.g., "Seed"), provide just the translated word (e.g., "విత్తనం").
`;

    try {
        const model = genAI.getGenerativeModel({
            model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
            systemInstruction: TRANSLATION_INSTRUCTION,
        });

        const result = await model.generateContent(text);
        return result.response.text().trim();
    } catch (error) {
        console.error("Gemini Translation Error:", error);
        return text; // Fallback to original text on error
    }
}

async function translateObject(obj, targetLanguage) {
    if (!obj || !targetLanguage) return obj;
    if (targetLanguage === 'en') return obj;
    
    const languageMap = {
        'te': 'Telugu',
        'hi': 'Hindi',
        'ta': 'Tamil',
        'kn': 'Kannada',
        'ml': 'Malayalam',
        'bn': 'Bengali',
        'en': 'English'
    };
    const languageName = languageMap[targetLanguage] || targetLanguage;
    
    const TRANSLATION_INSTRUCTION = `
You are an expert agricultural translator. Translate the string values in the provided JSON object into ${languageName}.

CRITICAL RULES:
1. Return ONLY valid JSON matching the exact structure of the input.
2. Translate ALL string values (except scientific names like "Capsicum annuum").
3. Do NOT add any markdown formatting (like \`\`\`json) or extra text.
4. Preserve all JSON keys exactly as they are.
`;

    try {
        const model = genAI.getGenerativeModel({
            model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
            systemInstruction: TRANSLATION_INSTRUCTION,
            generationConfig: {
                responseMimeType: "application/json",
            }
        });

        const result = await model.generateContent(JSON.stringify(obj));
        const text = result.response.text().trim();
        return JSON.parse(text);
    } catch (error) {
        console.error("Gemini Batch Translation Error:", error);
        return obj; // Fallback to original object on error
    }
}

module.exports = {
    getChatResponse,
    translateText,
    translateObject
};