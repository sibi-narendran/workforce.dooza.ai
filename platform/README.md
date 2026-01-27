# Workforce Platform

Multi-tenant AI employee management platform powered by Clawdbot.

## Features

- **AI Employees**: Pre-built templates (Researcher, Writer, Data Analyst, Support Agent) or custom
- **Multi-tenant**: Full isolation via per-tenant directories and gateway processes
- **Scheduled Jobs**: Cron-based automation for AI tasks
- **Real-time Chat**: Conversation interface with AI employees
- **Supabase Auth**: Email/password authentication with JWT

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm
- Supabase project (for auth and database)
- Anthropic API key

### Setup

1. **Configure Supabase**

   Create a Supabase project and run the migration:
   ```sql
   -- Run contents of supabase/migrations/001_initial.sql
   ```

2. **Environment Variables**

   Copy `.env.example` to `.env` and fill in:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_KEY=eyJ...
   DATABASE_URL=postgresql://...
   ANTHROPIC_API_KEY=sk-ant-...
   ```

3. **Install & Run**

   ```bash
   # API Server
   cd platform
   pnpm install
   pnpm dev

   # Web Frontend (separate terminal)
   cd platform/web
   pnpm install
   pnpm dev
   ```

4. **Open** http://localhost:5173

## Architecture

```
platform/
├── src/
│   ├── server/          # Hono API routes
│   ├── tenant/          # Multi-tenant isolation
│   ├── employees/       # AI employee management
│   ├── jobs/            # Scheduled tasks
│   └── db/              # Database schema
└── web/                 # React frontend
```

## API Endpoints

### Auth
- `POST /api/auth/register` - Create account + tenant
- `POST /api/auth/login` - Get JWT
- `POST /api/auth/refresh` - Refresh token

### Employees
- `GET /api/employees` - List employees
- `POST /api/employees` - Create employee
- `GET /api/employees/:id` - Get employee
- `PATCH /api/employees/:id` - Update employee
- `DELETE /api/employees/:id` - Delete employee

### Conversations
- `POST /api/conversations/employee/:id/chat` - Send message
- `GET /api/conversations/:id/messages` - Get history

### Jobs
- `GET /api/jobs` - List jobs
- `POST /api/jobs` - Create job
- `POST /api/jobs/:id/run` - Run immediately

## License

Private
