import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const DATA_DIR = path.resolve(__dirname, '.data');
const DB_FILE = path.join(DATA_DIR, 'geomatrix-saas-store.json');

interface VersionedRecord {
  id: string;
  version: number;
  updatedAt: string;
}

function mergeLww<T extends VersionedRecord>(local: T[] = [], remote: T[] = []): T[] {
  const map = new Map<string, T>();
  for (const item of local) map.set(item.id, item);
  for (const item of remote) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
    } else if (item.version !== existing.version) {
      map.set(item.id, item.version > existing.version ? item : existing);
    } else {
      const tNew = Date.parse(item.updatedAt) || 0;
      const tOld = Date.parse(existing.updatedAt) || 0;
      map.set(item.id, tNew >= tOld ? item : existing);
    }
  }
  return Array.from(map.values());
}

function ensureDataStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify({ empresas: {}, lastSyncedAt: null }, null, 2),
      'utf-8'
    );
  }
}

function readStore(): { empresas: Record<string, Record<string, unknown>>; lastSyncedAt: string | null } {
  ensureDataStore();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      empresas: parsed?.empresas && typeof parsed.empresas === 'object' ? parsed.empresas : {},
      lastSyncedAt: parsed?.lastSyncedAt || null,
    };
  } catch {
    return { empresas: {}, lastSyncedAt: null };
  }
}

function writeStore(data: unknown) {
  ensureDataStore();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function requireSession(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token =
    req.header('x-session-token') ||
    req.header('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token || !token.startsWith('aia-session-')) {
    return res.status(401).json({ error: 'Sesión no autenticada o token inválido.' });
  }
  next();
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
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.get('/api/state', requireSession, (req, res) => {
    const empresaId = String(req.query.empresaId || '').trim();
    if (!empresaId) {
      return res.status(400).json({ error: 'Se requiere empresaId.' });
    }
    const store = readStore();
    res.json({
      empresaId,
      snapshot: store.empresas[empresaId] ?? null,
      lastSyncedAt: store.lastSyncedAt,
    });
  });

  app.post('/api/sync', requireSession, (req, res) => {
    const { empresaId, snapshot } = req.body ?? {};
    if (!empresaId || typeof empresaId !== 'string' || !snapshot || typeof snapshot !== 'object') {
      return res.status(400).json({ error: 'Payload inválido: se requiere empresaId y snapshot.' });
    }

    const store = readStore();
    const existing = (store.empresas[empresaId] ?? {}) as Record<string, unknown>;
    const nowIso = new Date().toISOString();

    const merged = {
      ...snapshot,
      proyectos: mergeLww(
        (existing.proyectos as VersionedRecord[]) || [],
        (snapshot.proyectos as VersionedRecord[]) || []
      ),
      rutas: mergeLww(
        (existing.rutas as VersionedRecord[]) || [],
        (snapshot.rutas as VersionedRecord[]) || []
      ),
      servicios: mergeLww(
        (existing.servicios as VersionedRecord[]) || [],
        (snapshot.servicios as VersionedRecord[]) || []
      ),
      asignaciones: mergeLww(
        (existing.asignaciones as VersionedRecord[]) || [],
        (snapshot.asignaciones as VersionedRecord[]) || []
      ),
      viaticos: mergeLww(
        (existing.viaticos as VersionedRecord[]) || [],
        (snapshot.viaticos as VersionedRecord[]) || []
      ),
      lastSyncedAt: nowIso,
    };

    store.empresas[empresaId] = merged;
    store.lastSyncedAt = nowIso;
    writeStore(store);

    res.json({
      synced: true,
      empresaId,
      lastSyncedAt: nowIso,
      snapshot: merged,
    });
  });

  app.post('/api/expenses/analyze-receipt', requireSession, async (req, res) => {
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
      const safeMime =
        typeof mimeType === 'string' && mimeType.startsWith('image/') ? mimeType : 'image/jpeg';

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
            required: [
              'merchant',
              'amountRD',
              'itbisRD',
              'ncf',
              'category',
              'dateIso',
              'notes',
              'confidence',
            ],
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
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
        ws: { server: httpServer },
      },
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

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`GeoMatrix RD server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
