import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface DetectionResult {
  emotion: string;
  age: string;
}

export async function detectEmotionAndAge(base64Image: string): Promise<DetectionResult> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `Analyze this image and detect the primary human emotion and guess the age of the person in the image. 
  Return the result in JSON format with keys "emotion" and "age". 
  The "emotion" should be a single word or short phrase (e.g., "Happy", "Sad", "Neutral", "Anxious"). 
  The "age" should be a guessed range or specific number (e.g., "25-30", "Mid-40s").
  If no face is detected, return "Unknown" for both.`;

  const imagePart = {
    inlineData: {
      mimeType: "image/jpeg",
      data: base64Image.split(",")[1], // Remove the data:image/jpeg;base64, prefix
    },
  };

  const response: GenerateContentResponse = await ai.models.generateContent({
    model,
    contents: { parts: [imagePart, { text: prompt }] },
    config: {
      responseMimeType: "application/json",
    },
  });

  try {
    const result = JSON.parse(response.text || "{}");
    return {
      emotion: result.emotion || "Unknown",
      age: result.age || "Unknown",
    };
  } catch (e) {
    console.error("Failed to parse AI response:", e);
    return { emotion: "Unknown", age: "Unknown" };
  }
}
