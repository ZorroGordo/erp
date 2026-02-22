path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-frontend/src/pages/Settings.tsx'
with open(path) as f:
    src = f.read()

# Fix duplicate Shield import
src = src.replace(
    'Plus, Pencil, X, Eye, EyeOff, UserCheck, UserX, Loader2, Shield, Shield,',
    'Plus, Pencil, X, Eye, EyeOff, UserCheck, UserX, Loader2, Shield,'
)

# Find double-inserted PermisosTab block
# The block starts with "// ── Role labels" and ends with "// ── Main Settings page"
# If there are two copies, remove the second

marker_start = '// ── Role labels ──────────────────────────────────────────────────────────────'
marker_end   = '// ── Main Settings page ────────────────────────────────────────────────────────'

first  = src.find(marker_start)
second = src.find(marker_start, first + 1)

if second != -1:
    # Find the marker_end that comes right before (or right after) the second occurrence
    # We want to remove the duplicate block between second and its marker_end
    end_pos = src.find(marker_end, second)
    if end_pos != -1:
        # Remove from second occurrence start to (but not including) the marker_end
        src = src[:second] + src[end_pos:]
        print("Removed duplicate PermisosTab block")
    else:
        print("Could not find end marker after second start – manual check needed")
else:
    print("No duplicate found – nothing to remove")

with open(path, 'w') as f:
    f.write(src)

print("Settings.tsx fixed")
