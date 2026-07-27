import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { agentBridgeApi } from './server/agentBridge'

/**
 * Dev-server endpoint for the real ICP review. Keeps the Anthropic key
 * server-side. For production this same handler moves to a serverless function;
 * the client calls the same /api/icp-review path either way.
 */
function icpReviewApi(): PluginOption {
  return {
    name: 'icp-review-api',
    configureServer(server) {
      server.middlewares.use('/api/icp-review', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runIcpReview } = await import('./server/icpReviewHandler')
            const result = await runIcpReview(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for real publishing (Buffer). Keeps the Buffer token
 * server-side; mirrors /api/icp-review. Moves to a serverless function for prod.
 */
function publishApi(): PluginOption {
  return {
    name: 'publish-api',
    configureServer(server) {
      server.middlewares.use('/api/publish', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runPublish } = await import('./server/publishHandler')
            const result = await runPublish(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for real email publishing (Resend). Keeps the Resend key
 * server-side; mirrors /api/publish. Moves to a serverless function for prod.
 */
function publishEmailApi(): PluginOption {
  return {
    name: 'publish-email-api',
    configureServer(server) {
      server.middlewares.use('/api/publish-email', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runPublishEmail } = await import('./server/resendHandler')
            const result = await runPublishEmail(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for real starter-copy drafting. Keeps the Anthropic key
 * server-side; mirrors /api/icp-review. Moves to a serverless function for prod.
 */
function draftCopyApi(): PluginOption {
  return {
    name: 'draft-copy-api',
    configureServer(server) {
      server.middlewares.use('/api/draft-copy', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runCopyDraft } = await import('./server/copyDraftHandler')
            const result = await runCopyDraft(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for generating one personalization-matrix cell's copy with
 * Claude. Keeps the key server-side; mirrors /api/draft-copy. 501 when no key, so
 * the client falls back to the deterministic composer.
 */
function draftCellApi(): PluginOption {
  return {
    name: 'draft-cell-api',
    configureServer(server) {
      server.middlewares.use('/api/draft-cell', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runDraftCell } = await import('./server/draftCellHandler')
            const result = await runDraftCell(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for "Claude sets up the workspace". Reads the team's site
 * server-side and generates a proposed config. Keeps the key private; mirrors
 * /api/icp-review. Moves to a serverless function for prod.
 */
function setupApi(): PluginOption {
  return {
    name: 'setup-api',
    configureServer(server) {
      server.middlewares.use('/api/setup', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runSetup } = await import('./server/setupHandler')
            const result = await runSetup(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for "Ask Claude" (conversational connection / what-worked).
 * Keeps the Anthropic key server-side; mirrors /api/icp-review. Moves to a
 * serverless function for prod.
 */
function askApi(): PluginOption {
  return {
    name: 'ask-api',
    configureServer(server) {
      server.middlewares.use('/api/claude-ask', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runAsk } = await import('./server/askHandler')
            const result = await runAsk(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for the BRAND STRATEGY draft (pass 1 of the brand-page build, the one that
 * fills 17 of the 26 brand fields). It existed only in the Vercel catch-all, so in local dev it
 * 404ed and the chat reported "Couldn't draft the strategy yet. Add a website or one-liner" no
 * matter what the user had supplied. Every local test of "is the brand page complete" was
 * measuring a pipeline whose first and widest pass never ran.
 */
function draftBrandProfileApi(): PluginOption {
  return {
    name: 'draft-brand-profile-api',
    configureServer(server) {
      server.middlewares.use('/api/draft-brand-profile', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runDraftBrandProfile } = await import('./server/draftBrandProfileHandler')
            const result = await runDraftBrandProfile(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for "Draft proof points with Claude". Keeps the key
 * server-side; mirrors /api/claude-ask. 501 when no key, so the client falls back.
 */
function draftProofApi(): PluginOption {
  return {
    name: 'draft-proof-api',
    configureServer(server) {
      server.middlewares.use('/api/draft-proof', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runDraftProof } = await import('./server/draftProofHandler')
            const result = await runDraftProof(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for "Draft audiences with Claude". Keeps the key
 * server-side; mirrors /api/claude-ask. 501 when no key, so the client falls back.
 */
function draftAudiencesApi(): PluginOption {
  return {
    name: 'draft-audiences-api',
    configureServer(server) {
      server.middlewares.use('/api/draft-audiences', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runDraftAudiences } = await import('./server/draftAudienceHandler')
            const result = await runDraftAudiences(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/** Dev-server endpoint for "Draft messages with Claude". Mirrors /api/claude-ask. */
function draftMessagesApi(): PluginOption {
  return {
    name: 'draft-messages-api',
    configureServer(server) {
      server.middlewares.use('/api/draft-messages', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runDraftMessages } = await import('./server/draftMessageHandler')
            const result = await runDraftMessages(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/** Dev-server endpoint for "Draft voices with Claude". Mirrors /api/claude-ask. */
function draftVoicesApi(): PluginOption {
  return {
    name: 'draft-voices-api',
    configureServer(server) {
      server.middlewares.use('/api/draft-voices', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runDraftVoices } = await import('./server/draftVoiceHandler')
            const result = await runDraftVoices(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/** Dev-server endpoint for "Draft objectives with Claude". Mirrors /api/claude-ask. */
function draftObjectivesApi(): PluginOption {
  return {
    name: 'draft-objectives-api',
    configureServer(server) {
      server.middlewares.use('/api/draft-objectives', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runDraftObjectives } = await import('./server/draftObjectiveHandler')
            const result = await runDraftObjectives(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/** Dev-server endpoint for "Recommend channels with Claude". Mirrors /api/claude-ask. */
function draftChannelsApi(): PluginOption {
  return {
    name: 'draft-channels-api',
    configureServer(server) {
      server.middlewares.use('/api/draft-channels', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runDraftChannels } = await import('./server/draftChannelHandler')
            const result = await runDraftChannels(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/** Dev-server endpoint for "Recommend audience angle with Claude". Mirrors /api/draft-channels. */
function draftAngleApi(): PluginOption {
  return {
    name: 'draft-angle-api',
    configureServer(server) {
      server.middlewares.use('/api/draft-angle', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runDraftAngle } = await import('./server/draftAngleHandler')
            const result = await runDraftAngle(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/** Dev-server endpoint for "Ingest a brand's site content". Plain fetch, no key needed. */
function ingestSiteApi(): PluginOption {
  return {
    name: 'ingest-site-api',
    configureServer(server) {
      server.middlewares.use('/api/ingest-site', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runIngestSite } = await import('./server/ingestSiteHandler')
            const result = await runIngestSite(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            res.statusCode = 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for "Generate a media mix with Claude". Keeps the Anthropic
 * key server-side; mirrors /api/claude-ask.
 */
function mediaMixApi(): PluginOption {
  return {
    name: 'media-mix-api',
    configureServer(server) {
      server.middlewares.use('/api/media-mix', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runMediaMix } = await import('./server/mediaMixHandler')
            const result = await runMediaMix(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for the flow-canvas AI agent. Keeps the Anthropic key server-side;
 * mirrors /api/media-mix.
 */
function flowAgentApi(): PluginOption {
  return {
    name: 'flow-agent-api',
    configureServer(server) {
      server.middlewares.use('/api/flow-agent', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runFlowAgent } = await import('./server/flowAgentHandler')
            const result = await runFlowAgent(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

// Server-side secrets read by the /api middleware. These are NOT VITE_-prefixed,
// so Vite won't expose them to the browser; we load them from .env into
// process.env here so the handlers (icp-review, draft-copy, setup, claude-ask,
// publish) can read them in dev. In production each handler reads the platform's
// own env vars. A real key flips every Claude feature from heuristic to live.
const SERVER_SECRETS = [
  'ANTHROPIC_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  // The per-tier overrides modelClient documents. They were absent, so setting OPENROUTER_MODEL_COPY
  // in .env silently did nothing in dev and looked like the tier default winning.
  'OPENROUTER_MODEL_EXTRACT',
  'OPENROUTER_MODEL_COPY',
  'OPENROUTER_MODEL_AGENT',
  // Lets an operator pin the models and ignore per-campaign picks (see resolveOpenRouterModel).
  'OPENROUTER_MODEL_LOCK',
  'BUFFER_ACCESS_TOKEN',
  'BUFFER_PROFILE_IDS',
  'RESEND_API_KEY',
  'RESEND_AUDIENCE_ID',
  'RESEND_FROM_EMAIL',
  'YOUTUBE_API_KEY',
  'INSTAGRAM_ACCESS_TOKEN',
  'INSTAGRAM_BUSINESS_ID',
  'LINKEDIN_ACCESS_TOKEN',
  'LINKEDIN_ORG_ID',
  'LINKEDIN_VERSION',
  'NEON_ORG_ID',
  'NEON_API_KEY',
  'NEON_BASE',
]

/**
 * Dev-server endpoint for the records-table AI agent. Keeps the Anthropic key server-side;
 * mirrors /api/flow-agent.
 */
function recordsAgentApi(): PluginOption {
  return {
    name: 'records-agent-api',
    configureServer(server) {
      server.middlewares.use('/api/records-agent', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runRecordsAgent } = await import('./server/recordsAgentHandler')
            const result = await runRecordsAgent(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for the Claude-powered coherence check (the connection
 * check itself). Keeps the Anthropic key server-side; mirrors /api/icp-review.
 */
function coherenceApi(): PluginOption {
  return {
    name: 'coherence-api',
    configureServer(server) {
      server.middlewares.use('/api/coherence-check', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runCoherenceCheck } = await import('./server/coherenceHandler')
            const result = await runCoherenceCheck(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for the current-state messaging map: crawl + ads in,
 * structured live messaging out. Keeps the key server-side; mirrors /api/setup.
 */
function siteMapApi(): PluginOption {
  return {
    name: 'site-map-api',
    configureServer(server) {
      server.middlewares.use('/api/map-site', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runSiteMap } = await import('./server/siteMapHandler')
            const result = await runSiteMap(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Streaming variant of /api/map-site: emits stage progress over SSE (so the
 * onboarding UI can show the work) then the final map. Mirrors the JSON route.
 */
function siteMapStreamApi(): PluginOption {
  return {
    name: 'site-map-stream-api',
    configureServer(server) {
      server.middlewares.use('/api/map-site-stream', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          })
          const send = (event: string, data: unknown) =>
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          try {
            const { runSiteMap } = await import('./server/siteMapHandler')
            const result = await runSiteMap(JSON.parse(body || '{}'), (e) => send('progress', e))
            send('result', result)
          } catch (err) {
            const code = (err as { code?: string })?.code
            send('error', { code: code ?? null, message: String((err as Error)?.message ?? err) })
          } finally {
            res.end()
          }
        })
      })
    },
  }
}

/**
 * Connect-a-channel endpoints: open a real browser to log into a client's channel
 * once (/start), then persist that session (/save) so Claude can read the channel
 * authenticated. Local/dev only — opens a visible browser window for the login.
 */
function connectApi(): PluginOption {
  const readBody = (req: import('node:http').IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolve) => {
      let b = ''
      req.on('data', (c) => (b += c))
      req.on('end', () => {
        try {
          resolve(JSON.parse(b || '{}') as Record<string, unknown>)
        } catch {
          resolve({})
        }
      })
    })
  const handle = (run: (body: Record<string, unknown>) => Promise<unknown>) => async (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      return res.end()
    }
    try {
      const result = await run(await readBody(req))
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(result))
    } catch (err) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: String((err as Error)?.message ?? err) }))
    }
  }
  return {
    name: 'connect-api',
    configureServer(server) {
      server.middlewares.use(
        '/api/connect/start',
        handle(async (body) => {
          const { startConnect } = await import('./server/connectChannel')
          return startConnect(String(body.url ?? ''))
        }),
      )
      server.middlewares.use(
        '/api/connect/save',
        handle(async (body) => {
          const { saveConnect } = await import('./server/connectChannel')
          return saveConnect(String(body.token ?? ''))
        }),
      )
    },
  }
}

/**
 * Streaming per-channel ingest: link one channel and pull all of its copy —
 * including the copy baked into the art (vision reads on-image text). Emits stage
 * progress over SSE, then the final channel map. Mirrors /api/map-site-stream.
 */
function ingestChannelApi(): PluginOption {
  return {
    name: 'ingest-channel-api',
    configureServer(server) {
      server.middlewares.use('/api/ingest-channel', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          })
          const send = (event: string, data: unknown) =>
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          try {
            const { runIngestChannel } = await import('./server/ingestChannelHandler')
            const result = await runIngestChannel(JSON.parse(body || '{}'), (e) => send('progress', e))
            send('result', result)
          } catch (err) {
            const code = (err as { code?: string })?.code
            send('error', { code: code ?? null, message: String((err as Error)?.message ?? err) })
          } finally {
            res.end()
          }
        })
      })
    },
  }
}

/**
 * Streaming ingest of a brand's owned content from their Sanity CMS: query the
 * dataset, harvest the copy, map it. Emits stage progress over SSE; mirrors
 * /api/ingest-channel (no vision — Sanity is the source of record).
 */
function ingestSanityApi(): PluginOption {
  return {
    name: 'ingest-sanity-api',
    configureServer(server) {
      server.middlewares.use('/api/ingest-sanity', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          })
          const send = (event: string, data: unknown) =>
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          try {
            const { runSanityIngest } = await import('./server/sanityIngestHandler')
            const result = await runSanityIngest(JSON.parse(body || '{}'), (e) => send('progress', e))
            send('result', result)
          } catch (err) {
            const code = (err as { code?: string })?.code
            send('error', { code: code ?? null, message: String((err as Error)?.message ?? err) })
          } finally {
            res.end()
          }
        })
      })
    },
  }
}

/**
 * Streaming ingest of a brand's email copy from Resend: list broadcasts, pull
 * their copy, map it into the email channel. Mirrors /api/ingest-sanity.
 */
function ingestResendApi(): PluginOption {
  return {
    name: 'ingest-resend-api',
    configureServer(server) {
      server.middlewares.use('/api/ingest-resend', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          })
          const send = (event: string, data: unknown) =>
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          try {
            const { runResendIngest } = await import('./server/resendIngestHandler')
            const result = await runResendIngest(JSON.parse(body || '{}'), (e) => send('progress', e))
            send('result', result)
          } catch (err) {
            const code = (err as { code?: string })?.code
            send('error', { code: code ?? null, message: String((err as Error)?.message ?? err) })
          } finally {
            res.end()
          }
        })
      })
    },
  }
}

/**
 * Streaming ingest of a brand's live Google Ads copy via the Google Ads API:
 * OAuth token exchange, GAQL ad-text query, map into paid Google channels.
 * Mirrors /api/ingest-sanity.
 */
function ingestGoogleAdsApi(): PluginOption {
  return {
    name: 'ingest-google-ads-api',
    configureServer(server) {
      server.middlewares.use('/api/ingest-google-ads', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          })
          const send = (event: string, data: unknown) =>
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          try {
            const { runGoogleAdsIngest } = await import('./server/googleAdsIngestHandler')
            const result = await runGoogleAdsIngest(JSON.parse(body || '{}'), (e) => send('progress', e))
            send('result', result)
          } catch (err) {
            const code = (err as { code?: string })?.code
            send('error', { code: code ?? null, message: String((err as Error)?.message ?? err) })
          } finally {
            res.end()
          }
        })
      })
    },
  }
}

/**
 * Streaming ingest of a brand's Neon (NeonCRM) published assets: fundraising
 * campaign pages and event pages, pulled server-side with the Neon key, mapped
 * into the Library as posted content. Emits stage progress over SSE; mirrors
 * /api/ingest-resend.
 */
function ingestNeonApi(): PluginOption {
  return {
    name: 'ingest-neon-api',
    configureServer(server) {
      server.middlewares.use('/api/ingest-neon', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          })
          const send = (event: string, data: unknown) =>
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          try {
            const { runNeonIngest } = await import('./server/neonIngestHandler')
            const result = await runNeonIngest(JSON.parse(body || '{}'), (e) => send('progress', e))
            send('result', result)
          } catch (err) {
            const code = (err as { code?: string })?.code
            send('error', { code: code ?? null, message: String((err as Error)?.message ?? err) })
          } finally {
            res.end()
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for reading the copy inside a single creative (vision OCR).
 * Backs the row-level extractCopy action; mirrors /api/icp-review.
 */
function extractCopyApi(): PluginOption {
  return {
    name: 'extract-copy-api',
    configureServer(server) {
      server.middlewares.use('/api/extract-copy', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runExtractCopy } = await import('./server/extractCopyHandler')
            const result = await runExtractCopy(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for the Claude engine — the agent that reads from sources
 * and publishes to channels by calling tools. Keeps the Anthropic key server-side.
 */
function agentApi(): PluginOption {
  return {
    name: 'agent-api',
    configureServer(server) {
      server.middlewares.use('/api/claude-agent', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runAgent } = await import('./server/agentHandler')
            const result = await runAgent(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server status endpoint: reports whether a model key is configured server-side
 * (OpenRouter preferred, else Anthropic), so the client can tell if Claude is connected
 * without exposing the key. The "Connect Claude" onboarding step reads this. GET only.
 */
function aiStatusApi(): PluginOption {
  return {
    name: 'ai-status-api',
    configureServer(server) {
      server.middlewares.use('/api/ai-status', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          return res.end()
        }
        const provider = process.env.OPENROUTER_API_KEY ? 'openrouter' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : null
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ connected: !!provider, provider }))
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of SERVER_SECRETS) {
    if (env[key] && !process.env[key]) process.env[key] = env[key]
  }
  return {
    // Don't let test/automation artifacts written into the repo (Playwright MCP
    // logs, screenshots, exported data snapshots) trigger a dev-server reload —
    // a reload resets the in-memory store (clientFilter/brandView) to defaults.
    server: {
      watch: {
        ignored: ['**/.playwright-mcp/**', '**/*.png', '**/public/ww-*.json'],
      },
    },
    // Split heavy vendor code out of the main chunk so first load is smaller and parallelized
    // (clears the >500 kB single-chunk warning; each vendor group is cached independently).
    build: {
      // The vendor split (react / supabase / charts / icons) is done; the remaining ~1 MB is the
      // app's own code. Route-level lazy-loading is a follow-up; bump the warning so builds are clean.
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return
            if (/[\\/]recharts[\\/]|[\\/]d3-|[\\/]victory/.test(id)) return 'charts'
            if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
            if (/[\\/]@supabase[\\/]/.test(id)) return 'supabase'
            if (/[\\/]simple-icons[\\/]/.test(id)) return 'icons'
            return 'vendor'
          },
        },
      },
    },
    plugins: [
      react(),
      icpReviewApi(),
      publishApi(),
      publishEmailApi(),
      draftCopyApi(),
      draftCellApi(),
      draftProofApi(),
    draftBrandProfileApi(),
      draftAudiencesApi(),
      draftMessagesApi(),
      draftVoicesApi(),
      draftObjectivesApi(),
      draftChannelsApi(),
      draftAngleApi(),
      ingestSiteApi(),
      setupApi(),
      askApi(),
      mediaMixApi(),
      flowAgentApi(),
      recordsAgentApi(),
      coherenceApi(),
      agentApi(),
      siteMapApi(),
      siteMapStreamApi(),
      connectApi(),
      ingestChannelApi(),
      ingestSanityApi(),
      ingestResendApi(),
      ingestGoogleAdsApi(),
      ingestNeonApi(),
      extractCopyApi(),
      agentBridgeApi(),
      aiStatusApi(),
    ],
  }
})
