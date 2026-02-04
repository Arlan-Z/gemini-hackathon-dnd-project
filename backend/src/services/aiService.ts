import { GoogleGenerativeAI } from "@google/generative-ai";
import { GameState } from "../models/GameState";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ 
    model: "gemini-3-pro-latest", // Или gemini-3-pro, когда выйдет
    generationConfig: { responseMimeType: "application/json" } // Force JSON
});

export const generateStoryStep = async (state: GameState, playerAction: string) => {
    // Формируем контекст: кто герой, что у него в карманах
    const context = `
    CURRENT STATE:
    HP: ${state.stats.hp}, Sanity: ${state.stats.sanity}
    Inventory: ${state.inventory.map(i => i.name).join(", ")}
    Tags: ${state.tags.join(", ")}
    
    PLAYER ACTION: "${playerAction}"
    `;

    const prompt = `
    Ты — ИИ "AM" из "I Have No Mouth...". Ты жестокий рассказчик.
    Продолжи историю на основе действия игрока.
    Верни ТОЛЬКО JSON следующего формата:
    {
      "narrative": "Текст истории...",
      "choices": [{"text": "Вариант 1", "type": "action"}],
      "statUpdates": {"hp": -5},
      "tagsAdded": ["panicked"],
      "imagePrompt": "описание для генератора картинок"
    }
    
    ${context}
    `;

    // Отправляем чат (с учетом истории, если нужно, или просто промпт)
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    // Парсим JSON
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error("AI returned bad JSON", text);
        // Retry logic или возвращаем ошибку
        throw new Error("AI Malfunction");
    }
};