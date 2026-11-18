import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const DATA_DIR = path.resolve(__dirname, '.data');
const DB_FILE = path.join(DATA_DIR, 'geomatrix-store.json');

function ensureDataStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify({ surveys: null, expenses: null, lastSyncedAt: null }, null, 2),
      'utf-8'
    );
  }
}

function readStore() {
  ensureDataStore();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { surveys: null, expenses: null, lastSyncedAt: null };
  }
}

function writeStore(data: unknown) {
  ensureDataStore();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Get synced operational state
  app.get('/api/state', (_req, res) => {
    const store = readStore();
    res.json(store);
  });

  // Sync offline queue & workspace state
  app.post('/api/sync', (req, res) => {
    const { surveys, expenses } = req.body ?? {};
    const store = readStore();
    const updated = {
      surveys: Array.isArray(surveys) ? surveys : store.surveys,
      expenses: Array.isArray(expenses) ? expenses : store.expenses,
      lastSyncedAt: new Date().toISOString(),
    };
    writeStore(updated);
    res.json({
      synced: true,
      lastSyncedAt: updated.lastSyncedAt,
      surveyCount: Array.isArray(updated.surveys) ? updated.surveys.length : 0,
      expenseCount: Array.isArray(updated.expenses) ? updated.expenses.length : 0,
    });
  });

  // Automatic mobile receipt extraction with Gemini Vision
  app.post('/api/expenses/analyze-receipt', async (req, res) => {
    try {
      const { imageBase64, mimeType, surveyCode } = req.body ?? {};
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ error: 'Se requiere una imagen del comprobante en base64.' });
      }

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY no está configurada en el servidor.',
        });
      }

      const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      const safeMime = typeof mimeType === 'string' && mimeType.startsWith('image/') ? mimeType : 'image/jpeg';

      const prompt = `Analiza este comprobante de gasto o factura de campo en República Dominicana${
        surveyCode ? ` asociado al levantamiento ${surveyCode}` : ''
      }. Extrae el comercio, monto total en pesos dominicanos (RD$), ITBIS si aparece, número de comprobante fiscal (NCF como B01, B02, E31, etc.), fecha (YYYY-MM-DD), categoría operativa más probable y un resumen breve de los conceptos.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: safeMime,
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          systemInstruction:
            'Eres un asistente contable especializado en viáticos de ingeniería topográfica en República Dominicana. Devuelve únicamente JSON válido según el esquema.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              merchant: {
                type: Type.STRING,
                description: 'Nombre del establecimiento, estación de combustible, peaje o proveedor.',
              },
              amountRD: {
                type: Type.NUMBER,
                description: 'Monto total pagado en pesos dominicanos (RD$).',
              },
              itbisRD: {
                type: Type.NUMBER,
                description: 'Impuesto ITBIS en RD$, o 0 si no está desglosado.',
              },
              ncf: {
                type: Type.STRING,
                description: 'Número de Comprobante Fiscal (ej. B0100004512) o cadena vacía si no aplica.',
              },
              category: {
                type: Type.STRING,
                description: 'Una de: Combustible, Dieta, Hospedaje, Peaje, Materiales, Otro',
              },
              dateIso: {
                type: Type.STRING,
                description: 'Fecha del recibo en formato YYYY-MM-DD.',
              },
              notes: {
                type: Type.STRING,
                description: 'Detalle breve de los artículos o servicio facturado.',
              },
              confidence: {
                type: Type.STRING,
                description: 'Nivel de legibilidad: alta, media, o baja.',
              },
            },
            required: ['merchant', 'amountRD', 'itbisRD', 'ncf', 'category', 'dateIso', 'notes', 'confidence'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json({ ok: true, extracted: parsed });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error analizando el comprobante.';
      console.error('Receipt analysis error:', message);
      return res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GeoMatrix RD server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
