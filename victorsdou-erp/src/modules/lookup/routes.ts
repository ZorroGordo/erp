/**
 * Lookup routes — proxied RUC (SUNAT) and DNI (RENIEC) queries
 * Uses api.decolecta.com (same credentials as apis.net.pe).
 * Token goes in .env: APIS_NET_PE_TOKEN=<your_token>
 */
import type { FastifyInstance } from 'fastify';
import { requireAnyOf } from '../../middleware/auth';
import { config } from '../../config';

const BASE = 'https://api.apis.net.pe/v2';

async function apisNetPe(path: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    headers: {
      'Authorization': `Bearer ${config.APIS_NET_PE_TOKEN ?? ''}`,
      'Accept': 'application/json',
    },
  });
}

export async function lookupRoutes(app: FastifyInstance) {

  // GET /v1/lookup/ruc?n=20606963123
  app.get('/ruc', {
    preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR', 'SALES_AGENT', 'SALES_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { n } = req.query as { n?: string };
    if (!n || !/^\d{11}$/.test(n.trim())) {
      return reply.code(400).send({ error: 'RUC must be exactly 11 digits' });
    }

    if (!config.APIS_NET_PE_TOKEN) {
      return reply.code(503).send({
        error: 'APIS_TOKEN_MISSING',
        detail: 'Set APIS_NET_PE_TOKEN in .env. Register free at https://apis.net.pe',
      });
    }

    let res: Response;
    try {
      res = await apisNetPe(`/sunat/ruc?numero=${n.trim()}`);
    } catch {
      return reply.code(502).send({ error: 'LOOKUP_UNAVAILABLE', detail: 'Could not reach lookup API' });
    }

    if (res.status === 401 || res.status === 403) {
      return reply.code(503).send({
        error: 'APIS_TOKEN_INVALID',
        detail: 'APIS_NET_PE_TOKEN is invalid or expired. Check your token at https://apis.net.pe',
      });
    }
    if (!res.ok) {
      const body = await res.text();
      return reply.code(res.status === 404 ? 404 : 502).send({ error: 'NOT_FOUND', detail: body });
    }

    const data = await res.json() as {
      razonSocial?: string;        // apis.net.pe
      ruc?: string;
      estado?: string;
      condicion?: string;
      direccion?: string;
      distrito?: string;
      provincia?: string;
      departamento?: string;
      nombreComercial?: string;
      
    };

    return reply.send({
      ruc:             data.ruc ?? n,
      razonSocial:     data.razonSocial ?? '',
      nombreComercial: data.nombreComercial ?? '',
      estado:          data.estado ?? '',
      condicion:       data.condicion ?? '',
      direccion:       data.direccion ?? '',
      distrito:        data.distrito ?? '',
      provincia:       data.provincia ?? '',
      departamento:    data.departamento ?? '',
    });
  });

  // GET /v1/lookup/dni?n=12345678
  app.get('/dni', {
    preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR', 'SALES_AGENT', 'SALES_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { n } = req.query as { n?: string };
    if (!n || !/^\d{8}$/.test(n.trim())) {
      return reply.code(400).send({ error: 'DNI must be exactly 8 digits' });
    }

    if (!config.APIS_NET_PE_TOKEN) {
      return reply.code(503).send({
        error: 'APIS_TOKEN_MISSING',
        detail: 'Set APIS_NET_PE_TOKEN in .env. Register free at https://apis.net.pe',
      });
    }

    let res: Response;
    try {
      res = await apisNetPe(`/reniec/dni?numero=${n.trim()}`);
    } catch {
      return reply.code(502).send({ error: 'LOOKUP_UNAVAILABLE', detail: 'Could not reach lookup API' });
    }

    if (res.status === 401 || res.status === 403) {
      return reply.code(503).send({
        error: 'APIS_TOKEN_INVALID',
        detail: 'APIS_NET_PE_TOKEN is invalid or expired. Check your token at https://apis.net.pe',
      });
    }
    if (!res.ok) {
      return reply.code(res.status === 404 ? 404 : 502).send({ error: 'NOT_FOUND' });
    }

    const data = await res.json() as {
      nombres?: string;            // apis.net.pe
      apellidoPaterno?: string;
      apellidoMaterno?: string;
      dni?: string;
      
    };

    const nombres         = data.nombres ?? '';
    const apellidoPaterno = data.apellidoPaterno ?? '';
    const apellidoMaterno = data.apellidoMaterno ?? '';
    const fullName = [nombres, apellidoPaterno, apellidoMaterno].filter(Boolean).join(' ');

    return reply.send({
      dni:             data.dni ?? n,
      nombres,
      apellidoPaterno,
      apellidoMaterno,
      fullName,
    });
  });
}
