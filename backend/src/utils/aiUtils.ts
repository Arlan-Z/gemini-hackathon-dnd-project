export async function getCleanJson(model: any, prompt: string, retries = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
        try {
            const result = await model.generateContent(prompt);
            let text = result.response.text();
            // Очистка от маркдауна, если ИИ вернул ```json ... ```
            text = text.replace(/```json/g, "").replace(/```/g, ""); 
            return JSON.parse(text);
        } catch (error) {
            console.warn(`Attempt ${i+1} failed to parse JSON. Retrying...`);
        }
    }
    throw new Error("Failed to generate valid game data.");
}