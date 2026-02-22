path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-frontend/src/pages/Payroll.tsx'
with open(path) as f: src = f.read()

src = src.replace(
    'Plus, UserCheck, Edit2, Clock, Calendar, ChevronLeft, ChevronRight,\n  CheckCircle, DollarSign, Mail, X, AlertCircle, RefreshCw, Star',
    'Plus, UserCheck, Edit2, Clock, Calendar, ChevronLeft, ChevronRight,\n  CheckCircle, DollarSign, Mail, X, AlertCircle, RefreshCw, Star, Pencil, Trash2, Save, Check'
)

with open(path, 'w') as f: f.write(src)
print("Icons fixed")
