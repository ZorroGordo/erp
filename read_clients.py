
import openpyxl, json

wb = openpyxl.load_workbook('/Users/victordyrnes/Desktop/victorsdou ERP/VictorOS_Plantilla_Carga_Masiva.xlsx')
ws = wb['Clientes']
rows = list(ws.iter_rows(min_row=1, max_row=60, values_only=True))

# Headers are at row index 3
# ('★ tipo_cliente', '★ nombre_completo', 'razon_social', 'ruc', 'email', 'telefono', 'direccion', 'distrito', 'ciudad', 'notas', None)
clients = []
for r in rows[4:]:
    if not any(v for v in r if v is not None):
        continue
    tipo = r[0]
    nombre = r[1]
    razon = r[2]
    ruc = str(r[3]) if r[3] else None
    email = r[4]
    telefono = str(r[5]) if r[5] else None
    branch = r[6]   # branch/local name
    address = r[7]  # actual street address
    district = r[8]
    city = r[9]

    clients.append({
        'tipo': tipo,
        'nombre': nombre,
        'ruc': ruc,
        'email': email,
        'telefono': telefono,
        'branch': branch,
        'address': address,
        'district': district,
        'city': city
    })

print(json.dumps(clients, ensure_ascii=False, indent=2))
print(f"\nTotal: {len(clients)}")
