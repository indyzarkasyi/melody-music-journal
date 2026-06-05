import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

app.use(express.json());

// API Recommendation Endpoint
app.post("/api/recommend", async (req, res) => {
  const { venting, genre, language } = req.body;
  
  if (!venting) {
    return res.status(400).json({ error: "Venting content is required." });
  }

  let languagePrompt = "";
  if (language === "indonesian") {
    languagePrompt = "Language constraint: All recommended songs MUST be from Indonesian artists or contain Indonesian lyrics.";
  } else if (language === "english") {
    languagePrompt = "Language constraint: All recommended songs MUST be international/English songs.";
  } else {
    languagePrompt = "Language constraint: All (provide the best fit regardless of language).";
  }

  // Handle J-Pop & K-Pop special logic
  if (genre === "K-Pop" || genre === "J-Pop") {
    const isKpop = genre === "K-Pop";
    const primaryRegion = isKpop ? "Korean/K-Pop" : "Japanese/J-Pop";
    const exampleSongs = isKpop ? "BTS's English singles or English versions of popular K-Pop tracks" : "English versions of popular J-Pop tracks or global releases by Japanese artists";
    
    languagePrompt += `\nSPECIAL GENRE EXCEPTION: Since the genre constraint is "${genre}", the core "${primaryRegion}" genre/artist group takes priority. Do NOT recommend regular Indonesian or Western pop/rock/indie songs just to satisfy the language constraint.
- If language is Indonesian Only or All: Default to original K-Pop/J-Pop songs in their native languages (Korean/Japanese) that fit the mood.
- If language is English Only: Smartly find global/full-English tracks released by K-Pop/J-Pop artists (e.g., ${exampleSongs}), or songs with heavy English hooks by K-Pop/J-Pop artists.`;
  }

  const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  let rawText = "";
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      console.log(`Attempting recommendation with model: ${model}`);
      const response = await ai.models.generateContent({
        model: model,
        contents: `Emotional venting of user: "${venting}"\nSelected genre constraint: ${genre || "Any"}\n${languagePrompt}`,
        config: {
          systemInstruction: "You are MelodyBestie, an emotionally intelligent music companion. Analyze the user's emotional venting, classify their mood into one of the 5 official moods, and recommend exactly 3 highly relevant songs. Provide casual, chill, and mature Gen Z/Jaksel casual Indonesian mixed with natural English code-switching using 'kamu'. ANTI-LEBAY & ANTI-JAMET: STRICTLY avoid overly dramatic lines like 'Duh nyesek banget', 'Semangat ya bestie-ku sayang', 'Stay strong!', or 'Jangan layu ya'. Limit emojis to maximum 1-2 aesthetic/neutral ones (e.g. 🤍 or 🎧) or none. Focus realistically on validation, emotional empathy, and natural friendship vibes.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detected_mood: {
                type: Type.STRING,
                description: "Classify the user's emotional venting into exactly one of these 5 official moods: 'Sad Vibes', 'Happy Pill', 'Cozy & Chill', 'Overthinking', 'Burnout / Tired'."
              },
              song_recommendation: {
                type: Type.STRING,
                description: "Main song recommendation represented in the format: Title - Artist."
              },
              ai_reason: {
                type: Type.STRING,
                description: "Warm and cozy emotional reasoning of why the main song fits their venting and current mood."
              },
              songs: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    artist: { type: Type.STRING },
                    lyrics_snippet: { type: Type.STRING },
                    ai_reason: { type: Type.STRING }
                  },
                  required: ["title", "artist", "lyrics_snippet", "ai_reason"]
                },
                description: "Exactly 3 recommended songs for the playlist/album cassette collection."
              }
            },
            required: ["detected_mood", "song_recommendation", "ai_reason", "songs"]
          }
        }
      });

      if (response && response.text) {
        rawText = response.text;
        console.log(`Success generating recommendation with model: ${model}`);
        break;
      }
    } catch (error: any) {
      console.warn(`Model ${model} failed:`, error.message || error);
      lastError = error;
    }
  }

  try {
    if (!rawText) {
      throw lastError || new Error("All selected Gemini models failed to generate content.");
    }

    const cleanText = rawText.replace(/```json|```/g, "").trim();
    const resultObj = JSON.parse(cleanText);
    return res.json(resultObj);
  } catch (error: any) {
    console.error("Failed to parse or obtain recommendations:", error);
    return res.status(500).json({ 
      error: "Gagal membuat rekomendasi musik", 
      details: error.message || String(error) 
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
