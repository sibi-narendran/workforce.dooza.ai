# Content Calendar — Test & Verification Plan

Step-by-step plan to verify the content calendar implementation works end-to-end.

## Prerequisites

```bash
# Ensure services are running
pm2 restart platform && pm2 restart gateway
pm2 status  # Both should be "online"

# Get a valid auth token (login via UI or use this)
export TOKEN="your-supabase-access-token"
export TENANT_ID="your-tenant-uuid"
```

---

## Phase 1: Database

### 1.1 Verify posts table exists

```bash
cd platform && source ../.env && npx tsx -e "
import postgres from 'postgres';
async function main() {
  const client = postgres(process.env.DATABASE_URL!);
  const rows = await client\`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'posts' ORDER BY ordinal_position
  \`;
  console.table(rows);
  await client.end();
}
main();
"
```

**Expected:** 12 columns (id, tenant_id, employee_id, platform, title, content, image_url, scheduled_date, status, metadata, created_at, updated_at)

### 1.2 Verify foreign keys

```bash
# Should show 2 FKs: tenant_id → tenants, employee_id → employees
cd platform && source ../.env && npx tsx -e "
import postgres from 'postgres';
async function main() {
  const client = postgres(process.env.DATABASE_URL!);
  const rows = await client\`
    SELECT constraint_name, table_name FROM information_schema.table_constraints
    WHERE table_name = 'posts' AND constraint_type = 'FOREIGN KEY'
  \`;
  console.table(rows);
  await client.end();
}
main();
"
```

---

## Phase 2: API Routes

### 2.1 List posts (empty)

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/posts?month=$(date +%Y-%m)" | jq
```

**Expected:** `{ "posts": [] }`

### 2.2 Create a post

First get an employee ID:
```bash
EMPLOYEE_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/employees" | jq -r '.employees[] | select(.type=="somi") | .id')
echo "Somi employee ID: $EMPLOYEE_ID"
```

Create the post:
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "http://localhost:3000/api/posts" \
  -d "{
    \"employeeId\": \"$EMPLOYEE_ID\",
    \"platform\": \"linkedin\",
    \"title\": \"Test post\",
    \"content\": \"This is a test post from the API\",
    \"scheduledDate\": \"$(date -u -v+1d +%Y-%m-%dT10:00:00Z)\",
    \"status\": \"draft\"
  }" | jq
```

**Expected:** 201 with `{ "post": { "id": "...", ... } }`

Save the post ID:
```bash
POST_ID="uuid-from-above"
```

### 2.3 List posts (should have one)

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/posts?month=$(date +%Y-%m)" | jq '.posts | length'
```

**Expected:** `1`

### 2.4 Update post

```bash
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "http://localhost:3000/api/posts/$POST_ID" \
  -d '{"status": "scheduled", "title": "Updated test"}' | jq '.post.status'
```

**Expected:** `"scheduled"`

### 2.5 Delete post

```bash
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/posts/$POST_ID" | jq
```

**Expected:** `{ "success": true, "message": "Post deleted" }`

### 2.6 Verify month filtering

Create posts in different months and verify the `?month=` filter only returns the right ones.

---

## Phase 3: Sync & Tool Policy

### 3.1 Verify sync injected SOMI_EMPLOYEE_ID

```bash
cat ~/data/tenants/$TENANT_ID/clawdbot.json | jq '.env.SOMI_EMPLOYEE_ID'
```

**Expected:** A UUID string (the Somi employee's ID for this tenant)

### 3.2 Verify save_post in agent policy

```bash
cat ~/data/tenants/$TENANT_ID/clawdbot.json | jq '.agents.list[] | select(.id=="somi") | .tools.alsoAllow'
```

**Expected:** Array includes `"save_post"`

### 3.3 Verify save_post in sandbox policy

```bash
cat ~/data/tenants/$TENANT_ID/clawdbot.json | jq '.agents.list[] | select(.id=="somi") | .tools.sandbox.tools.allow'
```

**Expected:** Array includes `"save_post"` alongside the default tools

### 3.4 Verify YAML tool was copied to tenant

```bash
ls ~/data/tenants/$TENANT_ID/agents/somi/api-tools/
```

**Expected:** `publish_linkedin.yaml  save_post.yaml`

### 3.5 Verify skill was copied

```bash
ls ~/data/tenants/$TENANT_ID/agents/somi/skills/schedule-post/
```

**Expected:** `SKILL.md`

---

## Phase 4: Gateway Tool Availability

### 4.1 Check gateway logs for api-tools loading

```bash
pm2 logs gateway --lines 50 | grep "api-tools"
```

**Expected:** `api-tools: loaded X tool(s) for agent somi: publish_linkedin, save_post`

### 4.2 Ask the LLM to list tools

```bash
# Get gateway auth token from tenant config
GW_TOKEN=$(cat ~/data/tenants/$TENANT_ID/clawdbot.json | jq -r '.gateway.auth.token')

curl -s "http://127.0.0.1:18789/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GW_TOKEN" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -H "X-OpenClaw-Agent-ID: somi" \
  -d '{"model":"anthropic/claude-sonnet-4","messages":[{"role":"user","content":"List all your available tools. Just the tool names, nothing else."}],"max_tokens":500}' | jq -r '.choices[0].message.content'
```

**Expected:** Output includes `save_post` alongside `generate_image`, `publish_linkedin`, `read`, `write`, etc.

---

## Phase 5: End-to-End (save_post via LLM)

### 5.1 Schedule a post via chat

```bash
curl -s "http://127.0.0.1:18789/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GW_TOKEN" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -H "X-OpenClaw-Agent-ID: somi" \
  -d '{"model":"anthropic/claude-sonnet-4","messages":[{"role":"user","content":"Save a LinkedIn post to the calendar for tomorrow at 10am UTC. Title: AI trends. Content: The future of AI is about making it accessible to everyone. Status: scheduled."}],"max_tokens":1000}' | jq -r '.choices[0].message'
```

**Expected:** The LLM calls `save_post` and reports success.

### 5.2 Verify the post landed in the DB

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/posts?month=$(date +%Y-%m)" | jq '.posts[] | {title, platform, status}'
```

**Expected:** Shows the post with title "AI trends", platform "linkedin", status "scheduled"

---

## Phase 6: Frontend

### 6.1 Open the workspace

1. Open http://localhost:5173
2. Log in
3. Click on Somi employee
4. Click "Workspace" button
5. Calendar should load (may be empty if no posts for current month)

### 6.2 Navigate months

- Click prev/next arrows — should load posts for that month
- Click "Today" — should return to current month

### 6.3 Create a post via UI

1. Click on a calendar day
2. Fill in: Title, Content, Platform (select from YouTube/Instagram/Facebook/LinkedIn/TikTok), Image URL (optional)
3. Click "Create Post"
4. Post should appear on the calendar

### 6.4 View post details

1. Click on a post card in the calendar
2. Modal should show: platform badge, status badge, date, content
3. If post has an image URL, thumbnail should render

### 6.5 Delete a post

1. Open post detail modal
2. Click "Delete"
3. Post should disappear from calendar

### 6.6 Verify platforms

In the create modal, the platform dropdown should show exactly:
- YouTube, Instagram, Facebook, LinkedIn, TikTok

(NOT Twitter/X)

---

## Phase 7: Cross-check (LLM creates, frontend shows)

This is the critical integration test.

1. Chat with Somi: "Generate a LinkedIn post about remote work, then save it to the calendar for next Tuesday at 2pm"
2. Open the workspace panel
3. Navigate to next Tuesday
4. The post should appear on the calendar with platform=linkedin

If Somi also generated an image, the post detail modal should show the image thumbnail.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `posts` table doesn't exist | Migration wasn't run | Run the SQL migration manually (see LOCAL.md) |
| API returns 401 | Auth token expired | Re-login or refresh token |
| `save_post` not in tool list | Sync didn't run or gateway not restarted | `pm2 restart platform && pm2 restart gateway` |
| `SOMI_EMPLOYEE_ID` missing from env | Sync didn't find the employee | Check `employees` table has a Somi entry for this tenant |
| YAML tool returns "Missing required environment variables" | `SUPABASE_URL` or `SUPABASE_SERVICE_KEY` not in gateway env | Check `ecosystem.config.cjs` passes these to gateway |
| Frontend calendar is empty | Wrong month or employee filter | Check browser network tab for the API call params |
| Post created via LLM doesn't show in UI | Different tenant or employee IDs | Compare `TENANT_ID` in the YAML tool context vs the frontend's auth tenant |
