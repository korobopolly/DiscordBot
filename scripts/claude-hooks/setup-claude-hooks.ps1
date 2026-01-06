# Claude Code Discord Webhook Setup Script
# Run this script on any PC to enable Discord notifications for Claude Code

param(
    [string]$WebhookUrl
)

Write-Host "=== Claude Code Discord Webhook Setup ===" -ForegroundColor Cyan
Write-Host ""

# Get webhook URL if not provided
if (-not $WebhookUrl) {
    $WebhookUrl = Read-Host "Enter your Discord Webhook URL"
}

if (-not $WebhookUrl) {
    Write-Host "Error: Webhook URL is required" -ForegroundColor Red
    exit 1
}

# Validate webhook URL format
if ($WebhookUrl -notmatch "^https://discord\.com/api/webhooks/") {
    Write-Host "Warning: URL doesn't look like a Discord webhook" -ForegroundColor Yellow
    $confirm = Read-Host "Continue anyway? (y/n)"
    if ($confirm -ne "y") {
        exit 1
    }
}

$claudeDir = Join-Path $env:USERPROFILE ".claude"
$hooksDir = Join-Path $claudeDir "hooks"
$settingsFile = Join-Path $claudeDir "settings.json"
$envFile = Join-Path $env:USERPROFILE ".env"
$scriptFile = Join-Path $hooksDir "discord-notify.ps1"

# Create directories
Write-Host "Creating directories..." -ForegroundColor Gray
if (-not (Test-Path $claudeDir)) {
    New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null
}
if (-not (Test-Path $hooksDir)) {
    New-Item -ItemType Directory -Path $hooksDir -Force | Out-Null
}

# Create discord-notify.ps1
Write-Host "Creating webhook script..." -ForegroundColor Gray
$scriptContent = @'
# Discord Webhook Notification Script for Claude Code (Global)
# This script sends notifications to Discord when Claude Code events occur

$webhookUrl = $null

# Load from user home .env
$homeEnv = Join-Path $env:USERPROFILE ".env"
if (Test-Path $homeEnv) {
    Get-Content $homeEnv | ForEach-Object {
        if ($_ -match "^DISCORD_WEBHOOK_URL=(.+)$") {
            $webhookUrl = $matches[1].Trim()
        }
    }
}

if (-not $webhookUrl) {
    exit 0
}

# Read input from stdin (Claude Code passes hook data as JSON)
# Use multiple methods to ensure we capture stdin properly
$inputData = ""
try {
    # Method 1: Try $input pipeline
    $inputData = $input | Out-String
} catch {}

if (-not $inputData -or $inputData.Trim() -eq "") {
    try {
        # Method 2: Try Console.In.ReadToEnd
        $inputData = [Console]::In.ReadToEnd()
    } catch {}
}

# Parse hook data
$hookEventName = "Claude Code"
$transcriptPath = $null
$projectName = Split-Path (Get-Location) -Leaf
$title = "Claude Code"
$description = "Task completed"

try {
    $jsonData = $inputData | ConvertFrom-Json -ErrorAction SilentlyContinue

    if ($jsonData.hook_event_name) {
        $hookEventName = $jsonData.hook_event_name
    }
    if ($jsonData.transcript_path) {
        $transcriptPath = $jsonData.transcript_path
    }
    if ($jsonData.message) {
        $description = $jsonData.message
    }
} catch {
    # Ignore parse errors
}

# Read last Claude response from transcript
if ($transcriptPath -and (Test-Path $transcriptPath)) {
    try {
        # Read last few lines of transcript (JSONL format) with UTF-8 encoding
        $lines = Get-Content $transcriptPath -Tail 20 -Encoding UTF8 -ErrorAction SilentlyContinue
        $lastAssistantMessage = $null

        foreach ($line in $lines) {
            try {
                $entry = $line | ConvertFrom-Json -ErrorAction SilentlyContinue
                if ($entry.type -eq "assistant" -and $entry.message.content) {
                    # Get text content from assistant message
                    foreach ($content in $entry.message.content) {
                        if ($content.type -eq "text" -and $content.text) {
                            $lastAssistantMessage = $content.text
                        }
                    }
                }
            } catch {
                continue
            }
        }

        if ($lastAssistantMessage) {
            # Truncate if too long (Discord limit)
            if ($lastAssistantMessage.Length -gt 4000) {
                $description = $lastAssistantMessage.Substring(0, 4000) + "..."
            } else {
                $description = $lastAssistantMessage
            }

            # Extract first line as title (if meaningful)
            $firstLine = ($lastAssistantMessage -split "`n")[0].Trim()
            if ($firstLine.Length -gt 5 -and $firstLine.Length -lt 100) {
                # Remove markdown formatting
                $firstLine = $firstLine -replace "^#+\s*", ""
                $firstLine = $firstLine -replace "\*+", ""
                $firstLine = $firstLine -replace "`+", ""
                if ($firstLine.Length -gt 5) {
                    $title = $firstLine
                }
            }
        }
    } catch {
        # Ignore transcript read errors
    }
}

# Set title based on event type if no better title (Korean)
# Base64 encoded Korean strings:
# "Claude 응답 완료" = Q2xhdWRlIOydkeuLtSDsmYTro4w=
# "Claude 알림" = Q2xhdWRlIOyVjOumvA==
# "Claude 서브에이전트 완료" = Q2xhdWRlIOyEnOu4jOyXkOydtOyghO2KuCDsmYTro4w=
# "Claude 권한 요청" = Q2xhdWRlIOq2jO2VnCDsmpTssq0=
if ($title -eq "Claude Code") {
    switch ($hookEventName) {
        "Stop" { $title = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("Q2xhdWRlIOydkeuLtSDsmYTro4w=")) }
        "SubagentStop" { $title = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("Q2xhdWRlIOyEnOu4jOyXkOydtOyghO2KuCDsmYTro4w=")) }
        "Notification" { $title = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("Q2xhdWRlIOyVjOumvA==")) }
        "PermissionRequest" { $title = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("Q2xhdWRlIOq2jO2VnCDsmpTssq0=")) }
        default { $title = "Claude Code - $hookEventName" }
    }
}

# Create timestamp in Korea timezone (UTC+9)
$kstTime = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId((Get-Date), "Korea Standard Time")
$timestamp = $kstTime.ToString("yyyy-MM-ddTHH:mm:ss+09:00")

# Set embed color based on event
$color = switch ($hookEventName) {
    "Stop" { 3066993 }            # Green
    "SubagentStop" { 3447003 }    # Purple
    "Notification" { 15844367 }   # Orange
    "PermissionRequest" { 15548997 } # Red
    default { 5814783 }           # Blue
}

# Create Discord embed payload
$payload = @{
    embeds = @(
        @{
            title = $title
            description = $description
            color = $color
            timestamp = $timestamp
            footer = @{
                text = "$projectName | $hookEventName"
            }
        }
    )
} | ConvertTo-Json -Depth 4

try {
    # Convert to UTF-8 bytes to preserve Korean characters
    $utf8Bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    Invoke-RestMethod -Uri $webhookUrl -Method Post -Body $utf8Bytes -ContentType "application/json; charset=utf-8" | Out-Null
    exit 0
} catch {
    exit 0
}
'@

Set-Content -Path $scriptFile -Value $scriptContent -Encoding UTF8

# Create settings.json
Write-Host "Creating settings.json..." -ForegroundColor Gray
$settingsContent = @'
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "cmd /c powershell -ExecutionPolicy Bypass -File \"%USERPROFILE%\\.claude\\hooks\\discord-notify.ps1\""
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "cmd /c powershell -ExecutionPolicy Bypass -File \"%USERPROFILE%\\.claude\\hooks\\discord-notify.ps1\""
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "cmd /c powershell -ExecutionPolicy Bypass -File \"%USERPROFILE%\\.claude\\hooks\\discord-notify.ps1\""
          }
        ]
      }
    ]
  }
}
'@

# Check if settings.json exists and has content
if (Test-Path $settingsFile) {
    $existingSettings = Get-Content $settingsFile -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($existingSettings) {
        Write-Host "Existing settings.json found. Updating..." -ForegroundColor Yellow
        $backupFile = "$settingsFile.backup"
        Copy-Item $settingsFile $backupFile
        Write-Host "Backup created: $backupFile" -ForegroundColor Gray
    }
}

Set-Content -Path $settingsFile -Value $settingsContent -Encoding UTF8

# Create or update .env file
Write-Host "Configuring webhook URL..." -ForegroundColor Gray
$envLine = "DISCORD_WEBHOOK_URL=$WebhookUrl"

if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match "DISCORD_WEBHOOK_URL=") {
        # Update existing
        $envContent = $envContent -replace "DISCORD_WEBHOOK_URL=.+", $envLine
        Set-Content -Path $envFile -Value $envContent.TrimEnd() -Encoding UTF8
    } else {
        # Append
        Add-Content -Path $envFile -Value "`n$envLine" -Encoding UTF8
    }
} else {
    # Create new
    Set-Content -Path $envFile -Value "# Global environment variables`n$envLine" -Encoding UTF8
}

# Test the webhook
Write-Host ""
Write-Host "Testing webhook..." -ForegroundColor Gray

# Create timestamp in Korea timezone (UTC+9)
$kstTime = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId((Get-Date), "Korea Standard Time")
$timestamp = $kstTime.ToString("yyyy-MM-ddTHH:mm:ss+09:00")

try {
    $testPayload = @{
        embeds = @(
            @{
                title = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("Q2xhdWRlIENvZGUg7ISk7KCVIOyZhOujjA=="))
                description = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("7J20IFBD7JeQ7IScIENsYXVkZSBDb2RlIOyCrOyaqSDsi5wgRGlzY29yZCDslYzrpr/snbQg7KCE7Iah65Cp64uI64uk"))
                color = 3066993
                timestamp = $timestamp
                footer = @{
                    text = "Setup Script | Test"
                }
            }
        )
    } | ConvertTo-Json -Depth 4

    $utf8Bytes = [System.Text.Encoding]::UTF8.GetBytes($testPayload)
    Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $utf8Bytes -ContentType "application/json; charset=utf-8" | Out-Null
    Write-Host "Test message sent successfully!" -ForegroundColor Green
} catch {
    Write-Host "Warning: Test message failed. Check your webhook URL." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Files created:" -ForegroundColor Cyan
Write-Host "  - $settingsFile"
Write-Host "  - $scriptFile"
Write-Host "  - $envFile"
Write-Host ""
Write-Host "Claude Code will now send Discord notifications on:" -ForegroundColor Cyan
Write-Host "  - Notification events (permission requests, etc.)"
Write-Host "  - Stop events (when Claude completes a response)"
Write-Host ""
