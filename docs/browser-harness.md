# Browser Harness Setup

Browser Harness is installed locally at:

```text
C:\Users\txoliv\Developer\browser-harness
```

The Expense Me workspace has a wrapper at:

```text
tools\browser-harness.ps1
```

Useful commands:

```powershell
npm run browser-harness:doctor
npm run browser-harness:verify
```

The verification command launches an isolated Chrome profile with remote debugging on port `9222`, opens `https://expense-me-tbo.vercel.app/`, verifies the clean empty Inbox, checks that old demo terms are absent, clicks Capture, and saves screenshots under `work\screenshots`.

For normal browser work, use Browser Harness with heredoc-style input:

```powershell
$env:BU_CDP_URL = "http://127.0.0.1:9222"
@'
new_tab("https://expense-me-tbo.vercel.app/")
wait_for_load()
print(page_info())
'@ | .\tools\browser-harness.ps1
```
