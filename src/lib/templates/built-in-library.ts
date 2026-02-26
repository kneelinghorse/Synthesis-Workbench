import type { DesignDocument, DesignNode } from '@/types/document-model';
import type { DesignTemplate, TemplateMetadata } from '@/types/template-model';
import { parseDesignTemplate } from '@/types/template-model.schema';
import { applyTemplate, type ApplyTemplateOptions } from '@/lib/templates/apply-template';

export const BUILT_IN_TEMPLATE_SLUGS = [
  'dashboard',
  'form-page',
  'landing-page',
  'settings-panel',
  'detail-view',
] as const;

export type BuiltInTemplateSlug = (typeof BUILT_IN_TEMPLATE_SLUGS)[number];

export type BuiltInTemplateSummary = {
  slug: BuiltInTemplateSlug;
  metadata: TemplateMetadata;
  requiredComponents: string[];
  componentCount: number;
};

export type ApplyBuiltInTemplateOptions = ApplyTemplateOptions;

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const countComponents = (node: DesignNode): number => {
  if (node.nodeType === 'component') {
    return 1;
  }

  return node.children.reduce((sum, child) => sum + countComponents(child), 0);
};

const defineTemplate = (template: DesignTemplate): DesignTemplate =>
  parseDesignTemplate(template);

const BUILT_IN_TEMPLATES: Record<BuiltInTemplateSlug, DesignTemplate> = {
  dashboard: defineTemplate({
    kind: 'template',
    metadata: {
      name: 'Dashboard Starter',
      description: 'Starter dashboard shell using the Foundry S44 component registry.',
      category: 'dashboard',
      previewThumbnail: '/thumbnails/dashboard-starter.png',
      tags: ['analytics', 'kpi', 'table'],
    },
    document: {
      metadata: {
        title: 'Dashboard Starter',
        description: 'Dashboard scaffold with status banner, KPI cards, and a summary table',
      },
      root: {
        nodeType: 'layout',
        layout: { type: 'stack', gap: 16 },
        children: [
          {
            nodeType: 'component',
            id: 'dash-banner',
            ref: 'oods:Banner',
            props: {
              title: 'Workbench Overview',
              message: 'Track pipeline health, adoption, and delivery metrics.',
              intent: 'info',
            },
          },
          {
            nodeType: 'component',
            id: 'dash-tabs',
            ref: 'oods:Tabs',
            props: {
              tabs: [
                { id: 'overview', label: 'Overview' },
                { id: 'pipeline', label: 'Pipeline' },
                { id: 'team', label: 'Team' },
              ],
              activeTab: 'overview',
            },
          },
          {
            nodeType: 'layout',
            layout: { type: 'grid', columns: 3, gap: 16 },
            children: [
              {
                nodeType: 'component',
                id: 'dash-kpi-users',
                ref: 'oods:Card',
                props: {
                  title: 'Active users',
                  value: '1,240',
                  trend: '+12%',
                },
              },
              {
                nodeType: 'component',
                id: 'dash-kpi-revenue',
                ref: 'oods:Card',
                props: {
                  title: 'Revenue',
                  value: '$42k',
                  trend: '+8%',
                },
              },
              {
                nodeType: 'component',
                id: 'dash-kpi-conversion',
                ref: 'oods:Card',
                props: {
                  title: 'Conversion',
                  value: '3.8%',
                  trend: '+0.4%',
                },
              },
            ],
          },
          {
            nodeType: 'component',
            id: 'dash-table',
            ref: 'oods:Table',
            props: {
              columns: [
                { key: 'metric', label: 'Metric' },
                { key: 'value', label: 'Value' },
                { key: 'delta', label: 'Delta' },
              ],
              rows: [
                { metric: 'Sessions', value: '18,240', delta: '+4.2%' },
                { metric: 'Template applies', value: '1,032', delta: '+9.8%' },
                { metric: 'A11y pass rate', value: '97.4%', delta: '+1.1%' },
              ],
            },
          },
          {
            nodeType: 'component',
            id: 'dash-action',
            ref: 'oods:Button',
            props: {
              label: 'View full report',
              variant: 'primary',
            },
          },
        ],
      },
    },
    tokenOverrides: {
      'colors.primary': '#2563eb',
      'spacing.md': '1rem',
      'radius.md': '0.5rem',
    },
    dataShape: {
      metrics: { type: 'array', required: true, description: 'KPI card values' },
      rows: { type: 'array', required: true, description: 'Table row data' },
      user: { type: 'object', required: false, description: 'Viewer context' },
    },
    requiredComponents: [
      'oods:Banner',
      'oods:Tabs',
      'oods:Card',
      'oods:Table',
      'oods:Button',
    ],
  }),
  'form-page': defineTemplate({
    kind: 'template',
    metadata: {
      name: 'Form Page',
      description: 'Form-first page scaffold using the Foundry S44 component registry.',
      category: 'form',
      previewThumbnail: '/thumbnails/form-page.png',
      tags: ['form', 'input'],
    },
    document: {
      metadata: {
        title: 'Form Page',
        description: 'Form scaffold with validated inputs and action controls',
      },
      root: {
        nodeType: 'layout',
        layout: { type: 'stack', gap: 12 },
        children: [
          {
            nodeType: 'component',
            id: 'form-banner',
            ref: 'oods:Banner',
            props: {
              title: 'Create account',
              message: 'Complete the fields below to provision a new workspace account.',
              intent: 'info',
            },
          },
          {
            nodeType: 'component',
            id: 'form-heading',
            ref: 'oods:Text',
            props: {
              as: 'h2',
              text: 'Account details',
            },
          },
          {
            nodeType: 'component',
            id: 'form-input-name',
            ref: 'oods:Input',
            props: {
              label: 'Full name',
              placeholder: 'Jane Doe',
              required: true,
            },
          },
          {
            nodeType: 'component',
            id: 'form-input-email',
            ref: 'oods:Input',
            props: {
              type: 'email',
              label: 'Email',
              placeholder: 'jane@example.com',
              required: true,
            },
          },
          {
            nodeType: 'component',
            id: 'form-role',
            ref: 'oods:Select',
            props: {
              label: 'Role',
              options: [
                { value: 'editor', label: 'Editor' },
                { value: 'manager', label: 'Manager' },
                { value: 'admin', label: 'Admin' },
              ],
              value: 'editor',
            },
          },
          {
            nodeType: 'component',
            id: 'form-badge',
            ref: 'oods:Badge',
            props: {
              label: 'Email verification required',
              tone: 'info',
            },
          },
          {
            nodeType: 'layout',
            layout: { type: 'grid', columns: 2, gap: 8 },
            children: [
              {
                nodeType: 'component',
                id: 'form-submit',
                ref: 'oods:Button',
                props: {
                  label: 'Create account',
                  variant: 'primary',
                },
              },
              {
                nodeType: 'component',
                id: 'form-cancel',
                ref: 'oods:Button',
                props: {
                  label: 'Cancel',
                  variant: 'secondary',
                },
              },
            ],
          },
        ],
      },
    },
    tokenOverrides: {
      'colors.primary': '#0f766e',
      'spacing.sm': '0.75rem',
    },
    dataShape: {
      form: { type: 'object', required: true, description: 'Form field values' },
      submitState: { type: 'string', required: false, description: 'Submission state label' },
    },
    requiredComponents: [
      'oods:Banner',
      'oods:Text',
      'oods:Input',
      'oods:Select',
      'oods:Badge',
      'oods:Button',
    ],
  }),
  'landing-page': defineTemplate({
    kind: 'template',
    metadata: {
      name: 'Landing Page',
      description: 'Marketing scaffold built from Foundry S44 registry components.',
      category: 'landing',
      previewThumbnail: '/thumbnails/landing-page.png',
      tags: ['marketing', 'hero'],
    },
    document: {
      metadata: {
        title: 'Landing Page',
        description: 'Hero + CTA layout for marketing and product announcements',
      },
      root: {
        nodeType: 'layout',
        layout: { type: 'stack', gap: 24 },
        children: [
          {
            nodeType: 'component',
            id: 'landing-banner',
            ref: 'oods:Banner',
            props: {
              title: 'New in Synthesis Workbench',
              message: 'Faster phase transitions and live Foundry previews are now available.',
              intent: 'success',
            },
          },
          {
            nodeType: 'component',
            id: 'landing-heading',
            ref: 'oods:Text',
            props: {
              as: 'h1',
              text: 'Ship better interfaces faster',
            },
          },
          {
            nodeType: 'component',
            id: 'landing-subcopy',
            ref: 'oods:Text',
            props: {
              text: 'Compose templates, tune tokens, and validate accessibility in one workbench.',
            },
          },
          {
            nodeType: 'component',
            id: 'landing-tabs',
            ref: 'oods:Tabs',
            props: {
              tabs: [
                { id: 'teams', label: 'Product Teams' },
                { id: 'agencies', label: 'Agencies' },
                { id: 'platform', label: 'Platform' },
              ],
              activeTab: 'teams',
            },
          },
          {
            nodeType: 'layout',
            layout: { type: 'grid', columns: 2, gap: 16 },
            children: [
              {
                nodeType: 'component',
                id: 'landing-card',
                ref: 'oods:Card',
                props: {
                  title: 'Unified workflow',
                  body: 'From Stage1 ingest to Foundry output with no context switching.',
                },
              },
              {
                nodeType: 'component',
                id: 'landing-table',
                ref: 'oods:Table',
                props: {
                  columns: [
                    { key: 'plan', label: 'Plan' },
                    { key: 'users', label: 'Users' },
                    { key: 'support', label: 'Support' },
                  ],
                  rows: [
                    { plan: 'Starter', users: '5', support: 'Community' },
                    { plan: 'Team', users: '25', support: 'Priority' },
                    { plan: 'Enterprise', users: 'Unlimited', support: 'Dedicated' },
                  ],
                },
              },
            ],
          },
          {
            nodeType: 'component',
            id: 'landing-badge',
            ref: 'oods:Badge',
            props: {
              label: 'Trusted by design and platform teams',
              tone: 'info',
            },
          },
          {
            nodeType: 'component',
            id: 'landing-cta',
            ref: 'oods:Button',
            props: {
              label: 'Start building',
              variant: 'primary',
            },
          },
        ],
      },
    },
    tokenOverrides: {
      'colors.primary': '#9333ea',
      'spacing.lg': '1.5rem',
    },
    dataShape: {
      hero: { type: 'object', required: true, description: 'Hero title/copy/action' },
      testimonials: { type: 'array', required: false, description: 'Optional social proof items' },
    },
    requiredComponents: [
      'oods:Banner',
      'oods:Text',
      'oods:Tabs',
      'oods:Card',
      'oods:Table',
      'oods:Badge',
      'oods:Button',
    ],
  }),
  'settings-panel': defineTemplate({
    kind: 'template',
    metadata: {
      name: 'Settings Panel',
      description: 'Settings management scaffold using Foundry S44 registry components.',
      category: 'settings',
      previewThumbnail: '/thumbnails/settings-panel.png',
      tags: ['settings', 'admin'],
    },
    document: {
      metadata: {
        title: 'Settings Panel',
        description: 'Configurable settings layout with grouped controls and save actions',
      },
      root: {
        nodeType: 'layout',
        layout: { type: 'stack', gap: 16 },
        children: [
          {
            nodeType: 'component',
            id: 'settings-heading',
            ref: 'oods:Text',
            props: {
              as: 'h2',
              text: 'Workspace settings',
            },
          },
          {
            nodeType: 'component',
            id: 'settings-tabs',
            ref: 'oods:Tabs',
            props: {
              tabs: [
                { id: 'profile', label: 'Profile' },
                { id: 'notifications', label: 'Notifications' },
                { id: 'security', label: 'Security' },
              ],
              activeTab: 'profile',
            },
          },
          {
            nodeType: 'layout',
            layout: { type: 'grid', columns: 2, gap: 12 },
            children: [
              {
                nodeType: 'component',
                id: 'settings-card-profile',
                ref: 'oods:Card',
                props: {
                  title: 'Profile',
                  body: 'Update your team identity and workspace metadata.',
                },
              },
              {
                nodeType: 'component',
                id: 'settings-card-notifications',
                ref: 'oods:Card',
                props: {
                  title: 'Notifications',
                  body: 'Choose how and when updates are delivered.',
                },
              },
            ],
          },
          {
            nodeType: 'component',
            id: 'settings-input-name',
            ref: 'oods:Input',
            props: {
              label: 'Display name',
              placeholder: 'Workbench Team',
            },
          },
          {
            nodeType: 'component',
            id: 'settings-select-timezone',
            ref: 'oods:Select',
            props: {
              label: 'Timezone',
              options: [
                { value: 'UTC', label: 'UTC' },
                { value: 'PST', label: 'Pacific Time' },
                { value: 'EST', label: 'Eastern Time' },
              ],
              value: 'UTC',
            },
          },
          {
            nodeType: 'component',
            id: 'settings-badge',
            ref: 'oods:Badge',
            props: {
              label: 'Unsaved changes',
              tone: 'warning',
            },
          },
          {
            nodeType: 'layout',
            layout: { type: 'grid', columns: 2, gap: 12 },
            children: [
              {
                nodeType: 'component',
                id: 'settings-save',
                ref: 'oods:Button',
                props: {
                  label: 'Save changes',
                  variant: 'primary',
                },
              },
              {
                nodeType: 'component',
                id: 'settings-reset',
                ref: 'oods:Button',
                props: {
                  label: 'Reset',
                  variant: 'secondary',
                },
              },
            ],
          },
        ],
      },
    },
    tokenOverrides: {
      'colors.primary': '#475569',
      'spacing.md': '1rem',
    },
    dataShape: {
      preferences: { type: 'object', required: true, description: 'Current settings model' },
      permissions: { type: 'array', required: false, description: 'Role and capability descriptors' },
    },
    requiredComponents: [
      'oods:Text',
      'oods:Tabs',
      'oods:Card',
      'oods:Input',
      'oods:Select',
      'oods:Badge',
      'oods:Button',
    ],
  }),
  'detail-view': defineTemplate({
    kind: 'template',
    metadata: {
      name: 'Detail View',
      description: 'Entity detail layout composed with Foundry S44 registry components.',
      category: 'detail',
      previewThumbnail: '/thumbnails/detail-view.png',
      tags: ['detail', 'entity'],
    },
    document: {
      metadata: {
        title: 'Detail View',
        description: 'Detailed record view with metadata, activity, and actions',
      },
      root: {
        nodeType: 'layout',
        layout: { type: 'stack', gap: 14 },
        children: [
          {
            nodeType: 'component',
            id: 'detail-banner',
            ref: 'oods:Banner',
            props: {
              title: 'Record synced',
              message: 'All dependencies resolved and audit checks passed.',
              intent: 'success',
            },
          },
          {
            nodeType: 'component',
            id: 'detail-title',
            ref: 'oods:Text',
            props: {
              as: 'h2',
              text: 'Record #1207',
            },
          },
          {
            nodeType: 'component',
            id: 'detail-status',
            ref: 'oods:Badge',
            props: {
              label: 'Active',
              tone: 'success',
            },
          },
          {
            nodeType: 'component',
            id: 'detail-tabs',
            ref: 'oods:Tabs',
            props: {
              tabs: [
                { id: 'summary', label: 'Summary' },
                { id: 'activity', label: 'Activity' },
                { id: 'history', label: 'History' },
              ],
              activeTab: 'summary',
            },
          },
          {
            nodeType: 'component',
            id: 'detail-table',
            ref: 'oods:Table',
            props: {
              columns: [
                { key: 'field', label: 'Field' },
                { key: 'value', label: 'Value' },
              ],
              rows: [
                { field: 'Owner', value: 'Design Ops' },
                { field: 'Updated', value: '2 minutes ago' },
                { field: 'Version', value: 'v3.2' },
              ],
            },
          },
          {
            nodeType: 'component',
            id: 'detail-card',
            ref: 'oods:Card',
            props: {
              title: 'Notes',
              body: 'This record includes all required semantic tokens and validated bindings.',
            },
          },
          {
            nodeType: 'layout',
            layout: { type: 'grid', columns: 2, gap: 10 },
            children: [
              {
                nodeType: 'component',
                id: 'detail-edit',
                ref: 'oods:Button',
                props: {
                  label: 'Edit',
                  variant: 'secondary',
                },
              },
              {
                nodeType: 'component',
                id: 'detail-export',
                ref: 'oods:Button',
                props: {
                  label: 'Export',
                  variant: 'primary',
                },
              },
            ],
          },
        ],
      },
    },
    tokenOverrides: {
      'colors.primary': '#0ea5e9',
      'spacing.md': '0.875rem',
    },
    dataShape: {
      record: { type: 'object', required: true, description: 'Entity payload' },
      activity: { type: 'array', required: false, description: 'Recent event stream' },
    },
    requiredComponents: [
      'oods:Banner',
      'oods:Text',
      'oods:Badge',
      'oods:Tabs',
      'oods:Table',
      'oods:Card',
      'oods:Button',
    ],
  }),
};

const TEMPLATE_ALIAS_MAP: Record<string, BuiltInTemplateSlug> = {
  dashboard: 'dashboard',
  'dashboard-starter': 'dashboard',
  form: 'form-page',
  'form-page': 'form-page',
  'formpage': 'form-page',
  landing: 'landing-page',
  'landing-page': 'landing-page',
  landingpage: 'landing-page',
  settings: 'settings-panel',
  'settings-panel': 'settings-panel',
  settingspanel: 'settings-panel',
  detail: 'detail-view',
  'detail-view': 'detail-view',
  detailview: 'detail-view',
};

export function resolveBuiltInTemplateSlug(input: string): BuiltInTemplateSlug | null {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, '-');
  return TEMPLATE_ALIAS_MAP[normalized] ?? null;
}

export function listBuiltInTemplates(): BuiltInTemplateSummary[] {
  return BUILT_IN_TEMPLATE_SLUGS.map((slug) => {
    const template = BUILT_IN_TEMPLATES[slug];
    return {
      slug,
      metadata: deepClone(template.metadata),
      requiredComponents: [...(template.requiredComponents ?? [])],
      componentCount: countComponents(template.document.root),
    };
  });
}

export function getBuiltInTemplate(slug: BuiltInTemplateSlug): DesignTemplate {
  return deepClone(BUILT_IN_TEMPLATES[slug]);
}

export function applyBuiltInTemplate(
  slug: BuiltInTemplateSlug,
  options?: ApplyBuiltInTemplateOptions
): DesignDocument {
  return applyTemplate(BUILT_IN_TEMPLATES[slug], options);
}
