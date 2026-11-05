#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createDb } from '@redline/db';
import { listFindings, getFixContext } from './tools.js';

/**
 * Redline MCP server. Lets a developer's own AI coding tool pull a reproduced
 * finding and the vulnerable source, and write the fix itself — an alternative
 * to Redline's own Fix-it.
 */
const { db } = createDb();
const server = new McpServer({ name: 'redline', version: '0.1.0' });

server.tool(
  'redline_list_findings',
  'List reproduced (red) security findings for a repository (owner/repo).',
  { repo: z.string().describe('owner/repo, e.g. acme-defi/vault-core'), onlyRed: z.boolean().optional() },
  async ({ repo, onlyRed }) => {
    const findings = await listFindings(db, repo, onlyRed ?? true);
    return { content: [{ type: 'text', text: JSON.stringify(findings, null, 2) }] };
  },
);

server.tool(
  'redline_fix_context',
  'Get the vulnerable contract source and finding for a finding id, so you can write the fix.',
  { findingId: z.string() },
  async ({ findingId }) => {
    const ctx = await getFixContext(db, findingId);
    if (!ctx) return { content: [{ type: 'text', text: 'finding not found' }], isError: true };
    return { content: [{ type: 'text', text: JSON.stringify(ctx, null, 2) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
