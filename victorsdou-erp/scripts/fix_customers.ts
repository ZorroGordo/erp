/**
 * fix_customers.ts — Rebuild Customer + Sucursal data from the Excel source
 *
 * CORRECTED field mapping (the original import used columns wrong):
 *   Excel col "dirección" → store/branch name  (Sucursal.name or CustomerAddress.label)
 *   Excel col "distrito"  → street address      (addressLine1)
 *   Excel col "ciudad"    → district            (district)
 *   Excel col "notas"     → city/province       (province — always "Lima" in this set)
 *
 * Logic:
 *   • Same RUC → ONE Customer, multiple Sucursales
 *   • Rows with a branch name → Sucursal record
 *   • Rows without a branch   → CustomerAddress (default delivery address)
 *   • RUC look-up via apis.net.pe for the legal fiscal address (set as Customer.notes)
 *
 * Run: npx tsx scripts/fix_customers.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Corrected source data (from Excel via read_clients.py) ───────────────────
const RAW: Array<{
  tipo: string;
  nombre: string;
  ruc: string;
  email: string | null;
  telefono: string | null;
  branch: string | null;   // Excel "dirección" — store name
  address: string | null;  // Excel "distrito"  — street address
  district: string | null; // Excel "ciudad"    — district
  city: string | null;     // Excel "notas"     — city/province
}> = [
  { tipo: 'B2B', nombre: 'BOTTEGA DASSO SOCIEDAD ANONIMA CERRADA - BOTTEGA DASSO S.A.C.', ruc: '20553737878', email: null, telefono: '941366800', branch: null, address: 'CAL. MIGUEL DASSO NRO 155', district: 'SAN ISIDRO', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'CALUA S.A.C.', ruc: '20607924946', email: 'pedidosamarena@gmail.com', telefono: '987829079', branch: 'LA MAR', address: 'AV. MARISCAL LA MAR 438', district: 'MIRAFLORES', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'CALUA S.A.C.', ruc: '20607924946', email: 'pedidosamarena@gmail.com', telefono: '987829079', branch: 'BOLOGNESI', address: 'CALLE BOLOGNESI 506', district: 'MIRAFLORES', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'CAPITTANA RS S.A.C.', ruc: '20565646754', email: 'compras@capittana.com', telefono: '951379478', branch: null, address: 'AV. SANTA CRUZ NRO 1068 DEP. 702 URB. CHACARILLA SANTA CRUZ', district: 'MIRAFLORES', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'CENCOSUD RETAIL PERU S.A.', ruc: '20109072177', email: 'cesar.chavez@cencosud.com.pe', telefono: '952239222', branch: 'OVALO GUTIERREZ', address: 'AV. SANTA CRUZ 771 - OVALO GUTIERREZ', district: 'MIRAFLORES', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'CENCOSUD RETAIL PERU S.A.', ruc: '20109072177', email: 'cesar.chavez@cencosud.com.pe', telefono: null, branch: 'SAN MIGUEL', address: 'AV. LA MARINA ESQ. AV. UNIVERSITARIA', district: 'SAN MIGUEL', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'CENCOSUD RETAIL PERU S.A.', ruc: '20109072177', email: 'cesar.chavez@cencosud.com.pe', telefono: '952377154', branch: 'BENAVIDES', address: 'ESQ. AV BENAVIDES Y REPUBLICA DE PANAMA 1475', district: 'MIRAFLORES', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'CENCOSUD RETAIL PERU S.A.', ruc: '20109072177', email: 'cesar.chavez@cencosud.com.pe', telefono: '955754040', branch: 'BAJADA BALTA', address: 'AV. BAJADA BALTA 626', district: 'MIRAFLORES', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'CENCOSUD RETAIL PERU S.A.', ruc: '20109072177', email: 'cesar.chavez@cencosud.com.pe', telefono: '989887182', branch: 'AURORA', address: 'ARIAS SCHREIBER 27. URB LA AURORA', district: 'MIRAFLORES', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'CENCOSUD RETAIL PERU S.A.', ruc: '20109072177', email: 'cesar.chavez@cencosud.com.pe', telefono: null, branch: 'LA PLANICIE', address: 'AV. RICARDO ELIAS APARICIO LOTE C. 751', district: 'LA MOLINA', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'CENCOSUD RETAIL PERU S.A.', ruc: '20109072177', email: 'cesar.chavez@cencosud.com.pe', telefono: '950221248', branch: 'CHACARILLA', address: 'MONTE BELLO 150', district: 'SANTIAGO DE SURCO', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'CENCOSUD RETAIL PERU S.A.', ruc: '20109072177', email: 'cesar.chavez@cencosud.com.pe', telefono: null, branch: 'LA MOLINA', address: 'AV. RAUL FERRERO MZ D LOTE 1 , URB. LOS SIRUS - II ETAPA', district: 'LA MOLINA', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'GEDA RESTAURANTES S.A.C.', ruc: '20610489061', email: null, telefono: '944789833', branch: null, address: 'CAL. PEREZ ROCA NRO 244', district: 'BARRANCO', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'HOTELERA LOS GIRASOLES S.A.C.', ruc: '20372362252', email: 'administracion@losgirasoleshotel.com', telefono: '980869714', branch: null, address: 'AV. DIEZ CANSECO NRO 696', district: 'MIRAFLORES', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'INVERSIONES 1004 E.I.R.L.', ruc: '20605582410', email: null, telefono: '964313139', branch: null, address: 'AV. PALERMO NRO 540 URB. BALCONCILLO', district: 'LA VICTORIA', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'INVERSIONES MATO S.A.C.', ruc: '20612109347', email: null, telefono: null, branch: null, address: 'AV. ANDRES ARAMBURU 1147', district: 'SAN ISIDRO', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'INVERSIONES SIFU S.A.C.', ruc: '20613822730', email: null, telefono: null, branch: null, address: 'CAL. JOSE GONZALES NRO 473 URB. COCHARCAS', district: 'MIRAFLORES', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'ISSIMO FOOD CO S.A.C.', ruc: '20610521879', email: null, telefono: null, branch: null, address: 'AV. GREGORIO ESCOBEDO NRO S/N INT. 62 RES. SAN FELIPE', district: 'JESUS MARIA', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'JKM NEGOCIOS S.A.C.', ruc: '20609361876', email: null, telefono: null, branch: null, address: 'CAL. SAN ISIDRO CALLE 42 NRO. NRO 42 DEP. 203 URB. CORPAC', district: 'SAN ISIDRO', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'KALDI CAFE SOCIEDAD ANONIMA CERRADA - KALDI CAFE S.A.C.', ruc: '20600550986', email: null, telefono: null, branch: null, address: 'CAL. GENERAL RECAVARREN NRO 598', district: 'MIRAFLORES', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'KAM INVERSIONES PERU S.A.C.', ruc: '20612296015', email: null, telefono: null, branch: null, address: 'CAL. LOS ALCANFORES NRO 348 URB. LEURO', district: 'MIRAFLORES', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'KARIM Y NAYDU S.A.C.', ruc: '20520733834', email: null, telefono: '981252591', branch: null, address: 'JR. ALCALA NRO 580 URB. LA CASTELLANA', district: 'SANTIAGO DE SURCO', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'LA PITUKÉ S.A.C.', ruc: '20613213172', email: null, telefono: '999420739', branch: null, address: 'JR. JORGE APRILE NRO 222', district: 'SAN BORJA', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'MARIBEAT S.A.C.', ruc: '20611836458', email: null, telefono: '994044901', branch: 'ANCON', address: null, district: 'ANCON', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'MARIBEAT S.A.C.', ruc: '20611836458', email: null, telefono: '971928176', branch: 'SAN ISIDRO', address: null, district: 'SAN ISIDRO', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'MAYA INVESTMENTS S.A.C.', ruc: '20563309416', email: null, telefono: '944372843', branch: null, address: 'AV. EL POLO NRO 418 URB. CENTRO COMERCIAL MONTERRICO', district: 'SANTIAGO DE SURCO', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'MILENARIA BIO COMPANY SAC', ruc: '20602681263', email: null, telefono: null, branch: null, address: 'CAL. LOS ALCANFORES NRO 350 INT. B URB. LEURO', district: 'MIRAFLORES', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'NITIDO S.A.C.', ruc: '20611324546', email: 'admin@nitido.coffee', telefono: null, branch: null, address: 'AV. RICARDO RIVERA NAVARRETE NRO 585 INT. 2 URB. JARDIN', district: 'SAN ISIDRO', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'PARAMO WELLNESS S.A.C.', ruc: '20607072273', email: null, telefono: '989048691', branch: null, address: 'AV. AVIACION 2868', district: 'SAN BORJA', city: 'LIMA' },
  { tipo: 'B2B', nombre: "PEPPER'S SMOKING HOUSE S.A.C.", ruc: '20614064821', email: null, telefono: '944630056', branch: null, address: 'CALLE GENERAL BORGOÑO 1191', district: 'MIRAFLORES', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'PRODUSANA S.A.C.', ruc: '20563468646', email: 'compras4@produsana.com', telefono: '981055117', branch: 'SAN BORJA', address: 'AV. AVIACIÓN 3118', district: 'SAN BORJA', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'PRODUSANA S.A.C.', ruc: '20563468646', email: 'compras4@produsana.com', telefono: '981055117', branch: 'BARRANCO', address: 'AV. ALMIRANTE MIGUEL GRAU NRO. 560', district: 'BARRANCO', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'PRODUSANA S.A.C.', ruc: '20563468646', email: 'compras4@produsana.com', telefono: '981055117', branch: 'BENAVIDES', address: 'AV. BENAVIDES 2140', district: 'MIRAFLORES', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'PRODUSANA S.A.C.', ruc: '20563468646', email: 'compras4@produsana.com', telefono: '981055117', branch: 'EL POLO', address: 'NRO. 109 OTR. AV. EL POLO NRO. 740, LOCAL C-109, BLOCK C', district: 'SANTIAGO DE SURCO', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'PRODUSANA S.A.C.', ruc: '20563468646', email: 'compras4@produsana.com', telefono: '981055117', branch: 'JESUS MARIA', address: 'AV. GREGORIO ESCOBEDO CDA. 8', district: 'JESUS MARIA', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'PRODUSANA S.A.C.', ruc: '20563468646', email: 'compras4@produsana.com', telefono: '981055117', branch: 'LA MAR', address: 'AV. MARISCAL LA MAR 1110', district: 'MIRAFLORES', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'PRODUSANA S.A.C.', ruc: '20563468646', email: 'compras4@produsana.com', telefono: '981055117', branch: 'LA MOLINA', address: 'AV. RAUL FERRERO 1415', district: 'LA MOLINA', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'PRODUSANA S.A.C.', ruc: '20563468646', email: 'compras4@produsana.com', telefono: '981055117', branch: 'PRIMAVERA', address: 'AV.PRIMAVERA 654', district: 'SANTIAGO DE SURCO', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'PRODUSANA S.A.C.', ruc: '20563468646', email: 'compras4@produsana.com', telefono: '981055117', branch: 'SAN MIGUEL', address: 'AV UNIVERSITARIA 1045', district: 'SAN MIGUEL', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'PRODUSANA S.A.C.', ruc: '20563468646', email: 'compras4@produsana.com', telefono: '981055117', branch: 'VASCO', address: 'AV. VASCO NUÑEZ DE BALBOA NRO. 771 URB. LEURO', district: 'MIRAFLORES', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'PRODUSANA S.A.C.', ruc: '20563468646', email: 'compras4@produsana.com', telefono: '981055117', branch: 'CAVENECIA', address: 'AV. EMILIO CAVENECIA 134 - 140', district: 'MIRAFLORES', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'SANABEG S.A.C.', ruc: '20612926825', email: 'pveraportocarrero@lasanahoria.com', telefono: null, branch: null, address: 'CALLE LAS BEGONIAS 429. LOCAL 1', district: 'SAN ISIDRO', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'SERENDIPIA S.A.C.', ruc: '20537677539', email: null, telefono: null, branch: null, address: 'AV. DEL EJERCITO NRO 395 URB. SANTA CRUZ', district: 'MIRAFLORES', city: 'LIMA' },
  { tipo: 'B2B', nombre: "SUPERMERCADOS PERUANOS SOCIEDAD ANONIMA 'O ' S.P.S.A.", ruc: '20100070970', email: null, telefono: null, branch: null, address: 'CAL. MORELLI NRO 181 INT. P-2', district: 'SAN BORJA', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'TKT INVERSIONES S.A.C.', ruc: '20612719595', email: null, telefono: null, branch: null, address: 'CALLE GRIMALDO DEL SOLAR 247', district: 'MIRAFLORES', city: 'LIMA' },
  { tipo: 'B2B', nombre: 'VIDASANAHORIA S.A.C.', ruc: '20602754163', email: 'pveraportocarrero@lasanahoria.com', telefono: '968392463', branch: null, address: 'AV. EL POLO NRO 401 INT. 510 URB. CENTRO COMERCIAL MONTERRICO', district: 'SANTIAGO DE SURCO', city: 'LIMA' },
];

// ── Category heuristics based on company name / known brands ─────────────────
type Category = 'SUPERMERCADO' | 'TIENDA_NATURISTA' | 'CAFETERIA' | 'RESTAURANTE' | 'HOTEL' | 'EMPRESA' | 'OTROS';

function guessCategory(nombre: string): Category {
  const n = nombre.toUpperCase();
  if (n.includes('CENCOSUD') || n.includes('SUPERMERCADOS PERUANOS') || n.includes('SPSA') || n.includes('WONG') || n.includes('METRO')) return 'SUPERMERCADO';
  if (n.includes('SANAHORIA') || n.includes('PRODUSANA') || n.includes('MILENARIA BIO') || n.includes('PARAMO WELLNESS') || n.includes('VIDA')) return 'TIENDA_NATURISTA';
  if (n.includes('HOTEL') || n.includes('GIRASOLES')) return 'HOTEL';
  if (n.includes('RESTAURANTE') || n.includes('GEDA') || n.includes('SMOKING') || n.includes('SERENDIPIA') || n.includes('BOTTEGA') || n.includes('PEPPER')) return 'RESTAURANTE';
  if (n.includes('CAFE') || n.includes('KALDI') || n.includes('NITIDO') || n.includes('CALUA') || n.includes('ISSIMO') || n.includes('MARIBEAT') || n.includes('KARIM')) return 'CAFETERIA';
  return 'EMPRESA';
}

// ── RUC lookup (apis.net.pe) — best-effort, skips on error ───────────────────
const APIS_TOKEN = process.env.APIS_NET_PE_TOKEN;

async function lookupRuc(ruc: string): Promise<{ address: string; razonSocial: string } | null> {
  if (!APIS_TOKEN) return null;
  try {
    const res = await fetch(`https://api.apis.net.pe/v2/sunat/ruc?numero=${ruc}`, {
      headers: { Authorization: `Bearer ${APIS_TOKEN}`, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    return {
      razonSocial: data.razonSocial ?? '',
      address: [data.direccion, data.distrito, data.provincia, data.departamento]
        .filter(Boolean).join(', '),
    };
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔧  Rebuilding customer + sucursal data from corrected Excel mapping...\n');

  // 1. Wipe existing data that came from this Excel sheet
  //    (safe to cascade because sucursales / addresses are children of customers)
  const rucsInSheet = [...new Set(RAW.map(r => r.ruc))];
  console.log(`📋  ${rucsInSheet.length} unique companies | ${RAW.length} rows total\n`);

  const existingCustomers = await prisma.customer.findMany({
    where: { docNumber: { in: rucsInSheet } },
    include: { sucursales: true, addresses: true },
  });

  if (existingCustomers.length > 0) {
    console.log(`🗑   Removing ${existingCustomers.length} existing customer records (and their branches/addresses)...`);
    const ids = existingCustomers.map(c => c.id);
    await prisma.sucursal.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.customerAddress.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.customerContact.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });
    console.log('   Done.\n');
  }

  // 2. Group rows by RUC
  const byRuc = new Map<string, typeof RAW>();
  for (const row of RAW) {
    if (!byRuc.has(row.ruc)) byRuc.set(row.ruc, []);
    byRuc.get(row.ruc)!.push(row);
  }

  let created = 0;
  let sucursalCount = 0;
  let addressCount = 0;

  // 3. Create each company
  for (const [ruc, rows] of byRuc.entries()) {
    const first = rows[0];
    const category = guessCategory(first.nombre);

    // Optional: look up legal address from SUNAT
    const sunat = await lookupRuc(ruc);

    const customer = await prisma.customer.create({
      data: {
        type:     'B2B',
        category: category as never,
        displayName:  first.nombre,
        docType:      'RUC',
        docNumber:    ruc,
        email:        first.email    ?? null,
        phone:        first.telefono ?? null,
        isActive:     true,
        notes: sunat?.address
          ? `Dirección fiscal (SUNAT): ${sunat.address}`
          : null,
      },
    });

    created++;

    // 4. Create sucursales or addresses
    for (const row of rows) {
      if (row.branch) {
        // Named branch → Sucursal
        await prisma.sucursal.create({
          data: {
            customerId:   customer.id,
            name:         row.branch,
            addressLine1: row.address  ?? '',
            district:     row.district ?? '',
            province:     'Lima',
            department:   'Lima',
            contactPhone: row.telefono ?? null,
            isActive:     true,
          },
        });
        sucursalCount++;
      } else {
        // No branch name → main delivery address
        await prisma.customerAddress.create({
          data: {
            customerId:   customer.id,
            label:        'Principal',
            addressLine1: row.address  ?? '',
            district:     row.district ?? '',
            province:     'Lima',
            department:   'Lima',
            country:      'Peru',
            isDefault:    true,
          },
        });
        addressCount++;
      }
    }

    const branchNames = rows.filter(r => r.branch).map(r => r.branch).join(', ');
    console.log(
      `  ✅  ${first.nombre.substring(0, 45).padEnd(45)} | ${category.padEnd(16)} | ${rows.length} row(s)${branchNames ? ` → [${branchNames}]` : ''}`,
    );
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✨  Done!`);
  console.log(`    Customers created   : ${created}`);
  console.log(`    Sucursales created  : ${sucursalCount}`);
  console.log(`    Addresses created   : ${addressCount}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
