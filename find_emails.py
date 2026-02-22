import subprocess, os

# Search for email addresses in backend src
r = subprocess.run(['grep', '-rn', '@victorsdou', '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-erp/src/'],
    capture_output=True, text=True)
print("=== Backend email refs ===")
print(r.stdout[:2000])

# Check .env for email and mailgun config
env_path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-erp/.env'
if os.path.exists(env_path):
    with open(env_path) as f:
        for l in f:
            if any(x in l.upper() for x in ['EMAIL', 'MAIL', 'SES', 'FROM', 'SMTP']):
                print(f'ENV: {l.rstrip()}')

# Check payroll routes for CC email
with open('/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-erp/src/modules/payroll/routes.ts') as f:
    for i, l in enumerate(f, 1):
        if '@' in l or 'email' in l.lower() or 'cc' in l.lower():
            print(f'payroll:{i}: {l.rstrip()[:100]}')
