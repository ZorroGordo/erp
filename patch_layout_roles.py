path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-frontend/src/components/Layout.tsx'
with open(path) as f: src = f.read()

# Pass user roles to isEnabled
src = src.replace(
    "  const visibleNav = nav.filter(item => isEnabled(item.to));",
    "  const visibleNav = nav.filter(item => isEnabled(item.to, user?.roles));"
)

with open(path, 'w') as f: f.write(src)
print("Layout.tsx updated with role-based filtering")
