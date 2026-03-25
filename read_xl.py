import openpyxl, json, os, glob, sys

# Find the uploads directory - check common Mac paths
search_dirs = [
    '/Users/victordyrnes',
]

found = []
for d in search_dirs:
    for root, dirs, files in os.walk(d):
        for f in files:
            if 'Maestro MP' in f or 'Plantilla_Carga' in f or 'recip' in f.lower() or 'recipe' in f.lower():
                found.append(os.path.join(root, f))

print("Found files:", json.dumps(found, indent=2))
