import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { normalizarResultadoAnalisisRecibo } from './src/domain/viaticos';

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

  const RECEIPT_OCR_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;

  const isTransientGeminiError = (err: unknown): { transient: boolean; status: number; raw: string } => {
    const raw = err instanceof Error ? err.message : String(err ?? '');
    const lower = raw.toLowerCase();
    const is503 =
      lower.includes('503') ||
      lower.includes('unavailable') ||
      lower.includes('high demand') ||
      lower.includes('overloaded');
    const is429 =
      lower.includes('429') ||
      lower.includes('resource_exhausted') ||
      lower.includes('quota') ||
      lower.includes('rate limit');
    const isNetwork =
      lower.includes('econnreset') ||
      lower.includes('etimedout') ||
      lower.includes('fetch failed') ||
      lower.includes('network');
    if (is503) return { transient: true, status: 503, raw };
    if (is429) return { transient: true, status: 429, raw };
    if (isNetwork) return { transient: true, status: 503, raw };
    return { transient: false, status: 500, raw };
  };

  const formatReceiptErrorMessage = (err: unknown): { status: number; message: string } => {
    const info = isTransientGeminiError(err);
    const lower = info.raw.toLowerCase();
    if (info.status === 503) {
      return {
        status: 503,
        message:
          'El servicio de análisis IA tiene alta demanda temporal en este momento. Intenta reintentar en unos segundos o completa los datos manualmente.',
      };
    }
    if (info.status === 429) {
      return {
        status: 429,
        message:
          'Se alcanzó temporalmente el límite de solicitudes del analizador de recibos. Espera unos segundos antes de reintentar o registra el viático manualmente.',
      };
    }
    if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('403')) {
      return {
        status: 403,
        message:
          'La clave de API de Gemini no es válida o no tiene permisos activos en la configuración del servidor.',
      };
    }
    return {
      status: 500,
      message: 'No se pudo analizar la factura automáticamente. Verifica la nitidez de la foto o completa los campos manualmente.',
    };
  };

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

      const cleanBase64 = (imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64).trim();
      if (!cleanBase64 || cleanBase64.length > 10_500_000) {
        return res.status(400).json({
          error: 'La imagen del comprobante es inválida o supera el tamaño máximo permitido.',
        });
      }

      const allowedMimes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
      const safeMime =
        typeof mimeType === 'string' && allowedMimes.has(mimeType.toLowerCase())
          ? mimeType.toLowerCase() === 'image/jpg'
            ? 'image/jpeg'
            : mimeType.toLowerCase()
          : 'image/jpeg';

      const safeSurveyCode =
        typeof surveyCode === 'string' ? surveyCode.trim().slice(0, 60) : '';

      const prompt = `Analiza este comprobante de gasto o factura de campo en República Dominicana${
        safeSurveyCode ? ` asociado al levantamiento ${safeSurveyCode}` : ''
      }. Extrae:
1. Comercio / establecimiento.
2. Monto total pagado en pesos dominicanos (RD$).
3. Subtotal antes de impuestos y cargos adicionales, ITBIS (impuesto) si aparece, y otros cargos adicionales (propina legal 10%, cargo por servicio, flete, recargo).
4. Desglose de los cargos o conceptos principales del recibo (descripcion y montoRD).
5. Número de Comprobante Fiscal (NCF como B01, B02, E31, E32, etc.) únicamente si aparece o es necesario en el documento; si no existe, devuelve cadena vacía y requiereNcf en false.
6. Fecha del recibo en formato YYYY-MM-DD.
7. Categoría operativa más probable (Combustible, Dieta, Hospedaje, Peaje, Materiales, Otro).`;

      let responseText: string | undefined;
      let lastErr: unknown;

      modelLoop: for (const modelName of RECEIPT_OCR_MODELS) {
        for (let intento = 0; intento < 2; intento += 1) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
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
                  'Eres un asistente contable especializado en viáticos de ingeniería topográfica en República Dominicana. Extrae montos, cargos desglosados, NCF (si aplica) y fecha con exactitud. Devuelve únicamente JSON válido según el esquema.',
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
                    subtotalRD: {
                      type: Type.NUMBER,
                      description: 'Subtotal antes de ITBIS y cargos adicionales en RD$, o 0 si no aparece.',
                    },
                    itbisRD: {
                      type: Type.NUMBER,
                      description: 'Impuesto ITBIS en RD$, o 0 si no está desglosado.',
                    },
                    otrosCargosRD: {
                      type: Type.NUMBER,
                      description: 'Suma de cargos adicionales (propina legal 10%, servicio, envío, recargos) en RD$, o 0.',
                    },
                    cargos: {
                      type: Type.ARRAY,
                      description: 'Lista de cargos o renglones facturados en el comprobante.',
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          descripcion: {
                            type: Type.STRING,
                            description: 'Nombre del cargo o concepto (ej. Gasolina Premium, ITBIS 18%, Propina 10%).',
                          },
                          montoRD: {
                            type: Type.NUMBER,
                            description: 'Monto de este cargo en RD$.',
                          },
                        },
                        required: ['descripcion', 'montoRD'],
                      },
                    },
                    ncf: {
                      type: Type.STRING,
                      description: 'Número de Comprobante Fiscal (ej. B0100004512) o cadena vacía si no aplica.',
                    },
                    requiereNcf: {
                      type: Type.BOOLEAN,
                      description: 'true si el comprobante contiene o requiere NCF fiscal; false en caso contrario.',
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
                      description: 'Detalle breve de los artículos, cargos o servicio facturado.',
                    },
                    confidence: {
                      type: Type.STRING,
                      description: 'Nivel de legibilidad: alta, media, o baja.',
                    },
                  },
                  required: [
                    'merchant',
                    'amountRD',
                    'subtotalRD',
                    'itbisRD',
                    'otrosCargosRD',
                    'cargos',
                    'ncf',
                    'requiereNcf',
                    'category',
                    'dateIso',
                    'notes',
                    'confidence',
                  ],
                },
              },
            });
            responseText = response.text;
            break modelLoop;
          } catch (err) {
            lastErr = err;
            const errInfo = isTransientGeminiError(err);
            if (!errInfo.transient && !errInfo.raw.toLowerCase().includes('not_found')) {
              break modelLoop;
            }
            if (intento === 0) {
              const jitter = Math.floor(Math.random() * 250);
              await new Promise((r) => setTimeout(r, 650 + jitter));
            }
          }
        }
      }

      if (responseText === undefined) {
        throw lastErr instanceof Error
          ? lastErr
          : new Error('No se recibió respuesta del servicio de análisis de recibos.');
      }

      const rawParsed = JSON.parse(responseText.trim());
      const extracted = normalizarResultadoAnalisisRecibo(rawParsed);
      return res.json({ ok: true, extracted });
    } catch (err: unknown) {
      const formatted = formatReceiptErrorMessage(err);
      console.error('Receipt analysis error:', err instanceof Error ? err.message : err);
      return res.status(formatted.status).json({ error: formatted.message });
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
