/**
 * Import script — Maestro MP Rev.xlsx data
 * Populates: Ingredients, Products (catalog), Recipes, BOM Lines
 *
 * Run with: npx tsx scripts/import_maestro.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const INGREDIENTS = [
  { sku: 'ING-ACEITEOLIVAING', name: 'ACEITE DE OLIVA', category: 'fat', baseUom: 'g', avgCostPen: 29.661, isPerishable: false },
  { sku: 'ING-ACEITEVEGETALIN', name: 'ACEITE VEGETAL', category: 'fat', baseUom: 'g', avgCostPen: 5.85, isPerishable: false },
  { sku: 'ING-AGUAINGREDIENT', name: 'AGUA', category: 'other', baseUom: 'g', avgCostPen: 0.2, isPerishable: false },
  { sku: 'ING-AJONJOLIBLANCOIH', name: 'AJONJOLI BLANCO', category: 'other', baseUom: 'g', avgCostPen: 11.0, isPerishable: false },
  { sku: 'ING-AJONJOLIBLANDEC', name: 'AJONJOLI BLANCO (DEC)', category: 'other', baseUom: 'g', avgCostPen: 9.2, isPerishable: false },
  { sku: 'ING-AJONJOLINEGROING', name: 'AJONJOLI NEGRO', category: 'other', baseUom: 'g', avgCostPen: 14.0, isPerishable: false },
  { sku: 'ING-AMILASAINGREDIENT', name: 'AMILASA', category: 'other', baseUom: 'g', avgCostPen: 406.78, isPerishable: false },
  { sku: 'ING-AZUCARBLANCHING', name: 'AZUCAR BLANCA', category: 'sugar', baseUom: 'g', avgCostPen: 4.06, isPerishable: false },
  { sku: 'ING-AZUCARENPOLVING', name: 'AZUCAR EN POLVO', category: 'sugar', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-AZUCARRUBIAING', name: 'AZUCAR RUBIA', category: 'sugar', baseUom: 'g', avgCostPen: 3.72, isPerishable: false },
  { sku: 'ING-BICARBONATOINS', name: 'BICARBONATO', category: 'other', baseUom: 'g', avgCostPen: 6.36, isPerishable: false },
  { sku: 'ING-BIGAINGREDIENT', name: 'BIGA', category: 'flavoring', baseUom: 'g', avgCostPen: 2.07, isPerishable: false },
  { sku: 'ING-CACAOENPOLVING', name: 'CACAO EN POLVO', category: 'flavoring', baseUom: 'g', avgCostPen: 13.6, isPerishable: false },
  { sku: 'ING-CANELAINGREDIENT', name: 'CANELA', category: 'other', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-CANELAMOLIDAING', name: 'CANELA MOLIDA', category: 'other', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-CARDAMOMOAING', name: 'CARDAMOMO', category: 'other', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-CHOCOLATEBITTERR', name: 'CHOCOLATE BITTER', category: 'other', baseUom: 'g', avgCostPen: 70.325, isPerishable: false },
  { sku: 'ING-COOKIESAAING', name: 'COOKIES', category: 'other', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-CORISSSANTSRING', name: 'CORISSANTS', category: 'other', baseUom: 'unit', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-CREMADELECHING', name: 'CREMA DE LECHE', category: 'dairy', baseUom: 'ml', avgCostPen: 0.0, isPerishable: true },
  { sku: 'ING-CURCUMAAAAAING', name: 'CÚRCUMA', category: 'other', baseUom: 'g', avgCostPen: 80.0, isPerishable: false },
  { sku: 'ING-GLUTENAAAAAAING', name: 'GLUTEN', category: 'flour', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-HARINACENTEROING', name: 'HARINA DE CENTENO', category: 'flour', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-HARINAINTEGRALING', name: 'HARINA INTEGRAL', category: 'flour', baseUom: 'g', avgCostPen: 2.67, isPerishable: false },
  { sku: 'ING-HARINAPANADERING', name: 'HARINA PANADERA', category: 'flour', baseUom: 'g', avgCostPen: 1.97, isPerishable: false },
  { sku: 'ING-HARINATRIGONING', name: 'HARINA TRIGO', category: 'flour', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-HUEVOAAAAAAING', name: 'HUEVO', category: 'egg', baseUom: 'unit', avgCostPen: 6.8, isPerishable: true },
  { sku: 'ING-JAMAHUMADOAAING', name: 'JAMON AHUMADO', category: 'other', baseUom: 'g', avgCostPen: 0.0, isPerishable: true },
  { sku: 'ING-JENGIBREMOLIDOIG', name: 'JENGIBRE MOLIDO', category: 'other', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-LECHEENPOLVOING', name: 'LECHE EN POLVO', category: 'dairy', baseUom: 'g', avgCostPen: 19.5, isPerishable: false },
  { sku: 'ING-LECHEFRESCAING', name: 'LECHE FRESCA', category: 'dairy', baseUom: 'ml', avgCostPen: 3.668, isPerishable: true },
  { sku: 'ING-LEVADURASECAING', name: 'LEVADURA SECA', category: 'flavoring', baseUom: 'g', avgCostPen: 14.41, isPerishable: false },
  { sku: 'ING-LINAZAENTERAING', name: 'LINAZA ENTERA', category: 'other', baseUom: 'g', avgCostPen: 6.0, isPerishable: false },
  { sku: 'ING-LINAZAMOLIDAING', name: 'LINAZA MOLIDA', category: 'other', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-MALTAAAAAAAING', name: 'MALTA', category: 'other', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-MANTEQUILLAING', name: 'MANTEQUILLA SIN SAL', category: 'fat', baseUom: 'g', avgCostPen: 38.73, isPerishable: false },
  { sku: 'ING-MANTEQUILLACONS', name: 'MANTEQUILLA CON SAL', category: 'fat', baseUom: 'g', avgCostPen: 38.73, isPerishable: false },
  { sku: 'ING-MARGARINAHOJING', name: 'MARGARINA HOJALDRE', category: 'fat', baseUom: 'g', avgCostPen: 13.56, isPerishable: false },
  { sku: 'ING-MASAMADREING', name: 'MASA MADRE', category: 'flavoring', baseUom: 'g', avgCostPen: 2.71, isPerishable: false },
  { sku: 'ING-MEJORADORAAING', name: 'MEJORADOR', category: 'other', baseUom: 'g', avgCostPen: 9.32, isPerishable: false },
  { sku: 'ING-MIELDEABEJAING', name: 'MIEL DE ABEJA', category: 'sugar', baseUom: 'g', avgCostPen: 10.5, isPerishable: false },
  { sku: 'ING-NARANJACONFIING', name: 'NARANJA CONFITADA', category: 'other', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-NARANJARAYADING', name: 'NARANJA DE MESA (RAYADURA)', category: 'other', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-NUEZENTERAAING', name: 'NUEZ ENTERA', category: 'other', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-NUEZMOLIDAING', name: 'NUEZ MOLIDA', category: 'other', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-NUTELLAAAAING', name: 'NUTELLA', category: 'other', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-PAPABLANCAING', name: 'PAPA BLANCA', category: 'other', baseUom: 'g', avgCostPen: 2.03, isPerishable: true },
  { sku: 'ING-PECANASAAAING', name: 'PECANAS', category: 'other', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-POLVOHORNEING', name: 'POLVO DE HORNEAR', category: 'other', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-POOLISHAAAING', name: 'POOLISH', category: 'flavoring', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-PUREMANZANAING', name: 'PURE DE MANZANA', category: 'other', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-QUESOCREMAING', name: 'QUESO CREMA', category: 'dairy', baseUom: 'g', avgCostPen: 0.0, isPerishable: true },
  { sku: 'ING-QUESOGRYEREING', name: 'QUESO GRUYERE', category: 'dairy', baseUom: 'g', avgCostPen: 0.0, isPerishable: true },
  { sku: 'ING-ROMEROAAAING', name: 'ROMERO', category: 'other', baseUom: 'g', avgCostPen: 30.0, isPerishable: false },
  { sku: 'ING-SALAAAAAAAING', name: 'SAL', category: 'other', baseUom: 'g', avgCostPen: 0.82, isPerishable: false },
  { sku: 'ING-SALMARASGRUEING', name: 'SAL DE MARAS GRUESA', category: 'other', baseUom: 'g', avgCostPen: 20.0, isPerishable: false },
  { sku: 'ING-SALMARASFINAING', name: 'SAL DE MARAS FINA', category: 'other', baseUom: 'g', avgCostPen: 12.88, isPerishable: false },
  { sku: 'ING-SEMILLCALABAING', name: 'SEMILLAS DE CALABAZA', category: 'other', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-SEMILLGIRASOLING', name: 'SEMILLAS DE GIRASOL', category: 'other', baseUom: 'g', avgCostPen: 9.5, isPerishable: false },
  { sku: 'ING-SORBATOPOTASING', name: 'SORBATO DE POTASIO', category: 'other', baseUom: 'g', avgCostPen: 33.9, isPerishable: false },
  { sku: 'ING-VAINILLAESCNING', name: 'VAINILLA ESCENCIA', category: 'flavoring', baseUom: 'ml', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-VAINILLAVAAINING', name: 'VAINILLA VAINA', category: 'flavoring', baseUom: 'g', avgCostPen: 0.0, isPerishable: false },
  { sku: 'ING-YEMASAAAAAAING', name: 'YEMAS', category: 'egg', baseUom: 'unit', avgCostPen: 6.8, isPerishable: true },
  { sku: 'ING-ZANAHORIAING', name: 'ZANAHORIA', category: 'other', baseUom: 'g', avgCostPen: 0.0, isPerishable: true },
  { sku: 'EMP-BOLSAKRAF18IN', name: 'BOLSA KRAF 18.8X43.5X6 CON VENTANA', category: 'packaging', baseUom: 'unit', avgCostPen: 0.17, isPerishable: false },
  { sku: 'EMP-STICKERGRANDEIN', name: 'STICKER GRANDE', category: 'packaging', baseUom: 'unit', avgCostPen: 0.02, isPerishable: false },
  { sku: 'EMP-BOLSAKRAFGALLIN', name: 'BOLSA KRAF CON VENTANA GALLETA X UND', category: 'packaging', baseUom: 'unit', avgCostPen: 0.14, isPerishable: false },
  { sku: 'EMP-BOLSAPOLIE10ING', name: 'BOLSA POLIETILENO 10X15 X100UND', category: 'packaging', baseUom: 'unit', avgCostPen: 0.04, isPerishable: false },
  { sku: 'EMP-BOLSAPACKGALING', name: 'BOLSA PARA PACK GALLETA', category: 'packaging', baseUom: 'unit', avgCostPen: 0.81, isPerishable: false },
  { sku: 'EMP-CAJAFOCACC6ING', name: 'CAJA FOCACCIA 61X30X43', category: 'packaging', baseUom: 'unit', avgCostPen: 5.15, isPerishable: false },
  { sku: 'EMP-CAJASMASTER48ING', name: 'CAJAS MASTER 48 X 38X 26', category: 'packaging', baseUom: 'unit', avgCostPen: 4.45, isPerishable: false },
  { sku: 'EMP-BOLSAKRAFSIN1ING', name: 'BOLSA KRAFT SIN VENTANA NRO 12', category: 'packaging', baseUom: 'unit', avgCostPen: 0.14, isPerishable: false },
  { sku: 'EMP-BOLSAFOCACC18ING', name: 'BOLSA FOCACCIA 18*26 CM', category: 'packaging', baseUom: 'unit', avgCostPen: 0.16, isPerishable: false },
];

const PRODUCTS = [
  { sku: 'PT-BAGELAAAAAPT', name: 'BAGEL', yieldQty: 18.0, basePricePen: 3.5 },
  { sku: 'PT-BAGUETINOPTPT', name: 'BAGUETINO', yieldQty: 11.0, basePricePen: 2.5 },
  { sku: 'PT-BAGUETTEPTPT', name: 'BAGUETTE', yieldQty: 5.0, basePricePen: 6.0 },
  { sku: 'PT-BRIOCHEBURGPAPA', name: 'BRIOCHE BURGER DE PAPA', yieldQty: 24.0, basePricePen: 3.0 },
  { sku: 'PT-BRIOCHEBURGR10CM', name: 'BRIOCHE BURGUER 10 CM', yieldQty: 23.0, basePricePen: 2.8 },
  { sku: 'PT-BRIOCHEBURGR10B', name: 'BRIOCHE BURGUER 10 CM 85G', yieldQty: 18.9, basePricePen: 2.8 },
  { sku: 'PT-BRIOCHEBURGR6CM', name: 'BRIOCHE BURGUER 6 CM', yieldQty: 35.6, basePricePen: 1.8 },
  { sku: 'PT-BRIOCHEHOTDOG13', name: 'BRIOCHE HOT DOG 13 CM', yieldQty: 29.0, basePricePen: 2.5 },
  { sku: 'PT-BRIOCHEHOTPAPA', name: 'BRIOCHE HOTDOG DE PAPA', yieldQty: 33.6, basePricePen: 2.5 },
  { sku: 'PT-BRIOCHIEMOLDPPT', name: 'BRIOCHE MOLDE', yieldQty: 3.0, basePricePen: 12.0 },
  { sku: 'PT-BRIOCHIMOLDE8PT', name: 'BRIOCHE MOLDE - 8 BOYOS', yieldQty: 3.9, basePricePen: 15.0 },
  { sku: 'PT-CIABATTAMULTPT', name: 'CIABATTA MULTIGRANOS', yieldQty: 1.0, basePricePen: 10.0 },
  { sku: 'PT-CINNAMONROLLX9', name: 'CINNAMON ROLL X9UND', yieldQty: 1.0, basePricePen: 25.0 },
  { sku: 'PT-CRISINOS4PT', name: 'CRISINOS', yieldQty: 34.0, basePricePen: 1.5 },
  { sku: 'PT-CROISSANT2PT', name: 'CROISSANT', yieldQty: 24.0, basePricePen: 4.5 },
  { sku: 'PT-CROISSANTMARGPT', name: 'CROISSANT MARG', yieldQty: 24.0, basePricePen: 3.5 },
  { sku: 'PT-FOCACCIAPTPTPT', name: 'FOCACCIA', yieldQty: 1.0, basePricePen: 22.0 },
  { sku: 'PT-PAINDEMIE890PT', name: 'PAIN DE MIE 890 GR', yieldQty: 1.0, basePricePen: 18.0 },
  { sku: 'PT-PANBAGUETTE4PT', name: 'PAN BAGUETTE', yieldQty: 1.0, basePricePen: 6.0 },
  { sku: 'PT-PANCAMPESINO670', name: 'PAN CAMPESINO 670 GR', yieldQty: 140.0, basePricePen: 1.2 },
  { sku: 'PT-PANCAMPESINO800', name: 'PAN CAMPESINO 800 GR', yieldQty: 120.0, basePricePen: 1.4 },
  { sku: 'PT-PANCIPIABATTA18', name: 'PAN CIABATTA 18 CM', yieldQty: 13.0, basePricePen: 3.5 },
  { sku: 'PT-PANFRANCES12CM', name: 'PAN FRANCES 12 CM', yieldQty: 15.0, basePricePen: 2.0 },
  { sku: 'PT-PANFRANCES15CON', name: 'PAN FRANCES 15 CM CONGELADO', yieldQty: 14.0, basePricePen: 2.5 },
  { sku: 'PT-PANMULTIGRAN650', name: 'PAN MULTIGRANOS 650 GR', yieldQty: 160.0, basePricePen: 1.0 },
  { sku: 'PT-PANMULTIGRAN750', name: 'PAN MULTIGRANOS 750 GR', yieldQty: 135.0, basePricePen: 1.2 },
  { sku: 'PT-PANMULTIGRANCONG', name: 'PAN MULTIGRANOS CONGELADO', yieldQty: 160.0, basePricePen: 1.0 },
  { sku: 'PT-PANSANFRANCONG', name: 'PAN SAN FRANCISCO CONGELADO', yieldQty: 140.0, basePricePen: 1.1 },
  { sku: 'PT-PANINI21CMPTPT', name: 'PANINI 21 CM', yieldQty: 17.0, basePricePen: 3.5 },
  { sku: 'PT-SEEDEDSANDWICH71', name: 'SEEDED SANDWICH 710 GR', yieldQty: 1.3, basePricePen: 16.0 },
  { sku: 'PT-SEEDEDSANDWICH90', name: 'SEEDED SANDWICH 900 GR', yieldQty: 1.0, basePricePen: 20.0 },
  { sku: 'PT-XLSOURDOUGCOOKXL', name: 'XL SOURDOUGH CHOCOLATE MARBLE COOKIE 60 +15 GR', yieldQty: 40.0, basePricePen: 3.5 },
  { sku: 'PT-XSSOURDOUGCOOKXS', name: 'XS SOURDOUGH CHOCOLATE MARBLE COOKIE 18.5 +1.5 GR', yieldQty: 129.7, basePricePen: 1.5 },
];

const BOM: Record<string, Array<{ ingredientName: string; qtyRequired: number; uom: string }>> = {
  'BAGEL': [
    { ingredientName: 'HARINA PANADERA', qtyRequired: 1000.0, uom: 'g' },
    { ingredientName: 'MASA MADRE', qtyRequired: 150.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 15.0, uom: 'g' },
    { ingredientName: 'AZUCAR BLANCA', qtyRequired: 60.0, uom: 'g' },
    { ingredientName: 'MANTEQUILLA CON SAL', qtyRequired: 30.0, uom: 'g' },
    { ingredientName: 'ACEITE DE OLIVA', qtyRequired: 30.0, uom: 'g' },
    { ingredientName: 'AGUA', qtyRequired: 300.0, uom: 'g' },
    { ingredientName: 'LEVADURA SECA', qtyRequired: 8.0, uom: 'g' },
  ],
  'BAGUETINO': [
    { ingredientName: 'AGUA', qtyRequired: 600.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 1000.0, uom: 'g' },
    { ingredientName: 'LEVADURA SECA', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 25.0, uom: 'g' },
  ],
  'BAGUETTE': [
    { ingredientName: 'MASA MADRE', qtyRequired: 70.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 1020.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 15.0, uom: 'g' },
    { ingredientName: 'AGUA', qtyRequired: 700.0, uom: 'ml' },
  ],
  'BRIOCHE BURGER DE PAPA': [
    { ingredientName: 'ACEITE VEGETAL', qtyRequired: 50.0, uom: 'g' },
    { ingredientName: 'AGUA', qtyRequired: 75.0, uom: 'g' },
    { ingredientName: 'AMILASA', qtyRequired: 2.0, uom: 'g' },
    { ingredientName: 'AZUCAR BLANCA', qtyRequired: 100.0, uom: 'g' },
    { ingredientName: 'CÚRCUMA', qtyRequired: 1.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 1150.0, uom: 'g' },
    { ingredientName: 'HUEVO', qtyRequired: 2.0, uom: 'unit' },
    { ingredientName: 'LECHE FRESCA', qtyRequired: 450.0, uom: 'ml' },
    { ingredientName: 'LEVADURA SECA', qtyRequired: 14.0, uom: 'g' },
    { ingredientName: 'MANTEQUILLA CON SAL', qtyRequired: 60.0, uom: 'g' },
    { ingredientName: 'PAPA BLANCA', qtyRequired: 800.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 28.0, uom: 'g' },
    { ingredientName: 'YEMAS', qtyRequired: 2.0, uom: 'unit' },
  ],
  'BRIOCHE BURGUER 10 CM': [
    { ingredientName: 'AGUA', qtyRequired: 615.0, uom: 'g' },
    { ingredientName: 'AZUCAR BLANCA', qtyRequired: 150.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 1000.0, uom: 'g' },
    { ingredientName: 'HUEVO', qtyRequired: 1.0, uom: 'unit' },
    { ingredientName: 'LECHE EN POLVO', qtyRequired: 30.0, uom: 'g' },
    { ingredientName: 'LEVADURA SECA', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'MANTEQUILLA SIN SAL', qtyRequired: 100.0, uom: 'g' },
    { ingredientName: 'MEJORADOR', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 15.0, uom: 'g' },
    { ingredientName: 'SORBATO DE POTASIO', qtyRequired: 9.0, uom: 'g' },
    { ingredientName: 'YEMAS', qtyRequired: 1.0, uom: 'unit' },
  ],
  'BRIOCHE BURGUER 10 CM 85G': [
    { ingredientName: 'AGUA', qtyRequired: 615.0, uom: 'g' },
    { ingredientName: 'AZUCAR BLANCA', qtyRequired: 150.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 1000.0, uom: 'g' },
    { ingredientName: 'HUEVO', qtyRequired: 1.0, uom: 'unit' },
    { ingredientName: 'LECHE EN POLVO', qtyRequired: 30.0, uom: 'g' },
    { ingredientName: 'LEVADURA SECA', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'MANTEQUILLA SIN SAL', qtyRequired: 100.0, uom: 'g' },
    { ingredientName: 'MEJORADOR', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 15.0, uom: 'g' },
    { ingredientName: 'SORBATO DE POTASIO', qtyRequired: 9.0, uom: 'g' },
    { ingredientName: 'YEMAS', qtyRequired: 1.0, uom: 'unit' },
  ],
  'BRIOCHE BURGUER 6 CM': [
    { ingredientName: 'AGUA', qtyRequired: 615.0, uom: 'g' },
    { ingredientName: 'AZUCAR BLANCA', qtyRequired: 150.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 1000.0, uom: 'g' },
    { ingredientName: 'HUEVO', qtyRequired: 1.0, uom: 'unit' },
    { ingredientName: 'LECHE EN POLVO', qtyRequired: 30.0, uom: 'g' },
    { ingredientName: 'LEVADURA SECA', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'MANTEQUILLA SIN SAL', qtyRequired: 100.0, uom: 'g' },
    { ingredientName: 'MEJORADOR', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 15.0, uom: 'g' },
    { ingredientName: 'SORBATO DE POTASIO', qtyRequired: 9.0, uom: 'g' },
    { ingredientName: 'YEMAS', qtyRequired: 1.0, uom: 'unit' },
  ],
  'BRIOCHE HOT DOG 13 CM': [
    { ingredientName: 'AGUA', qtyRequired: 615.0, uom: 'g' },
    { ingredientName: 'AZUCAR BLANCA', qtyRequired: 150.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 1000.0, uom: 'g' },
    { ingredientName: 'HUEVO', qtyRequired: 1.0, uom: 'unit' },
    { ingredientName: 'LECHE EN POLVO', qtyRequired: 30.0, uom: 'g' },
    { ingredientName: 'LEVADURA SECA', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'MANTEQUILLA SIN SAL', qtyRequired: 100.0, uom: 'g' },
    { ingredientName: 'MEJORADOR', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 15.0, uom: 'g' },
    { ingredientName: 'SORBATO DE POTASIO', qtyRequired: 9.0, uom: 'g' },
    { ingredientName: 'YEMAS', qtyRequired: 1.0, uom: 'unit' },
  ],
  'BRIOCHE HOTDOG DE PAPA': [
    { ingredientName: 'ACEITE VEGETAL', qtyRequired: 50.0, uom: 'g' },
    { ingredientName: 'AGUA', qtyRequired: 75.0, uom: 'g' },
    { ingredientName: 'AMILASA', qtyRequired: 2.0, uom: 'g' },
    { ingredientName: 'AZUCAR BLANCA', qtyRequired: 100.0, uom: 'g' },
    { ingredientName: 'CÚRCUMA', qtyRequired: 1.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 1150.0, uom: 'g' },
    { ingredientName: 'HUEVO', qtyRequired: 2.0, uom: 'unit' },
    { ingredientName: 'LECHE FRESCA', qtyRequired: 450.0, uom: 'ml' },
    { ingredientName: 'LEVADURA SECA', qtyRequired: 14.0, uom: 'g' },
    { ingredientName: 'MANTEQUILLA CON SAL', qtyRequired: 60.0, uom: 'g' },
    { ingredientName: 'PAPA BLANCA', qtyRequired: 800.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 28.0, uom: 'g' },
    { ingredientName: 'YEMAS', qtyRequired: 2.0, uom: 'unit' },
  ],
  'BRIOCHE MOLDE': [
    { ingredientName: 'AGUA', qtyRequired: 615.0, uom: 'g' },
    { ingredientName: 'AZUCAR BLANCA', qtyRequired: 150.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 1000.0, uom: 'g' },
    { ingredientName: 'HUEVO', qtyRequired: 1.0, uom: 'unit' },
    { ingredientName: 'LECHE EN POLVO', qtyRequired: 30.0, uom: 'g' },
    { ingredientName: 'LEVADURA SECA', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'MANTEQUILLA SIN SAL', qtyRequired: 100.0, uom: 'g' },
    { ingredientName: 'MEJORADOR', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 15.0, uom: 'g' },
    { ingredientName: 'SORBATO DE POTASIO', qtyRequired: 9.0, uom: 'g' },
    { ingredientName: 'YEMAS', qtyRequired: 1.0, uom: 'unit' },
  ],
  'BRIOCHE MOLDE - 8 BOYOS': [
    { ingredientName: 'AGUA', qtyRequired: 615.0, uom: 'g' },
    { ingredientName: 'AZUCAR BLANCA', qtyRequired: 150.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 1000.0, uom: 'g' },
    { ingredientName: 'HUEVO', qtyRequired: 1.0, uom: 'unit' },
    { ingredientName: 'LECHE EN POLVO', qtyRequired: 30.0, uom: 'g' },
    { ingredientName: 'LEVADURA SECA', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'MANTEQUILLA SIN SAL', qtyRequired: 100.0, uom: 'g' },
    { ingredientName: 'MEJORADOR', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 15.0, uom: 'g' },
    { ingredientName: 'SORBATO DE POTASIO', qtyRequired: 9.0, uom: 'g' },
    { ingredientName: 'YEMAS', qtyRequired: 1.0, uom: 'unit' },
  ],
  'CRISINOS': [
    { ingredientName: 'HARINA PANADERA', qtyRequired: 500.0, uom: 'g' },
    { ingredientName: 'AGUA', qtyRequired: 250.0, uom: 'g' },
    { ingredientName: 'LEVADURA SECA', qtyRequired: 3.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'AZUCAR BLANCA', qtyRequired: 5.0, uom: 'g' },
    { ingredientName: 'ACEITE DE OLIVA', qtyRequired: 20.0, uom: 'g' },
    { ingredientName: 'MANTEQUILLA CON SAL', qtyRequired: 40.0, uom: 'g' },
  ],
  'CROISSANT': [
    { ingredientName: 'AZUCAR BLANCA', qtyRequired: 120.0, uom: 'g' },
    { ingredientName: 'BIGA', qtyRequired: 100.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 1000.0, uom: 'g' },
    { ingredientName: 'LECHE FRESCA', qtyRequired: 580.0, uom: 'ml' },
    { ingredientName: 'LEVADURA SECA', qtyRequired: 15.0, uom: 'g' },
    { ingredientName: 'MANTEQUILLA SIN SAL', qtyRequired: 500.0, uom: 'g' },
    { ingredientName: 'MANTEQUILLA CON SAL', qtyRequired: 100.0, uom: 'g' },
    { ingredientName: 'MIEL DE ABEJA', qtyRequired: 15.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 20.0, uom: 'g' },
  ],
  'CROISSANT MARG': [
    { ingredientName: 'AZUCAR BLANCA', qtyRequired: 120.0, uom: 'g' },
    { ingredientName: 'BIGA', qtyRequired: 100.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 1000.0, uom: 'g' },
    { ingredientName: 'LECHE FRESCA', qtyRequired: 580.0, uom: 'ml' },
    { ingredientName: 'LEVADURA SECA', qtyRequired: 15.0, uom: 'g' },
    { ingredientName: 'MARGARINA HOJALDRE', qtyRequired: 600.0, uom: 'g' },
    { ingredientName: 'MIEL DE ABEJA', qtyRequired: 15.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 20.0, uom: 'g' },
  ],
  'FOCACCIA': [
    { ingredientName: 'ACEITE DE OLIVA', qtyRequired: 120.0, uom: 'g' },
    { ingredientName: 'AGUA', qtyRequired: 850.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 1000.0, uom: 'g' },
    { ingredientName: 'MASA MADRE', qtyRequired: 200.0, uom: 'g' },
    { ingredientName: 'ROMERO', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 22.5, uom: 'g' },
    { ingredientName: 'SAL DE MARAS GRUESA', qtyRequired: 10.0, uom: 'g' },
  ],
  'PAIN DE MIE 890 GR': [
    { ingredientName: 'AGUA', qtyRequired: 225.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 425.0, uom: 'g' },
    { ingredientName: 'LECHE EN POLVO', qtyRequired: 7.0, uom: 'g' },
    { ingredientName: 'MANTEQUILLA CON SAL', qtyRequired: 50.0, uom: 'g' },
    { ingredientName: 'MASA MADRE', qtyRequired: 150.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 10.0, uom: 'g' },
  ],
  'PAN CAMPESINO 670 GR': [
    { ingredientName: 'AGUA', qtyRequired: 32500.0, uom: 'g' },
    { ingredientName: 'HARINA INTEGRAL', qtyRequired: 5000.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 45000.0, uom: 'g' },
    { ingredientName: 'MASA MADRE', qtyRequired: 10000.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 1250.0, uom: 'g' },
  ],
  'PAN CAMPESINO 800 GR': [
    { ingredientName: 'AGUA', qtyRequired: 32500.0, uom: 'g' },
    { ingredientName: 'HARINA INTEGRAL', qtyRequired: 5000.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 45000.0, uom: 'g' },
    { ingredientName: 'MASA MADRE', qtyRequired: 10000.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 1250.0, uom: 'g' },
  ],
  'PAN CIABATTA 18 CM': [
    { ingredientName: 'AGUA', qtyRequired: 600.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 1000.0, uom: 'g' },
    { ingredientName: 'LEVADURA SECA', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 25.0, uom: 'g' },
  ],
  'PAN FRANCES 12 CM': [
    { ingredientName: 'AGUA', qtyRequired: 600.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 1000.0, uom: 'g' },
    { ingredientName: 'LEVADURA SECA', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 25.0, uom: 'g' },
  ],
  'PAN FRANCES 15 CM CONGELADO': [
    { ingredientName: 'AGUA', qtyRequired: 600.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 1000.0, uom: 'g' },
    { ingredientName: 'LEVADURA SECA', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 25.0, uom: 'g' },
  ],
  'PAN MULTIGRANOS 650 GR': [
    { ingredientName: 'AGUA', qtyRequired: 23500.0, uom: 'g' },
    { ingredientName: 'AJONJOLI BLANCO', qtyRequired: 4000.0, uom: 'g' },
    { ingredientName: 'AJONJOLI NEGRO', qtyRequired: 4000.0, uom: 'g' },
    { ingredientName: 'HARINA INTEGRAL', qtyRequired: 5000.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 45000.0, uom: 'g' },
    { ingredientName: 'MASA MADRE', qtyRequired: 8500.0, uom: 'g' },
    { ingredientName: 'MIEL DE ABEJA', qtyRequired: 5000.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 750.0, uom: 'g' },
    { ingredientName: 'SEMILLAS DE GIRASOL', qtyRequired: 4000.0, uom: 'g' },
  ],
  'PAN MULTIGRANOS 750 GR': [
    { ingredientName: 'AGUA', qtyRequired: 23500.0, uom: 'g' },
    { ingredientName: 'AJONJOLI BLANCO', qtyRequired: 4000.0, uom: 'g' },
    { ingredientName: 'AJONJOLI BLANCO (DEC)', qtyRequired: 100.0, uom: 'g' },
    { ingredientName: 'AJONJOLI NEGRO', qtyRequired: 4000.0, uom: 'g' },
    { ingredientName: 'HARINA INTEGRAL', qtyRequired: 5000.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 45000.0, uom: 'g' },
    { ingredientName: 'MASA MADRE', qtyRequired: 8500.0, uom: 'g' },
    { ingredientName: 'MIEL DE ABEJA', qtyRequired: 5000.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 750.0, uom: 'g' },
    { ingredientName: 'SEMILLAS DE GIRASOL', qtyRequired: 4000.0, uom: 'g' },
  ],
  'PAN MULTIGRANOS CONGELADO': [
    { ingredientName: 'AGUA', qtyRequired: 23500.0, uom: 'g' },
    { ingredientName: 'AJONJOLI BLANCO', qtyRequired: 4000.0, uom: 'g' },
    { ingredientName: 'AJONJOLI NEGRO', qtyRequired: 4000.0, uom: 'g' },
    { ingredientName: 'HARINA INTEGRAL', qtyRequired: 5000.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 45000.0, uom: 'g' },
    { ingredientName: 'MASA MADRE', qtyRequired: 8500.0, uom: 'g' },
    { ingredientName: 'MIEL DE ABEJA', qtyRequired: 5000.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 750.0, uom: 'g' },
    { ingredientName: 'SEMILLAS DE GIRASOL', qtyRequired: 4000.0, uom: 'g' },
  ],
  'PAN SAN FRANCISCO CONGELADO': [
    { ingredientName: 'AGUA', qtyRequired: 32500.0, uom: 'g' },
    { ingredientName: 'HARINA INTEGRAL', qtyRequired: 5000.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 45000.0, uom: 'g' },
    { ingredientName: 'MASA MADRE', qtyRequired: 10000.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 1250.0, uom: 'g' },
  ],
  'PANINI 21 CM': [
    { ingredientName: 'ACEITE VEGETAL', qtyRequired: 100.0, uom: 'g' },
    { ingredientName: 'AGUA', qtyRequired: 300.0, uom: 'g' },
    { ingredientName: 'AZUCAR BLANCA', qtyRequired: 20.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 1000.0, uom: 'g' },
    { ingredientName: 'LECHE FRESCA', qtyRequired: 300.0, uom: 'ml' },
    { ingredientName: 'LEVADURA SECA', qtyRequired: 25.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 20.0, uom: 'g' },
  ],
  'SEEDED SANDWICH 710 GR': [
    { ingredientName: 'AGUA', qtyRequired: 310.0, uom: 'g' },
    { ingredientName: 'AJONJOLI BLANCO', qtyRequired: 30.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 450.0, uom: 'g' },
    { ingredientName: 'LINAZA ENTERA', qtyRequired: 15.0, uom: 'g' },
    { ingredientName: 'MASA MADRE', qtyRequired: 100.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'SEMILLAS DE GIRASOL', qtyRequired: 20.0, uom: 'g' },
  ],
  'SEEDED SANDWICH 900 GR': [
    { ingredientName: 'AGUA', qtyRequired: 310.0, uom: 'g' },
    { ingredientName: 'AJONJOLI BLANCO', qtyRequired: 30.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 450.0, uom: 'g' },
    { ingredientName: 'LINAZA ENTERA', qtyRequired: 15.0, uom: 'g' },
    { ingredientName: 'MASA MADRE', qtyRequired: 100.0, uom: 'g' },
    { ingredientName: 'SAL', qtyRequired: 10.0, uom: 'g' },
    { ingredientName: 'SEMILLAS DE GIRASOL', qtyRequired: 20.0, uom: 'g' },
  ],
  'XL SOURDOUGH CHOCOLATE MARBLE COOKIE 60 +15 GR': [
    { ingredientName: 'AZUCAR BLANCA', qtyRequired: 420.0, uom: 'g' },
    { ingredientName: 'AZUCAR RUBIA', qtyRequired: 760.0, uom: 'g' },
    { ingredientName: 'BICARBONATO', qtyRequired: 20.0, uom: 'g' },
    { ingredientName: 'CHOCOLATE BITTER', qtyRequired: 600.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 850.0, uom: 'g' },
    { ingredientName: 'HUEVO', qtyRequired: 6.0, uom: 'unit' },
    { ingredientName: 'MANTEQUILLA CON SAL', qtyRequired: 420.0, uom: 'g' },
    { ingredientName: 'MASA MADRE', qtyRequired: 20.0, uom: 'g' },
    { ingredientName: 'SAL DE MARAS FINA', qtyRequired: 15.0, uom: 'g' },
    { ingredientName: 'YEMAS', qtyRequired: 2.0, uom: 'unit' },
  ],
  'XS SOURDOUGH CHOCOLATE MARBLE COOKIE 18.5 +1.5 GR': [
    { ingredientName: 'AZUCAR BLANCA', qtyRequired: 420.0, uom: 'g' },
    { ingredientName: 'AZUCAR RUBIA', qtyRequired: 760.0, uom: 'g' },
    { ingredientName: 'BICARBONATO', qtyRequired: 20.0, uom: 'g' },
    { ingredientName: 'CHOCOLATE BITTER', qtyRequired: 600.0, uom: 'g' },
    { ingredientName: 'HARINA PANADERA', qtyRequired: 850.0, uom: 'g' },
    { ingredientName: 'HUEVO', qtyRequired: 6.0, uom: 'unit' },
    { ingredientName: 'MANTEQUILLA CON SAL', qtyRequired: 420.0, uom: 'g' },
    { ingredientName: 'MASA MADRE', qtyRequired: 20.0, uom: 'g' },
    { ingredientName: 'SAL DE MARAS FINA', qtyRequired: 15.0, uom: 'g' },
    { ingredientName: 'YEMAS', qtyRequired: 2.0, uom: 'unit' },
  ],
};

async function main() {
  console.log('🌱 Importing Maestro MP data into VictorOS ERP...\n');

  // 1. Get or create default category
  let defaultCat = await prisma.productCategory.findFirst();
  if (!defaultCat) {
    defaultCat = await prisma.productCategory.create({
      data: { id: 'cat-panes', name: 'Panes' },
    });
  }
  const defaultCategoryId = defaultCat.id;
  console.log(`✅ Category: ${defaultCat.name} (${defaultCategoryId})`);

  // 2. Create/upsert all ingredients
  console.log('\n📦 Creating ingredients...');
  const ingMap: Record<string, string> = {};
  let ingCount = 0;
  for (const ing of INGREDIENTS) {
    const result = await prisma.ingredient.upsert({
      where: { sku: ing.sku },
      update: { name: ing.name, category: ing.category, baseUom: ing.baseUom, avgCostPen: ing.avgCostPen, isPerishable: ing.isPerishable },
      create: { sku: ing.sku, name: ing.name, category: ing.category, baseUom: ing.baseUom, avgCostPen: ing.avgCostPen, isPerishable: ing.isPerishable },
    });
    ingMap[ing.name] = result.id;
    ingCount++;
  }
  console.log(`✅ ${ingCount} ingredients created/updated`);

  // 3. Create/upsert all products
  console.log('\n🥐 Creating products...');
  const prodMap: Record<string, string> = {};
  let prodCount = 0;
  for (const prod of PRODUCTS) {
    const result = await prisma.product.upsert({
      where: { sku: prod.sku },
      update: { name: prod.name, basePricePen: prod.basePricePen },
      create: { sku: prod.sku, name: prod.name, categoryId: defaultCategoryId, basePricePen: prod.basePricePen },
    });
    prodMap[prod.name] = result.id;
    prodCount++;
  }
  console.log(`✅ ${prodCount} products created/updated`);

  // 4. Create recipes + BOM lines
  console.log('\n📋 Creating recipes and BOM lines...');
  let recipeCount = 0;
  let bomLinesCount = 0;
  let skipped = 0;

  for (const prod of PRODUCTS) {
    const bomLines = BOM[prod.name];
    if (!bomLines || bomLines.length === 0) {
      console.log(`  ⚠️  No BOM for "${prod.name}" — skipping`);
      skipped++;
      continue;
    }

    const productId = prodMap[prod.name];

    // Archive existing active recipes
    await prisma.recipe.updateMany({ where: { productId, status: 'ACTIVE' }, data: { status: 'ARCHIVED' } });

    // Count existing versions
    const existingCount = await prisma.recipe.count({ where: { productId } });

    // Create recipe as DRAFT
    const recipe = await prisma.recipe.create({
      data: {
        productId,
        version: existingCount + 1,
        yieldQty: prod.yieldQty,
        yieldUom: 'unit',
        status: 'DRAFT',
        createdBy: 'maestro-import',
        effectiveFrom: new Date(),
      },
    });

    // Resolve ingredient IDs and insert BOM lines
    const lines = bomLines
      .map((line) => {
        const ingId = ingMap[line.ingredientName];
        if (!ingId) {
          console.log(`    ⚠️  Unknown ingredient: "${line.ingredientName}"`);
          return null;
        }
        return { recipeId: recipe.id, ingredientId: ingId, qtyRequired: line.qtyRequired, uom: line.uom, wasteFactorPct: 0 };
      })
      .filter(Boolean) as any[];

    if (lines.length > 0) {
      await prisma.bOMLine.createMany({ data: lines });
      bomLinesCount += lines.length;
    }

    // Activate recipe
    await prisma.recipe.update({ where: { id: recipe.id }, data: { status: 'ACTIVE' } });

    console.log(`  ✅ ${prod.name}: v${existingCount + 1}, ${lines.length} lines → ACTIVE`);
    recipeCount++;
  }

  console.log(`\n✨ Import complete!`);
  console.log(`   Ingredients : ${ingCount}`);
  console.log(`   Products    : ${prodCount}`);
  console.log(`   Recipes     : ${recipeCount} (${skipped} skipped — no BOM)`);
  console.log(`   BOM Lines   : ${bomLinesCount}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
